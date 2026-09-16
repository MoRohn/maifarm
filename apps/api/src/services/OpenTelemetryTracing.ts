/**
 * OpenTelemetry-Compatible Tracing Service
 *
 * Provides distributed tracing capabilities with span management and persistence
 */

import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { randomBytes } from 'crypto';

export type SpanKind = 'server' | 'client' | 'producer' | 'consumer' | 'internal';
export type SpanStatus = 'ok' | 'error' | 'unset';

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, any>;
  parentSpanId?: string;
  traceId?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, any>;
}

export class TracingSpan {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly name: string;
  public readonly kind: SpanKind;
  private status: SpanStatus = 'unset';
  private attributes: Record<string, any> = {};
  private events: SpanEvent[] = [];
  private startTime: Date;
  private endTime?: Date;

  constructor(name: string, options: SpanOptions = {}) {
    this.name = name;
    this.traceId = options.traceId || this.generateTraceId();
    this.spanId = this.generateSpanId();
    this.parentSpanId = options.parentSpanId;
    this.kind = options.kind || 'internal';
    this.attributes = options.attributes || {};
    this.startTime = new Date();
  }

  setAttributes(attributes: Record<string, any>): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  setAttribute(key: string, value: any): this {
    this.attributes[key] = value;
    return this;
  }

  addEvent(name: string, attributes?: Record<string, any>): this {
    this.events.push({ name, timestamp: new Date(), attributes });
    return this;
  }

  setStatus(status: SpanStatus, message?: string): this {
    this.status = status;
    if (message) {
      this.setAttribute('error.message', message);
    }
    return this;
  }

  recordException(error: Error): this {
    this.setStatus('error', error.message);
    this.setAttribute('exception.type', error.name);
    this.setAttribute('exception.message', error.message);
    if (error.stack) this.setAttribute('exception.stacktrace', error.stack);
    return this;
  }

  end(): void {
    if (this.endTime) return;
    this.endTime = new Date();
    OpenTelemetryTracing.getInstance().persistSpan(this);
  }

  getDuration(): number {
    const end = this.endTime || new Date();
    return end.getTime() - this.startTime.getTime();
  }

  export(): any {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      status: this.status,
      attributes: this.attributes,
      events: this.events,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration()
    };
  }

  private generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }
}

export class OpenTelemetryTracing {
  private static instance: OpenTelemetryTracing;
  private readonly serviceName = 'maifarm-api';
  private readonly serviceVersion = process.env.npm_package_version || '2.5.0';

  private constructor() {
    logger.info(LogCategory.MONITORING, 'OpenTelemetryTracing initialized');
  }

  static getInstance(): OpenTelemetryTracing {
    if (!OpenTelemetryTracing.instance) {
      OpenTelemetryTracing.instance = new OpenTelemetryTracing();
    }
    return OpenTelemetryTracing.instance;
  }

  startSpan(name: string, options: SpanOptions = {}): TracingSpan {
    return new TracingSpan(name, options);
  }

  startChildSpan(name: string, parent: TracingSpan, options: Omit<SpanOptions, 'traceId' | 'parentSpanId'> = {}): TracingSpan {
    return this.startSpan(name, {
      ...options,
      traceId: parent.traceId,
      parentSpanId: parent.spanId
    });
  }

  async traced<T>(name: string, fn: (span: TracingSpan) => Promise<T>, options: SpanOptions = {}): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  async persistSpan(span: TracingSpan): Promise<void> {
    try {
      const data = span.export();
      await db.query(
        `INSERT INTO telemetry_spans (
          trace_id, span_id, parent_span_id, name, kind, status_code,
          start_time, end_time, duration_ms, attributes, events,
          service_name, service_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          data.traceId, data.spanId, data.parentSpanId, data.name, data.kind, data.status,
          data.startTime, data.endTime, data.duration,
          JSON.stringify(data.attributes), JSON.stringify(data.events),
          this.serviceName, this.serviceVersion
        ]
      );
      logger.debug(LogCategory.MONITORING, `Span persisted: ${span.name} (${span.getDuration()}ms)`);
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to persist span:', error);
    }
  }

  async recordMetric(name: string, value: number, options: {
    type?: 'counter' | 'gauge' | 'histogram';
    unit?: string;
    tags?: Record<string, any>;
  } = {}): Promise<void> {
    try {
      await db.query(
        `INSERT INTO performance_metrics (metric_name, metric_type, value, unit, tags)
         VALUES ($1, $2, $3, $4, $5)`,
        [name, options.type || 'gauge', value, options.unit || 'count', JSON.stringify(options.tags || {})]
      );
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to record metric:', error);
    }
  }
}

export const openTelemetryTracing = OpenTelemetryTracing.getInstance();
