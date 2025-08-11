/**
 * Multi-Claude Integration Service
 * Bridges the file-based coordination system from orchestrator.py with the WebSocket server
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watchFile, unwatchFile } from 'fs';

export interface IMultiClaudeAgent {
  agent_id: string;
  pane_id?: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'active';
  started: string;
  current_step?: number;
  last_output?: string;
  error?: string;
}

export interface IAgentCoordination {
  agents: Map<string, IMultiClaudeAgent>;
  work_claims: Map<string, any>;
  completed_work: string[];
}

export interface IMultiClaudeMessage {
  type: 'agent_update' | 'work_claim' | 'work_complete' | 'coordination_sync';
  agent_id?: string;
  data: any;
  timestamp: string;
}

export interface IWebSocketAgentUpdate {
  agent_id: string;
  status: string;
  current_step?: number;
  output?: string;
  error?: string;
  timestamp: string;
}

class MultiClaudeIntegrationService extends EventEmitter {
  private coordinationDir = '/tmp/claude_coordination';
  private activeAgentsFile = path.join(this.coordinationDir, 'active_agents.json');
  private workClaimsDir = path.join(this.coordinationDir, 'work_claims');
  private completedWorkFile = path.join(this.coordinationDir, 'completed_work.log');
  
  private agents: Map<string, IMultiClaudeAgent> = new Map();
  private workClaims: Map<string, any> = new Map();
  private lastWorkClaimsSize = 0;
  private completedWork: string[] = [];
  
  private watchers: Set<string> = new Set();
  private isInitialized = false;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    try {
      // Ensure coordination directory exists
      await fs.mkdir(this.coordinationDir, { recursive: true });
      await fs.mkdir(this.workClaimsDir, { recursive: true });
      
      // Initialize files if they don't exist
      try {
        await fs.access(this.activeAgentsFile);
      } catch {
        await fs.writeFile(this.activeAgentsFile, '{}');
      }
      
      try {
        await fs.access(this.completedWorkFile);
      } catch {
        await fs.writeFile(this.completedWorkFile, '');
      }
      
      // Load initial state
      await this.loadActiveAgents();
      await this.loadWorkClaims();
      await this.loadCompletedWork();
      
      // Start watching for changes
      this.startWatching();
      
      this.isInitialized = true;
      console.log('[MultiClaudeIntegration] Service initialized successfully');
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to initialize:', error);
      throw error;
    }
  }

  private async loadActiveAgents() {
    try {
      const data = await fs.readFile(this.activeAgentsFile, 'utf-8');
      const agents = JSON.parse(data || '{}');
      
      this.agents.clear();
      for (const [id, agent] of Object.entries(agents)) {
        this.agents.set(id, agent as IMultiClaudeAgent);
      }
      
      console.log(`[MultiClaudeIntegration] Loaded ${this.agents.size} active agents`);
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to load active agents:', error);
    }
  }

  private corruptedFiles = new Set<string>();
  
  private async loadWorkClaims() {
    try {
      const files = await fs.readdir(this.workClaimsDir);
      
      this.workClaims.clear();
      for (const file of files) {
        if (file.endsWith('.json')) {
          // Skip files we've already identified as corrupted
          if (this.corruptedFiles.has(file)) {
            continue;
          }
          
          try {
            const filePath = path.join(this.workClaimsDir, file);
            const data = await fs.readFile(filePath, 'utf-8');
            
            // Basic validation before parsing
            if (!data.trim().startsWith('{') || !data.trim().endsWith('}')) {
              console.warn(`[MultiClaudeIntegration] Skipping malformed JSON file ${file}`);
              this.corruptedFiles.add(file);
              // Optionally remove corrupted file
              await fs.unlink(filePath).catch(() => {});
              continue;
            }
            
            const claim = JSON.parse(data);
            this.workClaims.set(file, claim);
          } catch (error) {
            // Only log once per file
            if (!this.corruptedFiles.has(file)) {
              console.error(`[MultiClaudeIntegration] Failed to load work claim ${file}:`, error);
              this.corruptedFiles.add(file);
              
              // Try to remove corrupted file
              const filePath = path.join(this.workClaimsDir, file);
              await fs.unlink(filePath).catch(() => {
                console.warn(`[MultiClaudeIntegration] Could not remove corrupted file ${file}`);
              });
            }
          }
        }
      }
      
      // Only log if the number of claims has changed
      if (this.workClaims.size !== this.lastWorkClaimsSize) {
        console.log(`[MultiClaudeIntegration] Work claims updated: ${this.workClaims.size} total`);
        this.lastWorkClaimsSize = this.workClaims.size;
      }
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to load work claims:', error);
    }
  }

  private async loadCompletedWork() {
    try {
      const data = await fs.readFile(this.completedWorkFile, 'utf-8');
      this.completedWork = data.split('\n').filter(line => line.trim());
      console.log(`[MultiClaudeIntegration] Loaded ${this.completedWork.length} completed work items`);
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to load completed work:', error);
    }
  }

  private startWatching() {
    // Watch active agents file
    this.watchFile(this.activeAgentsFile, async () => {
      await this.loadActiveAgents();
      this.emitAgentUpdate();
    });
    
    // Poll for work claims changes (more reliable than watching directory)
    this.pollingInterval = setInterval(async () => {
      const previousCount = this.workClaims.size;
      await this.loadWorkClaims();
      if (this.workClaims.size !== previousCount) {
        this.emitWorkClaimsUpdate();
      }
    }, 10000); // Poll every 10 seconds (reduced from 2 seconds)
    
    // Watch completed work file
    this.watchFile(this.completedWorkFile, async () => {
      await this.loadCompletedWork();
      this.emitCompletedWorkUpdate();
    });
  }

  private watchFile(filePath: string, callback: () => void) {
    if (this.watchers.has(filePath)) {
      return;
    }
    
    this.watchers.add(filePath);
    watchFile(filePath, { interval: 1000 }, callback);
  }

  private emitAgentUpdate() {
    const update: IMultiClaudeMessage = {
      type: 'agent_update',
      data: Array.from(this.agents.entries()).map(([id, agent]) => ({
        ...agent,
        agent_id: id
      })),
      timestamp: new Date().toISOString()
    };
    
    this.emit('agent:updated', update);
  }

  private emitWorkClaimsUpdate() {
    const update: IMultiClaudeMessage = {
      type: 'work_claim',
      data: Array.from(this.workClaims.values()),
      timestamp: new Date().toISOString()
    };
    
    this.emit('work:claimed', update);
  }

  private emitCompletedWorkUpdate() {
    const update: IMultiClaudeMessage = {
      type: 'work_complete',
      data: this.completedWork,
      timestamp: new Date().toISOString()
    };
    
    this.emit('work:completed', update);
  }

  // Public API methods
  public getAgents(): IMultiClaudeAgent[] {
    return Array.from(this.agents.values());
  }

  public getAgent(agentId: string): IMultiClaudeAgent | undefined {
    return this.agents.get(agentId);
  }

  public getWorkClaims(): any[] {
    return Array.from(this.workClaims.values());
  }

  public getCompletedWork(): string[] {
    return this.completedWork;
  }

  public async updateAgentStatus(agentId: string, status: IMultiClaudeAgent['status'], additionalData?: Partial<IMultiClaudeAgent>) {
    try {
      const agents = await this.loadActiveAgentsFromFile();
      
      if (agents[agentId]) {
        agents[agentId] = {
          ...agents[agentId],
          status,
          ...additionalData
        };
        
        await fs.writeFile(this.activeAgentsFile, JSON.stringify(agents, null, 2));
        console.log(`[MultiClaudeIntegration] Updated agent ${agentId} status to ${status}`);
      }
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to update agent status:', error);
      throw error;
    }
  }

  private async loadActiveAgentsFromFile(): Promise<Record<string, any>> {
    try {
      const data = await fs.readFile(this.activeAgentsFile, 'utf-8');
      return JSON.parse(data || '{}');
    } catch {
      return {};
    }
  }

  public async claimWork(agentId: string, claim: any) {
    try {
      const claimFile = path.join(this.workClaimsDir, `${agentId}_claim.json`);
      await fs.writeFile(claimFile, JSON.stringify(claim, null, 2));
      console.log(`[MultiClaudeIntegration] Work claimed by agent ${agentId}`);
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to claim work:', error);
      throw error;
    }
  }

  public async markWorkComplete(agentId: string, workDescription: string) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} - ${agentId}: ${workDescription}\n`;
      await fs.appendFile(this.completedWorkFile, logEntry);
      console.log(`[MultiClaudeIntegration] Work completed by agent ${agentId}`);
    } catch (error) {
      console.error('[MultiClaudeIntegration] Failed to mark work complete:', error);
      throw error;
    }
  }

  public getCoordinationState(): IAgentCoordination {
    return {
      agents: this.agents,
      work_claims: this.workClaims,
      completed_work: this.completedWork
    };
  }

  public destroy() {
    // Stop watching files
    for (const filePath of this.watchers) {
      unwatchFile(filePath);
    }
    this.watchers.clear();
    
    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Clear event listeners
    this.removeAllListeners();
    
    console.log('[MultiClaudeIntegration] Service destroyed');
  }
}

// Export singleton instance
export const multiClaudeIntegration = new MultiClaudeIntegrationService();

// Export for WebSocket integration
export function formatAgentUpdateForWebSocket(agent: IMultiClaudeAgent): IWebSocketAgentUpdate {
  return {
    agent_id: agent.agent_id,
    status: agent.status,
    current_step: agent.current_step,
    output: agent.last_output,
    error: agent.error,
    timestamp: new Date().toISOString()
  };
}