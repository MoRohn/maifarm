import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { io, Socket } from 'socket.io-client';
import { DataCollectorAgent } from './DataCollectorAgent.js';
import { ContentAnalyzerAgent } from './ContentAnalyzerAgent.js';
import { DesignGeneratorAgent } from './DesignGeneratorAgent.js';
import { OutputAssemblerAgent } from './OutputAssemblerAgent.js';
import {
  IAgent,
  AgentConfig,
  AgentRole,
  AgentStatus,
  AgentMessage,
  CoordinationEvent,
  SharedState
} from './types.js';

interface CoordinatorConfig {
  workingDirectory: string;
  coordinationPath: string;
  websocketUrl?: string;
  farmId: string;
  numberOfAgents: number;
}

export class AgentCoordinator extends EventEmitter {
  private agents: Map<string, IAgent> = new Map();
  private config: CoordinatorConfig;
  private socket: Socket | null = null;
  private coordinationWatcher: NodeJS.Timer | null = null;
  private sharedStatePath: string;

  constructor(config: CoordinatorConfig) {
    super();
    this.config = config;
    this.sharedStatePath = path.join(
      config.coordinationPath,
      'trump_infog',
      'shared_state.json'
    );
  }

  async initialize(): Promise<void> {
    console.log('Initializing Agent Coordinator...');
    
    // Ensure coordination directories exist
    await this.setupDirectories();
    
    // Initialize shared state
    await this.initializeSharedState();
    
    // Create and initialize agents
    await this.createAgents();
    
    // Setup WebSocket connection if URL provided
    if (this.config.websocketUrl) {
      await this.setupWebSocket();
    }
    
    // Start coordination file watcher
    this.startCoordinationWatcher();
    
    console.log('Agent Coordinator initialized successfully');
  }

