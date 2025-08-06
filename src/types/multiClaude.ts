export interface MultiClaudeAgent {
  id: string;
  agentNumber: number;
  paneId?: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  currentStep: number;
  output: string[];
  lastActivity?: string;
  startTime: Date;
  currentPrompt?: string;
  taskHistory: AgentTask[];
  resources?: {
    cpu?: number;
    memory?: number;
  };
}

export interface AgentTask {
  id: string;
  prompt: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string[];
  error?: string;
}

export interface MultiClaudeConfig {
  maxAgents: number;
  staggerDelay: number;
  sessionName: string;
  coordintionDir: string;
  enableLogging: boolean;
  autoRestart: boolean;
}

export interface TmuxPaneInfo {
  paneId: string;
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  width: number;
  height: number;
  active: boolean;
}

export interface CoordinationData {
  activeAgents: Record<string, {
    agent_id: number;
    started: string;
    status: string;
  }>;
  tasks?: any[];
  workClaims?: any[];
  completed?: any[];
}

export interface MultiClaudeCommand {
  type: 'start' | 'stop' | 'pause' | 'resume' | 'reset' | 'prompt';
  agentId: string;
  payload?: any;
}

export interface MultiClaudeEvent {
  type: 'agent:created' | 'agent:started' | 'agent:stopped' | 'agent:output' | 'agent:error' | 'agent:status';
  agentId: string;
  data: any;
  timestamp: Date;
}