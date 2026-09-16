import { Socket, Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';

export interface ClientHealth {
  socketId: string;
  userId?: string;
  connected: boolean;
  lastPing: Date;
  lastPong: Date;
  latency: number;
  missedPings: number;
  reconnectCount: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  connectionTime: Date;
}

export interface HealthMetrics {
  activeClients: number;
  healthyClients: number;
  degradedClients: number;
  disconnectedClients: number;
  averageLatency: number;
  connectionUptime: number;
  messageDeliveryRate: number;
  errorRate: number;
}

export class WebSocketHealthMonitor extends EventEmitter {
  private io: SocketIOServer;
  private clients: Map<string, ClientHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.startHealthChecks();
    this.startMetricsReporting();
  }

  public trackConnection(socket: Socket, userId?: string) {
    const health: ClientHealth = {
      socketId: socket.id,
      userId,
      connected: true,
      lastPing: new Date(),
      lastPong: new Date(),
      latency: 0,
      missedPings: 0,
      reconnectCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      connectionTime: new Date()
    };

    this.clients.set(socket.id, health);
    
    // Set up ping/pong handlers
    socket.on('pong', (data?: { timestamp?: number }) => {
      const client = this.clients.get(socket.id);
      if (client) {
        client.lastPong = new Date();
        client.missedPings = 0;
        
        if (data?.timestamp) {
          client.latency = Date.now() - data.timestamp;
        }
      }
    });
  }

  public trackDisconnection(socketId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      client.connected = false;
      
      // Keep the client in memory for a while in case of reconnection
      setTimeout(() => {
        if (!this.clients.get(socketId)?.connected) {
          this.clients.delete(socketId);
        }
      }, 300000); // 5 minutes
    }
  }

  public trackReconnection(socketId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      client.connected = true;
      client.reconnectCount++;
      client.lastPing = new Date();
      client.lastPong = new Date();
      client.missedPings = 0;
    }
  }

  public trackMessage(socketId: string, direction: 'sent' | 'received') {
    const client = this.clients.get(socketId);
    if (client) {
      if (direction === 'sent') {
        client.messagesSent++;
      } else {
        client.messagesReceived++;
      }
    }
  }

  public trackError(socketId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      client.errors++;
    }
  }

  public getClientHealth(socketId: string): ClientHealth | undefined {
    return this.clients.get(socketId);
  }

  public getHealthSummary(): {
    clients: ClientHealth[];
    metrics: HealthMetrics;
    activeClients: number;
    healthyClients: number;
    errorRate: number;
  } {
    const clients = Array.from(this.clients.values());
    const activeClients = clients.filter(c => c.connected);
    const healthyClients = activeClients.filter(c => c.latency < 200 && c.missedPings < 2);
    
    const totalMessages = clients.reduce((sum, c) => sum + c.messagesSent + c.messagesReceived, 0);
    const totalErrors = clients.reduce((sum, c) => sum + c.errors, 0);
    
    const metrics: HealthMetrics = {
      activeClients: activeClients.length,
      healthyClients: healthyClients.length,
      degradedClients: activeClients.filter(c => c.latency >= 200 || c.missedPings >= 2).length,
      disconnectedClients: clients.filter(c => !c.connected).length,
      averageLatency: activeClients.length > 0
        ? activeClients.reduce((sum, c) => sum + c.latency, 0) / activeClients.length
        : 0,
      connectionUptime: activeClients.length > 0
        ? (activeClients.filter(c => c.missedPings === 0).length / activeClients.length) * 100
        : 100,
      messageDeliveryRate: totalMessages > 0 ? ((totalMessages - totalErrors) / totalMessages) * 100 : 100,
      errorRate: totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0
    };

    return {
      clients,
      metrics,
      activeClients: activeClients.length,
      healthyClients: healthyClients.length,
      errorRate: metrics.errorRate
    };
  }

  private startHealthChecks() {
    this.checkInterval = setInterval(() => {
      const now = new Date();
      
      for (const [socketId, client] of this.clients) {
        if (!client.connected) continue;
        
        const timeSinceLastPong = now.getTime() - client.lastPong.getTime();
        
        // Check for timeout (60 seconds)
        if (timeSinceLastPong > 60000) {
          this.emit('client:timeout', {
            socketId,
            userId: client.userId,
            lastSeen: client.lastPong
          });
          
          // Mark as disconnected
          client.connected = false;
        }
        // Check for degraded connection (30 seconds)
        else if (timeSinceLastPong > 30000) {
          client.missedPings++;
          
          if (client.missedPings === 3) {
            this.emit('health:warning', {
              type: 'connection_degraded',
              socketId,
              userId: client.userId,
              missedPings: client.missedPings,
              latency: client.latency
            });
          }
        }
      }
      
      // Check overall health
      const summary = this.getHealthSummary();
      if (summary.metrics.errorRate > 10) {
        this.emit('health:critical', {
          type: 'high_error_rate',
          errorRate: summary.metrics.errorRate,
          affectedClients: summary.clients.filter(c => c.errors > 0).length
        });
      }
      
      if (summary.metrics.averageLatency > 500) {
        this.emit('health:warning', {
          type: 'high_latency',
          averageLatency: summary.metrics.averageLatency,
          affectedClients: summary.clients.filter(c => c.latency > 500).length
        });
      }
    }, 10000); // Check every 10 seconds
  }

  private startMetricsReporting() {
    this.metricsInterval = setInterval(() => {
      const summary = this.getHealthSummary();
      this.emit('metrics:update', summary.metrics);
    }, 30000); // Report every 30 seconds
  }

  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.clients.clear();
    this.removeAllListeners();
  }
}