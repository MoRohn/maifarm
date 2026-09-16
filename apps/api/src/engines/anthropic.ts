import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger as defaultLogger } from '../utils/logger';
import type {
  CapabilityFlags,
  ChatRequest,
  ChatResponse,
  EngineAdapter,
  StreamEvent,
  TokenCountResult,
  ToolCallResult
} from './engine-adapter';
import { estimateMessagesTokenCount, estimateTokenCount } from './token-estimator';
import { parseSSE } from './streaming';

/**
 * Custom error class for Anthropic API errors with retry information
 */
export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
    public readonly retryAfterMs?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AnthropicApiError';
  }

  static fromAxiosError(error: AxiosError): AnthropicApiError {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as { error?: { message?: string; type?: string } } | undefined;
    const message = data?.error?.message || error.message || 'Unknown Anthropic API error';

    // Determine if error is retryable based on status code
    const isRetryable = status === 429 || status === 503 || status === 500 || status >= 502;

    // Parse retry-after header if present
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined;

    return new AnthropicApiError(
      `Anthropic API error (${status}): ${message}`,
      status,
      isRetryable,
      retryAfterMs,
      error
    );
  }

  static fromNetworkError(error: Error): AnthropicApiError {
    return new AnthropicApiError(
      `Anthropic network error: ${error.message}`,
      0,
      true, // Network errors are typically retryable
      5000, // Default 5s retry delay
      error
    );
  }
}

const ANTHROPIC_VERSION = process.env.ANTHROPIC_API_VERSION || '2023-06-01';

interface AnthropicAdapterOptions {
  key: string;
  label?: string;
  apiKey: string;
  model: string;
  baseURL?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
}

interface AnthropicMessageContent {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicMessageContent[];
}

