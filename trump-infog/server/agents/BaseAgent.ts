import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  IAgent, 
  AgentConfig, 
  AgentState, 
  AgentStatus, 
  AgentMessage,
  CoordinationEvent,
  SharedState 
} from './types.js';

export abstract class BaseAgent extends EventEmitter implements IAgent {
  protected _config: AgentConfig;
  protected _state: AgentState;
  protected stateChangeCallbacks: ((state: AgentState) => void)[] = [];
  protected errorCallbacks: ((error: Error) => void)[] = [];
  protected completeCallbacks: ((result: any) => void)[] = [];
  protected coordinationPath: string;
  protected sharedStatePath: string;

  constructor(config: AgentConfig) {
    super();
    this._config = config;
    this._state = {
      status: AgentStatus.IDLE,
      progress: 0,
      lastUpdate: new Date(),
      errors: [],
      outputs: []
    };
    
    this.coordinationPath = config.coordinationPath || '/tmp/claude_coordination';
    this.sharedStatePath = path.join(this.coordinationPath, 'trump_infog', 'shared_state.json');
  }

  get config(): AgentConfig {
    return this._config;
  }

  get state(): AgentState {
    return this._state;
  }

  async initialize(): Promise<void> {
    try {
      this.updateState({ status: AgentStatus.INITIALIZING });
      
      // Ensure working directories exist
      await this.ensureDirectories();
      
      // Register with coordination system
      await this.registerAgent();
      
      // Initialize agent-specific resources
      await this.initializeAgent();
      
      this.updateState({ status: AgentStatus.IDLE });
      console.log(`Agent ${this.config.name} initialized successfully`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      this.updateState({ status: AgentStatus.WORKING });
      await this.startAgent();
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.stopAgent();
      await this.unregisterAgent();
      this.updateState({ status: AgentStatus.IDLE });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  abstract processTask(task: any): Promise<any>;
  abstract initializeAgent(): Promise<void>;
  abstract startAgent(): Promise<void>;
  abstract stopAgent(): Promise<void>;

  async handleMessage(message: AgentMessage): Promise<void> {
    console.log(`Agent ${this.config.name} received message:`, message.type);
    
    switch (message.type) {
      case 'task:assign':
        await this.processTask(message.payload);
        break;
      case 'status:request':
        await this.reportStatus();
        break;
      case 'stop':
        await this.stop();
        break;
      default:
        await this.handleAgentMessage(message);
    }
  }

  protected abstract handleAgentMessage(message: AgentMessage): Promise<void>;

  getStatus(): AgentStatus {
    return this._state.status;
  }

  getProgress(): number {
    return this._state.progress;
  }

  getOutputs(): string[] {
    return this._state.outputs;
  }

  onStateChange(callback: (state: AgentState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onComplete(callback: (result: any) => void): void {
    this.completeCallbacks.push(callback);
  }

  protected updateState(partial: Partial<AgentState>): void {
    this._state = {
      ...this._state,
      ...partial,
      lastUpdate: new Date()
    };
    
    this.stateChangeCallbacks.forEach(cb => cb(this._state));
    this.emit('state:changed', this._state);
    
    // Update shared state
    this.updateSharedState().catch(console.error);
  }

  protected updateProgress(progress: number, currentTask?: string): void {
    this.updateState({ 
      progress: Math.min(100, Math.max(0, progress)),
      currentTask 
    });
  }

  protected addOutput(output: string): void {
    this._state.outputs.push(output);
    this.updateState({ outputs: this._state.outputs });
  }

  protected handleError(error: Error): void {
    console.error(`Agent ${this.config.name} error:`, error);
    this._state.errors.push(error.message);
    this.updateState({ 
      status: AgentStatus.ERROR,
      errors: this._state.errors 
    });
    
    this.errorCallbacks.forEach(cb => cb(error));
    this.emit('error', error);
  }

  protected notifyComplete(result: any): void {
    this.updateState({ 
      status: AgentStatus.COMPLETED,
      progress: 100 
    });
    
    this.completeCallbacks.forEach(cb => cb(result));
    this.emit('complete', result);
  }

  protected async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.workingDirectory,
      path.join(this.coordinationPath, 'trump_infog'),
      path.join(this.coordinationPath, 'trump_infog', 'data_pipeline'),
      path.join(this.coordinationPath, 'trump_infog', 'logs'),
      path.join(this.config.workingDirectory, 'outputs')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  protected async registerAgent(): Promise<void> {
    const activeAgentsPath = path.join(this.coordinationPath, 'active_agents.json');
    
    try {
      let activeAgents = {};
      try {
        const content = await fs.readFile(activeAgentsPath, 'utf-8');
        activeAgents = JSON.parse(content);
      } catch {
        // File doesn't exist, start fresh
      }

      activeAgents[`trump_infog_${this.config.id}`] = {
        agent_id: this.config.id,
        name: this.config.name,
        role: this.config.role,
        started: new Date().toISOString(),
        status: 'active'
      };

      await fs.writeFile(activeAgentsPath, JSON.stringify(activeAgents, null, 2));
    } catch (error) {
      console.error('Failed to register agent:', error);
    }
  }

  protected async unregisterAgent(): Promise<void> {
    const activeAgentsPath = path.join(this.coordinationPath, 'active_agents.json');
    
    try {
      const content = await fs.readFile(activeAgentsPath, 'utf-8');
      const activeAgents = JSON.parse(content);
      
      delete activeAgents[`trump_infog_${this.config.id}`];
      
      await fs.writeFile(activeAgentsPath, JSON.stringify(activeAgents, null, 2));
    } catch (error) {
      console.error('Failed to unregister agent:', error);
    }
  }

  protected async updateSharedState(): Promise<void> {
    try {
      let sharedState: SharedState;
      
      try {
        const content = await fs.readFile(this.sharedStatePath, 'utf-8');
        sharedState = JSON.parse(content);
      } catch {
        // Initialize if doesn't exist
        sharedState = {
          projectId: 'trump_infog',
          status: 'running',
          agents: {},
          pipeline: {
            currentStage: 'initialization',
            completedStages: [],
            data: {}
          },
          lastUpdate: new Date()
        };
      }

      sharedState.agents[this.config.name] = this._state;
      sharedState.lastUpdate = new Date();

      await fs.writeFile(this.sharedStatePath, JSON.stringify(sharedState, null, 2));
    } catch (error) {
      console.error('Failed to update shared state:', error);
    }
  }

  protected async reportStatus(): Promise<void> {
    const event: CoordinationEvent = {
      type: 'agent:status',
      agentId: this.config.name,
      payload: {
        status: this._state.status,
        progress: this._state.progress,
        currentTask: this._state.currentTask,
        outputs: this._state.outputs
      },
      timestamp: new Date()
    };

    await this.emitCoordinationEvent(event);
  }

  protected async emitCoordinationEvent(event: CoordinationEvent): Promise<void> {
    const eventPath = path.join(
      this.coordinationPath, 
      'trump_infog',
      'events',
      `${event.type}_${Date.now()}.json`
    );

    try {
      await fs.mkdir(path.dirname(eventPath), { recursive: true });
      await fs.writeFile(eventPath, JSON.stringify(event, null, 2));
      this.emit('coordination:event', event);
    } catch (error) {
      console.error('Failed to emit coordination event:', error);
    }
  }

  protected async waitForStage(stageName: string, timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const content = await fs.readFile(this.sharedStatePath, 'utf-8');
        const sharedState: SharedState = JSON.parse(content);
        
        if (sharedState.pipeline.completedStages.includes(stageName)) {
          return;
        }
      } catch {
        // State file might not exist yet
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Timeout waiting for stage: ${stageName}`);
  }

  protected async completeStage(stageName: string, data?: any): Promise<void> {
    try {
      const content = await fs.readFile(this.sharedStatePath, 'utf-8');
      const sharedState: SharedState = JSON.parse(content);
      
      if (!sharedState.pipeline.completedStages.includes(stageName)) {
        sharedState.pipeline.completedStages.push(stageName);
      }
      
      if (data) {
        sharedState.pipeline.data[stageName] = data;
      }
      
      sharedState.lastUpdate = new Date();
      
      await fs.writeFile(this.sharedStatePath, JSON.stringify(sharedState, null, 2));
      
      // Emit stage completion event
      await this.emitCoordinationEvent({
        type: `stage:${stageName}:complete`,
        agentId: this.config.name,
        payload: { stageName, data },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to complete stage:', error);
      throw error;
    }
  }
}