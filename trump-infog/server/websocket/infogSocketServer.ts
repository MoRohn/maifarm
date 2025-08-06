import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { connectionPool } from './connectionPool';
import { agentEventHandlers } from './agentEventHandlers';
import { stateManager } from './stateManager';
import { InfogSocketEvents, AgentStatus, PipelineStage } from '../../src/types/monitoring';

export class InfogSocketServer extends EventEmitter {
  private io: SocketIOServer;
  private agentSockets: Map<string, Socket> = new Map();
  private activeFarms: Set<string> = new Set();

  constructor(httpServer: HTTPServer) {
    super();
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'development' ? '*' : process.env.FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHealthCheck();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const agentId = socket.handshake.query.agentId as string;
        
        // In development, bypass auth if BYPASS_AUTH is true
        if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
          socket.data.agentId = agentId;
          return next();
        }

        // TODO: Implement proper JWT validation
        if (!token && process.env.NODE_ENV === 'production') {
          return next(new Error('Authentication required'));
        }

        socket.data.agentId = agentId;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const agentId = socket.data.agentId;
      
      console.log(`[InfogSocket] Agent connected: ${agentId}`);
      
      // Add to connection pool
      connectionPool.addConnection(agentId, socket);
      this.agentSockets.set(agentId, socket);

      // Register agent-specific event handlers
      agentEventHandlers.registerHandlers(socket, this);

      // Send initial state
      socket.emit('state:sync', stateManager.getState());

      // Handle pipeline events
      this.setupPipelineEventHandlers(socket);

