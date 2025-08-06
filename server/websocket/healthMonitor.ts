/**
 * WebSocket Health Monitor
 * Monitors WebSocket connection health, tracks metrics, and manages connection recovery
 */

import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import { SocketIOServer } from 'socket.io';

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  reconnections: number;
  disconnections: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  averageLatency: number;
  connectionUptime: number;
  lastHeartbeat: Date | null;
}

export interface ClientHealth {
  socketId: string;
  userId?: string;
  connected: boolean;
  lastPing: Date;
  lastPong: Date;
  latency: number;
  reconnectCount: number;
  errorCount: number;
  messageQueueSize: number;
}

export class WebSocketHealthMonitor extends EventEmitter {
  private io: SocketIOServer;
  private metrics: ConnectionMetrics;
  private clientHealthMap: Map<string, ClientHealth> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private startTime: Date;
  
  // Health check thresholds
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds
  private readonly HEARTBEAT_TIMEOUT = 45000; // 45 seconds
  private readonly MAX_LATENCY = 5000; // 5 seconds
  private readonly MAX_ERROR_RATE = 0.1; // 10% error rate
  private readonly MIN_CONNECTION_STABILITY = 0.9; // 90% uptime

  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.startTime = new Date();
    
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      reconnections: 0,
      disconnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      averageLatency: 0,
      connectionUptime: 100,
      lastHeartbeat: null
    };

    this.startMonitoring();
  }

  private startMonitoring() {
    // Monitor connection health every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 5000);

    // Update metrics every second
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000);

    console.log('[WebSocketHealthMonitor] Health monitoring started');
  }

  public trackConnection(socket: Socket, userId?: string) {
    const clientHealth: ClientHealth = {
      socketId: socket.id,
      userId,
      connected: true,
      lastPing: new Date(),
      lastPong: new Date(),
      latency: 0,
      reconnectCount: 0,
      errorCount: 0,
      messageQueueSize: 0
    };

    this.clientHealthMap.set(socket.id, clientHealth);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;

    // Setup heartbeat for this client
    this.setupClientHeartbeat(socket);

    this.emit('client:connected', { socketId: socket.id, userId });
  }

  public trackDisconnection(socketId: string, reason?: string) {
    const client = this.clientHealthMap.get(socketId);
    if (client) {
      client.connected = false;
      this.metrics.disconnections++;
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
      
      this.emit('client:disconnected', { 
        socketId, 
        userId: client.userId, 
        reason,
        sessionDuration: Date.now() - client.lastPing.getTime()
      });

      // Keep client info for potential reconnection tracking
      setTimeout(() => {
        // Clean up after 5 minutes if not reconnected
        if (!this.clientHealthMap.get(socketId)?.connected) {
          this.clientHealthMap.delete(socketId);
        }
      }, 300000);
    }
  }

  public trackReconnection(socketId: string, oldSocketId?: string) {
    const client = this.clientHealthMap.get(oldSocketId || socketId);
    if (client) {
      client.connected = true;
      client.reconnectCount++;
      client.socketId = socketId;
      this.metrics.reconnections++;
      
      // Move to new socket ID if changed
      if (oldSocketId && oldSocketId !== socketId) {
        this.clientHealthMap.delete(oldSocketId);
        this.clientHealthMap.set(socketId, client);
      }

      this.emit('client:reconnected', { 
        socketId, 
        userId: client.userId,
        reconnectCount: client.reconnectCount 
      });
    }
  }

  public trackMessage(socketId: string, direction: 'sent' | 'received') {
    const client = this.clientHealthMap.get(socketId);
    if (client) {
      if (direction === 'sent') {
        this.metrics.messagesSent++;
      } else {
        this.metrics.messagesReceived++;
      }
    }
  }

  public trackError(socketId: string, error: Error) {
    const client = this.clientHealthMap.get(socketId);
    if (client) {
      client.errorCount++;
      this.metrics.errors++;
      
      // Check if error rate is too high
      const errorRate = this.metrics.errors / (this.metrics.messagesSent + this.metrics.messagesReceived || 1);
      if (errorRate > this.MAX_ERROR_RATE) {
        this.emit('health:warning', {
          type: 'high_error_rate',
          rate: errorRate,
          threshold: this.MAX_ERROR_RATE
        });
      }
    }
  }

  private setupClientHeartbeat(socket: Socket) {
    const heartbeatInterval = setInterval(() => {
      const client = this.clientHealthMap.get(socket.id);
      if (!client || !client.connected) {
        clearInterval(heartbeatInterval);
        return;
      }

      // Send ping and track time
      client.lastPing = new Date();
      socket.emit('ping', { timestamp: Date.now() });
      
      // Check for timeout
      const timeSinceLastPong = Date.now() - client.lastPong.getTime();
      if (timeSinceLastPong > this.HEARTBEAT_TIMEOUT) {
        this.emit('client:timeout', {
          socketId: socket.id,
          userId: client.userId,
          lastSeen: client.lastPong
        });
        
        // Force disconnect if severely timed out
        if (timeSinceLastPong > this.HEARTBEAT_TIMEOUT * 2) {
          socket.disconnect(true);
        }
      }
    }, this.HEARTBEAT_INTERVAL);

    // Handle pong response
    socket.on('pong', (data: { timestamp: number }) => {
      const client = this.clientHealthMap.get(socket.id);
      if (client) {
        client.lastPong = new Date();
        client.latency = Date.now() - data.timestamp;
        
        // Update average latency
        this.updateAverageLatency();
        
        // Check for high latency
        if (client.latency > this.MAX_LATENCY) {
          this.emit('health:warning', {
            type: 'high_latency',
            socketId: socket.id,
            latency: client.latency,
            threshold: this.MAX_LATENCY
          });
        }
      }
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
    });
  }

  private checkConnectionHealth() {
    const now = Date.now();
    let healthyConnections = 0;
    let unhealthyConnections: string[] = [];

    this.clientHealthMap.forEach((client, socketId) => {
      if (!client.connected) return;

      const timeSinceLastPong = now - client.lastPong.getTime();
      
      if (timeSinceLastPong < this.HEARTBEAT_TIMEOUT) {
        healthyConnections++;
      } else {
        unhealthyConnections.push(socketId);
      }
    });

    // Calculate connection stability
    const totalActive = healthyConnections + unhealthyConnections.length;
    const stability = totalActive > 0 ? healthyConnections / totalActive : 1;
    
    if (stability < this.MIN_CONNECTION_STABILITY) {
      this.emit('health:critical', {
        type: 'low_stability',
        stability,
        unhealthyConnections,
        threshold: this.MIN_CONNECTION_STABILITY
      });
    }

    // Update metrics
    this.metrics.connectionUptime = stability * 100;
    this.metrics.lastHeartbeat = new Date();
  }

  private updateAverageLatency() {
    const latencies: number[] = [];
    this.clientHealthMap.forEach(client => {
      if (client.connected && client.latency > 0) {
        latencies.push(client.latency);
      }
    });

    if (latencies.length > 0) {
      this.metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }
  }

  private updateMetrics() {
    // Emit current metrics
    this.emit('metrics:update', this.getMetrics());
  }

  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  public getClientHealth(socketId: string): ClientHealth | undefined {
    return this.clientHealthMap.get(socketId);
  }

  public getAllClientHealth(): ClientHealth[] {
    return Array.from(this.clientHealthMap.values());
  }

  public getHealthSummary() {
    const uptime = Date.now() - this.startTime.getTime();
    const errorRate = this.metrics.errors / (this.metrics.messagesSent + this.metrics.messagesReceived || 1);
    
    return {
      status: this.determineHealthStatus(),
      uptime,
      metrics: this.metrics,
      errorRate,
      activeClients: this.metrics.activeConnections,
      healthyClients: Array.from(this.clientHealthMap.values()).filter(c => 
        c.connected && (Date.now() - c.lastPong.getTime()) < this.HEARTBEAT_TIMEOUT
      ).length,
      warnings: this.getActiveWarnings()
    };
  }

  private determineHealthStatus(): 'healthy' | 'degraded' | 'critical' {
    const errorRate = this.metrics.errors / (this.metrics.messagesSent + this.metrics.messagesReceived || 1);
    const stability = this.metrics.connectionUptime / 100;
    
    if (errorRate > this.MAX_ERROR_RATE * 2 || stability < 0.5) {
      return 'critical';
    } else if (errorRate > this.MAX_ERROR_RATE || stability < this.MIN_CONNECTION_STABILITY) {
      return 'degraded';
    }
    return 'healthy';
  }

  private getActiveWarnings(): string[] {
    const warnings: string[] = [];
    const errorRate = this.metrics.errors / (this.metrics.messagesSent + this.metrics.messagesReceived || 1);
    
    if (errorRate > this.MAX_ERROR_RATE) {
      warnings.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
    }
    
    if (this.metrics.averageLatency > this.MAX_LATENCY * 0.5) {
      warnings.push(`High average latency: ${this.metrics.averageLatency}ms`);
    }
    
    if (this.metrics.connectionUptime < this.MIN_CONNECTION_STABILITY * 100) {
      warnings.push(`Low connection stability: ${this.metrics.connectionUptime.toFixed(2)}%`);
    }
    
    return warnings;
  }

  public stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.removeAllListeners();
    console.log('[WebSocketHealthMonitor] Health monitoring stopped');
  }
}