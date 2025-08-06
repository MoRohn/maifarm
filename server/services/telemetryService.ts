import { EventEmitter } from 'events';
import { telemetryManager } from '../config/telemetry.js';
import { logger } from '../utils/logger.js';
import { TokenUsage, CostCalculation } from './costTrackingService.js';
import { AIProvider } from '../config/aiProviders.js';

// Conditional OpenTelemetry imports
let metrics: any;
let trace: any;

const loadOpenTelemetryAPI = async () => {
  if (!metrics || !trace) {
    try {
      const otelApi = await import('@opentelemetry/api');
      metrics = otelApi.metrics;
      trace = otelApi.trace;
    } catch (error) {
      logger.warn('OpenTelemetry API package not found. Telemetry features will be disabled.');
      // Create mock objects to prevent errors
      metrics = {
        getMeter: () => ({
          createCounter: () => ({ add: () => {} }),
          createUpDownCounter: () => ({ add: () => {} }),
          createHistogram: () => ({ record: () => {} })
        })
      };
      trace = {
        getTracer: () => ({
          startSpan: () => ({
            setAttributes: () => {},
            recordException: () => {},
            end: () => {}
          })
        })
      };
    }
  }
  return { metrics, trace };
};

export interface ClaudeCodeMetrics {
  sessionDuration: number;
  apiCallCount: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  costData: {
    totalCost: number;
    avgCostPerCall: number;
    costPerToken: number;
  };
  providerMetrics: {
    [provider: string]: {
      callCount: number;
      tokenCount: number;
      cost: number;
      avgLatency: number;
    };
  };
  toolUsage: {
    [toolName: string]: {
      callCount: number;
      avgDuration: number;
      errorRate: number;
    };
  };
}

export interface TelemetryEvent {
  type: 'cost' | 'performance' | 'error' | 'usage';
  timestamp: Date;
  data: any;
  source: 'claude-code' | 'api' | 'ui';
  sessionId?: string;
  userId?: string;
}

/**
 * Telemetry service for comprehensive Claude Code cost and performance tracking
 * Implements OpenTelemetry integration from Claude Cost Tracking Plan
 */
export class TelemetryService extends EventEmitter {
  private meter: any;
  private tracer: any;
  
  // Metrics instruments
  private tokenCounter: any;
  private costGauge: any;
  private apiCallCounter: any;
  private latencyHistogram: any;
  private providerCounter: any;
  private toolUsageCounter: any;

