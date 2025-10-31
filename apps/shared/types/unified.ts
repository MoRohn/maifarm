/**
 * Unified Type Definitions for MaiFarm
 * Ensures consistency between server and client
 */

// ============================================
// Agent Types
// ============================================

/**
 * Unified agent status type
 * Used consistently across server and client
 */
export type AgentStatus = 
  | 'idle'           // Not working on anything
  | 'initializing'   // Starting up
  | 'active'         // Working on a task
  | 'working'        // Alias for active
  | 'busy'           // Processing intensive task
  | 'completed'      // Finished all tasks
  | 'paused'         // Temporarily stopped
  | 'error'          // Encountered an error
  | 'failed'         // Fatal error, cannot continue
  | 'terminating'    // Shutting down
  | 'terminated';    // Fully stopped

/**
 * Agent health status
 */
export type AgentHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Agent state for lifecycle management
 */
export interface AgentState {
  current: 'initializing' | 'idle' | 'busy' | 'draining' | 'terminating' | 'terminated';
  previous?: string;
  transitionTime: Date;
  reason?: string;
}

/**
 * Agent type classification
 */
export type AgentType = 'builder' | 'reviewer' | 'tester' | 'documenter' | 'custom';

/**
 * Complete agent interface
 */
export interface Agent {
  id: string;
  farmId: string;
  name: string;
  displayName?: string; // Farm animal name (e.g., "Bessie the Cow")
  agentNumber: number;  // 1-based index for display
  type: AgentType;
  status: AgentStatus;
  health?: AgentHealth;
  
  // Tmux session info
  sessionName?: string;
  paneId?: number;      // 0-based pane index
  
  // Resource usage
  resources?: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
  
  // Task tracking
  currentTask?: string;
  progress?: number;
  
  // Metrics
  metrics?: {
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    uptime: number;
    efficiency: number;
  };
  
  // Timestamps
  lastHeartbeat?: Date;
  lastActivity?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Farm Types
// ============================================

/**
 * Farm status type
 */
export type FarmStatus = 
  | 'idle'        // Not started
  | 'launching'   // Starting up agents
  | 'active'      // Running
  | 'running'     // Alias for active
  | 'paused'      // Temporarily stopped
  | 'harvesting'  // Collecting outputs
  | 'completed'   // Successfully finished
  | 'failed'      // Fatal error
  | 'terminated'; // Forcefully stopped

/**
 * Farm orchestration strategy
 */
export type OrchestrationStrategy = 'round-robin' | 'least-loaded' | 'priority' | 'custom';

/**
 * AI Provider type
 */
export type AIProvider = 'claude' | 'openai' | 'qwen' | 'ollama';

/**
 * Complete farm interface
 */
export interface Farm {
  id: string;
  name: string;
  description?: string;
  status: FarmStatus;
  provider?: AIProvider;
  orchestratorType?: 'xenosync';
  
  // Agent management
  agents: Agent[] | string[]; // Can be full objects or just IDs
  agentCount?: number;
  
  // Configuration
  config: {
    yaml?: string;
    maxAgents?: number;
    timeout?: number; // In seconds for Farm/GoWild, ms for internal use
    autoScale?: boolean;
    orchestrationStrategy?: OrchestrationStrategy;
    resourceLimits?: {
      totalCpu: number;
      totalMemory: number;
      totalGpu?: number;
    };
  };
  
  // Metrics
  metrics?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    queuedTasks: number;
    efficiency: number;
    resourceUtilization?: {
      cpu: number;
      memory: number;
      gpu?: number;
    };
  };
  
