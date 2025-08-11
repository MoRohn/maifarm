import { EventEmitter } from 'events';
import { watch, readFile, writeFile, mkdir, access } from 'fs/promises';
import { watchFile, unwatchFile } from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

interface CoordinationAgent {
  agent_id: string;
  started: string;
  status: string;
  pane_id?: string;
  current_step?: number;
  uid?: string;
}

interface WorkClaim {
  agent: string;
  files: string[];
  description: string;
  timestamp: string;
}

interface MultiClaudeConfig {
  agents: number;
  prompt: string;
  session?: string;
  stagger?: number;
  collaborative?: boolean;
  steps?: string[];
  contextFiles?: string[];
}

export class AgentCoordinator extends EventEmitter {
  private coordinationDir = '/tmp/claude_coordination';
  private activeAgentsFile = path.join(this.coordinationDir, 'active_agents.json');
  private workClaimsDir = path.join(this.coordinationDir, 'work_claims');
  private completedWorkFile = path.join(this.coordinationDir, 'completed_work.log');
  
  private agents: Map<string, CoordinationAgent> = new Map();
  private workClaims: Map<string, WorkClaim> = new Map();
  private watchInterval: ReturnType<typeof setInterval> | null = null;
  private multiClaudeProcess: ChildProcess | null = null;
  
  constructor() {
    super();
    this.initialize();
  }
  
  private async initialize() {
    try {
      // Ensure coordination directory exists
      await this.ensureDirectoryExists(this.coordinationDir);
      await this.ensureDirectoryExists(this.workClaimsDir);
      
      // Initialize empty files if they don't exist
      try {
        await access(this.activeAgentsFile);
      } catch {
        await writeFile(this.activeAgentsFile, '{}');
      }
      
      // Start watching for changes
      this.startWatching();
      
      // Initial load
      await this.loadActiveAgents();
      await this.loadWorkClaims();
      
      console.log('[AgentCoordinator] Initialized and watching:', this.coordinationDir);
    } catch (error) {
      console.error('[AgentCoordinator] Initialization error:', error);
    }
  }
  
  private async ensureDirectoryExists(dir: string) {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }
  
  private startWatching() {
    // Watch active agents file
    watchFile(this.activeAgentsFile, { interval: 1000 }, async () => {
      await this.loadActiveAgents();
    });
    
    // Poll work claims directory every 2 seconds
    this.watchInterval = setInterval(async () => {
      await this.loadWorkClaims();
    }, 2000);
  }
  
