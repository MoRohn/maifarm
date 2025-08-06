import { 
  MultiClaudeConfig, 
  MultiClaudeCommand, 
  CoordinationData,
  TmuxPaneInfo 
} from '../types/multiClaude';

class MultiClaudeService {
  private config: MultiClaudeConfig;
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
    this.config = {
      maxAgents: 6,
      staggerDelay: 2,
      sessionName: 'claude_agents',
      coordintionDir: '/tmp/claude_coordination',
      enableLogging: true,
      autoRestart: true
    };
  }

  initialize(config: MultiClaudeConfig) {
    this.config = config;
  }

  updateConfig(config: MultiClaudeConfig) {
    this.config = config;
  }

  async startSession(sessionName: string, numAgents: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName,
        numAgents,
        config: this.config
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to start session: ${response.statusText}`);
    }
  }

  async stopSession(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/session`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop session: ${response.statusText}`);
    }
  }

  async addAgent(agentNumber: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentNumber,
        sessionName: this.config.sessionName
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to add agent: ${response.statusText}`);
    }
  }

  async removeAgent(agentNumber: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/agents/${agentNumber}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to remove agent: ${response.statusText}`);
    }
  }

  async sendCommand(agentNumber: number, command: MultiClaudeCommand): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/agents/${agentNumber}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`Failed to send command: ${response.statusText}`);
    }
  }

  async sendPrompt(agentNumber: number, prompt: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/agents/${agentNumber}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      throw new Error(`Failed to send prompt: ${response.statusText}`);
    }
  }

  async getCoordinationData(): Promise<CoordinationData> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/coordination`);
    
    if (!response.ok) {
      throw new Error(`Failed to get coordination data: ${response.statusText}`);
    }

    return response.json();
  }

  async getPaneInfo(sessionName: string): Promise<TmuxPaneInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/panes?session=${sessionName}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get pane info: ${response.statusText}`);
    }

    return response.json();
  }

  async getPaneOutput(paneId: string, lines?: number): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/api/multiclaude/panes/${paneId}/output`);
    if (lines) {
      url.searchParams.append('lines', lines.toString());
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Failed to get pane output: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output;
  }

  async sendToPan(paneId: string, command: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/panes/${paneId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });

    if (!response.ok) {
      throw new Error(`Failed to send to pane: ${response.statusText}`);
    }
  }

  // Utility function to execute Python script
  async executePythonScript(scriptPath: string, args: string[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/multiclaude/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: scriptPath,
        args
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to execute script: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output;
  }

  // Watch coordination file for changes
  watchCoordinationFile(callback: (data: CoordinationData) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const data = await this.getCoordinationData();
        callback(data);
      } catch (error) {
        console.error('Error watching coordination file:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }
}

export const multiClaudeService = new MultiClaudeService();