import { Socket } from 'socket.io';
import { EventEmitter } from 'events';

interface ConnectionInfo {
  socket: Socket;
  connectedAt: Date;
  lastHeartbeat: Date;
  reconnectCount: number;
  latency: number;
}

interface ConnectionHealth {
  healthy: number;
  warning: number;
  critical: number;
  disconnected: number;
}

export class ConnectionPool extends EventEmitter {
  private connections: Map<string, ConnectionInfo> = new Map();
  private heartbeatInterval: NodeJS.Timer;
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  private readonly HEARTBEAT_WARNING = 30000; // 30 seconds

  constructor() {
    super();
    
    // Start monitoring connections
    this.heartbeatInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 10000); // Check every 10 seconds
  }

  public addConnection(agentId: string, socket: Socket): void {
    const now = new Date();
    
    // Check if this is a reconnection
    const existingConnection = this.connections.get(agentId);
    const reconnectCount = existingConnection ? existingConnection.reconnectCount + 1 : 0;
    
    this.connections.set(agentId, {
      socket,
      connectedAt: now,
      lastHeartbeat: now,
      reconnectCount,
      latency: 0
    });

    console.log(`[ConnectionPool] Added connection for ${agentId} (reconnect #${reconnectCount})`);
    this.emit('connection:added', { agentId, reconnectCount });

    // Set up latency measurement
    this.setupLatencyMeasurement(agentId, socket);
  }

  public removeConnection(agentId: string): void {
    const connection = this.connections.get(agentId);
    if (connection) {
      this.connections.delete(agentId);
      console.log(`[ConnectionPool] Removed connection for ${agentId}`);
      this.emit('connection:removed', { agentId });
    }
  }

  public updateHeartbeat(agentId: string): void {
    const connection = this.connections.get(agentId);
    if (connection) {
      connection.lastHeartbeat = new Date();
      this.emit('heartbeat:received', { agentId });
    }
  }

  public getConnection(agentId: string): ConnectionInfo | undefined {
    return this.connections.get(agentId);
  }

  public getAllConnections(): Map<string, ConnectionInfo> {
    return new Map(this.connections);
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public isConnected(agentId: string): boolean {
    return this.connections.has(agentId);
  }

  private setupLatencyMeasurement(agentId: string, socket: Socket): void {
    // Measure latency every 30 seconds
    const latencyInterval = setInterval(() => {
      const connection = this.connections.get(agentId);
      if (!connection) {
        clearInterval(latencyInterval);
        return;
      }

      const start = Date.now();
      socket.emit('ping', start);
      
      socket.once('pong', (clientTime: number) => {
        const latency = Date.now() - start;
        connection.latency = latency;
        this.emit('latency:measured', { agentId, latency });
      });
    }, 30000);

    // Clean up on disconnect
    socket.on('disconnect', () => {
      clearInterval(latencyInterval);
    });
  }

  private checkConnectionHealth(): void {
    const now = Date.now();
    const health: ConnectionHealth = {
      healthy: 0,
      warning: 0,
      critical: 0,
      disconnected: 0
    };

    for (const [agentId, connection] of this.connections) {
      const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        // Connection is dead
        health.critical++;
        this.emit('connection:timeout', { 
          agentId, 
          lastSeen: connection.lastHeartbeat.toISOString() 
        });
        
        // Auto-remove dead connections
        this.removeConnection(agentId);
        health.disconnected++;
      } else if (timeSinceHeartbeat > this.HEARTBEAT_WARNING) {
        // Connection is struggling
        health.warning++;
        this.emit('connection:warning', { 
          agentId, 
          timeSinceHeartbeat 
        });
      } else {
        // Connection is healthy
        health.healthy++;
      }
    }

    this.emit('health:updated', health);
  }

  public getConnectionHealth(): ConnectionHealth {
    const now = Date.now();
    const health: ConnectionHealth = {
      healthy: 0,
      warning: 0,
      critical: 0,
      disconnected: 0
    };

    for (const [agentId, connection] of this.connections) {
      const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        health.critical++;
      } else if (timeSinceHeartbeat > this.HEARTBEAT_WARNING) {
        health.warning++;
      } else {
        health.healthy++;
      }
    }

    return health;
  }

  public getConnectionStats(agentId: string): any {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return null;
    }

    const now = new Date();
    return {
      agentId,
      connected: true,
      connectedAt: connection.connectedAt.toISOString(),
      connectionDuration: now.getTime() - connection.connectedAt.getTime(),
      lastHeartbeat: connection.lastHeartbeat.toISOString(),
      timeSinceHeartbeat: now.getTime() - connection.lastHeartbeat.getTime(),
      reconnectCount: connection.reconnectCount,
      latency: connection.latency,
      health: this.getConnectionHealthStatus(agentId)
    };
  }

  private getConnectionHealthStatus(agentId: string): 'healthy' | 'warning' | 'critical' | 'disconnected' {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return 'disconnected';
    }

    const timeSinceHeartbeat = Date.now() - connection.lastHeartbeat.getTime();
    
    if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
      return 'critical';
    } else if (timeSinceHeartbeat > this.HEARTBEAT_WARNING) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  public getAllConnectionStats(): any[] {
    return Array.from(this.connections.keys()).map(agentId => 
      this.getConnectionStats(agentId)
    ).filter(stats => stats !== null);
  }

  public broadcastToAll(event: string, data: any): void {
    for (const [agentId, connection] of this.connections) {
      try {
        connection.socket.emit(event, data);
      } catch (error) {
        console.error(`[ConnectionPool] Failed to broadcast to ${agentId}:`, error);
      }
    }
  }

  public broadcastToHealthy(event: string, data: any): void {
    for (const [agentId, connection] of this.connections) {
      if (this.getConnectionHealthStatus(agentId) === 'healthy') {
        try {
          connection.socket.emit(event, data);
        } catch (error) {
          console.error(`[ConnectionPool] Failed to broadcast to ${agentId}:`, error);
        }
      }
    }
  }

  public cleanup(): void {
    clearInterval(this.heartbeatInterval);
    this.connections.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const connectionPool = new ConnectionPool();