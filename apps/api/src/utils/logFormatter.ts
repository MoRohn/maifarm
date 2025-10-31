import { format } from 'date-fns';

export interface LogFormat {
  timestamp: string;
  level: string;
  source: string;
  message: string;
  metadata?: any;
  correlationId?: string;
}

export class LogFormatter {
  private readonly format: 'json' | 'text' | 'ecs';
  
  constructor(format: 'json' | 'text' | 'ecs' = 'json') {
    this.format = format;
  }

  // Format log entry based on configured format
  format(log: any): string {
    switch (this.format) {
      case 'json':
        return this.formatJSON(log);
      case 'text':
        return this.formatText(log);
      case 'ecs':
        return this.formatECS(log);
      default:
        return JSON.stringify(log);
    }
  }

  // JSON format (default)
  private formatJSON(log: any): string {
    return JSON.stringify({
      '@timestamp': log.timestamp || new Date().toISOString(),
      level: log.level,
      source: log.source,
      message: log.message,
      correlation_id: log.correlationId,
      metadata: log.metadata,
      agent_id: log.agentId,
      farm_id: log.farmId,
      user_id: log.userId
    });
  }

  // Human-readable text format
  private formatText(log: any): string {
    const timestamp = format(new Date(log.timestamp || Date.now()), 'yyyy-MM-dd HH:mm:ss.SSS');
    const level = (log.level || 'info').toUpperCase().padEnd(5);
    const source = (log.source || 'unknown').padEnd(15);
    const correlationId = log.correlationId ? `[${log.correlationId}] ` : '';
    
    let message = `${timestamp} ${level} ${source} ${correlationId}${log.message}`;
    
    if (log.metadata && Object.keys(log.metadata).length > 0) {
      message += ` | ${JSON.stringify(log.metadata)}`;
    }
    
    return message;
  }

  // Elastic Common Schema (ECS) format
  private formatECS(log: any): string {
    const ecsLog = {
      '@timestamp': log.timestamp || new Date().toISOString(),
      'log.level': log.level,
      'log.logger': log.source,
      'message': log.message,
      'trace.id': log.correlationId,
      'agent.id': log.agentId,
      'labels': {
        farm_id: log.farmId,
        user_id: log.userId
      },
      'event': {
        dataset: 'maifarm.logs',
        module: log.source
      },
      'service': {
        name: 'maifarm',
        type: 'orchestrator'
      }
    };

    // Add metadata fields
    if (log.metadata) {
      Object.assign(ecsLog, { metadata: log.metadata });
    }

    // Add error fields if present
    if (log.metadata?.error) {
      Object.assign(ecsLog, {
        'error.message': log.metadata.error.message,
        'error.stack_trace': log.metadata.error.stack,
        'error.type': log.metadata.error.type || 'Error'
      });
    }

    return JSON.stringify(ecsLog);
  }
}

// Log filtering utilities
export class LogFilter {
  private filters: Array<(log: any) => boolean> = [];

  // Add level filter
  byLevel(levels: string | string[]): LogFilter {
    const levelArray = Array.isArray(levels) ? levels : [levels];
    this.filters.push(log => levelArray.includes(log.level));
    return this;
  }

  // Add source filter
  bySource(sources: string | string[]): LogFilter {
    const sourceArray = Array.isArray(sources) ? sources : [sources];
    this.filters.push(log => sourceArray.includes(log.source));
    return this;
  }

  // Add time range filter
  byTimeRange(start: Date, end: Date): LogFilter {
    this.filters.push(log => {
      const timestamp = new Date(log.timestamp);
      return timestamp >= start && timestamp <= end;
    });
    return this;
  }

  // Add search filter
  bySearch(searchTerm: string): LogFilter {
    const term = searchTerm.toLowerCase();
    this.filters.push(log => {
      const message = (log.message || '').toLowerCase();
      const metadata = JSON.stringify(log.metadata || {}).toLowerCase();
      return message.includes(term) || metadata.includes(term);
    });
    return this;
  }

  // Add correlation ID filter
  byCorrelationId(correlationId: string): LogFilter {
    this.filters.push(log => log.correlationId === correlationId);
    return this;
  }

  // Apply all filters
  apply(logs: any[]): any[] {
    return logs.filter(log => this.filters.every(filter => filter(log)));
  }
}

// Log aggregation utilities
export class LogAggregator {
  // Group logs by level
  static groupByLevel(logs: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    
    logs.forEach(log => {
      const level = log.level || 'unknown';
      if (!grouped.has(level)) {
        grouped.set(level, []);
      }
      grouped.get(level)!.push(log);
    });

    return grouped;
  }

  // Group logs by source
  static groupBySource(logs: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    
    logs.forEach(log => {
      const source = log.source || 'unknown';
      if (!grouped.has(source)) {
        grouped.set(source, []);
      }
      grouped.get(source)!.push(log);
    });

    return grouped;
  }

  // Calculate log statistics
  static calculateStats(logs: any[]): {
    total: number;
    byLevel: Record<string, number>;
    bySource: Record<string, number>;
    errorRate: number;
    avgPerMinute: number;
  } {
    const stats = {
      total: logs.length,
      byLevel: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      errorRate: 0,
      avgPerMinute: 0
    };

    if (logs.length === 0) return stats;

    // Count by level
    const byLevel = this.groupByLevel(logs);
    byLevel.forEach((logs, level) => {
      stats.byLevel[level] = logs.length;
    });

    // Count by source
    const bySource = this.groupBySource(logs);
    bySource.forEach((logs, source) => {
      stats.bySource[source] = logs.length;
    });

    // Calculate error rate
    const errorCount = (stats.byLevel.error || 0) + (stats.byLevel.warn || 0);
    stats.errorRate = (errorCount / logs.length) * 100;

    // Calculate average per minute
    if (logs.length > 1) {
      const timestamps = logs.map(log => new Date(log.timestamp).getTime()).sort();
      const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 60000; // minutes
      stats.avgPerMinute = duration > 0 ? logs.length / duration : 0;
    }

    return stats;
  }
}

// Export singleton instances
export const jsonFormatter = new LogFormatter('json');
export const textFormatter = new LogFormatter('text');
export const ecsFormatter = new LogFormatter('ecs');