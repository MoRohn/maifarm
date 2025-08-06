import {
  SafetyBoundary,
  BoundaryConfig,
  BoundaryViolation,
  SafetyMonitor,
  SafetyRecommendation,
  SafetyConfig
} from '../types/safety';
import { GoWildSession, GoWildConfig } from '../types/goWild';
import { snapshotService } from './explorationSnapshot';
import { rollbackManager } from './rollbackManager';
import { metricsCollector } from './metricsCollector';
import { toast } from 'react-hot-toast';

export class GoWildSafetyService {
  private static instance: GoWildSafetyService;
  private monitors: Map<string, SafetyMonitor> = new Map();
  private boundaries: Map<string, SafetyBoundary[]> = new Map();
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private config: SafetyConfig = {
    autoSnapshotInterval: 5,
    maxSnapshotsPerSession: 50,
    enableAutoRollback: true,
    rollbackThreshold: {
      violationCount: 10,
      riskScore: 80,
      criticalViolations: 1
    },
    monitoring: {
      checkInterval: 5,
      metricsRetention: 24,
      alertChannels: ['ui', 'webhook']
    }
  };

  private constructor() {}

  static getInstance(): GoWildSafetyService {
    if (!GoWildSafetyService.instance) {
      GoWildSafetyService.instance = new GoWildSafetyService();
    }
    return GoWildSafetyService.instance;
  }

  async initializeSafety(session: GoWildSession): Promise<SafetyMonitor> {
    // Create default boundaries based on config
    const boundaries = this.createDefaultBoundaries(session.config);
    this.boundaries.set(session.id, boundaries);

    // Initialize monitor
    const monitor: SafetyMonitor = {
      sessionId: session.id,
      status: 'active',
      riskScore: 0,
      boundaries,
      activeViolations: [],
      metrics: {
        violationCount: 0,
        warningCount: 0,
        autoTerminations: 0,
        rollbackCount: 0
      },
      recommendations: []
    };

    this.monitors.set(session.id, monitor);

    // Start auto-snapshot
    snapshotService.startAutoSnapshot(session, this.config.autoSnapshotInterval);

    // Start monitoring
    this.startMonitoring(session.id);

    return monitor;
  }

  async validateExploration(
    farmId: string,
    config: GoWildConfig
  ): Promise<{ valid: boolean; warnings: string[]; errors: string[] }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check resource availability
    const resources = await this.checkResourceAvailability();
    if (resources.cpu > 80) {
      warnings.push(`High CPU usage (${resources.cpu}%)`);
    }
    if (resources.memory > 90) {
      errors.push(`Critical memory usage (${resources.memory}%)`);
    }

    // Validate boundaries
    if (config.creativityLevel > 90) {
      warnings.push('Very high creativity level may lead to unpredictable behavior');
    }

    if (config.maxDuration > 60) {
      warnings.push('Long exploration duration may consume significant resources');
    }

