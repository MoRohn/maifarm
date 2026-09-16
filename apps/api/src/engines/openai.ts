import OpenAI, { APIError, APIConnectionError, RateLimitError, AuthenticationError } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
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
import { logger as defaultLogger, LogCategory } from '../utils/logger';

/**
 * Custom error class for OpenAI API errors with retry information
 */
export class OpenAIApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
    public readonly retryAfterMs?: number,
    public readonly errorType?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'OpenAIApiError';
  }

  static fromOpenAIError(error: unknown): OpenAIApiError {
    // Handle rate limit errors
    if (error instanceof RateLimitError) {
      const retryAfter = error.headers?.['retry-after'];
      return new OpenAIApiError(
        `OpenAI rate limit exceeded: ${error.message}`,
        429,
        true,
        retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000, // Default 60s retry
        'rate_limit',
        error
      );
    }

    // Handle authentication errors
    if (error instanceof AuthenticationError) {
      return new OpenAIApiError(
        `OpenAI authentication failed: ${error.message}`,
        401,
        false,
        undefined,
        'authentication',
        error
      );
    }

    // Handle connection errors
    if (error instanceof APIConnectionError) {
      return new OpenAIApiError(
        `OpenAI connection error: ${error.message}`,
        0,
        true, // Network errors are retryable
        5000, // 5s default retry
        'connection',
        error
      );
    }

    // Handle generic API errors
    if (error instanceof APIError) {
      const isRetryable = error.status === 429 ||
                          error.status === 503 ||
                          error.status === 500 ||
                          (error.status !== undefined && error.status >= 502);
      return new OpenAIApiError(
        `OpenAI API error (${error.status}): ${error.message}`,
        error.status ?? 0,
        isRetryable,
        undefined,
        error.type ?? 'api_error',
        error
      );
    }

    // Handle unknown errors
    if (error instanceof Error) {
      return new OpenAIApiError(
        `OpenAI error: ${error.message}`,
        0,
        true,
        5000,
        'unknown',
        error
      );
    }

    return new OpenAIApiError('Unknown OpenAI error', 0, false, undefined, 'unknown', error);
  }
}

interface OpenAIAdapterOptions {
  key: string;
  label?: string;
  apiKey: string;
  model: string;
  baseURL?: string;
  organization?: string;
  headers?: Record<string, string>;
  logger?: typeof defaultLogger;
}

export class OpenAIAdapter implements EngineAdapter {
  readonly key: string;
  readonly label: string;

  private readonly model: string;
  private readonly client: OpenAI;
  private readonly defaultHeaders?: Record<string, string>;
  private readonly logger: typeof defaultLogger;

