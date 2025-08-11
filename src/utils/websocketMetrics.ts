/**
 * WebSocket connection metrics tracker
 * Collects and analyzes connection performance data
 */

interface MetricEvent {
  type: string;
  timestamp: number;
  data?: any;
}

interface ConnectionMetrics {
  connected: boolean;
  connectionTime: number | null;
  disconnectionTime: number | null;
  uptime: number;
  reconnectCount: number;
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
  errorCount: number;
  lastError: string | null;
  events: MetricEvent[];
}

export class WebSocketMetrics {
  private clientId: string;
  private metrics: ConnectionMetrics;
  private startTime: number;
  private latencyMeasurements: number[] = [];
  private eventHistory: MetricEvent[] = [];
  private maxEventHistory = 100;
  
  constructor(clientId: string) {
    this.clientId = clientId;
    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
  }
  
  /**
   * Initialize metrics object
   */
  private initializeMetrics(): ConnectionMetrics {
    return {
      connected: false,
      connectionTime: null,
      disconnectionTime: null,
      uptime: 0,
      reconnectCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      averageLatency: null,
      minLatency: null,
      maxLatency: null,
      errorCount: 0,
      lastError: null,
      events: []
    };
  }
  
  /**
   * Set connection status
   */
  setConnected(connected: boolean): void {
    this.metrics.connected = connected;
    
    if (connected) {
      this.metrics.connectionTime = Date.now();
      this.metrics.disconnectionTime = null;
      this.metrics.reconnectCount++;
    } else {
      this.metrics.disconnectionTime = Date.now();
      if (this.metrics.connectionTime) {
        this.metrics.uptime += Date.now() - this.metrics.connectionTime;
      }
    }
  }
  
  /**
   * Record a latency measurement
   */
  recordLatency(latency: number): void {
    this.latencyMeasurements.push(latency);
    
    // Keep only last 100 measurements
    if (this.latencyMeasurements.length > 100) {
      this.latencyMeasurements.shift();
    }
    
    // Update latency metrics
    this.updateLatencyMetrics();
  }
  
  /**
   * Update latency statistics
   */
  private updateLatencyMetrics(): void {
    if (this.latencyMeasurements.length === 0) {
      this.metrics.averageLatency = null;
      this.metrics.minLatency = null;
      this.metrics.maxLatency = null;
      return;
    }
    
    const sum = this.latencyMeasurements.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = Math.round(sum / this.latencyMeasurements.length);
    this.metrics.minLatency = Math.min(...this.latencyMeasurements);
    this.metrics.maxLatency = Math.max(...this.latencyMeasurements);
  }
  
  /**
   * Increment messages sent counter
   */
  incrementMessagesSent(): void {
    this.metrics.messagesSent++;
  }
  
  /**
   * Increment messages received counter
   */
  incrementMessagesReceived(): void {
    this.metrics.messagesReceived++;
  }
  
  /**
   * Increment error counter
   */
  incrementErrorCount(error?: string): void {
    this.metrics.errorCount++;
    if (error) {
      this.metrics.lastError = error;
    }
  }
  
  /**
   * Record a metric event
   */
  recordEvent(type: string, data?: any): void {
    const event: MetricEvent = {
      type,
      timestamp: Date.now(),
      data
    };
    
    this.eventHistory.push(event);
    
    // Limit event history size
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }
    
    // Also add to metrics events (limited)
    this.metrics.events = this.eventHistory.slice(-10);
  }
  
  /**
   * Get current metrics snapshot
   */
  getSnapshot(): ConnectionMetrics {
    // Update uptime if connected
    if (this.metrics.connected && this.metrics.connectionTime) {
      this.metrics.uptime = Date.now() - this.metrics.connectionTime;
    }
    
    return { ...this.metrics };
  }
  
  /**
   * Get connection quality score (0-100)
   */
  getQualityScore(): number {
    let score = 100;
    
    // Deduct for high latency
    if (this.metrics.averageLatency !== null) {
      if (this.metrics.averageLatency > 500) score -= 30;
      else if (this.metrics.averageLatency > 200) score -= 20;
      else if (this.metrics.averageLatency > 100) score -= 10;
    }
    
    // Deduct for errors
    if (this.metrics.errorCount > 0) {
      score -= Math.min(30, this.metrics.errorCount * 5);
    }
    
    // Deduct for frequent reconnects
    const runtime = (Date.now() - this.startTime) / 1000; // seconds
    const reconnectsPerHour = (this.metrics.reconnectCount / runtime) * 3600;
    if (reconnectsPerHour > 10) score -= 20;
    else if (reconnectsPerHour > 5) score -= 10;
    
    // Deduct if not connected
    if (!this.metrics.connected) score -= 50;
    
    return Math.max(0, score);
  }
  
  /**
   * Get connection stability analysis
   */
  getStabilityAnalysis(): {
    isStable: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check latency
    if (this.metrics.averageLatency !== null && this.metrics.averageLatency > 200) {
      issues.push(`High average latency: ${this.metrics.averageLatency}ms`);
      recommendations.push('Check network connection quality');
    }
    
    // Check errors
    if (this.metrics.errorCount > 5) {
      issues.push(`High error count: ${this.metrics.errorCount}`);
      recommendations.push('Review error logs for patterns');
    }
    
    // Check reconnects
    const runtime = (Date.now() - this.startTime) / 1000;
    const reconnectsPerHour = (this.metrics.reconnectCount / runtime) * 3600;
    if (reconnectsPerHour > 5) {
      issues.push(`Frequent reconnections: ${reconnectsPerHour.toFixed(1)}/hour`);
      recommendations.push('Check server stability and network reliability');
    }
    
    // Check message throughput
    const messagesPerSecond = (this.metrics.messagesSent + this.metrics.messagesReceived) / runtime;
    if (messagesPerSecond > 100) {
      issues.push(`High message rate: ${messagesPerSecond.toFixed(1)}/second`);
      recommendations.push('Consider message batching or rate limiting');
    }
    
    const isStable = issues.length === 0 && this.metrics.connected;
    
    return {
      isStable,
      issues,
      recommendations
    };
  }
  
  /**
   * Export metrics for logging or analytics
   */
  exportMetrics(): string {
    const snapshot = this.getSnapshot();
    const stability = this.getStabilityAnalysis();
    const quality = this.getQualityScore();
    
    return JSON.stringify({
      clientId: this.clientId,
      timestamp: Date.now(),
      metrics: snapshot,
      stability,
      qualityScore: quality,
      runtime: Date.now() - this.startTime
    }, null, 2);
  }
  
  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.latencyMeasurements = [];
    this.eventHistory = [];
    this.startTime = Date.now();
  }
  
  /**
   * Get summary for display
   */
  getSummary(): string {
    const quality = this.getQualityScore();
    const stability = this.getStabilityAnalysis();
    
    return `
Connection Quality: ${quality}% ${this.getQualityEmoji(quality)}
Status: ${this.metrics.connected ? '🟢 Connected' : '🔴 Disconnected'}
Latency: ${this.metrics.averageLatency || 'N/A'}ms
Messages: ↑${this.metrics.messagesSent} ↓${this.metrics.messagesReceived}
Errors: ${this.metrics.errorCount}
Stability: ${stability.isStable ? '✅ Stable' : '⚠️ Issues detected'}
`.trim();
  }
  
  /**
   * Get quality emoji based on score
   */
  private getQualityEmoji(score: number): string {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    if (score >= 50) return '🟠';
    return '🔴';
  }
}