    // Check for conflicting boundaries
    if (config.boundaries.allowExternalAPIs && config.boundaries.restrictedDomains.length === 0) {
      warnings.push('External APIs allowed without domain restrictions');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  async checkBoundaryViolation(
    sessionId: string,
    type: string,
    current: number | string,
    limit: number | string
  ): Promise<BoundaryViolation | null> {
    const monitor = this.monitors.get(sessionId);
    if (!monitor) return null;

    const boundary = monitor.boundaries.find(b => b.type === type && b.enabled);
    if (!boundary) return null;

    // Determine if violation occurred
    let violated = false;
    let severity: BoundaryViolation['severity'] = 'low';

    if (typeof current === 'number' && typeof limit === 'number') {
      violated = current > limit;
      const ratio = current / limit;
      if (ratio > 2) severity = 'critical';
      else if (ratio > 1.5) severity = 'high';
      else if (ratio > 1.2) severity = 'medium';
    }

    if (!violated) return null;

    // Create violation record
    const violation: BoundaryViolation = {
      id: `vio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      boundaryId: boundary.id,
      timestamp: new Date(),
      severity,
      type,
      details: {
        current,
        limit,
        message: `${type} boundary exceeded: ${current} > ${limit}`
      },
      action: this.determineViolationAction(severity, monitor),
      resolved: false
    };

    // Record violation
    monitor.activeViolations.push(violation);
    monitor.metrics.violationCount++;
    boundary.violations.push(violation);

    // Update risk score
    monitor.riskScore = this.calculateRiskScore(monitor);

    // Take action based on severity
    await this.handleViolation(sessionId, violation, monitor);

    return violation;
  }

  private async handleViolation(
    sessionId: string,
    violation: BoundaryViolation,
    monitor: SafetyMonitor
  ): Promise<void> {
    switch (violation.action) {
      case 'warn':
        toast.warning(violation.details.message);
        monitor.metrics.warningCount++;
        break;
        
      case 'throttle':
        // Implement throttling logic
        toast.warning(`Throttling exploration due to ${violation.type} violation`);
        break;
        
      case 'pause':
        // Pause exploration
        toast.error(`Pausing exploration due to ${violation.severity} violation`);
        // await goWildService.pauseExploration(sessionId);
        break;
        
      case 'terminate':
        // Emergency stop
        toast.error(`Terminating exploration due to critical violation`);
        monitor.metrics.autoTerminations++;
        await this.emergencyStop(sessionId, violation.details.message);
        break;
    }

    // Check for auto-rollback threshold
    if (this.config.enableAutoRollback) {
      if (monitor.metrics.violationCount >= this.config.rollbackThreshold.violationCount ||
          monitor.riskScore >= this.config.rollbackThreshold.riskScore ||
          monitor.activeViolations.filter(v => v.severity === 'critical').length >= 
            this.config.rollbackThreshold.criticalViolations) {
        
        await this.triggerAutoRollback(sessionId, 'Safety threshold exceeded');
      }
    }
  }

  async emergencyStop(sessionId: string, reason: string): Promise<void> {
    const monitor = this.monitors.get(sessionId);
    if (!monitor) return;

    try {
      // Create emergency snapshot
      const session = { id: sessionId } as GoWildSession; // Mock session
      await snapshotService.createSnapshot(session, 'checkpoint', `Emergency stop: ${reason}`);

      // Update monitor status
      monitor.status = 'terminated';

      // Stop all monitoring
      this.stopMonitoring(sessionId);

      // Log the emergency stop
      console.error(`Emergency stop for session ${sessionId}: ${reason}`);
      
    } catch (error) {
      console.error('Failed to execute emergency stop:', error);
    }
  }

  private async triggerAutoRollback(sessionId: string, reason: string): Promise<void> {
    try {
      // Get latest safe snapshot
      const snapshots = await snapshotService.listSnapshots(sessionId);
      const safeSnapshot = snapshots.find(s => s.type === 'automatic' || s.type === 'checkpoint');
      
      if (!safeSnapshot) {
        toast.error('No safe snapshot available for rollback');
        return;
      }

      // Initiate rollback
      await rollbackManager.initiateRollback({
        snapshotId: safeSnapshot.id,
        type: 'full',
        preview: false,
        reason: `Auto-rollback: ${reason}`
      });

      const monitor = this.monitors.get(sessionId);
      if (monitor) {
        monitor.metrics.rollbackCount++;
      }

    } catch (error) {
      console.error('Auto-rollback failed:', error);
      toast.error('Failed to execute auto-rollback');
    }
  }

  private createDefaultBoundaries(config: GoWildConfig): SafetyBoundary[] {
    const boundaries: SafetyBoundary[] = [];

    // Resource boundaries
    boundaries.push({
      id: `bound_${Date.now()}_cpu`,
      name: 'CPU Usage Limit',
      type: 'resource',
      enabled: true,
      config: {
        maxCpuPercent: 80,
        maxMemoryMB: 4096,
        maxDiskIOMBps: 100
      },
      violations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Time boundaries
    boundaries.push({
      id: `bound_${Date.now()}_time`,
      name: 'Time Constraints',
      type: 'time',
      enabled: true,
      config: {
        maxDurationMinutes: config.maxDuration,
        idleTimeoutMinutes: 5
      },
      violations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // API boundaries
    if (config.boundaries.allowExternalAPIs) {
      boundaries.push({
        id: `bound_${Date.now()}_api`,
        name: 'API Rate Limits',
        type: 'api',
        enabled: true,
        config: {
          maxApiCallsPerMinute: 60,
          maxTotalApiCalls: 1000,
          blockedApiEndpoints: config.boundaries.restrictedDomains
        },
        violations: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Network boundaries
    boundaries.push({
      id: `bound_${Date.now()}_network`,
      name: 'Network Restrictions',
      type: 'network',
      enabled: true,
      config: {
        blockedDomains: config.boundaries.restrictedDomains,
        maxBandwidthMBps: 10,
        maxConnections: 100
      },
      violations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return boundaries;
  }

  private startMonitoring(sessionId: string): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.performSafetyChecks(sessionId);
    }, this.config.monitoring.checkInterval * 1000);
  }

  private stopMonitoring(sessionId: string): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    snapshotService.stopAutoSnapshot();
  }

  private async performSafetyChecks(sessionId: string): Promise<void> {
    const monitor = this.monitors.get(sessionId);
    if (!monitor || monitor.status === 'terminated') return;

    // Check resource usage
    const resources = await this.checkResourceUsage();
    const resourceBoundary = monitor.boundaries.find(b => b.type === 'resource');
    
    if (resourceBoundary?.config.maxCpuPercent) {
      await this.checkBoundaryViolation(
        sessionId,
        'cpu',
        resources.cpu,
        resourceBoundary.config.maxCpuPercent
      );
    }

    if (resourceBoundary?.config.maxMemoryMB) {
      await this.checkBoundaryViolation(
        sessionId,
        'memory',
        resources.memory,
        resourceBoundary.config.maxMemoryMB
      );
    }

    // Update recommendations
    monitor.recommendations = this.generateRecommendations(monitor);
  }

  private async checkResourceUsage(): Promise<{ cpu: number; memory: number }> {
    // Mock implementation - would get actual system metrics
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 4096
    };
  }

  private async checkResourceAvailability(): Promise<{ cpu: number; memory: number }> {
    // Mock implementation
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100
    };
  }

  private calculateRiskScore(monitor: SafetyMonitor): number {
    let score = 0;

    // Base score from violations
    score += monitor.metrics.violationCount * 5;
    score += monitor.metrics.warningCount * 2;
    score += monitor.metrics.autoTerminations * 20;

    // Severity multipliers
    const criticalViolations = monitor.activeViolations.filter(v => v.severity === 'critical').length;
    const highViolations = monitor.activeViolations.filter(v => v.severity === 'high').length;
    
    score += criticalViolations * 30;
    score += highViolations * 15;

    // Cap at 100
    return Math.min(score, 100);
  }

  private determineViolationAction(
    severity: BoundaryViolation['severity'],
    monitor: SafetyMonitor
  ): BoundaryViolation['action'] {
    if (severity === 'critical' || monitor.riskScore > 90) {
      return 'terminate';
    } else if (severity === 'high' || monitor.riskScore > 70) {
      return 'pause';
    } else if (severity === 'medium' || monitor.riskScore > 50) {
      return 'throttle';
    }
    return 'warn';
  }

  private generateRecommendations(monitor: SafetyMonitor): SafetyRecommendation[] {
    const recommendations: SafetyRecommendation[] = [];

    if (monitor.riskScore > 70) {
      recommendations.push({
        id: `rec_${Date.now()}_1`,
        type: 'risk_mitigation',
        priority: 'high',
        title: 'High Risk Detected',
        description: 'Consider reducing exploration scope or enabling stricter boundaries',
        actions: [
          {
            label: 'Reduce Creativity Level',
            action: 'adjustCreativity',
            params: { level: 50 }
          },
          {
            label: 'Enable Stricter Boundaries',
            action: 'tightenBoundaries'
          }
        ]
      });
    }

    if (monitor.metrics.violationCount > 5) {
      recommendations.push({
        id: `rec_${Date.now()}_2`,
        type: 'boundary_adjustment',
        priority: 'medium',
        title: 'Frequent Boundary Violations',
        description: 'Current boundaries may be too restrictive for the exploration goals',
        actions: [
          {
            label: 'Review Boundaries',
            action: 'reviewBoundaries'
          },
          {
            label: 'Adjust Limits',
            action: 'adjustLimits'
          }
        ]
      });
    }

    return recommendations;
  }

  getMonitor(sessionId: string): SafetyMonitor | undefined {
    return this.monitors.get(sessionId);
  }

  updateConfig(config: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const goWildSafety = GoWildSafetyService.getInstance();