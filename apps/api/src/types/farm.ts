export type FarmStatus = 'launching' | 'active' | 'completed' | 'stopped';
export type AgentStatus = 
  | 'idle'           // Agent is idle, not processing anything
  | 'active'         // Agent is active and can accept tasks
  | 'paused'         // Agent is paused
  | 'failed'         // Agent failed (legacy, maps to 'error')
  | 'completed'      // Agent completed its tasks
  | 'processing'     // Agent is processing a task
  | 'error'          // Agent encountered an error
  | 'terminated'     // Agent has been terminated
  | 'starting'       // Agent is starting up
  | 'ready'          // Agent is ready to accept tasks
  | 'working'        // Agent is actively working on a task
  | 'initializing'   // Agent is initializing
  | 'disconnected'   // Agent disconnected
  | 'shutting_down'; // Agent is shutting down

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  farmId: string;
  config: any;
  metrics?: {
    tasksCompleted: number;
    tasksFailed: number;
    averageResponseTime: number;
    lastActiveAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface FarmMetrics {
  tasksCompleted: number;
  tasksRunning: number;
  tasksFailed: number;
  averageTaskTime: number;
  successRate: number;
  resourceUtilization: number;
}

export interface Farm {
  id: string;
  name: string;
  description: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  status: FarmStatus;
  config: {
    maxAgents: number;
    autoScale: boolean;
    timeout?: number;
    yaml?: string;
    parsedYaml?: any;
  };
  agents: Agent[];
  metrics: FarmMetrics;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  createdBy: string;
  // Tmux session persistence
  tmuxSessionId?: string;
  tmuxWindowTarget?: string;
  tmuxCreatedAt?: Date;
  sessionPreserved?: boolean;
}

export interface FarmCreateInput {
  name: string;
  description?: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  config: {
    maxAgents: number;
    autoScale: boolean;
    timeout?: number;
    yaml?: string;
  };
  userId: string;
  createdBy: string;
}

export interface FarmUpdateInput {
  name?: string;
  description?: string;
  status?: FarmStatus;
  config?: Partial<FarmCreateInput['config']>;
}