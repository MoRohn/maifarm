export type FarmStatus = 'idle' | 'running' | 'paused' | 'failed' | 'completed';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'failed' | 'completed';

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