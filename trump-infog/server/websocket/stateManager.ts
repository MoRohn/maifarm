import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ProjectMetadata {
  id: string;
  name: string;
  created: string;
  status: 'initializing' | 'collecting' | 'analyzing' | 'designing' | 'assembling' | 'complete' | 'error';
}

interface PipelineStageState {
  status: 'pending' | 'in_progress' | 'complete' | 'error';
  progress: number;
  outputs: string[];
}

interface AgentState {
  status: string;
  currentTask: string;
  lastUpdate: string;
}

interface InfographState {
  projectMetadata: ProjectMetadata;
  pipelineStages: {
    data_collection: PipelineStageState;
    content_analysis: PipelineStageState;
    design_generation: PipelineStageState;
    output_assembly: PipelineStageState;
  };
  agentStates: {
    [agentId: string]: AgentState;
  };
}

export class StateManager extends EventEmitter {
  private state: InfographState;
  private stateFilePath: string;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.stateFilePath = process.env.COORDINATION_PATH 
      ? path.join(process.env.COORDINATION_PATH, 'infograph_state.json')
      : '/tmp/claude_coordination/infograph_state.json';
    
    // Initialize with default state
    this.state = this.getDefaultState();
    
    // Load existing state if available
    this.loadState().catch(err => {
      console.error('[StateManager] Failed to load initial state:', err);
    });

