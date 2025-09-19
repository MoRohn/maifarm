/**
 * DistributedTracingService - Distributed tracing for monitoring and debugging
 *
 * Provides:
 * - Trace context propagation
 * - Span creation and management
 * - Performance monitoring
 * - Dependency mapping
 * - Error tracking across services
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';
import { logger, LogCategory } from '../../utils/logger';
import { db } from '../../database/connection';
import { redisPubSubManager } from './RedisPubSubManager';

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, any>;
  flags: number; // Sampling decision
}

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'in_progress' | 'completed' | 'error';
  tags: Record<string, any>;
  logs: LogEntry[];
  references: SpanReference[];
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

interface SpanReference {
  type: 'child_of' | 'follows_from';
  spanId: string;
  traceId: string;
}

interface TraceSummary {
  traceId: string;
  rootSpan: Span;
  spans: Span[];
  totalDuration: number;
  serviceCount: number;
  errorCount: number;
  criticalPath: Span[];
}

export class DistributedTracingService extends EventEmitter {
  private static instance: DistributedTracingService;
  private activeSpans: Map<string, Span> = new Map();
  private completedTraces: Map<string, Span[]> = new Map();
  private traceBuffer: Span[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private serviceName: string;
  private samplingRate: number = 1.0; // 100% sampling by default

  private readonly MAX_TRACE_AGE = 3600000; // 1 hour
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly MAX_SPAN_DURATION = 300000; // 5 minutes

  private constructor() {
    super();
    this.serviceName = process.env.SERVICE_NAME || 'maifarm-main';
    this.initialize();
  }

  static getInstance(): DistributedTracingService {
    if (!DistributedTracingService.instance) {
      DistributedTracingService.instance = new DistributedTracingService();
    }
    return DistributedTracingService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Load sampling rate from config
      this.samplingRate = parseFloat(process.env.TRACING_SAMPLING_RATE || '1.0');

      // Subscribe to trace events
      await redisPubSubManager.subscribe(
        'maifarm:tracing:spans',
        (message) => this.handleRemoteSpan(message)
      );

      // Start flush timer
      this.startFlushTimer();

      // Clean up old traces periodically
      setInterval(() => this.cleanupOldTraces(), 60000);

      logger.info(LogCategory.DISTRIBUTED,
        `DistributedTracingService initialized with sampling rate ${this.samplingRate}`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED,
        'Failed to initialize DistributedTracingService:', error);
    }
  }

  /**
   * Start a new trace
   */
  startTrace(
    operationName: string,
    tags?: Record<string, any>
  ): TraceContext {
    const traceId = uuidv4();
    const spanId = uuidv4();

    // Sampling decision
    const sampled = Math.random() < this.samplingRate;
    const flags = sampled ? 1 : 0;

    const context: TraceContext = {
      traceId,
      spanId,
      flags
    };

    if (sampled) {
      const span = this.createSpan(
        traceId,
        spanId,
        undefined,
        operationName,
        tags
      );
      this.activeSpans.set(spanId, span);
    }

    return context;
  }

  /**
   * Start a child span
   */
  startSpan(
    parentContext: TraceContext,
    operationName: string,
    tags?: Record<string, any>
  ): TraceContext {
    const spanId = uuidv4();

    const context: TraceContext = {
      traceId: parentContext.traceId,
      spanId,
      parentSpanId: parentContext.spanId,
      baggage: parentContext.baggage,
      flags: parentContext.flags
    };

    // Only create span if trace is sampled
    if (parentContext.flags & 1) {
      const span = this.createSpan(
        parentContext.traceId,
        spanId,
        parentContext.spanId,
        operationName,
        tags
      );
      this.activeSpans.set(spanId, span);
    }

    return context;
  }

  /**
   * Create a span object
   */
  private createSpan(
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    operationName: string,
    tags?: Record<string, any>
  ): Span {
    return {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      serviceName: this.serviceName,
      startTime: performance.now(),
      status: 'in_progress',
      tags: {
        ...tags,
        'service.name': this.serviceName,
        'service.instance': process.env.INSTANCE_ID || 'unknown',
        'service.version': process.env.SERVICE_VERSION || '1.0.0'
      },
      logs: [],
      references: parentSpanId ? [{
        type: 'child_of',
        spanId: parentSpanId,
        traceId
      }] : []
    };
  }

  /**
   * Finish a span
   */
  finishSpan(
    context: TraceContext,
    tags?: Record<string, any>
  ): void {
    if (!(context.flags & 1)) return; // Not sampled

    const span = this.activeSpans.get(context.spanId);
    if (!span) return;

    span.endTime = performance.now();
    span.duration = span.endTime - span.startTime;
    span.status = 'completed';

    if (tags) {
      Object.assign(span.tags, tags);
    }

    // Move to completed
    this.activeSpans.delete(context.spanId);
    this.addToBuffer(span);

    // Emit for local monitoring
    this.emit('span:completed', span);

    // Send to other services
    this.publishSpan(span);
  }

  /**
   * Record an error on a span
   */
  recordError(
    context: TraceContext,
    error: Error,
    tags?: Record<string, any>
  ): void {
    if (!(context.flags & 1)) return; // Not sampled

    const span = this.activeSpans.get(context.spanId);
    if (!span) return;

    span.status = 'error';
    span.error = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    };

    if (tags) {
      Object.assign(span.tags, tags);
    }

    // Add error log
    this.addLog(context, 'error', error.message, {
      'error.kind': error.name,
      'error.stack': error.stack
    });

    // Finish the span
    this.finishSpan(context);
  }

  /**
   * Add a log entry to a span
   */
  addLog(
    context: TraceContext,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, any>
  ): void {
    if (!(context.flags & 1)) return; // Not sampled

    const span = this.activeSpans.get(context.spanId);
    if (!span) return;

    span.logs.push({
      timestamp: performance.now(),
      level,
      message,
      fields
    });
  }

  /**
   * Set tags on a span
   */
  setTags(
    context: TraceContext,
    tags: Record<string, any>
  ): void {
    if (!(context.flags & 1)) return; // Not sampled

    const span = this.activeSpans.get(context.spanId);
    if (!span) return;

    Object.assign(span.tags, tags);
  }

  /**
   * Set baggage (context that propagates to child spans)
   */
  setBaggage(
    context: TraceContext,
    key: string,
    value: any
  ): TraceContext {
    return {
      ...context,
      baggage: {
        ...context.baggage,
        [key]: value
      }
    };
  }

  /**
   * Extract trace context from headers
   */
  extract(headers: Record<string, string>): TraceContext | null {
    const traceId = headers['x-trace-id'];
    const spanId = headers['x-span-id'];
    const parentSpanId = headers['x-parent-span-id'];
    const flags = parseInt(headers['x-trace-flags'] || '0', 10);

    if (!traceId || !spanId) return null;

    const baggage: Record<string, any> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.startsWith('x-baggage-')) {
        const baggageKey = key.substring(10);
        baggage[baggageKey] = value;
      }
    }

    return {
      traceId,
      spanId,
      parentSpanId,
      baggage: Object.keys(baggage).length > 0 ? baggage : undefined,
      flags
    };
  }

  /**
   * Inject trace context into headers
   */
  inject(context: TraceContext): Record<string, string> {
    const headers: Record<string, string> = {
      'x-trace-id': context.traceId,
      'x-span-id': context.spanId,
      'x-trace-flags': context.flags.toString()
    };

    if (context.parentSpanId) {
      headers['x-parent-span-id'] = context.parentSpanId;
    }

    if (context.baggage) {
      for (const [key, value] of Object.entries(context.baggage)) {
        headers[`x-baggage-${key}`] = String(value);
      }
    }

    return headers;
  }

  /**
   * Get trace summary
   */
  async getTraceSummary(traceId: string): Promise<TraceSummary | null> {
    // Check completed traces
    let spans = this.completedTraces.get(traceId);

    if (!spans) {
      // Try to load from database
      spans = await this.loadTraceFromDatabase(traceId);
      if (!spans || spans.length === 0) return null;
    }

    // Find root span
    const rootSpan = spans.find(s => !s.parentSpanId);
    if (!rootSpan) return null;

    // Calculate total duration
    const minStart = Math.min(...spans.map(s => s.startTime));
    const maxEnd = Math.max(...spans
      .filter(s => s.endTime)
      .map(s => s.endTime!));
    const totalDuration = maxEnd - minStart;

    // Count unique services
    const services = new Set(spans.map(s => s.serviceName));

    // Count errors
    const errorCount = spans.filter(s => s.status === 'error').length;

    // Calculate critical path
    const criticalPath = this.calculateCriticalPath(spans, rootSpan);

    return {
      traceId,
      rootSpan,
      spans,
      totalDuration,
      serviceCount: services.size,
      errorCount,
      criticalPath
    };
  }

  /**
   * Calculate the critical path in a trace
   */
  private calculateCriticalPath(spans: Span[], rootSpan: Span): Span[] {
    const path: Span[] = [rootSpan];
    let currentSpan = rootSpan;

    while (true) {
      // Find children of current span
      const children = spans.filter(s => s.parentSpanId === currentSpan.spanId);
      if (children.length === 0) break;

      // Select child with longest duration
      const longestChild = children.reduce((prev, curr) => {
        const prevDuration = prev.duration || 0;
        const currDuration = curr.duration || 0;
        return currDuration > prevDuration ? curr : prev;
      });

      path.push(longestChild);
      currentSpan = longestChild;
    }

    return path;
  }

  /**
   * Get service dependency map
   */
  async getServiceDependencies(): Promise<Map<string, Set<string>>> {
    const dependencies = new Map<string, Set<string>>();

    // Analyze recent traces
    for (const spans of this.completedTraces.values()) {
      for (const span of spans) {
        if (span.parentSpanId) {
          // Find parent span
          const parentSpan = spans.find(s => s.spanId === span.parentSpanId);
          if (parentSpan && parentSpan.serviceName !== span.serviceName) {
            // Record dependency
            if (!dependencies.has(parentSpan.serviceName)) {
              dependencies.set(parentSpan.serviceName, new Set());
            }
            dependencies.get(parentSpan.serviceName)!.add(span.serviceName);
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Add span to buffer
   */
  private addToBuffer(span: Span): void {
    this.traceBuffer.push(span);

    // Add to completed traces map
    const spans = this.completedTraces.get(span.traceId) || [];
    spans.push(span);
    this.completedTraces.set(span.traceId, spans);

    // Flush if buffer is full
    if (this.traceBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushBuffer();
    }
  }

  /**
   * Flush trace buffer to database
   */
  private async flushBuffer(): Promise<void> {
    if (this.traceBuffer.length === 0) return;

    const spans = [...this.traceBuffer];
    this.traceBuffer = [];

    try {
      // Batch insert spans
      const values = spans.map(span => [
        span.traceId,
        span.spanId,
        span.parentSpanId,
        span.operationName,
        span.serviceName,
        span.startTime,
        span.endTime,
        span.duration,
        span.status,
        JSON.stringify(span.tags),
        JSON.stringify(span.logs),
        span.error ? JSON.stringify(span.error) : null
      ]);

      await db.query(
        `INSERT INTO distributed_traces (
          trace_id, span_id, parent_span_id, operation_name,
          service_name, start_time, end_time, duration,
          status, tags, logs, error
        ) VALUES ${values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
        ON CONFLICT (span_id) DO NOTHING`,
        values.flat()
      );

      logger.debug(LogCategory.DISTRIBUTED,
        `Flushed ${spans.length} spans to database`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED,
        'Failed to flush trace buffer:', error);
      
      // Re-add to buffer for retry
      this.traceBuffer.unshift(...spans);
    }
  }

  /**
   * Load trace from database
   */
  private async loadTraceFromDatabase(traceId: string): Promise<Span[] | null> {
    try {
      const result = await db.query(
        `SELECT * FROM distributed_traces WHERE trace_id = $1 ORDER BY start_time`,
        [traceId]
      );

      return result.rows.map(row => ({
        traceId: row.trace_id,
        spanId: row.span_id,
        parentSpanId: row.parent_span_id,
        operationName: row.operation_name,
        serviceName: row.service_name,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        status: row.status,
        tags: row.tags,
        logs: row.logs,
        references: [],
        error: row.error
      }));

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED,
        `Failed to load trace ${traceId}:`, error);
      return null;
    }
  }

  /**
   * Publish span to other services
   */
  private async publishSpan(span: Span): Promise<void> {
    await redisPubSubManager.publish(
      'maifarm:tracing:spans',
      'span:completed',
      span
    );
  }

  /**
   * Handle remote span
   */
  private handleRemoteSpan(message: any): void {
    if (message.event !== 'span:completed') return;

    const span = message.data as Span;
    
    // Add to completed traces
    const spans = this.completedTraces.get(span.traceId) || [];
    spans.push(span);
    this.completedTraces.set(span.traceId, spans);

    // Emit for local processing
    this.emit('remote:span', span);
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Clean up old traces
   */
  private cleanupOldTraces(): void {
    const now = Date.now();
    const cutoff = now - this.MAX_TRACE_AGE;

    // Clean up completed traces
    for (const [traceId, spans] of this.completedTraces) {
      const maxEndTime = Math.max(...spans
        .filter(s => s.endTime)
        .map(s => s.endTime!));
      
      if (maxEndTime < cutoff) {
        this.completedTraces.delete(traceId);
      }
    }

    // Clean up stuck active spans
    for (const [spanId, span] of this.activeSpans) {
      if (span.startTime < cutoff) {
        span.status = 'error';
        span.error = { message: 'Span timeout - automatically closed' };
        span.endTime = span.startTime + this.MAX_SPAN_DURATION;
        span.duration = this.MAX_SPAN_DURATION;
        
        this.activeSpans.delete(spanId);
        this.addToBuffer(span);
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeSpans: number;
    completedTraces: number;
    bufferSize: number;
    samplingRate: number;
  } {
    return {
      activeSpans: this.activeSpans.size,
      completedTraces: this.completedTraces.size,
      bufferSize: this.traceBuffer.length,
      samplingRate: this.samplingRate
    };
  }

  /**
   * Set sampling rate
   */
  setSamplingRate(rate: number): void {
    this.samplingRate = Math.max(0, Math.min(1, rate));
    logger.info(LogCategory.DISTRIBUTED,
      `Sampling rate changed to ${this.samplingRate}`);
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining spans
    await this.flushBuffer();

    // Close all active spans
    for (const [spanId, span] of this.activeSpans) {
      span.status = 'error';
      span.error = { message: 'Service shutdown' };
      span.endTime = performance.now();
      span.duration = span.endTime - span.startTime;
      this.addToBuffer(span);
    }
    this.activeSpans.clear();

    // Final flush
    await this.flushBuffer();

    logger.info(LogCategory.DISTRIBUTED, 'DistributedTracingService shut down');
  }
}

// Export singleton instance
export const distributedTracingService = DistributedTracingService.getInstance();

// Export convenience functions for tracing
export function startTrace(
  operationName: string,
  tags?: Record<string, any>
): TraceContext {
  return distributedTracingService.startTrace(operationName, tags);
}

export function startSpan(
  parentContext: TraceContext,
  operationName: string,
  tags?: Record<string, any>
): TraceContext {
  return distributedTracingService.startSpan(parentContext, operationName, tags);
}

export function finishSpan(
  context: TraceContext,
  tags?: Record<string, any>
): void {
  distributedTracingService.finishSpan(context, tags);
}

export function recordError(
  context: TraceContext,
  error: Error,
  tags?: Record<string, any>
): void {
  distributedTracingService.recordError(context, error, tags);
}