  constructor(options: OpenAIAdapterOptions) {
    this.key = options.key;
    this.label = options.label ?? 'OpenAI';
    this.model = options.model;
    this.logger = options.logger ?? defaultLogger;

    this.defaultHeaders = options.headers;

    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      organization: options.organization,
      defaultHeaders: this.defaultHeaders
    });
  }

  supports(): CapabilityFlags {
    return {
      tools: 'native',
      streaming: true,
      jsonMode: true,
      vision: true,
      maxContextTokens: 128_000,
      maxOutputTokens: 16_384,
      tokenizer: 'openai'
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const completion = await this.client.chat.completions.create({
        model: request.metadata?.model ?? this.model,
        messages: this.buildMessages(request),
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: request.stop,
        tools: this.toOpenAITools(request),
        tool_choice: this.toToolChoice(request),
        response_format: this.toResponseFormat(request)
      });

      const choice = completion.choices[0];
      const content = choice.message.content;

      // Filter to only function-type tool calls and extract data
      const toolCalls = choice.message.tool_calls
        ?.filter((call): call is typeof call & { type: 'function'; function: { name: string; arguments: string } } =>
          call.type === 'function' && 'function' in call)
        .map(call => ({
          id: call.id,
          name: call.function.name,
          arguments: safeJsonParse(call.function.arguments)
        })) as ToolCallResult[] | undefined;

      return {
        content: content ?? null,
        tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        usage: completion.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens
            }
          : undefined,
        finish_reason: this.mapFinish(choice.finish_reason),
        raw: completion
      };
    } catch (error) {
      // Convert OpenAI errors to our standardized error type
      const apiError = OpenAIApiError.fromOpenAIError(error);
      this.logger.error(LogCategory.AI, 'openai_chat_error', {
        statusCode: apiError.statusCode,
        errorType: apiError.errorType,
        isRetryable: apiError.isRetryable,
        message: apiError.message
      });
      throw apiError;
    }
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

    try {
      stream = await this.client.chat.completions.create({
        model: request.metadata?.model ?? this.model,
        messages: this.buildMessages(request),
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: request.stop,
        tools: this.toOpenAITools(request),
        tool_choice: this.toToolChoice(request),
        stream: true,
        response_format: this.toResponseFormat(request)
      });
    } catch (error) {
      // Handle connection/setup errors before stream starts
      const apiError = OpenAIApiError.fromOpenAIError(error);
      this.logger.error(LogCategory.AI, 'openai_stream_setup_error', {
        statusCode: apiError.statusCode,
        errorType: apiError.errorType,
        isRetryable: apiError.isRetryable,
        message: apiError.message
      });
      throw apiError;
    }

    let finish: StreamEvent | null = null;
    let finishReason: 'stop' | 'length' | 'tool' | 'error' = 'stop';

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice.delta;

        if (delta.content) {
          const contentDelta = Array.isArray(delta.content)
            ? delta.content.map(part => part.text ?? '').join('')
            : delta.content;
          if (contentDelta) {
            yield { type: 'token', value: contentDelta };
          }
        }

        if (delta.tool_calls) {
          for (const call of delta.tool_calls) {
            yield {
              type: 'tool_call_delta',
              value: {
                id: call.id ?? call.index?.toString() ?? 'tool',
                name: call.function?.name,
                argumentsJson: call.function?.arguments,
                isFinal: choice.finish_reason === 'tool_calls'
              }
            };
          }
        }

        if (chunk.usage) {
          yield {
            type: 'usage',
            value: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens
            }
          };
        }

        if (choice.finish_reason) {
          finishReason = this.mapFinish(choice.finish_reason);
          finish = { type: 'finish', value: finishReason };
        }
      }
    } catch (error) {
      // Handle errors during stream processing
      const apiError = error instanceof OpenAIApiError ? error : OpenAIApiError.fromOpenAIError(error);
      this.logger.error(LogCategory.AI, 'openai_stream_processing_error', {
        statusCode: apiError.statusCode,
        errorType: apiError.errorType,
        message: apiError.message
      });
      yield {
        type: 'error',
        message: apiError.message,
        retryable: apiError.isRetryable
      };
      finishReason = 'error';
    }

    yield finish ?? { type: 'finish', value: finishReason };
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

  private buildMessages(request: ChatRequest): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];

    if (request.system) {
      messages.push({
        role: 'system',
        content: request.system
      });
    }

    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        messages.push({ role: message.role as any, content: message.content });
      } else {
        // Log warnings for dropped segments
        for (const part of message.content) {
          if (part.type === 'image') {
            this.logger.warn(LogCategory.AI, 'openai_image_segment_dropped', {
              mimeType: (part as { mimeType?: string }).mimeType,
              reason: 'Image segments are not yet fully supported in buildMessages. Consider using vision endpoints directly.'
            });
          } else if (part.type !== 'text' && part.type !== 'tool-result') {
            this.logger.warn(LogCategory.AI, 'openai_unsupported_segment_dropped', {
              segmentType: (part as { type: string }).type
            });
          }
        }
        const textContent = message.content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');
        messages.push({ role: message.role as any, content: textContent });
      }
    }

    return messages;
  }

  private toOpenAITools(request: ChatRequest) {
    if (!request.tools || request.tools.length === 0) {
      return undefined;
    }

    return request.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  private toToolChoice(request: ChatRequest) {
    const choice = request.tool_choice;
    if (!choice || choice === 'auto') {
      return undefined;
    }
    if (choice === 'none') {
      return 'none';
    }
    if (choice === 'required') {
      return 'auto';
    }
    if (typeof choice === 'object' && choice.name) {
      return { type: 'function', function: { name: choice.name } } as const;
    }
    return undefined;
  }

  private toResponseFormat(request: ChatRequest): { type: 'json_schema'; json_schema: { name: string; schema: any; strict: boolean } } | { type: 'text' } | undefined {
    if (!request.response_format) {
      return undefined;
    }

    if (request.response_format.type === 'json_schema') {
      const schemaTitle = request.response_format.schema?.title;
      return {
        type: 'json_schema' as const,
        json_schema: {
          name: typeof schemaTitle === 'string' ? schemaTitle : 'maifarm_response',
          schema: request.response_format.schema as any,
          strict: true
        }
      };
    }

    return { type: 'text' as const };
  }

  private mapFinish(reason: string | null | undefined): 'stop' | 'length' | 'tool' | 'error' {
    switch (reason) {
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool';
      case 'content_filter':
        return 'error';
      default:
        return 'stop';
    }
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
