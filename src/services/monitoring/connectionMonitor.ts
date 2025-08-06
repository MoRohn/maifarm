import { websocketService } from '../websocket';
import { apiClient } from '../apiClient';

export interface ConnectionHealth {
  websocket: {
    connected: boolean;
    latency: number;
    lastPing: Date | null;
    reconnectAttempts: number;
    errorCount: number;
  };
  api: {
    available: boolean;
    latency: number;
    lastCheck: Date | null;
    errorCount: number;
  };
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

export interface ConnectionMetrics {
  uptimePercentage: number;
  avgLatency: number;
  totalDisconnects: number;
  totalErrors: number;
  connectionHistory: Array<{
    timestamp: Date;
    status: 'connected' | 'disconnected' | 'error';
    duration?: number;
  }>;
}

class ConnectionMonitor {
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;
  private connectionHealth: ConnectionHealth = {
    websocket: {
      connected: false,
      latency: 0,
      lastPing: null,
      reconnectAttempts: 0,
      errorCount: 0
    },
    api: {
      available: false,
      latency: 0,
      lastCheck: null,
      errorCount: 0
    },
    overall: 'unhealthy'
  };
  
  private connectionMetrics: ConnectionMetrics = {
    uptimePercentage: 0,
    avgLatency: 0,
    totalDisconnects: 0,
    totalErrors: 0,
    connectionHistory: []
  };
  
  private listeners: Set<(health: ConnectionHealth) => void> = new Set();
  private anomalyThresholds = {
    maxLatency: 5000, // 5 seconds
    maxErrorRate: 0.1, // 10% error rate
    minUptime: 0.95 // 95% uptime
  };

  start(): void {
    this.setupWebSocketMonitoring();
    this.startHealthChecks();
    this.startMetricsCollection();
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  checkHealth(): ConnectionHealth {
    return { ...this.connectionHealth };
  }

  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  detectAnomalies(): Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }> {
    const anomalies: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }> = [];
    
    // Check latency
    if (this.connectionHealth.websocket.latency > this.anomalyThresholds.maxLatency) {
      anomalies.push({
        type: 'high_latency',
        message: `WebSocket latency is ${this.connectionHealth.websocket.latency}ms (threshold: ${this.anomalyThresholds.maxLatency}ms)`,
        severity: 'medium'
      });
    }
    
    // Check error rate
    const recentErrors = this.connectionMetrics.connectionHistory
      .slice(-100)
      .filter(h => h.status === 'error').length;
    const errorRate = recentErrors / Math.min(100, this.connectionMetrics.connectionHistory.length);
    
