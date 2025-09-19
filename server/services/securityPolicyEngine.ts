import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { sandboxExecutor } from './sandboxExecutor';
import { cleanupValidator } from './cleanupValidator';

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  category: 'access' | 'execution' | 'network' | 'data' | 'resource';
  rules: PolicyRule[];
  actions: PolicyAction[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  id: string;
  type: 'allow' | 'deny' | 'monitor';
  resource: string;
  conditions: PolicyCondition[];
  priority: number;
}

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'matches' | 'greater' | 'less';
  value: any;
}

export interface PolicyAction {
  type: 'block' | 'alert' | 'log' | 'quarantine' | 'sandbox';
  severity: 'info' | 'warning' | 'error' | 'critical';
  notification?: boolean;
  metadata?: any;
}

export interface PolicyViolation {
  id: string;
  policyId: string;
  ruleId: string;
  timestamp: Date;
  farmId?: string;
  agentId?: string;
  resource: string;
  action: string;
  result: 'blocked' | 'allowed' | 'sandboxed';
  details: any;
}

export interface SecurityAuditLog {
  id: string;
  timestamp: Date;
  eventType: string;
  farmId?: string;
  agentId?: string;
  userId?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'blocked';
  metadata: any;
}

export class SecurityPolicyEngine extends EventEmitter {
  private policies: Map<string, SecurityPolicy> = new Map();
  private violations: Map<string, PolicyViolation[]> = new Map();
  private auditLogs: SecurityAuditLog[] = [];
  
  private readonly MAX_AUDIT_LOGS = 10000;
  private readonly AUDIT_RETENTION_DAYS = 90;
  private readonly POLICY_CACHE_TTL = 300000; // 5 minutes
  
  private policyCache: Map<string, { policy: SecurityPolicy; expires: number }> = new Map();
  private isInitialized = false;

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the security policy engine
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info('[SecurityPolicyEngine] Initializing security policy engine...');

      // Load security policies
      await this.loadPolicies();

      // Load recent violations
      await this.loadRecentViolations();

      // Start periodic tasks
      this.startPeriodicTasks();

      // Set up event listeners
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('[SecurityPolicyEngine] Initialization complete');