export class AnthropicAdapter implements EngineAdapter {
  readonly key: string;
  readonly label: string;

  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly timeoutMs: number;
  private readonly logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
  private readonly http: AxiosInstance;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: AnthropicAdapterOptions) {
    this.key = options.key;
    this.label = options.label ?? 'Anthropic Claude';
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL ?? 'https://api.anthropic.com/v1';
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.logger = options.logger ?? defaultLogger;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      ...(options.headers ?? {})
    };

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeoutMs,
      headers: this.defaultHeaders
    });
  }

  supports(): CapabilityFlags {
    return {
      tools: 'native',
      streaming: true,
      jsonMode: true,
      vision: true,
      maxContextTokens: 200_000,
      maxOutputTokens: 8_192,
      tokenizer: 'anthropic'
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const payload = this.buildPayload(request);
      const response = await this.http.post('/messages', payload);

      const message = response.data;
      const blocks = message.content ?? [];
      const text = blocks
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const toolCalls: ToolCallResult[] | undefined = blocks
        .filter((block: any) => block.type === 'tool_use')
        .map((block: any) => ({
          id: block.id,
          name: block.name,
          arguments: block.input
        }));

      return {
        content: text || null,
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        usage: message.usage
          ? {
              prompt_tokens: message.usage.input_tokens,
              completion_tokens: message.usage.output_tokens,
              total_tokens: message.usage.input_tokens + message.usage.output_tokens
            }
          : undefined,
        finish_reason: message.stop_reason ?? 'stop',
        raw: message
      };
    } catch (error) {
      // Handle Axios errors with specific error information
      if (axios.isAxiosError(error)) {
        const apiError = AnthropicApiError.fromAxiosError(error);
        this.logger?.error?.('anthropic_chat_error', {
          statusCode: apiError.statusCode,
          isRetryable: apiError.isRetryable,
          message: apiError.message
        });
        throw apiError;
      }

      // Handle network/other errors
      if (error instanceof Error) {
        const networkError = AnthropicApiError.fromNetworkError(error);
        this.logger?.error?.('anthropic_chat_network_error', {
          message: networkError.message
        });
        throw networkError;
      }

      // Unknown error type
      this.logger?.error?.('anthropic_chat_unknown_error', { error });
      throw new AnthropicApiError('Unknown error during Anthropic chat', 0, false, undefined, error);
    }
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    let response: Response;

    try {
      const payload = this.buildPayload(request, true);

      response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        const apiError = new AnthropicApiError(
          `Anthropic stream failed: ${response.status} ${errorText}`,
          response.status,
          response.status === 429 || response.status >= 500,
          response.headers.get('retry-after')
            ? parseInt(response.headers.get('retry-after')!, 10) * 1000
            : undefined
        );
        this.logger?.error?.('anthropic_stream_error', {
          statusCode: apiError.statusCode,
          isRetryable: apiError.isRetryable,
          message: apiError.message
        });
        throw apiError;
      }
    } catch (error) {
      // If it's already our error type, re-throw
      if (error instanceof AnthropicApiError) {
        throw error;
      }

      // Handle network/fetch errors
      if (error instanceof Error) {
        const networkError = AnthropicApiError.fromNetworkError(error);
        this.logger?.error?.('anthropic_stream_network_error', {
          message: networkError.message
        });
        throw networkError;
      }

      throw new AnthropicApiError('Unknown error during Anthropic stream', 0, false, undefined, error);
    }

    let finishReason: 'stop' | 'length' | 'tool' | 'error' = 'stop';

    try {
      for await (const event of parseSSE(response)) {
        if (!event.data) {
          continue;
        }

        if (event.data === '[DONE]') {
          break;
        }

        let payloadObj: any;
        try {
          payloadObj = JSON.parse(event.data);
        } catch (error) {
          this.logger?.warn?.('anthropic_sse_parse_error', { error, data: event.data });
          continue;
        }

        // Handle error events from the stream
        if (payloadObj.type === 'error') {
          const errorMessage = payloadObj.error?.message || 'Unknown stream error';
          const errorType = payloadObj.error?.type;
          this.logger?.error?.('anthropic_stream_error_event', { error: payloadObj.error });
          yield {
            type: 'error',
            message: errorMessage,
            retryable: errorType === 'overloaded_error' || errorType === 'rate_limit_error'
          };
          finishReason = 'error';
          break;
        }

        switch (payloadObj.type) {
          case 'ping':
            yield { type: 'heartbeat' };
            break;
          case 'content_block_delta': {
            const delta = payloadObj.delta;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              yield { type: 'token', value: delta.text };
            } else if (delta?.type === 'tool_use_delta') {
              yield {
                type: 'tool_call_delta',
                value: {
                  id: payloadObj.content_block?.id ?? payloadObj.index?.toString() ?? 'tool',
                  name: payloadObj.content_block?.name,
                  argumentsJson: delta.partial_json,
                  isFinal: false
                }
              };
            }
            break;
          }
          case 'content_block_stop': {
            if (payloadObj.content_block?.type === 'tool_use') {
              yield {
                type: 'tool_call_delta',
                value: {
                  id: payloadObj.content_block.id,
                  name: payloadObj.content_block.name,
                  arguments: payloadObj.content_block.input,
                  isFinal: true
                }
              };
            }
            break;
          }
          case 'message_delta':
            if (payloadObj.delta?.stop_reason) {
              finishReason = payloadObj.delta.stop_reason;
            }
            if (payloadObj.delta?.usage) {
              const usage = payloadObj.delta.usage;
              yield {
                type: 'usage',
                value: {
                  promptTokens: usage.input_tokens,
                  completionTokens: usage.output_tokens
                }
              };
            }
            break;
          case 'message_stop':
            finishReason = payloadObj.stop_reason ?? finishReason;
            break;
          default:
            break;
        }
      }
    } catch (error) {
      // Handle stream processing errors
      this.logger?.error?.('anthropic_stream_processing_error', { error });
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Stream processing error',
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

    const request = typeof target === 'object' && 'messages' in target ? target : undefined;
    if (!request) {
      return { prompt: 0 };
    }

    try {
      const payload = this.buildPayload(request, false, true);
      const response = await this.http.post('/messages/count_tokens', payload);
      const messages = payload.messages as Array<{ content: string | { text?: string } | Array<{ text?: string }> }>;
      return {
        prompt: response.data?.input_tokens ?? estimateMessagesTokenCount(messages),
        completion: response.data?.output_tokens
      };
    } catch (error) {
      this.logger?.warn?.('anthropic_count_tokens_fallback', { error });
      return {
        prompt: estimateMessagesTokenCount(this.toAnthropicMessages(request))
      };
    }
  }

  private buildPayload(request: ChatRequest, stream = false, forCount = false) {
    const messages = this.toAnthropicMessages(request);

    const payload: Record<string, unknown> = {
      model: request.metadata?.model ?? this.model,
      messages,
      max_tokens: request.max_tokens ?? request.extensions?.max_tokens ?? 1024,
      temperature: request.temperature,
      top_p: request.top_p,
      stop_sequences: request.stop,
      stream,
      system: request.system,
      tool_choice: request.tool_choice === 'none' ? { type: 'tool', name: 'none' } : undefined
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }));
    }

    if (request.response_format) {
      if (request.response_format.type === 'json_schema') {
        payload.response_format = {
          type: 'json_schema',
          schema: request.response_format.schema
        };
      } else {
        payload.response_format = { type: 'text' };
      }
    }

    if (forCount) {
      delete payload.stream;
      delete payload.tool_choice;
    }

    return payload;
  }

  private toAnthropicMessages(request: ChatRequest): AnthropicMessage[] {
    return request.messages.map(message => {
      if (typeof message.content === 'string') {
        return {
          role: this.mapRole(message.role),
          content: [{ type: 'text', text: message.content }]
        } satisfies AnthropicMessage;
      }

      return {
        role: this.mapRole(message.role),
        content: message.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          }
          if (part.type === 'tool-result') {
            return {
              type: 'tool_result',
              tool_use_id: part.tool,
              text: typeof part.result === 'string' ? part.result : JSON.stringify(part.result)
            };
          }
          if (part.type === 'image') {
            // Anthropic Messages API does not yet support image uploads in Code context
            // Log warning so users understand why images are not processed
            this.logger?.warn?.('anthropic_image_segment_dropped', {
              mimeType: (part as { mimeType?: string }).mimeType,
              reason: 'Image segments are not yet supported by the Anthropic adapter. Images will be ignored.'
            });
            return { type: 'text', text: '[Image content not supported]' };
          }
          // Drop other unsupported segments with warning
          this.logger?.warn?.('anthropic_unsupported_segment_dropped', { segmentType: (part as any).type });
          return { type: 'text', text: '' };
        })
      } satisfies AnthropicMessage;
    });
  }

  private mapRole(role: string): 'user' | 'assistant' {
    if (role === 'assistant' || role === 'tool') {
      return 'assistant';
    }
    return 'user';
  }
}