  private async setupDirectories(): Promise<void> {
    const dirs = [
      path.join(this.config.coordinationPath, 'trump_infog'),
      path.join(this.config.coordinationPath, 'trump_infog', 'events'),
      path.join(this.config.coordinationPath, 'trump_infog', 'data_pipeline'),
      path.join(this.config.coordinationPath, 'trump_infog', 'logs'),
      path.join(this.config.workingDirectory, 'outputs'),
      path.join(this.config.workingDirectory, 'final_output')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async initializeSharedState(): Promise<void> {
    const initialState: SharedState = {
      projectId: 'trump_infog',
      status: 'initializing',
      agents: {},
      pipeline: {
        currentStage: 'initialization',
        completedStages: [],
        data: {}
      },
      lastUpdate: new Date()
    };

    await fs.writeFile(this.sharedStatePath, JSON.stringify(initialState, null, 2));
  }

  private async createAgents(): Promise<void> {
    const baseConfig = {
      workingDirectory: this.config.workingDirectory,
      coordinationPath: this.config.coordinationPath,
      websocketUrl: this.config.websocketUrl
    };

    // Create agents based on configuration
    const agentConfigs: AgentConfig[] = [
      {
        ...baseConfig,
        id: 0,
        name: 'Data Collector',
        role: AgentRole.DATA_COLLECTOR
      },
      {
        ...baseConfig,
        id: 1,
        name: 'Content Analyzer',
        role: AgentRole.CONTENT_ANALYZER
      },
      {
        ...baseConfig,
        id: 2,
        name: 'Design Generator',
        role: AgentRole.DESIGN_GENERATOR
      },
      {
        ...baseConfig,
        id: 3,
        name: 'Output Assembler',
        role: AgentRole.OUTPUT_ASSEMBLER
      }
    ];

    // Only create the configured number of agents
    const agentsToCreate = agentConfigs.slice(0, this.config.numberOfAgents);

    for (const config of agentsToCreate) {
      const agent = this.createAgent(config);
      if (agent) {
        this.agents.set(config.name, agent);
        
        // Setup agent event listeners
        this.setupAgentListeners(agent);
        
        // Initialize the agent
        await agent.initialize();
      }
    }
  }

  private createAgent(config: AgentConfig): IAgent | null {
    switch (config.role) {
      case AgentRole.DATA_COLLECTOR:
        return new DataCollectorAgent(config);
      case AgentRole.CONTENT_ANALYZER:
        return new ContentAnalyzerAgent(config);
      case AgentRole.DESIGN_GENERATOR:
        return new DesignGeneratorAgent(config);
      case AgentRole.OUTPUT_ASSEMBLER:
        return new OutputAssemblerAgent(config);
      default:
        console.error(`Unknown agent role: ${config.role}`);
        return null;
    }
  }

  private setupAgentListeners(agent: IAgent): void {
    agent.onStateChange((state) => {
      this.emit('agent:state:changed', { agent: agent.config.name, state });
      this.broadcastAgentStatus(agent);
    });

    agent.onError((error) => {
      this.emit('agent:error', { agent: agent.config.name, error });
      this.handleAgentError(agent, error);
    });

    agent.onComplete((result) => {
      this.emit('agent:complete', { agent: agent.config.name, result });
      this.handleAgentCompletion(agent, result);
    });
  }

  private async setupWebSocket(): Promise<void> {
    if (!this.config.websocketUrl) return;

    try {
      this.socket = io(this.config.websocketUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        query: {
          farmId: this.config.farmId,
          type: 'coordinator'
        }
      });

      this.socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        this.emit('websocket:connected');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket server');
        this.emit('websocket:disconnected');
      });

      this.socket.on('message', (message: AgentMessage) => {
        this.handleWebSocketMessage(message);
      });

      this.socket.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.emit('websocket:error', error);
      });
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  }

  private startCoordinationWatcher(): void {
    const eventsDir = path.join(this.config.coordinationPath, 'trump_infog', 'events');
    
    // Watch for coordination events
    this.coordinationWatcher = setInterval(async () => {
      try {
        const files = await fs.readdir(eventsDir);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(eventsDir, file);
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              const event: CoordinationEvent = JSON.parse(content);
              
              // Process event
              await this.handleCoordinationEvent(event);
              
              // Remove processed event file
              await fs.unlink(filePath);
            } catch (error) {
              console.error(`Error processing event file ${file}:`, error);
            }
          }
        }
      } catch (error) {
        // Directory might not exist yet
      }
    }, 1000); // Check every second
  }

  async start(): Promise<void> {
    console.log('Starting Agent Coordinator...');
    
    // Update shared state
    await this.updateSharedState({ status: 'running' });
    
    // Start agents in sequence
    for (const [name, agent] of this.agents) {
      console.log(`Starting agent: ${name}`);
      await agent.start();
      
      // Small delay between agent starts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.emit('coordinator:started');
  }

  async stop(): Promise<void> {
    console.log('Stopping Agent Coordinator...');
    
    // Stop coordination watcher
    if (this.coordinationWatcher) {
      clearInterval(this.coordinationWatcher);
      this.coordinationWatcher = null;
    }
    
    // Stop all agents
    for (const [name, agent] of this.agents) {
      console.log(`Stopping agent: ${name}`);
      await agent.stop();
    }
    
    // Disconnect WebSocket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Update shared state
    await this.updateSharedState({ status: 'stopped' });
    
    this.emit('coordinator:stopped');
  }

  async sendMessageToAgent(agentName: string, message: AgentMessage): Promise<void> {
    const agent = this.agents.get(agentName);
    if (agent) {
      await agent.handleMessage(message);
    } else {
      console.error(`Agent not found: ${agentName}`);
    }
  }

  async broadcastMessage(message: AgentMessage): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.handleMessage(message);
    }
  }

  private async handleWebSocketMessage(message: AgentMessage): Promise<void> {
    console.log('Received WebSocket message:', message.type);
    
    if (message.to === 'coordinator') {
      // Handle coordinator-specific messages
      switch (message.type) {
        case 'status:request':
          await this.reportStatus();
          break;
        case 'start':
          await this.start();
          break;
        case 'stop':
          await this.stop();
          break;
        default:
          console.log(`Unknown coordinator message type: ${message.type}`);
      }
    } else if (message.to) {
      // Forward to specific agent
      await this.sendMessageToAgent(message.to, message);
    } else {
      // Broadcast to all agents
      await this.broadcastMessage(message);
    }
  }

  private async handleCoordinationEvent(event: CoordinationEvent): Promise<void> {
    console.log(`Processing coordination event: ${event.type}`);
    
    // Emit event for listeners
    this.emit('coordination:event', event);
    
    // Broadcast via WebSocket if connected
    if (this.socket && this.socket.connected) {
      this.socket.emit('coordination:event', event);
    }
    
    // Handle specific event types
    switch (event.type) {
      case 'stage:data_collection:complete':
        console.log('Data collection complete, notifying dependent agents');
        break;
      case 'stage:content_analysis:complete':
        console.log('Content analysis complete, notifying dependent agents');
        break;
      case 'stage:design_generation:complete':
        console.log('Design generation complete, notifying dependent agents');
        break;
      case 'stage:output_assembly:complete':
        console.log('Output assembly complete, project finished!');
        await this.handleProjectCompletion();
        break;
    }
  }

  private async handleAgentError(agent: IAgent, error: Error): Promise<void> {
    console.error(`Agent ${agent.config.name} error:`, error);
    
    // Update shared state
    await this.updateSharedState({
      status: 'error',
      agents: {
        ...await this.getSharedState().then(s => s.agents),
        [agent.config.name]: agent.state
      }
    });
    
    // Broadcast error via WebSocket
    if (this.socket && this.socket.connected) {
      this.socket.emit('agent:error', {
        agent: agent.config.name,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  private async handleAgentCompletion(agent: IAgent, result: any): Promise<void> {
    console.log(`Agent ${agent.config.name} completed successfully`);
    
    // Broadcast completion via WebSocket
    if (this.socket && this.socket.connected) {
      this.socket.emit('agent:complete', {
        agent: agent.config.name,
        result: { summary: 'Task completed successfully' },
        timestamp: new Date()
      });
    }
  }

  private async handleProjectCompletion(): Promise<void> {
    console.log('Project completed successfully!');
    
    // Update shared state
    await this.updateSharedState({ status: 'completed' });
    
    // Emit project completion event
    this.emit('project:complete');
    
    // Broadcast via WebSocket
    if (this.socket && this.socket.connected) {
      this.socket.emit('infograph:complete', {
        projectId: this.config.farmId,
        timestamp: new Date()
      });
    }
  }

  private async broadcastAgentStatus(agent: IAgent): Promise<void> {
    if (this.socket && this.socket.connected) {
      this.socket.emit('agent:status', {
        agent: agent.config.name,
        status: agent.getStatus(),
        progress: agent.getProgress(),
        outputs: agent.getOutputs(),
        timestamp: new Date()
      });
    }
  }

  private async reportStatus(): Promise<void> {
    const status = {
      coordinator: 'active',
      agents: {} as Record<string, any>
    };
    
    for (const [name, agent] of this.agents) {
      status.agents[name] = {
        status: agent.getStatus(),
        progress: agent.getProgress(),
        outputs: agent.getOutputs()
      };
    }
    
    if (this.socket && this.socket.connected) {
      this.socket.emit('coordinator:status', status);
    }
    
    this.emit('status:report', status);
  }

  private async getSharedState(): Promise<SharedState> {
    try {
      const content = await fs.readFile(this.sharedStatePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        projectId: 'trump_infog',
        status: 'unknown',
        agents: {},
        pipeline: {
          currentStage: 'unknown',
          completedStages: [],
          data: {}
        },
        lastUpdate: new Date()
      };
    }
  }

  private async updateSharedState(updates: Partial<SharedState>): Promise<void> {
    const currentState = await this.getSharedState();
    const newState = {
      ...currentState,
      ...updates,
      lastUpdate: new Date()
    };
    
    await fs.writeFile(this.sharedStatePath, JSON.stringify(newState, null, 2));
  }

  getAgents(): Map<string, IAgent> {
    return this.agents;
  }

  getAgent(name: string): IAgent | undefined {
    return this.agents.get(name);
  }
}