      this.emit('engine:initialized', {
        policies: this.policies.size,
        violations: this.getTotalViolations()
      });

    } catch (error) {
      logger.error('[SecurityPolicyEngine] Initialization failed:', error);
    }
  }

  /**
   * Evaluate action against security policies
   */
  async evaluateAction(
    action: string,
    resource: string,
    context: {
      farmId?: string;
      agentId?: string;
      userId?: string;
      metadata?: any;
    }
  ): Promise<{
    allowed: boolean;
    violations: PolicyViolation[];
    actions: PolicyAction[];
    requiresSandbox: boolean;
  }> {
    await this.initialize();

    const violations: PolicyViolation[] = [];
    const actions: PolicyAction[] = [];
    let allowed = true;
    let requiresSandbox = false;

    // Get applicable policies
    const applicablePolicies = await this.getApplicablePolicies(resource, context);

    for (const policy of applicablePolicies) {
      const evaluation = this.evaluatePolicy(policy, action, resource, context);

      if (!evaluation.allowed) {
        allowed = false;

        // Create violation record
        const violation: PolicyViolation = {
          id: uuidv4(),
          policyId: policy.id,
          ruleId: evaluation.violatedRule?.id || '',
          timestamp: new Date(),
          farmId: context.farmId,
          agentId: context.agentId,
          resource,
          action,
          result: 'blocked',
          details: {
            policyName: policy.name,
            level: policy.level,
            ...context.metadata
          }
        };

        violations.push(violation);
        
        // Collect actions
        actions.push(...policy.actions);

        // Check if sandboxing is required
        if (policy.actions.some(a => a.type === 'sandbox')) {
          requiresSandbox = true;
          violation.result = 'sandboxed';
        }
      }
    }

    // If sandboxing is required and action is execution
    if (requiresSandbox && action === 'execute') {
      allowed = true; // Allow but in sandbox
    }

    // Record violations
    if (violations.length > 0) {
      await this.recordViolations(violations);
      
      // Emit security event
      this.emit('security:violation', {
        violations,
        resource,
        action,
        context
      });

      // Send WebSocket notification for critical violations
      const criticalViolation = violations.find(v => {
        const policy = this.policies.get(v.policyId);
        return policy?.level === 'critical';
      });

      if (criticalViolation) {
        websocketManager.broadcast('security:alert', {
          type: 'policy_violation',
          severity: 'critical',
          violation: criticalViolation,
          timestamp: new Date()
        });
      }
    }

    // Audit log
    await this.auditLog({
      id: uuidv4(),
      timestamp: new Date(),
      eventType: 'policy_evaluation',
      farmId: context.farmId,
      agentId: context.agentId,
      userId: context.userId,
      action,
      resource,
      result: allowed ? 'success' : 'blocked',
      metadata: {
        violations: violations.length,
        requiresSandbox,
        policies: applicablePolicies.length
      }
    });

    return {
      allowed,
      violations,
      actions,
      requiresSandbox
    };
  }

  /**
   * Evaluate a single policy
   */
  private evaluatePolicy(
    policy: SecurityPolicy,
    action: string,
    resource: string,
    context: any
  ): { allowed: boolean; violatedRule?: PolicyRule } {
    // Sort rules by priority
    const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesResource(rule.resource, resource)) {
        const conditionsMet = this.evaluateConditions(rule.conditions, context);

        if (conditionsMet) {
          if (rule.type === 'deny') {
            return { allowed: false, violatedRule: rule };
          } else if (rule.type === 'allow') {
            return { allowed: true };
          }
          // 'monitor' type continues to next rule
        }
      }
    }

    // Default allow if no explicit deny
    return { allowed: true };
  }

  /**
   * Check if resource matches pattern
   */
  private matchesResource(pattern: string, resource: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resource);
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(conditions: PolicyCondition[], context: any): boolean {
    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(condition.field, context);
      
      if (!this.evaluateCondition(condition, fieldValue)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: PolicyCondition, value: any): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      
      case 'contains':
        return String(value).includes(String(condition.value));
      
      case 'matches':
        const regex = new RegExp(condition.value);
        return regex.test(String(value));
      
      case 'greater':
        return Number(value) > Number(condition.value);
      
      case 'less':
        return Number(value) < Number(condition.value);
      
      default:
        return false;
    }
  }

  /**
   * Get field value from context
   */
  private getFieldValue(field: string, context: any): any {
    const parts = field.split('.');
    let value = context;

    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }

    return value;
  }

  /**
   * Get applicable policies for resource
   */
  private async getApplicablePolicies(
    resource: string,
    context: any
  ): Promise<SecurityPolicy[]> {
    const applicable: SecurityPolicy[] = [];

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      // Check if policy applies to this resource category
      const resourceCategory = this.getResourceCategory(resource);
      if (policy.category !== resourceCategory && policy.category !== 'access') {
        continue;
      }

      applicable.push(policy);
    }

    // Sort by level (critical first)
    const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    applicable.sort((a, b) => 
      levelOrder[a.level] - levelOrder[b.level]
    );

    return applicable;
  }

  /**
   * Get resource category
   */
  private getResourceCategory(resource: string): SecurityPolicy['category'] {
    if (resource.includes('/api/')) return 'network';
    if (resource.includes('execute') || resource.includes('run')) return 'execution';
    if (resource.includes('data') || resource.includes('db')) return 'data';
    if (resource.includes('cpu') || resource.includes('memory')) return 'resource';
    return 'access';
  }

  /**
   * Create default security policies
   */
  async createDefaultPolicies(): Promise<void> {
    const defaultPolicies: Partial<SecurityPolicy>[] = [
      {
        name: 'Prevent Command Injection',
        description: 'Block potentially dangerous command execution',
        level: 'critical',
        category: 'execution',
        rules: [
          {
            id: 'no-shell-injection',
            type: 'deny',
            resource: 'execute/*',
            conditions: [
              {
                field: 'command',
                operator: 'matches',
                value: '.*(;|&&|\\|\\||`|\\$\\(|<|>).*'
              }
            ],
            priority: 100
          }
        ],
        actions: [
          {
            type: 'block',
            severity: 'critical',
            notification: true
          },
          {
            type: 'alert',
            severity: 'critical'
          }
        ],
        enabled: true
      },
      {
        name: 'Sandbox Untrusted Code',
        description: 'Execute untrusted code in sandbox',
        level: 'high',
        category: 'execution',
        rules: [
          {
            id: 'sandbox-untrusted',
            type: 'monitor',
            resource: 'execute/untrusted/*',
            conditions: [],
            priority: 90
          }
        ],
        actions: [
          {
            type: 'sandbox',
            severity: 'warning'
          },
          {
            type: 'log',
            severity: 'info'
          }
        ],
        enabled: true
      },
      {
        name: 'File System Access Control',
        description: 'Restrict access to sensitive directories',
        level: 'high',
        category: 'access',
        rules: [
          {
            id: 'protect-system',
            type: 'deny',
            resource: '/system/*',
            conditions: [],
            priority: 95
          },
          {
            id: 'protect-config',
            type: 'deny',
            resource: '*/config/*',
            conditions: [
              {
                field: 'userId',
                operator: 'equals',
                value: null
              }
            ],
            priority: 85
          }
        ],
        actions: [
          {
            type: 'block',
            severity: 'error'
          },
          {
            type: 'log',
            severity: 'warning'
          }
        ],
        enabled: true
      },
      {
        name: 'Resource Limit Enforcement',
        description: 'Enforce resource usage limits',
        level: 'medium',
        category: 'resource',
        rules: [
          {
            id: 'memory-limit',
            type: 'deny',
            resource: 'resource/memory',
            conditions: [
              {
                field: 'metadata.memoryMB',
                operator: 'greater',
                value: 2048
              }
            ],
            priority: 70
          },
          {
            id: 'cpu-limit',
            type: 'monitor',
            resource: 'resource/cpu',
            conditions: [
              {
                field: 'metadata.cpuPercent',
                operator: 'greater',
                value: 80
              }
            ],
            priority: 60
          }
        ],
        actions: [
          {
            type: 'alert',
            severity: 'warning',
            notification: true
          }
        ],
        enabled: true
      },
      {
        name: 'Network Access Control',
        description: 'Control network access for agents',
        level: 'medium',
        category: 'network',
        rules: [
          {
            id: 'block-external',
            type: 'deny',
            resource: 'network/external/*',
            conditions: [
              {
                field: 'agentId',
                operator: 'contains',
                value: 'untrusted'
              }
            ],
            priority: 75
          }
        ],
        actions: [
          {
            type: 'block',
            severity: 'warning'
          }
        ],
        enabled: true
      }
    ];

    for (const policyData of defaultPolicies) {
      const policy: SecurityPolicy = {
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...policyData as SecurityPolicy
      };

      this.policies.set(policy.id, policy);
      await this.persistPolicy(policy);
    }

    logger.info(`[SecurityPolicyEngine] Created ${defaultPolicies.length} default policies`);
  }

  /**
   * Load security policies from database
   */
  private async loadPolicies(): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM security_policies WHERE enabled = true');
      
      for (const row of result.rows) {
        const policy: SecurityPolicy = {
          id: row.id,
          name: row.name,
          description: row.description,
          level: row.level,
          category: row.category,
          rules: row.rules || [],
          actions: row.actions || [],
          enabled: row.enabled,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        
        this.policies.set(policy.id, policy);
      }

      logger.info(`[SecurityPolicyEngine] Loaded ${this.policies.size} security policies`);

      // Create default policies if none exist
      if (this.policies.size === 0) {
        await this.createDefaultPolicies();
      }

    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error loading policies:', error);
      // Create defaults on error
      await this.createDefaultPolicies();
    }
  }

  /**
   * Load recent violations from database
   */
  private async loadRecentViolations(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM policy_violations 
        WHERE timestamp > NOW() - INTERVAL '7 days'
        ORDER BY timestamp DESC
        LIMIT 1000
      `);

      for (const row of result.rows) {
        const violation: PolicyViolation = {
          id: row.id,
          policyId: row.policy_id,
          ruleId: row.rule_id,
          timestamp: row.timestamp,
          farmId: row.farm_id,
          agentId: row.agent_id,
          resource: row.resource,
          action: row.action,
          result: row.result,
          details: row.details
        };

        const farmViolations = this.violations.get(violation.farmId || 'global') || [];
        farmViolations.push(violation);
        this.violations.set(violation.farmId || 'global', farmViolations);
      }

      logger.info(`[SecurityPolicyEngine] Loaded ${result.rows.length} recent violations`);

    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error loading violations:', error);
    }
  }

  /**
   * Record policy violations
   */
  private async recordViolations(violations: PolicyViolation[]): Promise<void> {
    for (const violation of violations) {
      // Add to memory
      const farmViolations = this.violations.get(violation.farmId || 'global') || [];
      farmViolations.push(violation);
      
      // Limit memory storage
      if (farmViolations.length > 100) {
        farmViolations.shift();
      }
      
      this.violations.set(violation.farmId || 'global', farmViolations);

      // Persist to database
      try {
        await db.query(`
          INSERT INTO policy_violations 
          (id, policy_id, rule_id, timestamp, farm_id, agent_id, 
           resource, action, result, details)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          violation.id,
          violation.policyId,
          violation.ruleId,
          violation.timestamp,
          violation.farmId,
          violation.agentId,
          violation.resource,
          violation.action,
          violation.result,
          JSON.stringify(violation.details)
        ]);
      } catch (error) {
        logger.error('[SecurityPolicyEngine] Error persisting violation:', error);
      }
    }
  }

  /**
   * Add audit log entry
   */
  private async auditLog(log: SecurityAuditLog): Promise<void> {
    // Add to memory
    this.auditLogs.push(log);
    
    // Limit memory storage
    if (this.auditLogs.length > this.MAX_AUDIT_LOGS) {
      this.auditLogs.shift();
    }

    // Persist to database
    try {
      await db.query(`
        INSERT INTO security_audit_logs 
        (id, timestamp, event_type, farm_id, agent_id, user_id, 
         action, resource, result, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        log.id,
        log.timestamp,
        log.eventType,
        log.farmId,
        log.agentId,
        log.userId,
        log.action,
        log.resource,
        log.result,
        JSON.stringify(log.metadata)
      ]);
    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error persisting audit log:', error);
    }
  }

  /**
   * Persist policy to database
   */
  private async persistPolicy(policy: SecurityPolicy): Promise<void> {
    try {
      await db.query(`
        INSERT INTO security_policies 
        (id, name, description, level, category, rules, actions, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = $2,
          description = $3,
          level = $4,
          category = $5,
          rules = $6,
          actions = $7,
          enabled = $8,
          updated_at = NOW()
      `, [
        policy.id,
        policy.name,
        policy.description,
        policy.level,
        policy.category,
        JSON.stringify(policy.rules),
        JSON.stringify(policy.actions),
        policy.enabled
      ]);
    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error persisting policy:', error);
    }
  }

  /**
   * Start periodic tasks
   */
  private startPeriodicTasks(): void {
    // Clean up old audit logs
    setInterval(async () => {
      await this.cleanupOldAuditLogs();
    }, 24 * 60 * 60 * 1000); // Daily

    // Refresh policy cache
    setInterval(() => {
      this.policyCache.clear();
    }, this.POLICY_CACHE_TTL);

    // Generate security reports
    setInterval(async () => {
      await this.generateSecurityReport();
    }, 60 * 60 * 1000); // Hourly
  }

  /**
   * Clean up old audit logs
   */
  private async cleanupOldAuditLogs(): Promise<void> {
    try {
      await db.query(`
        DELETE FROM security_audit_logs 
        WHERE timestamp < NOW() - INTERVAL '${this.AUDIT_RETENTION_DAYS} days'
      `);

      await db.query(`
        DELETE FROM policy_violations 
        WHERE timestamp < NOW() - INTERVAL '${this.AUDIT_RETENTION_DAYS} days'
      `);

      logger.info('[SecurityPolicyEngine] Cleaned up old audit logs');

    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error cleaning audit logs:', error);
    }
  }

  /**
   * Generate security report
   */
  private async generateSecurityReport(): Promise<void> {
    const stats = await this.getStatistics();
    
    if (stats.violationsLastHour > 10) {
      websocketManager.broadcast('security:report', {
        type: 'high_violation_rate',
        stats,
        timestamp: new Date()
      });
    }

    this.emit('security:report', stats);
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for sandbox executor events
    if (sandboxExecutor) {
      sandboxExecutor.on('execution:complete', (execution) => {
        if (execution.securityEvents && execution.securityEvents.length > 0) {
          this.handleSandboxSecurityEvents(execution);
        }
      });
    }

    // Listen for cleanup validator events
    if (cleanupValidator) {
      cleanupValidator.on('validation:complete', (result) => {
        if (!result.isClean) {
          this.handleCleanupIssues(result);
        }
      });
    }
  }

  /**
   * Handle sandbox security events
   */
  private async handleSandboxSecurityEvents(execution: any): Promise<void> {
    for (const event of execution.securityEvents) {
      await this.auditLog({
        id: uuidv4(),
        timestamp: event.timestamp,
        eventType: 'sandbox_security_event',
        action: 'sandbox_execution',
        resource: execution.command,
        result: event.severity === 'critical' ? 'blocked' : 'success',
        metadata: {
          executionId: execution.executionId,
          event
        }
      });
    }
  }

  /**
   * Handle cleanup validation issues
   */
  private async handleCleanupIssues(result: any): Promise<void> {
    for (const issue of result.issues) {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        await this.auditLog({
          id: uuidv4(),
          timestamp: new Date(),
          eventType: 'cleanup_issue',
          farmId: result.farmId,
          action: 'cleanup_validation',
          resource: issue.location || 'unknown',
          result: 'failure',
          metadata: {
            issue,
            farmId: result.farmId
          }
        });
      }
    }
  }

  /**
   * Get total violations count
   */
  private getTotalViolations(): number {
    let total = 0;
    for (const violations of this.violations.values()) {
      total += violations.length;
    }
    return total;
  }

  /**
   * Get security statistics
   */
  async getStatistics(): Promise<{
    totalPolicies: number;
    activePolicies: number;
    totalViolations: number;
    violationsLastHour: number;
    violationsLastDay: number;
    criticalViolations: number;
    topViolatedPolicies: Array<{ policyId: string; count: number }>;
    auditLogsCount: number;
  }> {
    try {
      // Get violation statistics
      const violationStats = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN timestamp > NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour,
          COUNT(CASE WHEN timestamp > NOW() - INTERVAL '1 day' THEN 1 END) as last_day,
          COUNT(CASE WHEN result = 'blocked' AND 
                EXISTS (SELECT 1 FROM security_policies WHERE id = policy_id AND level = 'critical')
                THEN 1 END) as critical
        FROM policy_violations
        WHERE timestamp > NOW() - INTERVAL '30 days'
      `);

      // Get top violated policies
      const topViolated = await db.query(`
        SELECT policy_id, COUNT(*) as count
        FROM policy_violations
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY policy_id
        ORDER BY count DESC
        LIMIT 5
      `);

      // Get audit log count
      const auditCount = await db.query(`
        SELECT COUNT(*) as count
        FROM security_audit_logs
        WHERE timestamp > NOW() - INTERVAL '30 days'
      `);

      const stats = violationStats.rows[0];

      return {
        totalPolicies: this.policies.size,
        activePolicies: Array.from(this.policies.values()).filter(p => p.enabled).length,
        totalViolations: parseInt(stats.total) || 0,
        violationsLastHour: parseInt(stats.last_hour) || 0,
        violationsLastDay: parseInt(stats.last_day) || 0,
        criticalViolations: parseInt(stats.critical) || 0,
        topViolatedPolicies: topViolated.rows.map(row => ({
          policyId: row.policy_id,
          count: parseInt(row.count)
        })),
        auditLogsCount: parseInt(auditCount.rows[0].count) || 0
      };
    } catch (error) {
      logger.error('[SecurityPolicyEngine] Error getting statistics:', error);
      return {
        totalPolicies: this.policies.size,
        activePolicies: 0,
        totalViolations: 0,
        violationsLastHour: 0,
        violationsLastDay: 0,
        criticalViolations: 0,
        topViolatedPolicies: [],
        auditLogsCount: 0
      };
    }
  }

  /**
   * Update security policy
   */
  async updatePolicy(policyId: string, updates: Partial<SecurityPolicy>): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const updatedPolicy = {
      ...policy,
      ...updates,
      updatedAt: new Date()
    };

    this.policies.set(policyId, updatedPolicy);
    await this.persistPolicy(updatedPolicy);

    this.emit('policy:updated', updatedPolicy);
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): SecurityPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Get all policies
   */
  getAllPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get violations for farm
   */
  getFarmViolations(farmId: string): PolicyViolation[] {
    return this.violations.get(farmId) || [];
  }
}

// Export singleton instance
export const securityPolicyEngine = new SecurityPolicyEngine();