/**
 * Audit Logger Service
 * Comprehensive audit logging for security and compliance
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';
import { db } from '../database/connection';
import { logger, LogCategory } from '../services/ProductionLogger';

const appendFile = promisify(fs.appendFile);
const mkdir = promisify(fs.mkdir);

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  
  // Authorization events
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  
  // Data events
  DATA_CREATE = 'DATA_CREATE',
  DATA_READ = 'DATA_READ',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_IMPORT = 'DATA_IMPORT',
  
  // Farm operations
  FARM_CREATE = 'FARM_CREATE',
  FARM_START = 'FARM_START',
  FARM_STOP = 'FARM_STOP',
  FARM_DELETE = 'FARM_DELETE',
  FARM_TIMEOUT = 'FARM_TIMEOUT',
  
  // Agent operations
  AGENT_SPAWN = 'AGENT_SPAWN',
  AGENT_TERMINATE = 'AGENT_TERMINATE',
  AGENT_ERROR = 'AGENT_ERROR',
  AGENT_RECOVERY = 'AGENT_RECOVERY',
  
  // System events
  SYSTEM_START = 'SYSTEM_START',
  SYSTEM_STOP = 'SYSTEM_STOP',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  
  // Security events
  SECURITY_ALERT = 'SECURITY_ALERT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED'
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface AuditEvent {
  id?: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  action?: string;
  result: 'SUCCESS' | 'FAILURE';
  message: string;
  metadata?: Record<string, any>;
  hash?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private readonly logDir: string;
  private readonly maxFileSize: number = 100 * 1024 * 1024; // 100MB
  private readonly retentionDays: number = 90;
  private currentLogFile: string;
  private writeQueue: AuditEvent[] = [];
  private isWriting: boolean = false;
  private flushInterval?: NodeJS.Timeout;
  
  private constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'audit');
    this.currentLogFile = this.getLogFileName();
    this.initialize();
  }
  
  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }
  
  /**
   * Initialize audit logger
   */
  private async initialize(): Promise<void> {
    try {
      // Create log directory
      await mkdir(this.logDir, { recursive: true });
      
      // Start flush interval
      this.flushInterval = setInterval(() => {
        this.flush();
      }, 5000); // Flush every 5 seconds
      
      // Log system start
      await this.log({
        eventType: AuditEventType.SYSTEM_START,
        severity: AuditSeverity.INFO,
        result: 'SUCCESS',
        message: 'Audit logging system initialized'
      });
      
      logger.info(LogCategory.SECURITY, 'Audit logger initialized');
    } catch (error) {
      logger.error(LogCategory.SECURITY, 'Failed to initialize audit logger:', error);
    }
  }
  
  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp' | 'hash'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...event
    };
    
    // Generate hash for integrity
    auditEvent.hash = this.generateHash(auditEvent);
    
    // Add to write queue
    this.writeQueue.push(auditEvent);
    
    // Write to database (async, don't wait)
    this.writeToDatabase(auditEvent).catch(error => {
      logger.error(LogCategory.SECURITY, 'Failed to write audit event to database:', error);
    });
    
    // Flush if queue is getting large
    if (this.writeQueue.length >= 100) {
      this.flush();
    }
  }
  
  /**
   * Log authentication event
   */
  async logAuth(
    eventType: AuditEventType,
    userId: string | undefined,
    success: boolean,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      severity: success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      userId,
      result: success ? 'SUCCESS' : 'FAILURE',
      message,
      metadata
    });
  }
  
  /**
   * Log data access event
   */
  async logDataAccess(
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE',
    resource: string,
    resourceId: string,
    userId?: string,
    success: boolean = true,
    metadata?: Record<string, any>
  ): Promise<void> {
    const eventTypeMap = {
      CREATE: AuditEventType.DATA_CREATE,
      READ: AuditEventType.DATA_READ,
      UPDATE: AuditEventType.DATA_UPDATE,
      DELETE: AuditEventType.DATA_DELETE
    };
    
    await this.log({
      eventType: eventTypeMap[action],
      severity: AuditSeverity.INFO,
      userId,
      resource,
      resourceId,
      action,
      result: success ? 'SUCCESS' : 'FAILURE',
      message: `${action} operation on ${resource}/${resourceId}`,
      metadata
    });
  }
  
  /**
   * Log security event
   */
  async logSecurity(
    eventType: AuditEventType,
    severity: AuditSeverity,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      severity,
      result: 'FAILURE',
      message,
      metadata
    });
  }
  
  /**
   * Generate hash for audit event
   */
  private generateHash(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      userId: event.userId,
      result: event.result,
      message: event.message
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Verify audit event integrity
   */
  verifyIntegrity(event: AuditEvent): boolean {
    const originalHash = event.hash;
    const calculatedHash = this.generateHash(event);
    return originalHash === calculatedHash;
  }
  
  /**
   * Flush write queue to file
   */
  private async flush(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }
    
    this.isWriting = true;
    const events = [...this.writeQueue];
    this.writeQueue = [];
    
    try {
      // Check if we need to rotate log file
      await this.rotateLogIfNeeded();
      
      // Write events to file
      const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
      await appendFile(this.currentLogFile, lines);
      
    } catch (error) {
      logger.error(LogCategory.SECURITY, 'Failed to flush audit events to file:', error);
      // Re-add events to queue
      this.writeQueue.unshift(...events);
    } finally {
      this.isWriting = false;
    }
  }
  
  /**
   * Write audit event to database
   */
  private async writeToDatabase(event: AuditEvent): Promise<void> {
    try {
      // Map to existing table schema:
      // action, resource_type, resource_id, details (JSONB), ip_address, user_agent, timestamp, user_id
      const details = {
        eventType: event.eventType,
        severity: event.severity,
        sessionId: event.sessionId,
        result: event.result,
        message: event.message,
        metadata: event.metadata,
        hash: event.hash
      };

      await db.query(
        `INSERT INTO audit_logs (
          id, user_id, action, resource_type, resource_id,
          details, ip_address, user_agent, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.id,
          event.userId,
          event.action || event.eventType, // Use action if available, else eventType
          event.resource || 'system', // resource becomes resource_type
          event.resourceId,
          JSON.stringify(details), // Store extra fields in details JSONB
          event.ipAddress,
          event.userAgent,
          event.timestamp
        ]
      );
    } catch (error: any) {
      // If table doesn't exist, create it
      if (error.code === '42P01') {
        await this.createAuditTable();
        // Retry insert
        await this.writeToDatabase(event);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Create audit logs table
   */
  private async createAuditTable(): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        user_id VARCHAR(255),
        session_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        resource VARCHAR(255),
        resource_id VARCHAR(255),
        action VARCHAR(50),
        result VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_result ON audit_logs(result);
    `);
  }
  
  /**
   * Get log file name
   */
  private getLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.logDir, `audit-${dateStr}.log`);
  }
  
  /**
   * Rotate log file if needed
   */
  private async rotateLogIfNeeded(): Promise<void> {
    try {
      const stats = await promisify(fs.stat)(this.currentLogFile);
      
      if (stats.size >= this.maxFileSize) {
        // Rotate file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = path.join(this.logDir, `audit-${timestamp}.log`);
        await promisify(fs.rename)(this.currentLogFile, rotatedFile);
        
        // Update current log file
        this.currentLogFile = this.getLogFileName();
        
        logger.info(LogCategory.SECURITY, `Rotated audit log file to ${rotatedFile}`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error(LogCategory.SECURITY, 'Error checking log file size:', error);
      }
    }
  }
  
  /**
   * Query audit logs
   */
  async query(filters: {
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    severity?: AuditSeverity;
    userId?: string;
    result?: 'SUCCESS' | 'FAILURE';
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.endDate);
    }
    
    if (filters.eventType) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(filters.eventType);
    }
    
    if (filters.severity) {
      query += ` AND severity = $${paramIndex++}`;
      params.push(filters.severity);
    }
    
    if (filters.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }
    
    if (filters.result) {
      query += ` AND result = $${paramIndex++}`;
      params.push(filters.result);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filters.offset);
    }
    
    const result = await db.query(query, params);
    return result.rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }
  
  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<{
    summary: Record<string, number>;
    failures: AuditEvent[];
    criticalEvents: AuditEvent[];
  }> {
    const events = await this.query({ startDate, endDate });
    
    const summary: Record<string, number> = {};
    const failures: AuditEvent[] = [];
    const criticalEvents: AuditEvent[] = [];
    
    for (const event of events) {
      // Count by event type
      summary[event.eventType] = (summary[event.eventType] || 0) + 1;
      
      // Collect failures
      if (event.result === 'FAILURE') {
        failures.push(event);
      }
      
      // Collect critical events
      if (event.severity === AuditSeverity.CRITICAL) {
        criticalEvents.push(event);
      }
    }
    
    return { summary, failures, criticalEvents };
  }
  
  /**
   * Clean up old audit logs
   */
  async cleanup(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    
    // Delete from database
    await db.query('DELETE FROM audit_logs WHERE timestamp < $1', [cutoffDate]);
    
    // Delete old log files
    const files = await promisify(fs.readdir)(this.logDir);
    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      const stats = await promisify(fs.stat)(filePath);
      
      if (stats.mtime < cutoffDate) {
        await promisify(fs.unlink)(filePath);
        logger.info(LogCategory.SECURITY, `Deleted old audit log file: ${file}`);
      }
    }
  }
  
  /**
   * Destroy the audit logger
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    this.flush();
    
    logger.info(LogCategory.SECURITY, 'Audit logger destroyed');
  }
}

export const auditLogger = AuditLogger.getInstance();