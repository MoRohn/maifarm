import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';

interface ClientStatus {
  clientId: string;
  ready: boolean;
  lastHeartbeat: Date;
  queuedMessages: any[];
  reconnectCount: number;
}

/**
 * WebSocket Client Readiness Tracker
 * Ensures clients are ready before broadcasting, preventing "No clients available" errors
 */
export class WebSocketClientReadinessTracker {
  private static instance: WebSocketClientReadinessTracker;
  private clientStatuses = new Map<string, ClientStatus>();
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_QUEUE_SIZE = 100;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startHeartbeatMonitor();
    this.setupEventHandlers();
  }

  static getInstance(): WebSocketClientReadinessTracker {
    if (!WebSocketClientReadinessTracker.instance) {
      WebSocketClientReadinessTracker.instance = new WebSocketClientReadinessTracker();
    }
    return WebSocketClientReadinessTracker.instance;
  }

  /**
   * Register a new client
   */
  registerClient(clientId: string): void {
    this.clientStatuses.set(clientId, {
      clientId,
      ready: false,
      lastHeartbeat: new Date(),
      queuedMessages: [],
      reconnectCount: 0
    });
    logger.info(`[WebSocketReadiness] Client registered: ${clientId}`);
  }

  /**
   * Mark client as ready
   */
  markClientReady(clientId: string): void {
    const status = this.clientStatuses.get(clientId);
    if (status) {
      status.ready = true;
      status.lastHeartbeat = new Date();
      
      // Deliver queued messages
      if (status.queuedMessages.length > 0) {
        logger.info(`[WebSocketReadiness] Delivering ${status.queuedMessages.length} queued messages to ${clientId}`);
        this.deliverQueuedMessages(clientId);
      }
    }
  }

  /**
   * Check if client is ready
   */
  isClientReady(clientId: string): boolean {
    const status = this.clientStatuses.get(clientId);
    return status?.ready || false;
  }

  /**
   * Get ready clients for a session
   */
  getReadyClientsForSession(sessionId: string): string[] {
    const readyClients: string[] = [];
    
    // Get all clients subscribed to this session
    const allClients = websocketManager.getClientsForSession(sessionId);
    
    for (const clientId of allClients) {
      if (this.isClientReady(clientId)) {
        readyClients.push(clientId);
      }
    }
    
    return readyClients;
  }

  /**
   * Queue message for unready client
   */
  queueMessage(clientId: string, message: any): void {
    const status = this.clientStatuses.get(clientId);
    if (status) {
      if (status.queuedMessages.length < this.MAX_QUEUE_SIZE) {
        status.queuedMessages.push(message);
        logger.debug(`[WebSocketReadiness] Queued message for unready client ${clientId}`);
      } else {
        logger.warn(`[WebSocketReadiness] Queue full for client ${clientId}, dropping oldest message`);
        status.queuedMessages.shift();
        status.queuedMessages.push(message);
      }
    }
  }

  /**
   * Deliver queued messages to client
   */
  private deliverQueuedMessages(clientId: string): void {
    const status = this.clientStatuses.get(clientId);
    if (!status || !status.ready) return;

    const messages = [...status.queuedMessages];
    status.queuedMessages = [];

    for (const message of messages) {
      try {
        websocketManager.sendToClient(clientId, message);
      } catch (error) {
        logger.error(`[WebSocketReadiness] Failed to deliver queued message to ${clientId}:`, error);
      }
    }
  }

  /**
   * Handle client disconnection
   */
  handleClientDisconnect(clientId: string): void {
    const status = this.clientStatuses.get(clientId);
    if (status) {
      status.ready = false;
      status.reconnectCount++;
      logger.info(`[WebSocketReadiness] Client disconnected: ${clientId} (reconnects: ${status.reconnectCount})`);
    }
  }

  /**
   * Update client heartbeat
   */
  updateHeartbeat(clientId: string): void {
    const status = this.clientStatuses.get(clientId);
    if (status) {
      status.lastHeartbeat = new Date();
      if (!status.ready) {
        this.markClientReady(clientId);
      }
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const staleClients: string[] = [];

      for (const [clientId, status] of this.clientStatuses) {
        const timeSinceHeartbeat = now.getTime() - status.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
          staleClients.push(clientId);
        }
      }

      // Mark stale clients as not ready
      for (const clientId of staleClients) {
        const status = this.clientStatuses.get(clientId);
        if (status && status.ready) {
          status.ready = false;
          logger.warn(`[WebSocketReadiness] Client ${clientId} marked as not ready (no heartbeat)`);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen for WebSocket events
    websocketManager.on('client:connected', (clientId: string) => {
      this.registerClient(clientId);
    });

    websocketManager.on('client:disconnected', (clientId: string) => {
      this.handleClientDisconnect(clientId);
    });

    websocketManager.on('client:heartbeat', (clientId: string) => {
      this.updateHeartbeat(clientId);
    });
  }

  /**
   * Broadcast with readiness check
   */
  broadcastWithReadinessCheck(sessionId: string, event: string, data: any): number {
    const readyClients = this.getReadyClientsForSession(sessionId);
    const unreadyClients = websocketManager.getClientsForSession(sessionId)
      .filter(clientId => !readyClients.includes(clientId));

    // Queue messages for unready clients
    for (const clientId of unreadyClients) {
      this.queueMessage(clientId, { event, data });
    }

    // Broadcast to ready clients
    if (readyClients.length > 0) {
      websocketManager.broadcastToClients(readyClients, event, data);
      logger.debug(`[WebSocketReadiness] Broadcast to ${readyClients.length} ready clients`);
    } else {
      logger.warn(`[WebSocketReadiness] No ready clients for session ${sessionId}, queued for ${unreadyClients.length} clients`);
    }

    return readyClients.length;
  }

  /**
   * Get client statistics
   */
  getStats(): {
    totalClients: number;
    readyClients: number;
    unreadyClients: number;
    totalQueuedMessages: number;
  } {
    let readyClients = 0;
    let totalQueuedMessages = 0;

    for (const status of this.clientStatuses.values()) {
      if (status.ready) readyClients++;
      totalQueuedMessages += status.queuedMessages.length;
    }

    return {
      totalClients: this.clientStatuses.size,
      readyClients,
      unreadyClients: this.clientStatuses.size - readyClients,
      totalQueuedMessages
    };
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clientStatuses.clear();
  }
}

// Export singleton instance
export const websocketReadinessTracker = WebSocketClientReadinessTracker.getInstance();