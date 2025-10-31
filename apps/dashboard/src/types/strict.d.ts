// Strict Type Definitions for MaiFarm

// Branded types for type safety
export type UUID = string & { __brand: 'UUID' };
export type Timestamp = Date & { __brand: 'Timestamp' };
export type NonEmptyString = string & { __brand: 'NonEmptyString' };

// Utility types
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Status enums with const assertion
export const FarmStatus = {
  IDLE: 'idle',
  LAUNCHING: 'launching',
  RUNNING: 'running',
  ACTIVE: 'active',
  HARVESTING: 'harvesting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CRASHED: 'crashed',
  STOPPED: 'stopped',
} as const;

export type FarmStatusType = typeof FarmStatus[keyof typeof FarmStatus];

export const AgentStatus = {
  IDLE: 'idle',
  PROVISIONING: 'provisioning',
  STARTING: 'starting',
  RUNNING: 'running',
  ACTIVE: 'active',
  BUSY: 'busy',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
  TERMINATED: 'terminated',
} as const;

export type AgentStatusType = typeof AgentStatus[keyof typeof AgentStatus];

// Strict Farm type
export interface StrictFarm {
  readonly id: UUID;
  readonly name: NonEmptyString;
  readonly status: FarmStatusType;
  readonly agents: ReadonlyArray<StrictAgent>;
  readonly config: DeepReadonly<FarmConfig>;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly createdBy?: UUID;
  readonly timeout?: number;
  readonly metadata?: DeepReadonly<Record<string, unknown>>;
}

// Strict Agent type
export interface StrictAgent {
  readonly id: UUID;
  readonly farmId: UUID;
  readonly name: NonEmptyString;
  readonly status: AgentStatusType;
  readonly type: 'claude' | 'openai' | 'qwen' | 'ollama';
  readonly health?: StrictAgentHealth;
  readonly resources?: StrictAgentResources;
  readonly metrics?: DeepReadonly<AgentMetrics>;
  readonly createdAt: Timestamp;
  readonly lastActivity?: Timestamp;
}

export interface StrictAgentHealth {
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  readonly lastCheck?: Timestamp;
  readonly errorCount?: number;
  readonly message?: string;
}

export interface StrictAgentResources {
  readonly cpu: {
    readonly allocated: number;
    readonly used: number;
    readonly limit: number;
  };
  readonly memory: {
    readonly allocated: number;
    readonly used: number;
    readonly limit: number;
  };
  readonly gpu?: {
    readonly allocated: number;
    readonly used: number;
    readonly limit: number;
  };
}

// Strict configuration types
export interface FarmConfig {
  readonly prompt: NonEmptyString;
  readonly agentCount: number;
  readonly provider: AIProvider;
  readonly timeout?: number;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly systemPrompt?: string;
  readonly tools?: ReadonlyArray<string>;
  readonly environment?: DeepReadonly<Record<string, string>>;
}

export type AIProvider = 'claude' | 'openai' | 'qwen' | 'ollama' | 'mock';

// Strict Harvest types
export interface StrictHarvest {
  readonly id: UUID;
  readonly farmId: UUID;
  readonly status: HarvestStatusType;
  readonly results: ReadonlyArray<HarvestResult>;
  readonly insights: ReadonlyArray<HarvestInsight>;
  readonly yield: ReadonlyArray<HarvestYield>;
  readonly createdAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly metadata?: DeepReadonly<Record<string, unknown>>;
}

export const HarvestStatus = {
  PENDING: 'pending',
  COLLECTING: 'collecting',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
} as const;

export type HarvestStatusType = typeof HarvestStatus[keyof typeof HarvestStatus];

export interface HarvestResult {
  readonly id: UUID;
  readonly agentId: UUID;
  readonly type: string;
  readonly content: unknown;
  readonly timestamp: Timestamp;
}

export interface HarvestInsight {
  readonly id: UUID;
  readonly category: string;
  readonly description: string;
  readonly importance: 'low' | 'medium' | 'high' | 'critical';
  readonly timestamp: Timestamp;
}

export interface HarvestYield {
  readonly id: UUID;
  readonly name: NonEmptyString;
  readonly type: string;
  readonly size: number;
  readonly path?: string;
  readonly content?: unknown;
  readonly createdAt: Timestamp;
}

// Type guards
export function isUUID(value: unknown): value is UUID {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isFarmStatus(value: unknown): value is FarmStatusType {
  return Object.values(FarmStatus).includes(value as any);
}

export function isAgentStatus(value: unknown): value is AgentStatusType {
  return Object.values(AgentStatus).includes(value as any);
}

// Validation functions
export function validateFarm(farm: unknown): farm is StrictFarm {
  if (!farm || typeof farm !== 'object') return false;
  const f = farm as any;
  return (
    isUUID(f.id) &&
    isNonEmptyString(f.name) &&
    isFarmStatus(f.status) &&
    Array.isArray(f.agents) &&
    f.agents.every(validateAgent) &&
    isTimestamp(f.createdAt) &&
    isTimestamp(f.updatedAt)
  );
}

export function validateAgent(agent: unknown): agent is StrictAgent {
  if (!agent || typeof agent !== 'object') return false;
  const a = agent as any;
  return (
    isUUID(a.id) &&
    isUUID(a.farmId) &&
    isNonEmptyString(a.name) &&
    isAgentStatus(a.status) &&
    ['claude', 'openai', 'qwen', 'ollama'].includes(a.type) &&
    isTimestamp(a.createdAt)
  );
}

// Result types for operations
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: Timestamp;
    requestId: string;
    duration: number;
  };
}

// Event types
export interface FarmEvent {
  readonly type: 'created' | 'updated' | 'deleted' | 'status_changed';
  readonly farmId: UUID;
  readonly timestamp: Timestamp;
  readonly payload: unknown;
}

export interface AgentEvent {
  readonly type: 'provisioned' | 'terminated' | 'status_changed' | 'health_changed';
  readonly agentId: UUID;
  readonly farmId: UUID;
  readonly timestamp: Timestamp;
  readonly payload: unknown;
}

// Strict WebSocket message types
export interface WebSocketMessage<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: T;
  readonly timestamp: Timestamp;
  readonly metadata?: DeepReadonly<Record<string, unknown>>;
}

// Export type utilities
export type {
  UUID as StrictUUID,
  Timestamp as StrictTimestamp,
  NonEmptyString as StrictNonEmptyString,
};