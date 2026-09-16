import { v4 as uuidv4 } from 'uuid';

export interface RetentionPolicy {
  id: string;
  name: string;
  description?: string;
  dataType: 'metrics' | 'logs' | 'analytics' | 'reports' | 'agent_data' | 'all';
  retentionPeriod: {
    value: number;
    unit: 'hours' | 'days' | 'weeks' | 'months' | 'years';
  };
  archiveAfter?: {
    value: number;
    unit: 'hours' | 'days' | 'weeks' | 'months';
  };
  compressArchive: boolean;
  deleteAfterArchive: boolean;
  compliance?: {
    standard: 'GDPR' | 'HIPAA' | 'SOC2' | 'ISO27001' | 'CUSTOM';
    requirements: string[];
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastExecuted?: Date;
  nextExecution?: Date;
}

export interface DataRetentionStats {
  totalDataSize: number;
  archivedDataSize: number;
  deletedDataSize: number;
  dataByType: {
    [key: string]: {
      size: number;
      count: number;
      oldestRecord: Date;
      newestRecord: Date;
    };
  };
  complianceStatus: {
    compliant: boolean;
    issues: string[];
  };
}

export interface ArchiveOperation {
  id: string;
  policyId: string;
  dataType: string;
  recordsProcessed: number;
  dataSize: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

class DataRetentionService {
  private policies: Map<string, RetentionPolicy> = new Map();
  private operations: Map<string, ArchiveOperation> = new Map();
  private stats: DataRetentionStats = {
    totalDataSize: 0,
    archivedDataSize: 0,
    deletedDataSize: 0,
    dataByType: {},
    complianceStatus: {
      compliant: true,
      issues: []
    }
  };

  constructor() {
    this.initializeDefaultPolicies();
    this.scheduleRetentionJobs();
  }

  private initializeDefaultPolicies() {
    // Default policies for different data types
    const defaultPolicies: Partial<RetentionPolicy>[] = [
      {
        name: 'Metrics Retention',
        description: 'Retain performance metrics for analysis',
        dataType: 'metrics',
        retentionPeriod: { value: 90, unit: 'days' },
        archiveAfter: { value: 30, unit: 'days' },
        compressArchive: true,
        deleteAfterArchive: false
      },
      {
        name: 'Log Retention',
        description: 'System and agent logs retention',
        dataType: 'logs',
        retentionPeriod: { value: 30, unit: 'days' },
        archiveAfter: { value: 7, unit: 'days' },
        compressArchive: true,
        deleteAfterArchive: true
      },
      {
        name: 'Analytics Data',
        description: 'Analytics and reporting data',
        dataType: 'analytics',
        retentionPeriod: { value: 1, unit: 'years' },
        archiveAfter: { value: 3, unit: 'months' },
        compressArchive: true,
        deleteAfterArchive: false
      },
      {
        name: 'Reports Archive',
        description: 'Generated reports and exports',
        dataType: 'reports',
        retentionPeriod: { value: 2, unit: 'years' },
        compressArchive: false,
        deleteAfterArchive: false
      }
    ];

    defaultPolicies.forEach(policy => {
      this.createPolicy(policy as Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>);
    });
  }