      // Handle coordination events
      this.setupCoordinationEventHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`[InfogSocket] Agent disconnected: ${agentId}, reason: ${reason}`);
        this.agentSockets.delete(agentId);
        connectionPool.removeConnection(agentId);
        
        // Broadcast agent status update
        this.broadcastAgentStatus(agentId, 'disconnected');
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`[InfogSocket] Socket error for agent ${agentId}:`, error);
        this.emit('socket:error', { agentId, error });
      });
    });
  }

  private setupPipelineEventHandlers(socket: Socket): void {
    const agentId = socket.data.agentId;

    // Data collection events
    socket.on('data:collected', (data: { articleCount: number; timestamp: string }) => {
      console.log(`[Pipeline] Data collected by ${agentId}: ${data.articleCount} articles`);
      stateManager.updatePipelineStage('data_collection', {
        status: 'complete',
        progress: 100,
        outputs: [`${data.articleCount} articles collected`]
      });
      this.broadcastPipelineUpdate('data_collection', 'complete');
      
      // Trigger next stage
      this.emit('pipeline:stage_complete', { stage: 'data_collection', nextStage: 'content_analysis' });
    });

    socket.on('data:validated', (data: { validCount: number; invalidCount: number }) => {
      console.log(`[Pipeline] Data validated: ${data.validCount} valid, ${data.invalidCount} invalid`);
      this.broadcast('infograph:data_validation', data);
    });

    // Analysis events
    socket.on('analysis:complete', (data: { themes: string[]; sentimentScore: number }) => {
      console.log(`[Pipeline] Analysis complete by ${agentId}`);
      stateManager.updatePipelineStage('content_analysis', {
        status: 'complete',
        progress: 100,
        outputs: [`${data.themes.length} themes identified`]
      });
      this.broadcastPipelineUpdate('content_analysis', 'complete');
      
      // Trigger next stage
      this.emit('pipeline:stage_complete', { stage: 'content_analysis', nextStage: 'design_generation' });
    });

    // Design events
    socket.on('design:created', (data: { templateId: string; elementsCount: number }) => {
      console.log(`[Pipeline] Design created by ${agentId}`);
      stateManager.updatePipelineStage('design_generation', {
        status: 'complete',
        progress: 100,
        outputs: [`Template ${data.templateId} with ${data.elementsCount} elements`]
      });
      this.broadcastPipelineUpdate('design_generation', 'complete');
      
      // Trigger next stage
      this.emit('pipeline:stage_complete', { stage: 'design_generation', nextStage: 'output_assembly' });
    });

    // Assembly events
    socket.on('assembly:complete', (data: { formats: string[]; fileSize: number }) => {
      console.log(`[Pipeline] Assembly complete by ${agentId}`);
      stateManager.updatePipelineStage('output_assembly', {
        status: 'complete',
        progress: 100,
        outputs: data.formats
      });
      this.broadcastPipelineUpdate('output_assembly', 'complete');
      
      // Project complete
      this.broadcast('infograph:complete', {
        timestamp: new Date().toISOString(),
        outputs: data.formats,
        totalSize: data.fileSize
      });
    });

    // Progress updates
    socket.on('agent:progress', (data: { stage: string; progress: number; message?: string }) => {
      stateManager.updateAgentState(agentId, {
        status: 'working',
        currentTask: data.stage,
        lastUpdate: new Date().toISOString()
      });
      
      this.broadcast('agent:progress', {
        agentId,
        stage: data.stage,
        progress: data.progress,
        message: data.message
      });
    });

    // Error events
    socket.on('agent:error', (data: { stage: string; error: string; recoverable: boolean }) => {
      console.error(`[Pipeline] Error in ${data.stage} by ${agentId}: ${data.error}`);
      
      if (data.recoverable) {
        this.broadcast('pipeline:warning', {
          agentId,
          stage: data.stage,
          message: data.error
        });
      } else {
        stateManager.updatePipelineStage(data.stage as any, {
          status: 'error',
          progress: 0,
          outputs: []
        });
        this.broadcast('pipeline:error', {
          agentId,
          stage: data.stage,
          error: data.error
        });
      }
    });
  }

  private setupCoordinationEventHandlers(socket: Socket): void {
    const agentId = socket.data.agentId;

    // Work claiming
    socket.on('work:claim', (data: { workId: string; description: string; estimatedDuration: number }) => {
      console.log(`[Coordination] Work claimed by ${agentId}: ${data.workId}`);
      this.broadcast('work:claimed', {
        agentId,
        workId: data.workId,
        description: data.description,
        timestamp: new Date().toISOString()
      });
    });

    // Work completion
    socket.on('work:complete', (data: { workId: string; outputs: string[] }) => {
      console.log(`[Coordination] Work completed by ${agentId}: ${data.workId}`);
      this.broadcast('work:completed', {
        agentId,
        workId: data.workId,
        outputs: data.outputs,
        timestamp: new Date().toISOString()
      });
    });

    // Agent status updates
    socket.on('agent:status', (status: AgentStatus) => {
      stateManager.updateAgentState(agentId, {
        status: status.status,
        currentTask: status.currentTask || '',
        lastUpdate: new Date().toISOString()
      });
      
      this.broadcastAgentStatus(agentId, status.status);
    });

    // Heartbeat
    socket.on('agent:heartbeat', () => {
      connectionPool.updateHeartbeat(agentId);
      stateManager.updateAgentState(agentId, {
        lastUpdate: new Date().toISOString()
      });
    });
  }

  private broadcastAgentStatus(agentId: string, status: string): void {
    this.broadcast('agent:status', {
      agentId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  private broadcastPipelineUpdate(stage: string, status: string): void {
    const stageData = stateManager.getPipelineStage(stage as any);
    this.broadcast('pipeline:update', {
      stage,
      status,
      progress: stageData?.progress || 0,
      timestamp: new Date().toISOString()
    });
  }

  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
    
    // Log important events
    if (event.includes('complete') || event.includes('error')) {
      console.log(`[Broadcast] ${event}:`, JSON.stringify(data));
    }
  }

  public broadcastToAgent(agentId: string, event: string, data: any): void {
    const socket = this.agentSockets.get(agentId);
    if (socket) {
      socket.emit(event, data);
    } else {
      console.warn(`[Broadcast] Agent ${agentId} not connected`);
    }
  }

  public broadcastToFarm(farmId: string, event: string, data: any): void {
    // For infograph project, farmId would be 'infograph_t47'
    this.io.to(farmId).emit(event, data);
  }

  private startHealthCheck(): void {
    setInterval(() => {
      const connectedAgents = Array.from(this.agentSockets.keys());
      const health = connectionPool.getConnectionHealth();
      
      this.broadcast('health:update', {
        connectedAgents,
        totalConnections: connectedAgents.length,
        healthStatus: health,
        timestamp: new Date().toISOString()
      });
    }, 30000); // Every 30 seconds
  }

  public getConnectedAgents(): string[] {
    return Array.from(this.agentSockets.keys());
  }

  public getAgentSocket(agentId: string): Socket | undefined {
    return this.agentSockets.get(agentId);
  }

  public shutdown(): void {
    console.log('[InfogSocket] Shutting down socket server...');
    this.io.close();
    this.removeAllListeners();
  }
}

// Factory function
export function createInfogSocketServer(httpServer: HTTPServer): InfogSocketServer {
  return new InfogSocketServer(httpServer);
}