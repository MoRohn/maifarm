import { Server } from 'socket.io';
import { AgentCoordinator } from './agents/AgentCoordinator.js';
import { CoordinationEvent } from './agents/types.js';

interface IntegrationConfig {
  farmId: string;
  numberOfAgents: number;
  workingDirectory: string;
  coordinationPath: string;
  websocketUrl?: string;
  io?: Server;
}

export class InfographAgentIntegration {
  private coordinator: AgentCoordinator;
  private config: IntegrationConfig;
  private io?: Server;

  constructor(config: IntegrationConfig) {
    this.config = config;
    this.io = config.io;
    
    this.coordinator = new AgentCoordinator({
      farmId: config.farmId,
      numberOfAgents: config.numberOfAgents,
      workingDirectory: config.workingDirectory,
      coordinationPath: config.coordinationPath,
      websocketUrl: config.websocketUrl
    });
    
    this.setupCoordinatorListeners();
  }

  private setupCoordinatorListeners(): void {
    // Agent state changes
    this.coordinator.on('agent:state:changed', ({ agent, state }) => {
      this.broadcastToFarm('agent:updated', {
        farmId: this.config.farmId,
        agent,
        state,
        timestamp: new Date()
      });
    });

    // Agent errors
    this.coordinator.on('agent:error', ({ agent, error }) => {
      this.broadcastToFarm('agent:error', {
        farmId: this.config.farmId,
        agent,
        error: error.message,
        timestamp: new Date()
      });
    });

    // Agent completion
    this.coordinator.on('agent:complete', ({ agent, result }) => {
      this.broadcastToFarm('agent:complete', {
        farmId: this.config.farmId,
        agent,
        result,
        timestamp: new Date()
      });
    });

    // Coordination events
    this.coordinator.on('coordination:event', (event: CoordinationEvent) => {
      this.broadcastToFarm('coordination:event', {
        farmId: this.config.farmId,
        event,
        timestamp: new Date()
      });
    });

    // Project completion
    this.coordinator.on('project:complete', () => {
      this.broadcastToFarm('infograph:complete', {
        farmId: this.config.farmId,
        status: 'completed',
        timestamp: new Date()
      });
    });

    // WebSocket connection status
    this.coordinator.on('websocket:connected', () => {
      console.log(`Infograph agents connected to WebSocket for farm ${this.config.farmId}`);
    });

    this.coordinator.on('websocket:disconnected', () => {
      console.log(`Infograph agents disconnected from WebSocket for farm ${this.config.farmId}`);
    });
  }

  async initialize(): Promise<void> {
    console.log(`Initializing Infograph Agent Integration for farm ${this.config.farmId}`);
    await this.coordinator.initialize();
  }

  async start(): Promise<void> {
    console.log(`Starting Infograph agents for farm ${this.config.farmId}`);
    await this.coordinator.start();
    
    // Notify that the farm has started
    this.broadcastToFarm('farm:status', {
      farmId: this.config.farmId,
      status: 'running',
      agents: this.getAgentStatuses(),
      timestamp: new Date()
    });
  }

  async stop(): Promise<void> {
    console.log(`Stopping Infograph agents for farm ${this.config.farmId}`);
    await this.coordinator.stop();
    
    // Notify that the farm has stopped
    this.broadcastToFarm('farm:status', {
      farmId: this.config.farmId,
      status: 'stopped',
      timestamp: new Date()
    });
  }

  private broadcastToFarm(event: string, data: any): void {
    if (this.io) {
      // Broadcast to all clients in the farm room
      this.io.to(`farm:${this.config.farmId}`).emit(event, data);
      
      // Also broadcast to general monitoring
      this.io.emit('infograph:event', {
        event,
        ...data
      });
    }
  }

  getAgentStatuses(): Record<string, any> {
    const statuses: Record<string, any> = {};
    
    for (const [name, agent] of this.coordinator.getAgents()) {
      statuses[name] = {
        status: agent.getStatus(),
        progress: agent.getProgress(),
        outputs: agent.getOutputs(),
        state: agent.state
      };
    }
    
    return statuses;
  }

