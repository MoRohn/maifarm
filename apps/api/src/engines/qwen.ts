import axios, { AxiosInstance } from 'axios';
import type {
  CapabilityFlags,
  ChatRequest,
  ChatResponse,
  EngineAdapter,
  FinishReason,
  StreamEvent,
  TokenCountResult,
  ToolCallResult
} from './engine-adapter';
import { estimateMessagesTokenCount, estimateTokenCount } from './token-estimator';
import { parseSSE } from './streaming';
import { logger as defaultLogger, LogCategory } from '../utils/logger';

interface LlamaAdapterOptions {
  key: string;
  label?: string;
  model: string;
  baseURL: string;
  apiKey?: string;
  toolMode?: 'native' | 'emulated';
  headers?: Record<string, string>;
  logger?: typeof defaultLogger;
}

export class LlamaAdapter implements EngineAdapter {
  readonly key: string;
  readonly label: string;

  private readonly model: string;
  private readonly toolMode: 'native' | 'emulated';
  private readonly http: AxiosInstance;
  private readonly baseURL: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly logger: typeof defaultLogger;

  constructor(options: LlamaAdapterOptions) {
    this.key = options.key;
    this.label = options.label ?? 'Llama';
    this.model = options.model;
    this.toolMode = options.toolMode ?? 'native';
    this.baseURL = options.baseURL.replace(/\/$/, '');
    this.logger = options.logger ?? defaultLogger;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      ...(options.headers ?? {})
    };

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 60_000,
      headers: this.defaultHeaders
    });
  }

  supports(): CapabilityFlags {
    return {
      tools: this.toolMode === 'native' ? 'native' : 'emulated',
      streaming: true,
      jsonMode: true,
      vision: false,
      tokenizer: 'huggingface'
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload = this.buildPayload(request);
    const response = await this.http.post('/services/aigc/text-generation/generation', payload);

    const output = response.data?.output;
    const text = output?.text ?? output?.choices?.[0]?.message?.content ?? '';

    const toolCalls = this.extractToolCalls(output, request);

    return {
      content: toolCalls ? null : text,
      tool_calls: toolCalls ?? undefined,
      usage: response.data?.usage
        ? {
            prompt_tokens: response.data.usage.input_tokens,
            completion_tokens: response.data.usage.output_tokens,
            total_tokens: response.data.usage.total_tokens
          }
        : undefined,
      finish_reason: response.data?.output?.finish_reason ?? 'stop',
      raw: response.data
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    let response: Response;
    let finishReason: FinishReason = 'stop';

    try {
      const payload = this.buildPayload(request, true);

      response = await fetch(`${this.baseURL}/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;
        this.logger.error(LogCategory.AI, 'llama_stream_error', {
          statusCode: response.status,
          isRetryable,
          message: text
        });
        yield {
          type: 'error',
          message: `Llama stream failed: ${response.status} ${text}`,
          retryable: isRetryable
        };
        yield { type: 'finish', value: 'error' };
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(LogCategory.AI, 'llama_stream_setup_error', { error: message });
      yield {
        type: 'error',
        message: `Llama stream setup failed: ${message}`,
        retryable: true
      };
      yield { type: 'finish', value: 'error' };
      return;
    }

    try {
      for await (const event of parseSSE(response)) {
        if (!event.data || event.data === '[DONE]') {
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          continue;
        }

        // Handle error events from the stream
        if (parsed.error) {
          this.logger.error(LogCategory.AI, 'llama_stream_error_event', { error: parsed.error });
          yield {
            type: 'error',
            message: parsed.error.message || 'Unknown stream error',
            retryable: false
          };
          finishReason = 'error';
          break;
        }

        if (parsed.output?.text_delta) {
          yield { type: 'token', value: parsed.output.text_delta };
        }

        if (parsed.usage) {
          yield {
            type: 'usage',
            value: {
              promptTokens: parsed.usage.input_tokens,
              completionTokens: parsed.usage.output_tokens
            }
          };
        }

        if (parsed.output?.finish_reason) {
          finishReason = this.mapFinish(parsed.output.finish_reason);
          yield { type: 'finish', value: finishReason };
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(LogCategory.AI, 'llama_stream_processing_error', { error: message });
      yield {
        type: 'error',
        message: `Llama stream processing error: ${message}`,
        retryable: false
      };
      finishReason = 'error';
    }

    yield { type: 'finish', value: finishReason };
  }

  async countTokens(target: string | ChatRequest): Promise<TokenCountResult> {
    if (typeof target === 'string') {
      return { prompt: estimateTokenCount(target) };
    }

    // Convert ChatMessage[] to the format expected by estimateMessagesTokenCount
    const formattedMessages = target.messages.map(msg => ({
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(seg => ({ text: seg.type === 'text' ? seg.text : '' }))
    }));

    return {
      prompt: estimateMessagesTokenCount(formattedMessages as any)
    };
  }

  private buildPayload(request: ChatRequest, stream = false) {
    const messages = [] as Array<{ role: string; content: string }>;

    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }

    for (const message of request.messages) {
      let content = '';
      if (typeof message.content === 'string') {
        content = message.content;
      } else {
        // Log warnings for dropped segments
        for (const part of message.content) {
          if (part.type === 'image') {
            this.logger.warn(LogCategory.AI, 'llama_image_segment_dropped', {
              mimeType: (part as { mimeType?: string }).mimeType,
              reason: 'Image segments are not supported by the Llama adapter. Images will be ignored.'
            });
          } else if (part.type !== 'text' && part.type !== 'tool-result') {
            this.logger.warn(LogCategory.AI, 'llama_unsupported_segment_dropped', {
              segmentType: (part as { type: string }).type
            });
          }
        }
        content = message.content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');
      }
      messages.push({ role: message.role === 'tool' ? 'assistant' : message.role, content });
    }

    if (this.toolMode === 'emulated' && request.tools?.length) {
      const tool = request.tools[0];
      const instruction = `Return ONLY JSON with {"tool":"${tool.name}","arguments":<object matching ${JSON.stringify(tool.parameters)}>}.`;
      const last = messages[messages.length - 1];
      last.content += `\n\n${instruction}`;
    }

    const payload: Record<string, unknown> = {
      model: request.metadata?.model ?? this.model,
      input: {
        messages
      },
      parameters: {
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        incremental_output: stream
      }
    };

    if (this.toolMode === 'native' && request.tools?.length) {
      payload.tools = request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
      if (request.tool_choice && request.tool_choice !== 'auto') {
        payload.tool_choice = request.tool_choice;
      }
    }

    return payload;
  }

  private extractToolCalls(output: any, request: ChatRequest): ToolCallResult[] | null {
    if (!request.tools || request.tools.length === 0) {
      return null;
    }

    if (output?.tool_calls?.length) {
      return output.tool_calls.map((call: any, index: number) => ({
        id: call.id ?? `${request.tools![0].name}-${index}`,
        name: call.name ?? request.tools![0].name,
        arguments: call.arguments ?? {}
      }));
    }

    if (this.toolMode === 'emulated' && output?.text) {
      try {
        const parsed = JSON.parse(output.text);
        if (parsed.tool) {
          return [
            {
              id: `${parsed.tool}-${Date.now()}`,
              name: parsed.tool,
              arguments: parsed.arguments
            }
          ];
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private mapFinish(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'tool':
        return 'tool';
      case 'error':
        return 'error';
      default:
        return 'stop';
    }
  }
}
