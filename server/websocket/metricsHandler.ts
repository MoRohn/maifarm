/**
 * Consolidated WebSocket Metrics Handler
 * Single handler for all metrics-related WebSocket events
 */

import { Server, Socket } from 'socket.io';
import { metricsSynchronizer } from '../services/metricsSynchronizer';
import { websocketManager } from './websocketManager';
import { validateWebSocketMetrics, sanitizeMetrics } from '../middleware/metricsValidation';

export class MetricsWebSocketHandler {
  private io: Server;
  private metricsRoom = 'metrics:subscribers';
  private updateBatchTimer: NodeJS.Timeout | null = null;
  private pendingUpdates: Map<string, any> = new Map();
  private readonly BATCH_INTERVAL = 500; // 500ms batching

  constructor(io: Server) {
    this.io = io;
    this.initialize();
  }

  /**
   * Initialize the metrics WebSocket handler
   */
  private initialize(): void {
    // Handle client connections
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    // Subscribe to metrics synchronizer events
    metricsSynchronizer.on('metrics:updated', (event) => {
      this.broadcastMetricsUpdate(event);
    });

    console.log('[MetricsWebSocketHandler] Initialized');
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    console.log(`[MetricsWebSocketHandler] Client connected: ${socket.id}`);

    // Handle metrics subscription
    socket.on('metrics:subscribe', () => {
      socket.join(this.metricsRoom);
      console.log(`[MetricsWebSocketHandler] Client ${socket.id} subscribed to metrics`);
      
      // Send current metrics immediately
      this.sendCurrentMetrics(socket);
    });

    // Handle metrics unsubscription
    socket.on('metrics:unsubscribe', () => {
      socket.leave(this.metricsRoom);
      console.log(`[MetricsWebSocketHandler] Client ${socket.id} unsubscribed from metrics`);
    });

    // Handle metrics request
    socket.on('metrics:request', (data) => {
      this.handleMetricsRequest(socket, data);
    });

    // Handle farm-specific metrics request
    socket.on('metrics:farm:request', (farmId: string) => {
      this.handleFarmMetricsRequest(socket, farmId);
    });

    // Handle agent-specific metrics request
    socket.on('metrics:agent:request', (agentId: string) => {
      this.handleAgentMetricsRequest(socket, agentId);
    });

    // Handle metrics update from client (if authorized)
    socket.on('metrics:update', async (data) => {
      await this.handleMetricsUpdate(socket, data);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[MetricsWebSocketHandler] Client disconnected: ${socket.id}`);
    });
  }

  /**
   * Send current metrics to a specific client
   */
  private sendCurrentMetrics(socket: Socket): void {
    const metrics = metricsSynchronizer.getMetrics();
    const dashboardMetrics = metricsSynchronizer.getDashboardMetrics();
    
    socket.emit('metrics:update', {
      type: 'full',
      metrics,
      dashboard: dashboardMetrics,
      timestamp: new Date(),
      version: Date.now(),
      source: 'server'
    });
  }

  /**
   * Broadcast metrics update to all subscribed clients
   */
  private broadcastMetricsUpdate(event: any): void {
    // Add to pending updates for batching
    this.pendingUpdates.set('latest', event);
    
    // Start batch timer if not already running
    if (!this.updateBatchTimer) {
      this.updateBatchTimer = setTimeout(() => {
        this.processBatchedUpdates();
      }, this.BATCH_INTERVAL);
    }
  }

  /**
   * Process and send batched updates
   */
  private processBatchedUpdates(): void {
    if (this.pendingUpdates.size === 0) {
      this.updateBatchTimer = null;
      return;
    }

    // Get the latest update
    const latestUpdate = this.pendingUpdates.get('latest');
    if (latestUpdate) {
      // Enhance with dashboard metrics
      const enhancedUpdate = {
        ...latestUpdate,
        dashboard: metricsSynchronizer.getDashboardMetrics()
      };
      
      // Broadcast to all subscribers
      this.io.to(this.metricsRoom).emit('metrics:update', enhancedUpdate);
      
      // Also broadcast on general channel for backward compatibility
      websocketManager.broadcast('metrics:update', enhancedUpdate);
    }

    // Clear pending updates
    this.pendingUpdates.clear();
    this.updateBatchTimer = null;
  }

  /**
   * Handle metrics request from client
   */
  private handleMetricsRequest(socket: Socket, data: any): void {
    const { type = 'current', period, filters } = data || {};
    
    switch (type) {
      case 'current':
        this.sendCurrentMetrics(socket);
        break;
      
      case 'historical':
        // TODO: Implement historical metrics retrieval
        socket.emit('metrics:response', {
          type: 'historical',
          error: 'Historical metrics not yet implemented'
        });
        break;
      
      case 'aggregated':
        const metrics = metricsSynchronizer.getMetrics();
        socket.emit('metrics:response', {
          type: 'aggregated',
          data: metrics,
          timestamp: new Date()
        });
        break;
      
      default:
        socket.emit('metrics:error', {
          error: `Unknown metrics request type: ${type}`
        });
    }
  }

  /**
   * Handle farm-specific metrics request
   */
  private handleFarmMetricsRequest(socket: Socket, farmId: string): void {
    if (!farmId) {
      socket.emit('metrics:error', {
        error: 'Farm ID is required'
      });
      return;
    }

    const agentCount = metricsSynchronizer.getFarmAgentCount(farmId);
    
    socket.emit('metrics:farm:response', {
      farmId,
      agentCount,
      timestamp: new Date()
    });
  }

  /**
   * Handle agent-specific metrics request
   */
  private handleAgentMetricsRequest(socket: Socket, agentId: string): void {
    if (!agentId) {
      socket.emit('metrics:error', {
        error: 'Agent ID is required'
      });
      return;
    }

    // TODO: Implement agent-specific metrics retrieval
    socket.emit('metrics:agent:response', {
      agentId,
      error: 'Agent-specific metrics not yet implemented'
    });
  }

  /**
   * Handle metrics update from client
   */
  private async handleMetricsUpdate(socket: Socket, data: any): Promise<void> {
    // TODO: Add authorization check
    // For now, reject all client-side updates for security
    socket.emit('metrics:error', {
      error: 'Client-side metrics updates are not allowed'
    });
    return;
    
    // When implementing client updates, use this validation:
    /*
    // Sanitize and validate the data
    const sanitized = sanitizeMetrics(data);
    const validation = validateWebSocketMetrics(sanitized);
    
    if (!validation.valid) {
      socket.emit('metrics:error', {
        error: 'Invalid metrics data',
        details: validation.errors
      });
      return;
    }
    
    // Process valid metrics
    await metricsSynchronizer.handleMetricUpdate('websocket:' + socket.id, sanitized);
    */
  }

  /**
   * Force broadcast current metrics
   */
  public broadcastNow(): void {
    if (this.updateBatchTimer) {
      clearTimeout(this.updateBatchTimer);
      this.updateBatchTimer = null;
    }
    this.processBatchedUpdates();
  }

  /**
   * Get subscriber count
   */
  public getSubscriberCount(): number {
    const room = this.io.sockets.adapter.rooms.get(this.metricsRoom);
    return room ? room.size : 0;
  }

  /**
   * Cleanup on shutdown
   */
  public cleanup(): void {
    if (this.updateBatchTimer) {
      clearTimeout(this.updateBatchTimer);
      this.updateBatchTimer = null;
    }
    this.pendingUpdates.clear();
    console.log('[MetricsWebSocketHandler] Cleaned up');
  }
}

/**
 * Initialize metrics WebSocket handler with the Socket.IO server
 */
export function initializeMetricsHandler(io: Server): MetricsWebSocketHandler {
  return new MetricsWebSocketHandler(io);
}