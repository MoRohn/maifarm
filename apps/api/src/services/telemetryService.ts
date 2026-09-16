import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

interface TelemetryEvent {
  type: string;
  timestamp: Date;
  data: any;
  metadata?: Record<string, any>;
}

interface ApiCallMetrics {
  provider: string;
  endpoint: string;
  latency: number;
  statusCode?: number;
  error?: string;
}

class TelemetryService {
  private static instance: TelemetryService;
  private events: TelemetryEvent[] = [];
  private metricsBuffer: any[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Flush metrics every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, 30000);
  }

  static getInstance(): TelemetryService {
    if (!this.instance) {
      this.instance = new TelemetryService();
    }
    return this.instance;
  }

  trackEvent(type: string, data: any, metadata?: Record<string, any>): void {
    const event: TelemetryEvent = {
      type,
      timestamp: new Date(),
      data,
      metadata
    };

    this.events.push(event);
    logger.debug(LogCategory.TELEMETRY, `Tracked event: ${type}`);
  }

  trackTokenUsage(usage: any, cost: number, sessionId?: string): void {
    const telemetryData = {
      type: 'token_usage',
      sessionId,
      usage,
      cost,
      timestamp: new Date()
    };

    this.metricsBuffer.push(telemetryData);
    logger.debug(LogCategory.TELEMETRY, `Tracked token usage: ${usage.inputTokens + usage.outputTokens} tokens, cost: $${cost}`);
  }

  trackApiCall(provider: string, endpoint: string, latency: number, statusCode?: number, error?: string): void {
    const metrics: ApiCallMetrics = {
      provider,
      endpoint,
      latency,
      statusCode,
      error
    };

    this.trackEvent('api_call', metrics);

    // Also buffer for batch processing
    this.metricsBuffer.push({
      type: 'api_call',
      ...metrics,
      timestamp: new Date()
    });

    logger.debug(LogCategory.TELEMETRY, `API call to ${provider}/${endpoint}: ${latency}ms`);
  }

  trackPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.trackEvent('performance', {
      operation,
      duration,
      ...metadata
    });

    logger.debug(LogCategory.TELEMETRY, `Performance: ${operation} took ${duration}ms`);
  }

  trackError(error: Error, context?: Record<string, any>): void {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      context
    });

    logger.error(LogCategory.TELEMETRY, `Error tracked: ${error.message}`);
  }

  async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      // Batch insert telemetry data
      for (const metric of metricsToFlush) {
        await db.query(
          `INSERT INTO telemetry_events (type, data, timestamp)
           VALUES ($1, $2, $3)`,
          [metric.type, JSON.stringify(metric), metric.timestamp || new Date()]
        );
      }

      logger.info(LogCategory.TELEMETRY, `Flushed ${metricsToFlush.length} telemetry events`);
    } catch (error) {
      logger.error(LogCategory.TELEMETRY, 'Failed to flush telemetry metrics:', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metricsToFlush);
    }
  }

  async getEvents(type?: string, limit: number = 100): Promise<TelemetryEvent[]> {
    if (type) {
      return this.events.filter(e => e.type === type).slice(-limit);
    }
    return this.events.slice(-limit);
  }

  async getMetrics(startTime?: Date, endTime?: Date): Promise<any[]> {
    try {
      const query = startTime && endTime
        ? `SELECT * FROM telemetry_events WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp DESC`
        : `SELECT * FROM telemetry_events ORDER BY timestamp DESC LIMIT 1000`;

      const params = startTime && endTime ? [startTime, endTime] : [];
      const result = await db.query(query, params);

      return result.rows.map(row => ({
        type: row.type,
        data: row.data,
        timestamp: row.timestamp
      }));
    } catch (error) {
      logger.error(LogCategory.TELEMETRY, 'Failed to get metrics:', error);
      return [];
    }
  }

  clearEvents(): void {
    this.events = [];
    logger.info(LogCategory.TELEMETRY, 'Cleared telemetry events');
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    await this.flushMetrics();
    logger.info(LogCategory.TELEMETRY, 'Telemetry service shut down');
  }
}

export const telemetryService = TelemetryService.getInstance();
export { TelemetryService, TelemetryEvent, ApiCallMetrics };