  private sessionMetrics: Map<string, ClaudeCodeMetrics> = new Map();
  private eventBuffer: TelemetryEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    super();
    this.initializeAsync();
    this.startMetricsFlush();
  }

  private async initializeAsync(): Promise<void> {
    try {
      await loadOpenTelemetryAPI();
      
      this.meter = metrics.getMeter('maifarm-cost-tracking', '1.0.0');
      this.tracer = trace.getTracer('maifarm-cost-tracking', '1.0.0');
      
      // Initialize metrics instruments
      this.tokenCounter = this.meter.createCounter('claude_tokens_total', {
        description: 'Total number of tokens processed'
      });
      
      this.costGauge = this.meter.createUpDownCounter('claude_cost_total', {
        description: 'Total cost in USD'
      });
      
      this.apiCallCounter = this.meter.createCounter('claude_api_calls_total', {
        description: 'Total number of API calls'
      });
      
      this.latencyHistogram = this.meter.createHistogram('claude_api_latency_ms', {
        description: 'API call latency in milliseconds'
      });
      
      this.providerCounter = this.meter.createCounter('claude_provider_usage', {
        description: 'Usage by AI provider'
      });
      
      this.toolUsageCounter = this.meter.createCounter('claude_tool_usage', {
        description: 'Tool usage metrics'
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize telemetry service:', error);
    }
  }

  /**
   * Track token usage with OpenTelemetry metrics
   */
  trackTokenUsage(usage: TokenUsage, cost: CostCalculation, sessionId?: string): void {
    if (!telemetryManager.isEnabled() || !this.initialized) return;

    const span = this.tracer.startSpan('track_token_usage');
    
    try {
      // Record metrics
      this.tokenCounter.add(usage.inputTokens, {
        provider: usage.provider,
        model: usage.model,
        type: 'input',
        task_id: usage.taskId || 'unknown',
        farm_id: usage.farmId || 'unknown'
      });

      this.tokenCounter.add(usage.outputTokens, {
        provider: usage.provider,
        model: usage.model,
        type: 'output',
        task_id: usage.taskId || 'unknown',
        farm_id: usage.farmId || 'unknown'
      });

      this.costGauge.add(cost.totalCost, {
        provider: usage.provider,
        model: usage.model,
        currency: cost.currency
      });

      this.apiCallCounter.add(1, {
        provider: usage.provider,
        model: usage.model,
        status: 'success'
      });

      this.providerCounter.add(1, {
        provider: usage.provider,
        model: usage.model
      });

      // Update session metrics
      if (sessionId) {
        this.updateSessionMetrics(sessionId, usage, cost);
      }

      // Add to event buffer
      this.bufferEvent({
        type: 'cost',
        timestamp: new Date(),
        data: { usage, cost },
        source: 'api',
        sessionId
      });

      // Set span attributes
      span.setAttributes({
        'claude.provider': usage.provider,
        'claude.model': usage.model,
        'claude.input_tokens': usage.inputTokens,
        'claude.output_tokens': usage.outputTokens,
        'claude.total_cost': cost.totalCost,
        'claude.task_id': usage.taskId || '',
        'claude.farm_id': usage.farmId || ''
      });

      logger.debug('Token usage tracked via telemetry', {
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: cost.totalCost
      });

    } catch (error) {
      span.recordException(error as Error);
      logger.error('Failed to track token usage via telemetry:', error);
    } finally {
      span.end();
    }
  }

  /**
   * Track API call performance
   */
  trackApiCall(
    provider: AIProvider,
    model: string,
    duration: number,
    success: boolean,
    error?: Error
  ): void {
    if (!telemetryManager.isEnabled() || !this.initialized) return;

    const span = this.tracer.startSpan('api_call');

    try {
      this.latencyHistogram.record(duration, {
        provider,
        model,
        status: success ? 'success' : 'error'
      });

      this.apiCallCounter.add(1, {
        provider,
        model,
        status: success ? 'success' : 'error'
      });

      span.setAttributes({
        'claude.provider': provider,
        'claude.model': model,
        'claude.duration_ms': duration,
        'claude.success': success
      });

      if (error) {
        span.recordException(error);
        span.setAttributes({
          'claude.error': error.message
        });
      }

      this.bufferEvent({
        type: 'performance',
        timestamp: new Date(),
        data: { provider, model, duration, success, error: error?.message },
        source: 'api'
      });

    } finally {
      span.end();
    }
  }

  /**
   * Track tool usage (from Claude Code)
   */
  trackToolUsage(
    toolName: string,
    duration: number,
    success: boolean,
    sessionId?: string
  ): void {
    if (!telemetryManager.isEnabled() || !this.initialized) return;

    this.toolUsageCounter.add(1, {
      tool: toolName,
      status: success ? 'success' : 'error'
    });

    // Update session metrics
    if (sessionId) {
      const metrics = this.sessionMetrics.get(sessionId);
      if (metrics) {
        if (!metrics.toolUsage[toolName]) {
          metrics.toolUsage[toolName] = {
            callCount: 0,
            avgDuration: 0,
            errorRate: 0
          };
        }
        
        const tool = metrics.toolUsage[toolName];
        const prevAvg = tool.avgDuration;
        const prevCount = tool.callCount;
        
        tool.callCount++;
        tool.avgDuration = ((prevAvg * prevCount) + duration) / tool.callCount;
        
        if (!success) {
          tool.errorRate = (tool.errorRate * (tool.callCount - 1) + 1) / tool.callCount;
        }
      }
    }

    this.bufferEvent({
      type: 'usage',
      timestamp: new Date(),
      data: { toolName, duration, success },
      source: 'claude-code',
      sessionId
    });
  }

  /**
   * Get Claude Code session metrics
   */
  getSessionMetrics(sessionId: string): ClaudeCodeMetrics | null {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionMetrics.keys());
  }

  /**
   * Export telemetry data for external analysis
   */
  exportTelemetryData(timeRange: { start: Date; end: Date }): TelemetryEvent[] {
    return this.eventBuffer.filter(event => 
      event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
    );
  }

  /**
   * Get current telemetry statistics
   */
  getStatistics(): {
    totalEvents: number;
    eventsByType: { [type: string]: number };
    activeSessions: number;
    bufferSize: number;
  } {
    const eventsByType = this.eventBuffer.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as { [type: string]: number });

    return {
      totalEvents: this.eventBuffer.length,
      eventsByType,
      activeSessions: this.sessionMetrics.size,
      bufferSize: this.eventBuffer.length
    };
  }

  /**
   * Clear old telemetry data
   */
  cleanup(olderThan: Date): void {
    // Clean event buffer
    this.eventBuffer = this.eventBuffer.filter(event => event.timestamp >= olderThan);
    
    // Clean inactive sessions (older than 1 hour)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [sessionId, metrics] of this.sessionMetrics.entries()) {
      // Remove sessions that haven't been updated recently
      // This is a simple heuristic - in production, you'd want better session tracking
      if (Object.keys(metrics.toolUsage).length === 0) {
        this.sessionMetrics.delete(sessionId);
      }
    }

    logger.info('Telemetry cleanup completed', {
      eventsRemaining: this.eventBuffer.length,
      activeSessionsRemaining: this.sessionMetrics.size
    });
  }

  /**
   * Update session metrics
   */
  private updateSessionMetrics(
    sessionId: string,
    usage: TokenUsage,
    cost: CostCalculation
  ): void {
    if (!this.sessionMetrics.has(sessionId)) {
      this.sessionMetrics.set(sessionId, {
        sessionDuration: 0,
        apiCallCount: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
        costData: { totalCost: 0, avgCostPerCall: 0, costPerToken: 0 },
        providerMetrics: {},
        toolUsage: {}
      });
    }

    const metrics = this.sessionMetrics.get(sessionId)!;
    
    // Update API call count
    metrics.apiCallCount++;
    
    // Update token usage
    metrics.tokenUsage.input += usage.inputTokens;
    metrics.tokenUsage.output += usage.outputTokens;
    metrics.tokenUsage.total += usage.totalTokens;
    
    // Update cost data
    metrics.costData.totalCost += cost.totalCost;
    metrics.costData.avgCostPerCall = metrics.costData.totalCost / metrics.apiCallCount;
    metrics.costData.costPerToken = metrics.tokenUsage.total > 0 
      ? metrics.costData.totalCost / metrics.tokenUsage.total 
      : 0;
    
    // Update provider metrics
    if (!metrics.providerMetrics[usage.provider]) {
      metrics.providerMetrics[usage.provider] = {
        callCount: 0,
        tokenCount: 0,
        cost: 0,
        avgLatency: 0
      };
    }
    
    const providerMetrics = metrics.providerMetrics[usage.provider];
    providerMetrics.callCount++;
    providerMetrics.tokenCount += usage.totalTokens;
    providerMetrics.cost += cost.totalCost;
  }

  /**
   * Buffer telemetry event
   */
  private bufferEvent(event: TelemetryEvent): void {
    this.eventBuffer.push(event);
    
    // Emit real-time event
    this.emit('telemetry:event', event);
    
    // Keep buffer size manageable
    if (this.eventBuffer.length > 10000) {
      this.eventBuffer = this.eventBuffer.slice(-5000); // Keep last 5000 events
    }
  }

  /**
   * Start periodic metrics flush
   */
  private startMetricsFlush(): void {
    this.flushInterval = setInterval(() => {
      this.emit('telemetry:flush', {
        timestamp: new Date(),
        statistics: this.getStatistics()
      });
    }, 60000); // Flush every minute
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.sessionMetrics.clear();
    this.eventBuffer = [];
    this.removeAllListeners();
  }
}

// Export singleton instance
export const telemetryService = new TelemetryService();