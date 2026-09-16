/**
 * Canonical segment union for multimodal content. Engines that do not
 * support multimodal inputs should collapse segments to plain text.
 */
export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }
  | { type: 'tool-result'; tool: string; result: unknown };

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  /** Plain text or structured segments depending on provider capabilities */
  content: string | MessageSegment[];
  /** Optional identifier for attributing follow-up tool calls */
  id?: string;
  /** Provider-specific metadata (kept opaque) */
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  /** JSON Schema describing arguments */
  parameters: Record<string, unknown>;
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { name: string };

export interface ResponseFormatText {
  type: 'text';
}

export interface ResponseFormatJsonSchema {
  type: 'json_schema';
  schema: Record<string, unknown>;
}

export type ResponseFormat = ResponseFormatText | ResponseFormatJsonSchema;

export interface ChatRequest {
  id?: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  response_format?: ResponseFormat;
  metadata?: Record<string, string>;
  /** Engine-specific tunables (kept opaque to caller) */
  extensions?: Record<string, unknown>;
}

export interface ToolCallDelta {
  /** Provider generated tool call id */
  id: string;
  name?: string;
  argumentsJson?: string;
  /** Parsed arguments when available */
  arguments?: unknown;
  /** Whether the tool call is complete */
  isFinal?: boolean;
}

export interface StreamUsageDelta {
  promptTokens?: number;
  completionTokens?: number;
}

export type StreamEvent =
  | { type: 'token'; value: string }
  | { type: 'tool_call_delta'; value: ToolCallDelta }
  | { type: 'usage'; value: StreamUsageDelta }
  | { type: 'heartbeat' }
  | { type: 'error'; message: string; retryable?: boolean }
  | { type: 'finish'; value: FinishReason };

export type FinishReason = 'stop' | 'length' | 'tool' | 'error';

export interface ChatResponseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatResponse {
  content: string | { json: unknown } | null;
  tool_calls?: ToolCallResult[];
  usage?: ChatResponseUsage;
  finish_reason: FinishReason;
  raw?: unknown;
}

export interface TokenCountResult {
  prompt: number;
  completion?: number;
}

export interface CapabilityFlags {
  tools: 'native' | 'emulated' | 'none';
  streaming: boolean;
  jsonMode: boolean;
  vision: boolean;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  tokenizer?: 'anthropic' | 'openai' | 'tiktoken' | 'huggingface' | 'custom';
}

export interface EngineAdapter {
  /** Stable identifier (matches key in engines.yaml) */
  readonly key: string;
  /** Provider readable name for logging */
  readonly label: string;
  /** Returns canonical capability description */
  supports(): CapabilityFlags;
  /** One-shot, non-streaming call */
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** Streaming call delivering incremental events */
  stream(request: ChatRequest): AsyncIterable<StreamEvent>;
  /** Token accounting for pre-flight checks */
  countTokens(target: string | ChatMessage[] | ChatRequest): Promise<TokenCountResult>;
  /** Allow adapters to release resources */
  shutdown?(): Promise<void>;
}

export type EngineFactory = (config: Record<string, unknown>) => EngineAdapter;