  createPolicy(
    policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): RetentionPolicy {
    const newPolicy: RetentionPolicy = {
      ...policy,
      id: uuidv4(),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      nextExecution: this.calculateNextExecution(policy.retentionPeriod)
    };

    this.policies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  updatePolicy(id: string, updates: Partial<RetentionPolicy>): RetentionPolicy | null {
    const policy = this.policies.get(id);
    if (!policy) return null;

    const updatedPolicy = {
      ...policy,
      ...updates,
      updatedAt: new Date()
    };

    if (updates.retentionPeriod) {
      updatedPolicy.nextExecution = this.calculateNextExecution(updates.retentionPeriod);
    }

    this.policies.set(id, updatedPolicy);
    return updatedPolicy;
  }

  deletePolicy(id: string): boolean {
    return this.policies.delete(id);
  }

  getPolicies(): RetentionPolicy[] {
    return Array.from(this.policies.values());
  }

  getPolicy(id: string): RetentionPolicy | undefined {
    return this.policies.get(id);
  }

  private calculateNextExecution(retentionPeriod: RetentionPolicy['retentionPeriod']): Date {
    const now = new Date();
    const multiplier = {
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000
    };

    // Check daily for retention
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  private scheduleRetentionJobs() {
    // Schedule daily retention checks
    setInterval(() => {
      this.executeRetentionPolicies();
    }, 24 * 60 * 60 * 1000); // Run daily

    // Run initial check
    setTimeout(() => this.executeRetentionPolicies(), 5000);
  }

  private async executeRetentionPolicies() {
    const activePolicies = Array.from(this.policies.values()).filter(p => p.enabled);

    for (const policy of activePolicies) {
      if (this.shouldExecutePolicy(policy)) {
        await this.executePolicy(policy);
      }
    }
  }

  private shouldExecutePolicy(policy: RetentionPolicy): boolean {
    if (!policy.nextExecution) return true;
    return new Date() >= policy.nextExecution;
  }

  private async executePolicy(policy: RetentionPolicy): Promise<void> {
    const operation: ArchiveOperation = {
      id: uuidv4(),
      policyId: policy.id,
      dataType: policy.dataType,
      recordsProcessed: 0,
      dataSize: 0,
      status: 'in_progress',
      startedAt: new Date()
    };

    this.operations.set(operation.id, operation);

    try {
      // Simulate data processing
      const result = await this.processDataForRetention(policy);
      
      operation.recordsProcessed = result.recordsProcessed;
      operation.dataSize = result.dataSize;
      operation.status = 'completed';
      operation.completedAt = new Date();

      // Update policy execution time
      policy.lastExecuted = new Date();
      policy.nextExecution = this.calculateNextExecution(policy.retentionPeriod);
      this.policies.set(policy.id, policy);

      // Update statistics
      this.updateStatistics(result);
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.completedAt = new Date();
    }

    this.operations.set(operation.id, operation);
  }

  private async processDataForRetention(policy: RetentionPolicy): Promise<{
    recordsProcessed: number;
    dataSize: number;
    archived: number;
    deleted: number;
  }> {
    // This would connect to actual data storage in production
    // For now, return simulated results
    const cutoffDate = this.calculateCutoffDate(policy.retentionPeriod);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const result = {
      recordsProcessed: Math.floor(Math.random() * 10000),
      dataSize: Math.floor(Math.random() * 1024 * 1024 * 100), // Up to 100MB
      archived: 0,
      deleted: 0
    };

    if (policy.archiveAfter) {
      const archiveCutoff = this.calculateCutoffDate(policy.archiveAfter);
      result.archived = Math.floor(result.recordsProcessed * 0.3);
    }

    if (policy.deleteAfterArchive) {
      result.deleted = result.archived;
    }

    return result;
  }

  private calculateCutoffDate(period: { value: number; unit: string }): Date {
    const now = new Date();
    const multiplier = {
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000
    };

    const ms = period.value * (multiplier[period.unit as keyof typeof multiplier] || multiplier.days);
    return new Date(now.getTime() - ms);
  }

  private updateStatistics(result: {
    recordsProcessed: number;
    dataSize: number;
    archived: number;
    deleted: number;
  }) {
    this.stats.totalDataSize += result.dataSize;
    this.stats.archivedDataSize += result.archived * (result.dataSize / result.recordsProcessed);
    this.stats.deletedDataSize += result.deleted * (result.dataSize / result.recordsProcessed);
  }

  getStatistics(): DataRetentionStats {
    return { ...this.stats };
  }

  getOperations(limit: number = 100): ArchiveOperation[] {
    return Array.from(this.operations.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  async validateCompliance(standard: string): Promise<{
    compliant: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let compliant = true;

    const policies = this.getPolicies();

    switch (standard) {
      case 'GDPR':
        // GDPR requires personal data deletion after purpose is fulfilled
        const personalDataPolicies = policies.filter(p => 
          p.dataType === 'logs' || p.dataType === 'agent_data'
        );
        
        personalDataPolicies.forEach(policy => {
          const retentionDays = this.convertToDays(policy.retentionPeriod);
          if (retentionDays > 365) {
            issues.push(`${policy.name}: Retention period exceeds GDPR recommendations`);
            compliant = false;
          }
          if (!policy.deleteAfterArchive) {
            recommendations.push(`${policy.name}: Consider enabling deletion after archive for GDPR compliance`);
          }
        });
        break;

      case 'SOC2':
        // SOC2 requires audit logs retention for at least 1 year
        const logPolicies = policies.filter(p => p.dataType === 'logs');
        logPolicies.forEach(policy => {
          const retentionDays = this.convertToDays(policy.retentionPeriod);
          if (retentionDays < 365) {
            issues.push(`${policy.name}: Retention period below SOC2 requirements (1 year minimum)`);
            compliant = false;
          }
        });
        break;

      case 'HIPAA':
        // HIPAA requires 6-year retention for certain records
        policies.forEach(policy => {
          const retentionDays = this.convertToDays(policy.retentionPeriod);
          if (retentionDays < 2190) { // 6 years
            recommendations.push(`${policy.name}: Consider extending retention to 6 years for HIPAA compliance`);
          }
        });
        break;
    }

    // General recommendations
    if (!policies.some(p => p.dataType === 'all')) {
      recommendations.push('Consider implementing a catch-all policy for uncategorized data');
    }

    if (!policies.some(p => p.compressArchive)) {
      recommendations.push('Enable compression for archived data to reduce storage costs');
    }

    return { compliant, issues, recommendations };
  }

  private convertToDays(period: { value: number; unit: string }): number {
    const multipliers = {
      hours: 1 / 24,
      days: 1,
      weeks: 7,
      months: 30,
      years: 365
    };
    return period.value * (multipliers[period.unit as keyof typeof multipliers] || 1);
  }

  async exportPolicies(): Promise<string> {
    const policies = this.getPolicies();
    return JSON.stringify(policies, null, 2);
  }

  async importPolicies(data: string): Promise<void> {
    try {
      const policies = JSON.parse(data) as RetentionPolicy[];
      policies.forEach(policy => {
        this.policies.set(policy.id, {
          ...policy,
          createdAt: new Date(policy.createdAt),
          updatedAt: new Date(policy.updatedAt),
          lastExecuted: policy.lastExecuted ? new Date(policy.lastExecuted) : undefined,
          nextExecution: policy.nextExecution ? new Date(policy.nextExecution) : undefined
        });
      });
    } catch (error) {
      throw new Error('Failed to import policies: Invalid format');
    }
  }
}

export const dataRetentionService = new DataRetentionService();