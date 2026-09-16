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

interface OssAdapterOptions {
  key: string;
  label?: string;
  model: string;
  baseURL: string;
  apiKey?: string;
  toolMode?: 'none' | 'emulated_json';
  streamPath?: string;
  completionPath?: string;
  headers?: Record<string, string>;
  logger?: typeof defaultLogger;
}

export class OssAdapter implements EngineAdapter {
  readonly key: string;
  readonly label: string;

  private readonly model: string;
  private readonly baseURL: string;
  private readonly toolMode: 'none' | 'emulated_json';
  private readonly http: AxiosInstance;
  private readonly streamPath: string;
  private readonly completionPath: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly logger: typeof defaultLogger;

  constructor(options: OssAdapterOptions) {
    this.key = options.key;
    this.label = options.label ?? 'OSS Model';
    this.model = options.model;
    this.baseURL = options.baseURL.replace(/\/$/, '');
    this.toolMode = options.toolMode ?? 'none';
    this.streamPath = options.streamPath ?? '/chat/completions';
    this.completionPath = options.completionPath ?? '/chat/completions';
    this.logger = options.logger ?? defaultLogger;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      ...(options.headers ?? {})
    };

    this.http = axios.create({
      baseURL: this.baseURL,
      headers: this.defaultHeaders,
      timeout: 120_000
    });
  }

  supports(): CapabilityFlags {
    return {
      tools: this.toolMode === 'emulated_json' ? 'emulated' : 'none',
      streaming: true,
      jsonMode: this.toolMode === 'emulated_json',
      vision: false,
      tokenizer: 'huggingface'
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload = this.buildPayload(request);
    const response = await this.http.post(this.completionPath, payload);
    const choice = response.data?.choices?.[0];

    const content = choice?.message?.content;
    const toolCalls = this.extractToolCalls(choice?.message?.content, request);

    return {
      content: toolCalls ? null : content ?? null,
      tool_calls: toolCalls ?? undefined,
      finish_reason: this.mapFinish(choice?.finish_reason),
      usage: response.data?.usage
        ? {
            prompt_tokens: response.data.usage.prompt_tokens,
            completion_tokens: response.data.usage.completion_tokens,
            total_tokens: response.data.usage.total_tokens
          }
        : undefined,
      raw: response.data
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    let response: Response;
    let finishReason: FinishReason = 'stop';

    try {
      const payload = { ...this.buildPayload(request), stream: true };

      response = await fetch(`${this.baseURL}${this.streamPath}`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;
        this.logger.error(LogCategory.AI, 'oss_stream_error', {
          statusCode: response.status,
          isRetryable,
          message: text
        });
        yield {
          type: 'error',
          message: `OSS stream failed: ${response.status} ${text}`,
          retryable: isRetryable
        };
        yield { type: 'finish', value: 'error' };
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(LogCategory.AI, 'oss_stream_setup_error', { error: message });
      yield {
        type: 'error',
        message: `OSS stream setup failed: ${message}`,
        retryable: true
      };
      yield { type: 'finish', value: 'error' };
      return;
    }

    let buffer = '';
    try {
      for await (const event of parseSSE(response)) {
        if (!event.data) {
          continue;
        }
        if (event.data === '[DONE]') {
          break;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          buffer += event.data;
          continue;
        }

        // Handle error events from the stream
        if (parsed.error) {
          this.logger.error(LogCategory.AI, 'oss_stream_error_event', { error: parsed.error });
          yield {
            type: 'error',
            message: parsed.error.message || 'Unknown stream error',
            retryable: false
          };
          finishReason = 'error';
          break;
        }

        const delta = parsed.choices?.[0]?.delta;
        const choice = parsed.choices?.[0];
        if (!delta && !choice) {
          continue;
        }

        if (delta?.content) {
          yield { type: 'token', value: delta.content };
        }

        // Check for finish_reason in delta or choice
        const reason = delta?.finish_reason || choice?.finish_reason;
        if (reason) {
          finishReason = this.mapFinish(reason);
          yield { type: 'finish', value: finishReason };
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(LogCategory.AI, 'oss_stream_processing_error', { error: message });
      yield {
        type: 'error',
        message: `OSS stream processing error: ${message}`,
        retryable: false
      };
      finishReason = 'error';
    }

    if (buffer.trim()) {
      // Attempt to parse buffered JSON for tool call on stream end
      const toolCalls = this.extractToolCalls(buffer, request);
      if (toolCalls) {
        for (const call of toolCalls) {
          yield { type: 'tool_call_delta', value: { ...call, isFinal: true } };
        }
        finishReason = 'tool';
      }
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

  private buildPayload(request: ChatRequest) {
    const messages = [] as Array<{ role: string; content: string }>;

    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }

    const normalizedMessages = request.messages.map(message => {
      if (typeof message.content === 'string') {
        return { role: message.role, content: message.content };
      }
      // Log warnings for dropped segments
      for (const part of message.content) {
        if (part.type === 'image') {
          this.logger.warn(LogCategory.AI, 'oss_image_segment_dropped', {
            mimeType: (part as { mimeType?: string }).mimeType,
            reason: 'Image segments are not supported by OSS models. Images will be ignored.'
          });
        } else if (part.type !== 'text' && part.type !== 'tool-result') {
          this.logger.warn(LogCategory.AI, 'oss_unsupported_segment_dropped', {
            segmentType: (part as { type: string }).type
          });
        }
      }
      const text = message.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
      return { role: message.role, content: text };
    });

    messages.push(...normalizedMessages);

    if (this.toolMode === 'emulated_json' && request.tools && request.tools.length > 0) {
      const schema = request.tools[0].parameters;
      const toolName = request.tools[0].name;
      const instruction = this.buildToolInstruction(toolName, schema, request.tool_choice);
      const last = messages[messages.length - 1];
      last.content += `\n\n${instruction}`;
    }

    return {
      model: request.metadata?.model ?? this.model,
      messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      stop: request.stop
    };
  }

  private buildToolInstruction(name: string, schema: Record<string, unknown>, choice?: ChatRequest['tool_choice']) {
    const requirement = choice === 'required' ? 'You must return a tool invocation.' : 'If a tool is appropriate, respond with a tool invocation.';
    return `TOOL PROTOCOL:\n${requirement}\nRespond with JSON only.\nFormat: {"tool":"${name}","arguments":<JSON matching schema below>}\nSchema:${JSON.stringify(schema)}`;
  }

  private extractToolCalls(content: any, request: ChatRequest): ToolCallResult[] | null {
    if (this.toolMode !== 'emulated_json' || !request.tools?.length) {
      return null;
    }

    const primaryTool = request.tools[0];
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.join('') : '';

    try {
      const parsed = JSON.parse(text);
      if (parsed?.tool && parsed.tool === primaryTool.name) {
        return [
          {
            id: `${primaryTool.name}-${Date.now()}`,
            name: primaryTool.name,
            arguments: parsed.arguments
          }
        ];
      }
    } catch {
      return null;
    }

    return null;
  }

  private mapFinish(reason: string | null | undefined): 'stop' | 'length' | 'tool' | 'error' {
    switch (reason) {
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool';
      default:
        return 'stop';
    }
  }
}
