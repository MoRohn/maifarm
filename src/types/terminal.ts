export interface TerminalSession {
  id: string;
  sessionName: string;
  farmId?: string;
  paneCount: number;
  windowName: string;
  active: boolean;
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error';
  createdAt: Date;
  agents: TerminalAgent[];
}

export interface TerminalAgent {
  id: number;
  sessionId: string;
  paneId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'disconnected';
  uid?: string;
  lastActivity?: Date;
  commandHistory: string[];
  currentWorkingDirectory?: string;
}

export interface TerminalOutput {
  agentId: number;
  sessionId: string;
  lines: string[];
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'command' | 'system';
}

export interface TerminalCommand {
  command: string;
  agentId: number;
  sessionId: string;
  timestamp: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface TerminalEvent {
  type: 'output' | 'command' | 'status' | 'session' | 'agent_connected' | 'agent_disconnected';
  sessionId: string;
  agentId?: number;
  data: any;
  timestamp: Date;
}

export interface TerminalViewMode {
  type: 'grid' | 'tabs' | 'single' | 'split';
  selectedAgent?: number;
  layout?: 'horizontal' | 'vertical';
}

export interface TerminalTheme {
  name: string;
  backgroundColor: string;
  textColor: string;
  promptColor: string;
  errorColor: string;
  successColor: string;
  warningColor: string;
  fontSize: number;
  fontFamily: string;
}

export interface TerminalConfig {
  autoScroll: boolean;
  maxLines: number;
  refreshInterval: number;
  theme: TerminalTheme;
  viewMode: TerminalViewMode;
  showTimestamps: boolean;
  enableCommandHistory: boolean;
  enableSyntaxHighlighting: boolean;
}

export interface TerminalState {
  sessions: TerminalSession[];
  activeSession: string | null;
  selectedAgent: number | null;
  outputs: Record<string, TerminalOutput[]>; // Key: `${sessionId}-${agentId}`
  config: TerminalConfig;
  isConnected: boolean;
  lastError?: string;
}