  private async loadActiveAgents() {
    try {
      const content = await readFile(this.activeAgentsFile, 'utf-8');
      const agents = JSON.parse(content || '{}') as Record<string, CoordinationAgent>;
      
      // Check for changes and emit events
      for (const [agentId, agentData] of Object.entries(agents)) {
        const existingAgent = this.agents.get(agentId);
        
        if (!existingAgent || existingAgent.status !== agentData.status) {
          this.agents.set(agentId, agentData);
          this.emit('agent:updated', {
            id: agentId,
            ...agentData,
            lastUpdate: new Date()
          });
        }
      }
      
      // Check for removed agents
      for (const agentId of this.agents.keys()) {
        if (!agents[agentId]) {
          this.agents.delete(agentId);
          this.emit('agent:removed', { id: agentId });
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error('[AgentCoordinator] Error loading active agents:', error);
      }
    }
  }
  
  private async loadWorkClaims() {
    try {
      const files = await readFile(this.workClaimsDir, 'utf-8').catch(() => '');
      // Read all .json and .lock files in the work claims directory
      const { readdirSync } = await import('fs');
      const claimFiles = readdirSync(this.workClaimsDir).filter(f => 
        f.endsWith('.json') || f.endsWith('.lock')
      );
      
      const currentClaims = new Map<string, WorkClaim>();
      
      for (const file of claimFiles) {
        try {
          const content = await readFile(path.join(this.workClaimsDir, file), 'utf-8');
          const claim = JSON.parse(content) as WorkClaim;
          const claimId = file.replace(/\.(json|lock)$/, '');
          currentClaims.set(claimId, claim);
          
          if (!this.workClaims.has(claimId)) {
            this.emit('work:claimed', { id: claimId, ...claim });
          }
        } catch (error) {
          // Ignore parse errors for individual files
        }
      }
      
      // Check for released claims
      for (const claimId of this.workClaims.keys()) {
        if (!currentClaims.has(claimId)) {
          this.emit('work:released', { id: claimId });
        }
      }
      
      this.workClaims = currentClaims;
    } catch (error) {
      // Directory might not exist yet
    }
  }
  
  // Public API methods
  
  async launchMultiClaude(config: MultiClaudeConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // Kill existing process if any
      if (this.multiClaudeProcess) {
        this.multiClaudeProcess.kill();
        this.multiClaudeProcess = null;
      }
      
      // Build command arguments
      const args = [
        'orchestrator.py',
        '-n', config.agents.toString(),
        '-p', config.prompt
      ];
      
      if (config.session) {
        args.push('-s', config.session);
      }
      
      if (config.stagger) {
        args.push('--stagger', config.stagger.toString());
      }
      
      if (config.collaborative) {
        args.push('--collaborative');
      }
      
      if (config.steps && config.steps.length > 0) {
        args.push('--steps', ...config.steps);
      }
      
      if (config.contextFiles && config.contextFiles.length > 0) {
        args.push('--context-files', ...config.contextFiles);
      }
      
      // Launch the Python script
      this.multiClaudeProcess = spawn('python3', args, {
        cwd: process.cwd(),
        env: { ...process.env },
        detached: false
      });
      
      this.multiClaudeProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[MultiClaude]', output);
        this.emit('multiclaude:output', { type: 'stdout', data: output });
      });
      
      this.multiClaudeProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        console.error('[MultiClaude Error]', output);
        this.emit('multiclaude:output', { type: 'stderr', data: output });
      });
      
      this.multiClaudeProcess.on('exit', (code) => {
        console.log(`[MultiClaude] Process exited with code ${code}`);
        this.emit('multiclaude:exit', { code });
        this.multiClaudeProcess = null;
      });
      
      return { success: true };
    } catch (error) {
      console.error('[AgentCoordinator] Error launching orchestrator:', error);
      return { success: false, error: (error as Error).message };
    }
  }
  
  async stopMultiClaude(): Promise<void> {
    if (this.multiClaudeProcess) {
      this.multiClaudeProcess.kill('SIGINT'); // Send Ctrl+C signal
      this.multiClaudeProcess = null;
    }
  }
  
  getActiveAgents(): CoordinationAgent[] {
    return Array.from(this.agents.values());
  }
  
  getWorkClaims(): WorkClaim[] {
    return Array.from(this.workClaims.values());
  }
  
  async getCompletedWork(): Promise<string[]> {
    try {
      const content = await readFile(this.completedWorkFile, 'utf-8');
      return content.split('\n').filter(line => line.trim());
    } catch {
      return [];
    }
  }
  
  async registerExternalAgent(agentId: string, metadata: any): Promise<void> {
    const agents = await this.loadAgentsFile();
    agents[agentId] = {
      agent_id: agentId,
      started: new Date().toISOString(),
      status: 'active',
      ...metadata
    };
    await writeFile(this.activeAgentsFile, JSON.stringify(agents, null, 2));
  }
  
  async unregisterAgent(agentId: string): Promise<void> {
    const agents = await this.loadAgentsFile();
    delete agents[agentId];
    await writeFile(this.activeAgentsFile, JSON.stringify(agents, null, 2));
  }
  
  private async loadAgentsFile(): Promise<Record<string, CoordinationAgent>> {
    try {
      const content = await readFile(this.activeAgentsFile, 'utf-8');
      return JSON.parse(content || '{}');
    } catch {
      return {};
    }
  }
  
  destroy() {
    // Clean up watchers
    unwatchFile(this.activeAgentsFile);
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    
    // Kill orchestrator process if running
    if (this.multiClaudeProcess) {
      this.multiClaudeProcess.kill();
      this.multiClaudeProcess = null;
    }
  }
}

// Export singleton instance
export const agentCoordinator = new AgentCoordinator();