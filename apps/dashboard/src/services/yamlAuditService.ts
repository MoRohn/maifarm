/**
 * YAML Audit Service
 * Provides comprehensive audit logging and compliance tracking
 */

import { 
  AuditEntry, 
  ApprovalWorkflow, 
  ApprovalRecord,
  ApprovalRule 
} from '@/types/yamlPipeline';
import { YamlConfig } from '@/types/yamlGenerator';
import { DiffChange } from '@/types/yamlPipeline';

class YamlAuditService {
  private dbName = 'maifarm-yaml-audit';
  private auditStoreName = 'audit-entries';
  private approvalStoreName = 'approval-workflows';
  private db: any = null;

  constructor() {
    this.initializeDB();
  }

  /**
   * Initialize IndexedDB for audit storage
   */
  private async initializeDB() {
    if (typeof window === 'undefined') return;
    
    const { openDB } = await import('idb');
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        // Audit entries store
        if (!db.objectStoreNames.contains('audit-entries')) {
          const auditStore = db.createObjectStore('audit-entries', { keyPath: 'id' });
          auditStore.createIndex('timestamp', 'timestamp');
          auditStore.createIndex('yamlId', 'yamlId');
          auditStore.createIndex('userId', 'userId');
          auditStore.createIndex('action', 'action');
        }

        // Approval workflows store
        if (!db.objectStoreNames.contains('approval-workflows')) {
          const approvalStore = db.createObjectStore('approval-workflows', { keyPath: 'id' });
          approvalStore.createIndex('yamlId', 'yamlId');
          approvalStore.createIndex('status', 'status');
          approvalStore.createIndex('deadline', 'deadline');
        }
      }
    });
  }

  /**
   * Log an audit entry
   */
  async logAudit(
    action: AuditEntry['action'],
    yamlId: string,
    version: string,
    userId: string,
    username: string,
    details: AuditEntry['details'] = {},
    request?: Request
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      yamlId,
      version,
      userId,
      username,
      details,
      ipAddress: request ? this.extractIPAddress(request) : undefined,
      userAgent: request ? request.headers.get('user-agent') || undefined : undefined
    };

    // Store in IndexedDB
    if (this.db) {
      await this.db.put('audit-entries', entry);
    }

    // Also send to backend for permanent storage
    await this.sendToBackend(entry);

    return entry;
  }

  /**
   * Create an approval workflow
   */
  async createApprovalWorkflow(
    yamlId: string,
    version: string,
    rules: ApprovalRule[],
    deadline?: string
  ): Promise<ApprovalWorkflow> {
    const requiredApprovers = this.calculateRequiredApprovers(rules);

    const workflow: ApprovalWorkflow = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      yamlId,
      version,
      status: 'pending',
      requiredApprovers,
      currentApprovers: [],
      deadline,
      rules
    };

    if (this.db) {
      await this.db.put('approval-workflows', workflow);
    }

    // Log workflow creation
    await this.logAudit(
      'create',
      yamlId,
      version,
      'system',
      'System',
      { reason: 'Approval workflow created' }
    );

    return workflow;
  }

  /**
   * Record an approval decision
   */
  async recordApproval(
    workflowId: string,
    userId: string,
    username: string,
    decision: 'approve' | 'reject',
    comment?: string
  ): Promise<ApprovalWorkflow> {
    const workflow = await this.getApprovalWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Approval workflow not found');
    }

    if (workflow.status !== 'pending') {
      throw new Error('Workflow is not pending approval');
    }

    // Check if user already approved
    if (workflow.currentApprovers.some(a => a.userId === userId)) {
      throw new Error('User has already provided approval decision');
    }

    // Add approval record
    const approvalRecord: ApprovalRecord = {
      userId,
      username,
      decision,
      timestamp: new Date().toISOString(),
      comment
    };

    workflow.currentApprovers.push(approvalRecord);

    // Check if workflow is complete
    const isComplete = this.checkWorkflowComplete(workflow);
    if (isComplete) {
      workflow.status = this.determineWorkflowStatus(workflow);
    }

    // Update workflow
    if (this.db) {
      await this.db.put('approval-workflows', workflow);
    }

    // Log approval
    await this.logAudit(
      'approve',
      workflow.yamlId,
      workflow.version,
      userId,
      username,
      { 
        decision,
        workflowId: workflow.id,
        ...(comment && { comment })
      }
    );

    return workflow;
  }

  /**
   * Get audit history for a YAML
   */
  async getAuditHistory(
    yamlId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      actions?: AuditEntry['action'][];
      limit?: number;
    }
  ): Promise<AuditEntry[]> {
    if (!this.db) return [];

    const entries: AuditEntry[] = [];
    const tx = this.db.transaction('audit-entries', 'readonly');
    const index = tx.objectStore('audit-entries').index('yamlId');
    
    let cursor = await index.openCursor(yamlId);
    while (cursor) {
      const entry = cursor.value;
      let include = true;

      // Apply filters
      if (options?.startDate && new Date(entry.timestamp) < new Date(options.startDate)) {
        include = false;
      }
      if (options?.endDate && new Date(entry.timestamp) > new Date(options.endDate)) {
        include = false;
      }
      if (options?.actions && !options.actions.includes(entry.action)) {
        include = false;
      }

      if (include) {
        entries.push(entry);
      }

      cursor = await cursor.continue();
    }

    // Sort by timestamp descending
    entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit
    if (options?.limit) {
      return entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(
    yamlId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    summary: {
      totalActions: number;
      actionBreakdown: Record<string, number>;
      uniqueUsers: number;
      approvalRate: number;
    };
    entries: AuditEntry[];
    compliance: {
      hasRequiredApprovals: boolean;
      auditTrailComplete: boolean;
      securityEvents: number;
    };
  }> {
    const entries = await this.getAuditHistory(yamlId, { startDate, endDate });
    
    // Calculate summary
    const actionBreakdown: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    let approvals = 0;
    let rejections = 0;
    let securityEvents = 0;

    for (const entry of entries) {
      // Action breakdown
      actionBreakdown[entry.action] = (actionBreakdown[entry.action] || 0) + 1;
      
      // Unique users
      uniqueUsers.add(entry.userId);
      
      // Approval stats
      if (entry.action === 'approve') {
        if (entry.details.decision === 'approve') approvals++;
        else if (entry.details.decision === 'reject') rejections++;
      }

      // Security events
      if (this.isSecurityEvent(entry)) {
        securityEvents++;
      }
    }

    const totalApprovalDecisions = approvals + rejections;
    const approvalRate = totalApprovalDecisions > 0 
      ? (approvals / totalApprovalDecisions) * 100 
      : 0;

    // Check compliance
    const hasRequiredApprovals = await this.checkRequiredApprovals(yamlId, entries);
    const auditTrailComplete = this.checkAuditTrailCompleteness(entries);

    return {
      summary: {
        totalActions: entries.length,
        actionBreakdown,
        uniqueUsers: uniqueUsers.size,
        approvalRate
      },
      entries,
      compliance: {
        hasRequiredApprovals,
        auditTrailComplete,
        securityEvents
      }
    };
  }

  /**
   * Get approval workflow
   */
  private async getApprovalWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    if (!this.db) return null;
    return await this.db.get('approval-workflows', workflowId);
  }

  /**
   * Calculate required approvers based on rules
   */
  private calculateRequiredApprovers(rules: ApprovalRule[]): string[] {
    const approvers = new Set<string>();

    for (const rule of rules) {
      if (rule.users) {
        rule.users.forEach(user => approvers.add(user));
      }
      // In a real implementation, resolve roles to users
      if (rule.roles) {
        // This would query a user service to get users with these roles
        // For now, we'll just add placeholder IDs
        rule.roles.forEach(role => approvers.add(`role:${role}`));
      }
    }

    return Array.from(approvers);
  }

  /**
   * Check if workflow is complete
   */
  private checkWorkflowComplete(workflow: ApprovalWorkflow): boolean {
    for (const rule of workflow.rules) {
      const relevantApprovals = workflow.currentApprovers.filter(approval => {
        // Check if approval is from a required user/role
        if (rule.users && rule.users.includes(approval.userId)) return true;
        // In real implementation, check if user has required role
        return false;
      });

      switch (rule.condition) {
        case 'all':
          if (relevantApprovals.length < rule.requiredCount) return false;
          break;
        case 'any':
          if (relevantApprovals.length === 0) return false;
          break;
        case 'majority':
          const approveCount = relevantApprovals.filter(a => a.decision === 'approve').length;
          if (approveCount < Math.ceil(rule.requiredCount / 2)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Determine workflow status based on approvals
   */
  private determineWorkflowStatus(workflow: ApprovalWorkflow): 'approved' | 'rejected' {
    const approvals = workflow.currentApprovers.filter(a => a.decision === 'approve').length;
    const rejections = workflow.currentApprovers.filter(a => a.decision === 'reject').length;

    // If any rule requires all approvals and there's a rejection, workflow is rejected
    for (const rule of workflow.rules) {
      if (rule.condition === 'all') {
        const relevantRejections = workflow.currentApprovers.filter(
          a => a.decision === 'reject' && 
          (rule.users?.includes(a.userId) || false)
        );
        if (relevantRejections.length > 0) return 'rejected';
      }
    }

    return approvals > rejections ? 'approved' : 'rejected';
  }

  /**
   * Check if an audit entry represents a security event
   */
  private isSecurityEvent(entry: AuditEntry): boolean {
    // Security-relevant actions
    const securityActions: AuditEntry['action'][] = ['delete', 'rollback'];
    if (securityActions.includes(entry.action)) return true;

    // Check for suspicious patterns
    if (entry.details.changes) {
      const suspiciousChanges = entry.details.changes.filter(change => 
        change.newValue?.includes('sudo') ||
        change.newValue?.includes('rm -rf') ||
        change.newValue?.includes('eval')
      );
      if (suspiciousChanges.length > 0) return true;
    }

    return false;
  }

  /**
   * Check if required approvals were obtained
   */
  private async checkRequiredApprovals(yamlId: string, entries: AuditEntry[]): Promise<boolean> {
    // Check if deployments had prior approvals
    const deployments = entries.filter(e => e.action === 'deploy');
    
    for (const deployment of deployments) {
      const priorApprovals = entries.filter(e => 
        e.action === 'approve' &&
        e.timestamp < deployment.timestamp &&
        e.yamlId === yamlId &&
        e.details.decision === 'approve'
      );

      if (priorApprovals.length === 0) return false;
    }

    return true;
  }

  /**
   * Check audit trail completeness
   */
  private checkAuditTrailCompleteness(entries: AuditEntry[]): boolean {
    // Ensure all critical actions are logged
    const requiredActions = ['create', 'update', 'approve', 'deploy'];
    const loggedActions = new Set(entries.map(e => e.action));

    // Check if at least create action exists
    return loggedActions.has('create');
  }

  /**
   * Extract IP address from request
   */
  private extractIPAddress(request: Request): string | undefined {
    // In a real implementation, extract from headers like X-Forwarded-For
    return request.headers.get('x-forwarded-for') || 
           request.headers.get('x-real-ip') || 
           undefined;
  }

  /**
   * Send audit entry to backend
   */
  private async sendToBackend(entry: AuditEntry): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
      await fetch(`${apiUrl}/audit/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch (error) {
      console.error('Failed to send audit log to backend:', error);
      // Continue - audit is also stored locally
    }
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    yamlId: string,
    format: 'json' | 'csv',
    options?: {
      startDate?: string;
      endDate?: string;
    }
  ): Promise<Blob> {
    const entries = await this.getAuditHistory(yamlId, options);

    if (format === 'json') {
      const json = JSON.stringify(entries, null, 2);
      return new Blob([json], { type: 'application/json' });
    } else {
      // CSV format
      const headers = ['Timestamp', 'Action', 'User', 'Version', 'Details'];
      const rows = entries.map(entry => [
        entry.timestamp,
        entry.action,
        entry.username,
        entry.version,
        JSON.stringify(entry.details)
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return new Blob([csv], { type: 'text/csv' });
    }
  }
}

export default new YamlAuditService();