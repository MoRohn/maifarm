import { AuditLog, SecurityEvent, SecurityEventType } from '../types/security';
import { authService } from './auth';
import { offlineService } from './offline';

class AuditService {
  private auditQueue: AuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxBatchSize = 50;
  private flushDelay = 5000; // 5 seconds

  constructor() {
    this.startBatchProcessing();
  }

  private startBatchProcessing() {
    this.flushInterval = setInterval(() => {
      this.flushAuditLogs();
    }, this.flushDelay);
  }

  async log(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
    };

    // Add to queue
    this.auditQueue.push(auditLog);

    // If queue is full, flush immediately
    if (this.auditQueue.length >= this.maxBatchSize) {
      await this.flushAuditLogs();
    }

    // Also log critical events immediately
    if (entry.severity === 'critical') {
      await this.sendAuditLog(auditLog);
    }
  }

  async logAction(
    action: string,
    resource: string,
    resourceId?: string,
    success: boolean = true,
    metadata?: Record<string, any>
  ): Promise<void> {
    const user = await authService.getCurrentUser().catch(() => null);
    
    await this.log({
      userId: user?.id || 'anonymous',
      action,
      resource,
      resourceId,
      success,
      metadata,
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      severity: success ? 'low' : 'medium',
    });
  }

  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.log({
      userId: event.userId || 'system',
      action: event.type,
      resource: 'security',
      metadata: event.details,
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      severity: event.severity,
      success: true,
    });
  }

  async logPermissionDenied(
    userId: string,
    resource: string,
    action: string
  ): Promise<void> {
    await this.log({
      userId,
      action: 'PERMISSION_DENIED',
      resource,
      metadata: { attemptedAction: action },
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      severity: 'medium',
      success: false,
    });
  }

  async logDataAccess(
    userId: string,
    dataType: string,
    operation: 'read' | 'write' | 'delete',
    recordCount: number
  ): Promise<void> {
    await this.log({
      userId,
      action: `DATA_${operation.toUpperCase()}`,
      resource: dataType,
      metadata: { recordCount },
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      severity: 'low',
      success: true,
    });
  }

  async getAuditLogs(filters: {
    userId?: string;
    resource?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: string[];
    success?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    try {
      const token = authService.getAccessToken();
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          if (value instanceof Date) {
            params.append(key, value.toISOString());
          } else if (Array.isArray(value)) {
            params.append(key, value.join(','));
          } else {
            params.append(key, String(value));
          }
        }
      });

      const response = await fetch(
        `/api/audit?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      return response.json();
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return { logs: [], total: 0 };
    }
  }

  async exportAuditLogs(format: 'csv' | 'json', filters: any): Promise<Blob> {
    const { logs } = await this.getAuditLogs({ ...filters, limit: 10000 });
    
    if (format === 'json') {
      return new Blob([JSON.stringify(logs, null, 2)], {
        type: 'application/json',
      });
    }

    // CSV format
    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Action',
      'Resource',
      'Resource ID',
      'Success',
      'Severity',
      'IP Address',
      'User Agent',
    ];

    const rows = logs.map(log => [
      log.id,
      log.timestamp.toISOString(),
      log.userId,
      log.action,
      log.resource,
      log.resourceId || '',
      log.success ? 'Yes' : 'No',
      log.severity,
      log.ipAddress,
      log.userAgent,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return new Blob([csv], { type: 'text/csv' });
  }

  private async flushAuditLogs(): Promise<void> {
    if (this.auditQueue.length === 0) return;

    const logsToSend = [...this.auditQueue];
    this.auditQueue = [];

    try {
      if (offlineService.isOnline()) {
        await this.sendAuditLogs(logsToSend);
      } else {
        // Queue for offline sync
        for (const log of logsToSend) {
          await offlineService.queueOperation({
            type: 'analytics',
            operation: 'create',
            url: '/api/audit/batch',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authService.getAccessToken()}`,
            },
            body: [log],
          });
        }
      }
    } catch (error) {
      console.error('Failed to send audit logs:', error);
      // Re-add to queue for retry
      this.auditQueue.unshift(...logsToSend);
    }
  }

  private async sendAuditLog(log: AuditLog): Promise<void> {
    const token = authService.getAccessToken();
    
    await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(log),
    });
  }

  private async sendAuditLogs(logs: AuditLog[]): Promise<void> {
    const token = authService.getAccessToken();
    
    await fetch('/api/audit/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(logs),
    });
  }

  private async getClientIP(): Promise<string> {
    try {
      // In a real app, this would be provided by the server
      return 'client-ip';
    } catch {
      return 'unknown';
    }
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushAuditLogs();
  }
}

export const auditService = new AuditService();