  async handleClientMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'start':
        await this.start();
        break;
      case 'stop':
        await this.stop();
        break;
      case 'status':
        this.broadcastToFarm('farm:status', {
          farmId: this.config.farmId,
          status: 'active',
          agents: this.getAgentStatuses(),
          timestamp: new Date()
        });
        break;
      case 'agent:message':
        if (message.agent && message.payload) {
          await this.coordinator.sendMessageToAgent(message.agent, {
            from: 'client',
            to: message.agent,
            type: message.payload.type,
            payload: message.payload.data,
            timestamp: new Date()
          });
        }
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }
}

// Factory function to create and initialize the integration
export async function createInfographIntegration(config: IntegrationConfig): Promise<InfographAgentIntegration> {
  const integration = new InfographAgentIntegration(config);
  await integration.initialize();
  return integration;
}

// Integration with MaiFarm multi-agent system
export function setupInfographRoutes(app: any, io: Server): void {
  const activeIntegrations = new Map<string, InfographAgentIntegration>();

  // API endpoint to launch infograph generation
  app.post('/api/infograph/launch', async (req: any, res: any) => {
    try {
      const { farmId, numberOfAgents = 4, workingDirectory } = req.body;
      
      if (!farmId || !workingDirectory) {
        return res.status(400).json({ error: 'farmId and workingDirectory are required' });
      }
      
      // Check if already running
      if (activeIntegrations.has(farmId)) {
        return res.status(409).json({ error: 'Infograph generation already running for this farm' });
      }
      
      // Create integration
      const integration = await createInfographIntegration({
        farmId,
        numberOfAgents,
        workingDirectory,
        coordinationPath: '/tmp/claude_coordination',
        websocketUrl: process.env.WEBSOCKET_URL || 'http://localhost:4567',
        io
      });
      
      activeIntegrations.set(farmId, integration);
      
      // Start the agents
      await integration.start();
      
      res.json({
        success: true,
        farmId,
        message: 'Infograph generation started',
        agents: integration.getAgentStatuses()
      });
    } catch (error) {
      console.error('Failed to launch infograph generation:', error);
      res.status(500).json({ error: 'Failed to launch infograph generation' });
    }
  });

  // API endpoint to stop infograph generation
  app.post('/api/infograph/stop', async (req: any, res: any) => {
    try {
      const { farmId } = req.body;
      
      if (!farmId) {
        return res.status(400).json({ error: 'farmId is required' });
      }
      
      const integration = activeIntegrations.get(farmId);
      if (!integration) {
        return res.status(404).json({ error: 'No active infograph generation for this farm' });
      }
      
      await integration.stop();
      activeIntegrations.delete(farmId);
      
      res.json({
        success: true,
        farmId,
        message: 'Infograph generation stopped'
      });
    } catch (error) {
      console.error('Failed to stop infograph generation:', error);
      res.status(500).json({ error: 'Failed to stop infograph generation' });
    }
  });

  // API endpoint to get status
  app.get('/api/infograph/status/:farmId', (req: any, res: any) => {
    const { farmId } = req.params;
    
    const integration = activeIntegrations.get(farmId);
    if (!integration) {
      return res.status(404).json({ error: 'No active infograph generation for this farm' });
    }
    
    res.json({
      farmId,
      status: 'active',
      agents: integration.getAgentStatuses()
    });
  });

  // WebSocket handling
  io.on('connection', (socket) => {
    socket.on('infograph:join', (farmId: string) => {
      socket.join(`farm:${farmId}`);
      console.log(`Client joined infograph farm: ${farmId}`);
      
      // Send current status if available
      const integration = activeIntegrations.get(farmId);
      if (integration) {
        socket.emit('farm:status', {
          farmId,
          status: 'active',
          agents: integration.getAgentStatuses(),
          timestamp: new Date()
        });
      }
    });

    socket.on('infograph:leave', (farmId: string) => {
      socket.leave(`farm:${farmId}`);
      console.log(`Client left infograph farm: ${farmId}`);
    });

    socket.on('infograph:message', async (data: any) => {
      const { farmId, message } = data;
      
      const integration = activeIntegrations.get(farmId);
      if (integration) {
        await integration.handleClientMessage(message);
      } else {
        socket.emit('error', { error: 'No active infograph generation for this farm' });
      }
    });
  });
}