export interface TerminalEvent {
  type: 'output' | 'command' | 'status' | 'session' | 'agent_connected' | 'agent_disconnected';
  sessionId: string;
  agentId?: number;
  data?: any;
  timestamp: Date;
}

export interface TerminalSession {
  sessionName: string;
  paneCount: number;
  windowName: string;
  active: boolean;
  farmId?: string;
  metadata?: any;
}

export interface TerminalOutput {
  sessionId: string;
  agentId: number;
  lines: string[];
  timestamp: Date;
}