    // Start periodic state persistence
    this.startPeriodicSave();
  }

  private getDefaultState(): InfographState {
    return {
      projectMetadata: {
        id: `infograph_${Date.now()}`,
        name: 'Trump Infographic Generation',
        created: new Date().toISOString(),
        status: 'initializing'
      },
      pipelineStages: {
        data_collection: { status: 'pending', progress: 0, outputs: [] },
        content_analysis: { status: 'pending', progress: 0, outputs: [] },
        design_generation: { status: 'pending', progress: 0, outputs: [] },
        output_assembly: { status: 'pending', progress: 0, outputs: [] }
      },
      agentStates: {
        agent_0: { status: 'initializing', currentTask: 'startup', lastUpdate: new Date().toISOString() },
        agent_1: { status: 'initializing', currentTask: 'startup', lastUpdate: new Date().toISOString() },
        agent_2: { status: 'initializing', currentTask: 'startup', lastUpdate: new Date().toISOString() },
        agent_3: { status: 'initializing', currentTask: 'startup', lastUpdate: new Date().toISOString() }
      }
    };
  }

  private async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const loadedState = JSON.parse(data) as InfographState;
      
      // Validate loaded state
      if (this.isValidState(loadedState)) {
        this.state = loadedState;
        console.log('[StateManager] State loaded successfully');
      } else {
        console.warn('[StateManager] Invalid state file, using default state');
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error('[StateManager] Error loading state:', error);
      }
      // File doesn't exist, use default state
      await this.saveState();
    }
  }

  private isValidState(state: any): state is InfographState {
    return state 
      && state.projectMetadata 
      && state.pipelineStages 
      && state.agentStates
      && typeof state.projectMetadata.id === 'string'
      && typeof state.projectMetadata.status === 'string';
  }

  private async saveState(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write state atomically
      const tempFile = `${this.stateFilePath}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(this.state, null, 2));
      await fs.rename(tempFile, this.stateFilePath);
      
      this.emit('state:persisted', this.state);
    } catch (error) {
      console.error('[StateManager] Error saving state:', error);
      this.emit('state:save_error', error);
    }
  }

  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(() => {
      this.saveState().catch(err => {
        console.error('[StateManager] Debounced save failed:', err);
      });
    }, 1000); // Save after 1 second of inactivity
  }

  private startPeriodicSave(): void {
    // Save state every 30 seconds
    setInterval(() => {
      this.saveState().catch(err => {
        console.error('[StateManager] Periodic save failed:', err);
      });
    }, 30000);
  }

  // Public methods for state updates
  public updateProjectStatus(status: ProjectMetadata['status']): void {
    this.state.projectMetadata.status = status;
    this.emit('project:status_changed', status);
    this.debouncedSave();
  }

  public updatePipelineStage(
    stage: keyof InfographState['pipelineStages'], 
    update: Partial<PipelineStageState>
  ): void {
    Object.assign(this.state.pipelineStages[stage], update);
    this.emit('pipeline:stage_updated', { stage, update });
    
    // Check if pipeline is complete
    this.checkPipelineCompletion();
    
    this.debouncedSave();
  }

  public updateAgentState(agentId: string, update: Partial<AgentState>): void {
    if (!this.state.agentStates[agentId]) {
      this.state.agentStates[agentId] = {
        status: 'unknown',
        currentTask: '',
        lastUpdate: new Date().toISOString()
      };
    }
    
    Object.assign(this.state.agentStates[agentId], update);
    this.emit('agent:state_updated', { agentId, update });
    this.debouncedSave();
  }

  public addPipelineOutput(stage: keyof InfographState['pipelineStages'], output: string): void {
    this.state.pipelineStages[stage].outputs.push(output);
    this.emit('pipeline:output_added', { stage, output });
    this.debouncedSave();
  }

  private checkPipelineCompletion(): void {
    const allStagesComplete = Object.values(this.state.pipelineStages)
      .every(stage => stage.status === 'complete');
    
    if (allStagesComplete && this.state.projectMetadata.status !== 'complete') {
      this.updateProjectStatus('complete');
      this.emit('project:complete', {
        projectId: this.state.projectMetadata.id,
        completedAt: new Date().toISOString()
      });
    }
  }

  // Public getters
  public getState(): InfographState {
    return JSON.parse(JSON.stringify(this.state)); // Deep clone
  }

  public getProjectMetadata(): ProjectMetadata {
    return { ...this.state.projectMetadata };
  }

  public getPipelineStage(stage: keyof InfographState['pipelineStages']): PipelineStageState {
    return { ...this.state.pipelineStages[stage] };
  }

  public getAgentState(agentId: string): AgentState | undefined {
    return this.state.agentStates[agentId] 
      ? { ...this.state.agentStates[agentId] } 
      : undefined;
  }

  public getAllAgentStates(): { [agentId: string]: AgentState } {
    return JSON.parse(JSON.stringify(this.state.agentStates));
  }

  public getPipelineProgress(): number {
    const stages = Object.values(this.state.pipelineStages);
    const totalProgress = stages.reduce((sum, stage) => sum + stage.progress, 0);
    return totalProgress / stages.length;
  }

  public getActivePipelineStage(): string | null {
    for (const [stage, data] of Object.entries(this.state.pipelineStages)) {
      if (data.status === 'in_progress') {
        return stage;
      }
    }
    return null;
  }

  // Reset methods
  public resetState(): void {
    this.state = this.getDefaultState();
    this.emit('state:reset');
    this.saveState().catch(err => {
      console.error('[StateManager] Failed to save reset state:', err);
    });
  }

  public resetPipelineStage(stage: keyof InfographState['pipelineStages']): void {
    this.state.pipelineStages[stage] = {
      status: 'pending',
      progress: 0,
      outputs: []
    };
    this.emit('pipeline:stage_reset', stage);
    this.debouncedSave();
  }

  // Utility methods
  public exportState(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public async importState(stateJson: string): Promise<void> {
    try {
      const importedState = JSON.parse(stateJson) as InfographState;
      if (this.isValidState(importedState)) {
        this.state = importedState;
        await this.saveState();
        this.emit('state:imported', this.state);
      } else {
        throw new Error('Invalid state format');
      }
    } catch (error) {
      console.error('[StateManager] Failed to import state:', error);
      throw error;
    }
  }
}

// Singleton instance
export const stateManager = new StateManager();