  // Metadata
  metadata?: {
    isQuickTask?: boolean;
    isGoWild?: boolean;
    templateUsed?: string;
    [key: string]: any;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================
// Terminal Types
// ============================================

/**
 * Terminal output event
 */
export interface TerminalOutput {
  sessionName: string;
  farmId: string;
  agentId: number;      // 0-based index
  agentName?: string;   // Display name
  lines: string[];
  timestamp: Date;
}

/**
 * Terminal stream status
 */
export interface TerminalStreamStatus {
  sessionName: string;
  farmId: string;
  agentCount: number;
  streaming: boolean;
  method: 'pipe-pane' | 'capture-pane';
  activePanes: number[];
}

// ============================================
// Harvest Types
// ============================================

/**
 * Harvest status
 */
export type HarvestStatus = 
  | 'pending'
  | 'collecting'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Harvest interface
 */
export interface Harvest {
  id: string;
  farmId: string;
  status: HarvestStatus;
  files: HarvestFile[];
  summary?: string;
  metrics?: {
    filesCollected: number;
    totalSize: number;
    duration: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Harvest file
 */
export interface HarvestFile {
  path: string;
  relativePath: string;
  size: number;
  content?: string;
  mimeType?: string;
  agentId?: string;
  createdAt: Date;
}

// ============================================
// Task Types
// ============================================

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task status
 */
export type TaskStatus = 
  | 'queued'
  | 'assigned'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Task interface
 */
export interface Task {
  id: string;
  farmId: string;
  agentId?: string;
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  retries: number;
  maxRetries: number;
  timeout: number; // milliseconds
  createdAt: Date;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================
// WebSocket Event Types
// ============================================

/**
 * WebSocket event names
 */
export type WebSocketEvent = 
  // Agent events
  | 'agent:created'
  | 'agent:updated'
  | 'agent:status'
  | 'agent:health:status'
  | 'agent:recovered'
  | 'agent:terminated'
  
  // Farm events
  | 'farm:created'
  | 'farm:status'
  | 'farm:updated'
  | 'farm:completed'
  | 'farm:failed'
  
  // Task events
  | 'task:created'
  | 'task:assigned'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  
  // Terminal events
  | 'terminal:output'
  | 'terminal:joined'
  | 'terminal:streaming:ready'
  | 'terminal:stream:error'
  
  // Harvest events
  | 'harvest:started'
  | 'harvest:progress'
  | 'harvest:ready'
  | 'harvest:collected'
  | 'harvest:failed'
  
  // Metrics events
  | 'metrics:update'
  | 'metrics:agent'
  | 'metrics:farm';

/**
 * WebSocket message structure
 */
export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  data: T;
  timestamp: Date;
  correlationId?: string;
}

// ============================================
// Logging Types
// ============================================

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  timestamp: Date;
  correlationId?: string;
  context?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

// ============================================
// API Response Types
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: Date;
  };
}

// ============================================
// Timing Constants
// ============================================

/**
 * System timing constants (all in milliseconds)
 */
export const TIMING = {
  // Quick Task
  QUICK_TASK_TIMEOUT: 300000, // 5 minutes, fixed
  
  // Health monitoring
  HEARTBEAT_INTERVAL: 30000,  // 30 seconds
  HEARTBEAT_TIMEOUT: 120000,  // 2 minutes
  HEALTH_CHECK_RETRY: 5000,    // 5 seconds
  
  // Terminal streaming
  PIPE_PANE_RETRY_DELAY: 1000,     // 1 second
  CAPTURE_PANE_INTERVAL: 1500,     // 1.5 seconds
  TERMINAL_SETUP_TIMEOUT: 60000,   // 60 seconds
  
  // Agent recovery
  RECOVERY_INITIAL_DELAY: 5000,    // 5 seconds
  RECOVERY_MAX_DELAY: 60000,       // 1 minute
  RECOVERY_MAX_ATTEMPTS: 3,
  
  // Graceful shutdown
  GRACEFUL_SHUTDOWN_TIMEOUT: 30000, // 30 seconds
  HARVEST_COLLECTION_TIMEOUT: 25000, // 25 seconds (within graceful shutdown)
  
  // WebSocket
  WS_HEARTBEAT_INTERVAL: 30000,    // 30 seconds
  WS_RECONNECT_DELAY: 1000,        // 1 second
  WS_MAX_RECONNECT_DELAY: 30000,   // 30 seconds
} as const;

// ============================================
// Export type guards
// ============================================

export function isAgent(obj: any): obj is Agent {
  return obj && typeof obj.id === 'string' && typeof obj.farmId === 'string';
}

export function isFarm(obj: any): obj is Farm {
  return obj && typeof obj.id === 'string' && Array.isArray(obj.agents);
}

export function isTask(obj: any): obj is Task {
  return obj && typeof obj.id === 'string' && typeof obj.farmId === 'string';
}