    if (errorRate > this.anomalyThresholds.maxErrorRate) {
      anomalies.push({
        type: 'high_error_rate',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}% (threshold: ${this.anomalyThresholds.maxErrorRate * 100}%)`,
        severity: 'high'
      });
    }
    
    // Check uptime
    if (this.connectionMetrics.uptimePercentage < this.anomalyThresholds.minUptime) {
      anomalies.push({
        type: 'low_uptime',
        message: `Uptime is ${(this.connectionMetrics.uptimePercentage * 100).toFixed(1)}% (threshold: ${this.anomalyThresholds.minUptime * 100}%)`,
        severity: 'high'
      });
    }
    
    // Check prolonged disconnection
    const lastConnection = this.connectionMetrics.connectionHistory
      .filter(h => h.status === 'connected')
      .pop();
    
    if (!lastConnection || (Date.now() - lastConnection.timestamp.getTime()) > 300000) { // 5 minutes
      anomalies.push({
        type: 'prolonged_disconnection',
        message: 'No successful connection in the last 5 minutes',
        severity: 'high'
      });
    }
    
    return anomalies;
  }

  onHealthChange(callback: (health: ConnectionHealth) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private setupWebSocketMonitoring(): void {
    // Monitor WebSocket connection status
    websocketService.on('*', (message) => {
      if (message.type === 'connection') {
        this.connectionHealth.websocket.connected = message.payload.connected;
        this.addConnectionHistoryEntry(
          message.payload.connected ? 'connected' : 'disconnected'
        );
      }
    });

    // Track errors
    websocketService.on('error', () => {
      this.connectionHealth.websocket.errorCount++;
      this.connectionMetrics.totalErrors++;
      this.addConnectionHistoryEntry('error');
    });
  }

  private async startHealthChecks(): Promise<void> {
    // Initial check
    await this.performHealthCheck();
    
    // Regular health checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  private async performHealthCheck(): Promise<void> {
    // Check WebSocket
    const wsStartTime = Date.now();
    const wsConnected = websocketService.getStatus() === 'connected';
    
    if (wsConnected) {
      // Measure WebSocket latency with a ping
      try {
        await this.pingWebSocket();
        this.connectionHealth.websocket.latency = Date.now() - wsStartTime;
        this.connectionHealth.websocket.lastPing = new Date();
      } catch (error) {
        this.connectionHealth.websocket.errorCount++;
      }
    }
    
    this.connectionHealth.websocket.connected = wsConnected;
    
    // Check API
    const apiStartTime = Date.now();
    try {
      const response = await apiClient.get('/health');
      this.connectionHealth.api.available = response.data.status === 'ok';
      this.connectionHealth.api.latency = Date.now() - apiStartTime;
      this.connectionHealth.api.lastCheck = new Date();
    } catch (error) {
      this.connectionHealth.api.available = false;
      this.connectionHealth.api.errorCount++;
    }
    
    // Determine overall health
    this.connectionHealth.overall = this.calculateOverallHealth();
    
    // Notify listeners
    this.notifyListeners();
  }

  private async pingWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Ping timeout'));
      }, 5000);
      
      websocketService.emit('ping', { timestamp: Date.now() });
      
      const handler = (message: any) => {
        if (message.type === 'pong') {
          clearTimeout(timeout);
          websocketService.off('pong', handler);
          resolve();
        }
      };
      
      websocketService.on('pong', handler);
    });
  }

  private calculateOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const wsHealthy = this.connectionHealth.websocket.connected && 
                     this.connectionHealth.websocket.latency < 1000;
    const apiHealthy = this.connectionHealth.api.available && 
                      this.connectionHealth.api.latency < 1000;
    
    if (wsHealthy && apiHealthy) {
      return 'healthy';
    } else if (wsHealthy || apiHealthy) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  private startMetricsCollection(): void {
    // Calculate metrics every minute
    this.metricsInterval = setInterval(() => {
      this.calculateMetrics();
    }, 60000);
  }

  private calculateMetrics(): void {
    const history = this.connectionMetrics.connectionHistory;
    if (history.length === 0) return;
    
    // Calculate uptime percentage
    const connectedTime = history
      .filter(h => h.status === 'connected')
      .reduce((sum, h) => sum + (h.duration || 0), 0);
    
    const totalTime = history.reduce((sum, h) => sum + (h.duration || 0), 0);
    this.connectionMetrics.uptimePercentage = totalTime > 0 ? connectedTime / totalTime : 0;
    
    // Calculate average latency
    const latencies = [
      this.connectionHealth.websocket.latency,
      this.connectionHealth.api.latency
    ].filter(l => l > 0);
    
    this.connectionMetrics.avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    
    // Count disconnects
    this.connectionMetrics.totalDisconnects = history
      .filter(h => h.status === 'disconnected').length;
    
    // Trim history to last 1000 entries
    if (history.length > 1000) {
      this.connectionMetrics.connectionHistory = history.slice(-1000);
    }
  }

  private addConnectionHistoryEntry(status: 'connected' | 'disconnected' | 'error'): void {
    const now = new Date();
    const lastEntry = this.connectionMetrics.connectionHistory[this.connectionMetrics.connectionHistory.length - 1];
    
    // Update duration of last entry
    if (lastEntry && !lastEntry.duration) {
      lastEntry.duration = now.getTime() - lastEntry.timestamp.getTime();
    }
    
    this.connectionMetrics.connectionHistory.push({
      timestamp: now,
      status
    });
  }

  private notifyListeners(): void {
    const health = this.checkHealth();
    this.listeners.forEach(listener => {
      try {
        listener(health);
      } catch (error) {
        console.error('Error in connection health listener:', error);
      }
    });
  }
}

export const connectionMonitor = new ConnectionMonitor();