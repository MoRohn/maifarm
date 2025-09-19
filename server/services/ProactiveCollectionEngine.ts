/**
 * Proactive Collection Engine
 * Intelligent system for detecting patterns and triggering automatic collections
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { barnService as barnCollectionService } from './unified/barnService';
import { enhancedFileWatcher } from './EnhancedFileWatcher';
import { websocketManager } from '../websocket/websocketManager';
import * as path from 'path';

interface ActivityPattern {
  id: string;
  name: string;
  description: string;
  detector: PatternDetector;
  action: CollectionAction;
  priority: number;
  enabled: boolean;
}

interface PatternDetector {
  type: 'burst' | 'idle' | 'milestone' | 'error' | 'completion' | 'custom';
  config: any;
  evaluate: (context: DetectionContext) => Promise<DetectionResult>;
}

interface DetectionContext {
  workspaceId: string;
  farmId: string;
  agentId?: string;
  recentChanges: any[];
  statistics: any;
  metadata: Record<string, any>;
}

interface DetectionResult {
  triggered: boolean;
  confidence: number; // 0-1
  reason?: string;
  metadata?: Record<string, any>;
}

interface CollectionAction {
  type: 'immediate' | 'scheduled' | 'conditional';
  config: any;
  execute: (context: ActionContext) => Promise<void>;
}

interface ActionContext extends DetectionContext {
  pattern: ActivityPattern;
  detectionResult: DetectionResult;
}

interface WorkspaceMonitor {
  workspaceId: string;
  farmId: string;
  agentId?: string;
  watchSessionId?: string;
  patterns: Set<string>;
  activityHistory: ActivityEvent[];
  lastAnalysis: Date;
  collectionHistory: CollectionEvent[];
  metrics: WorkspaceMetrics;
}

interface ActivityEvent {
  timestamp: Date;
  type: string;
  data: any;
}

interface CollectionEvent {
  timestamp: Date;
  patternId: string;
  result: 'success' | 'failed' | 'skipped';
  metadata: any;
}

interface WorkspaceMetrics {
  averageChangeRate: number;
  peakActivityTime?: Date;
  idleTime: number;
  productivityTrend: number[]; // Historical productivity scores
  fileTypes: Record<string, number>;
  errorRate: number;
}

export class ProactiveCollectionEngine extends EventEmitter {
  private patterns: Map<string, ActivityPattern> = new Map();
  private workspaceMonitors: Map<string, WorkspaceMonitor> = new Map();
  private analysisInterval?: NodeJS.Timeout;
  private learningEngine: LearningEngine;
  private readonly ANALYSIS_INTERVAL = 10000; // 10 seconds
  private readonly HISTORY_LIMIT = 1000;

  constructor() {
    super();
    this.learningEngine = new LearningEngine();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // CRITICAL: ProactiveCollectionEngine is effectively disabled
    // All automatic collection patterns are disabled to prevent premature collection
    // Collections should only happen at farm timeout via ShutdownCoordinator
    
    // Register default patterns (all disabled)
    this.registerDefaultPatterns();

    // Analysis loop disabled to prevent unnecessary processing
    // this.startAnalysisLoop(); // DISABLED

    // File watcher subscription disabled
    // this.subscribeToFileWatcher(); // DISABLED

    // Barn collection subscription disabled  
    // this.subscribeToBarnCollection(); // DISABLED

    logger.info('ProactiveCollectionEngine initialized (automatic collection disabled)');
  }

  /**
   * Register default activity patterns
   */
  private registerDefaultPatterns(): void {
    // Burst Activity Pattern
    this.registerPattern({
      id: 'burst-activity',
      name: 'Burst Activity Detection',
      description: 'Detects rapid file changes indicating active development',
      priority: 8,
      enabled: false, // DISABLED: Collections should only happen via ShutdownCoordinator
      detector: {
        type: 'burst',
        config: {
          threshold: 20, // 20 changes
          timeWindow: 60000, // within 1 minute
          minFileTypes: 2 // at least 2 different file types
        },
        evaluate: async (context) => {
          const recentChanges = context.recentChanges.filter(
            c => Date.now() - c.timestamp < 60000
          );
          
          const fileTypes = new Set(
            recentChanges
              .filter(c => c.path && typeof c.path === 'string')
              .map(c => path.extname(c.path))
          );
          
          if (recentChanges.length >= 20 && fileTypes.size >= 2) {
            return {
              triggered: true,
              confidence: Math.min(recentChanges.length / 30, 1),
              reason: `Detected burst activity: ${recentChanges.length} changes in last minute`,
              metadata: { changeCount: recentChanges.length, fileTypes: Array.from(fileTypes) }
            };
          }
          
          return { triggered: false, confidence: 0 };
        }
      },
      action: {
        type: 'scheduled',
        config: { delay: 5000 }, // Wait 5 seconds for activity to settle
        execute: async (context) => {
          await barnCollectionService.triggerManualCollection(context.workspaceId);
        }
      }
    });

    // Idle After Activity Pattern
    this.registerPattern({
      id: 'idle-after-activity',
      name: 'Idle After Activity',
      description: 'Collects files when workspace becomes idle after activity',
      priority: 6,
      enabled: false, // DISABLED: Collections should only happen at farm timeout via ShutdownCoordinator
      detector: {
        type: 'idle',
        config: {
          idleThreshold: 86400000, // 24 hours idle (effectively disabled for normal operations)
          minChangesBeforeIdle: 50 // High threshold to prevent premature collection
        },
        evaluate: async (context) => {
          const now = Date.now();
          const lastChange = context.recentChanges[context.recentChanges.length - 1];
          
          if (!lastChange) return { triggered: false, confidence: 0 };
          
          const idleTime = now - lastChange.timestamp;
          const changesBeforeIdle = context.recentChanges.filter(
            c => c.timestamp > lastChange.timestamp - 300000 // Last 5 minutes
          ).length;
          
          if (idleTime >= 3600000 && changesBeforeIdle >= 50) { // Only after 60 minutes idle (farms timeout before this)
            return {
              triggered: true,
              confidence: Math.min(changesBeforeIdle / 10, 1),
              reason: `Workspace idle for ${Math.round(idleTime / 1000)}s after ${changesBeforeIdle} changes`,
              metadata: { idleTime, changesBeforeIdle }
            };
          }
          
          return { triggered: false, confidence: 0 };
        }
      },
      action: {
        type: 'immediate',
        config: {},
        execute: async (context) => {
          await barnCollectionService.triggerManualCollection(context.workspaceId);
        }
      }
    });

    // Milestone Completion Pattern
    const milestoneConfig = {
      indicators: [
        { pattern: /test.*pass/i, weight: 0.3 },
        { pattern: /build.*success/i, weight: 0.3 },
        { pattern: /complete|done|finish/i, weight: 0.2 },
        { pattern: /\.test\.(ts|js)$/, weight: 0.2 }
      ]
    };
    
    this.registerPattern({
      id: 'milestone-completion',
      name: 'Milestone Completion',
      description: 'Detects completion of significant work milestones',
      priority: 9,
      enabled: false, // DISABLED: Collections should only happen via ShutdownCoordinator
      detector: {
        type: 'milestone',
        config: milestoneConfig,
        evaluate: async (context) => {
          let score = 0;
          const indicators = milestoneConfig.indicators;
          
          // Check recent file changes for milestone indicators
          for (const change of context.recentChanges.slice(-20)) {
            if (!change.path || typeof change.path !== 'string') continue;
            for (const indicator of indicators) {
              if (indicator.pattern.test(change.path)) {
                score += indicator.weight;
              }
            }
          }
          
          // Check for test file completions
          const testFiles = context.recentChanges.filter(
            c => c.path && typeof c.path === 'string' && /\.test\.(ts|js)$/.test(c.path) && c.type === 'change'
          );
          
          if (testFiles.length >= 3) {
            score += 0.3;
          }
          
          if (score >= 0.7) {
            return {
              triggered: true,
              confidence: Math.min(score, 1),
              reason: 'Milestone completion detected',
              metadata: { score, testFiles: testFiles.length }
            };
          }
          
          return { triggered: false, confidence: 0 };
        }
      },
      action: {
        type: 'immediate',
        config: { priority: true },
        execute: async (context) => {
          logger.info(`Milestone collection triggered for workspace ${context.workspaceId}`);
          await barnCollectionService.triggerManualCollection(context.workspaceId);
        }
      }
    });

    // Error Recovery Pattern
    const errorRecoveryConfig = {
      errorIndicators: ['error', 'exception', 'failed', 'crash'],
      recoveryIndicators: ['fixed', 'resolved', 'success'],
      timeWindow: 300000 // 5 minutes
    };
    
    this.registerPattern({
      id: 'error-recovery',
      name: 'Error Recovery',
      description: 'Collects files after error detection and recovery',
      priority: 7,
      enabled: true,
      detector: {
        type: 'error',
        config: errorRecoveryConfig,
        evaluate: async (context) => {
          const recentChanges = context.recentChanges.filter(
            c => Date.now() - c.timestamp < errorRecoveryConfig.timeWindow
          );
          
          // Look for error followed by recovery
          let errorFound = false;
          let recoveryFound = false;
          
          for (const change of recentChanges) {
            if (!change.path || typeof change.path !== 'string') continue;
            const pathLower = change.path.toLowerCase();
            
            if (!errorFound) {
              errorFound = errorRecoveryConfig.errorIndicators.some(ind => pathLower.includes(ind));
            } else {
              recoveryFound = errorRecoveryConfig.recoveryIndicators.some(ind => pathLower.includes(ind));
            }
            
            if (errorFound && recoveryFound) {
              return {
                triggered: true,
                confidence: 0.8,
                reason: 'Error recovery detected',
                metadata: { errorFound, recoveryFound }
              };
            }
          }
          
          return { triggered: false, confidence: 0 };
        }
      },
      action: {
        type: 'scheduled',
        config: { delay: 10000 }, // Wait 10 seconds
        execute: async (context) => {
          await barnCollectionService.triggerManualCollection(context.workspaceId);
        }
      }
    });

    // Smart Completion Pattern (ML-based)
    this.registerPattern({
      id: 'smart-completion',
      name: 'Smart Completion Detection',
      description: 'Uses machine learning to detect task completion',
      priority: 10,
      enabled: true,
      detector: {
        type: 'custom',
        config: {},
        evaluate: async (context) => {
          // Use learning engine to predict completion
          const prediction = await this.learningEngine.predictCompletion(context);
          
          if (prediction.confidence >= 0.75) {
            return {
              triggered: true,
              confidence: prediction.confidence,
              reason: `ML model detected completion pattern (${Math.round(prediction.confidence * 100)}% confidence)`,
              metadata: prediction.features
            };
          }
          
          return { triggered: false, confidence: prediction.confidence };
        }
      },
      action: {
        type: 'conditional',
        config: {
          confirmationRequired: true,
          minConfidence: 0.8
        },
        execute: async (context) => {
          if (context.detectionResult.confidence >= 0.8) {
            await barnCollectionService.triggerManualCollection(context.workspaceId);
          } else {
            // Send notification for manual confirmation
            websocketManager.broadcast('collection:suggestion', {
              workspaceId: context.workspaceId,
              pattern: 'smart-completion',
              confidence: context.detectionResult.confidence,
              reason: context.detectionResult.reason
            });
          }
        }
      }
    });
  }

  /**
   * Register a custom pattern
   */
  public registerPattern(pattern: ActivityPattern): void {
    this.patterns.set(pattern.id, pattern);
    logger.info(`Registered activity pattern: ${pattern.name}`);
  }

  /**
   * Start monitoring a workspace
   */
  public async startMonitoring(
    workspaceId: string,
    farmId: string,
    agentId?: string,
    patterns?: string[]
  ): Promise<void> {
    try {
      // Create monitor
      const monitor: WorkspaceMonitor = {
        workspaceId,
        farmId,
        agentId,
        patterns: new Set(patterns || Array.from(this.patterns.keys())),
        activityHistory: [],
        lastAnalysis: new Date(),
        collectionHistory: [],
        metrics: {
          averageChangeRate: 0,
          idleTime: 0,
          productivityTrend: [],
          fileTypes: {},
          errorRate: 0
        }
      };

      // Create file watch session if needed
      const watchSessionId = await enhancedFileWatcher.createWatchSession(
        workspaceId,
        {
          enableBarnCollection: true,
          barnCollectionPolicy: {
            farmId,
            agentId,
            autoCollect: true
          }
        }
      );

      monitor.watchSessionId = watchSessionId;

      // Store monitor
      this.workspaceMonitors.set(workspaceId, monitor);

      // Emit monitoring started event
      this.emit('monitoring:started', { workspaceId, farmId, agentId, patterns });

      logger.info(`Started proactive monitoring for workspace ${workspaceId}`);

    } catch (error) {
      logger.error(`Failed to start monitoring for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Stop monitoring a workspace
   */
  public async stopMonitoring(workspaceId: string): Promise<void> {
    const monitor = this.workspaceMonitors.get(workspaceId);
    if (!monitor) return;

    try {
      // Stop file watch session
      if (monitor.watchSessionId) {
        await enhancedFileWatcher.stopWatchSession(monitor.watchSessionId);
      }

      // Remove monitor
      this.workspaceMonitors.delete(workspaceId);

      // Emit monitoring stopped event
      this.emit('monitoring:stopped', { workspaceId });

      logger.info(`Stopped proactive monitoring for workspace ${workspaceId}`);

    } catch (error) {
      logger.error(`Failed to stop monitoring for workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Start the analysis loop
   */
  private startAnalysisLoop(): void {
    this.analysisInterval = setInterval(() => {
      this.analyzeWorkspaces();
    }, this.ANALYSIS_INTERVAL);
  }

  /**
   * Analyze all monitored workspaces
   */
  private async analyzeWorkspaces(): Promise<void> {
    for (const [workspaceId, monitor] of this.workspaceMonitors.entries()) {
      await this.analyzeWorkspace(workspaceId, monitor);
    }
  }

  /**
   * Analyze a single workspace
   */
  private async analyzeWorkspace(workspaceId: string, monitor: WorkspaceMonitor): Promise<void> {
    try {
      // Get recent activity
      const recentActivity = monitor.activityHistory.slice(-100);
      
      // Get surveillance status
      const surveillanceStatus = barnCollectionService.getSurveillanceStatus(workspaceId);
      
      // Create detection context
      const context: DetectionContext = {
        workspaceId,
        farmId: monitor.farmId,
        agentId: monitor.agentId,
        recentChanges: recentActivity,
        statistics: surveillanceStatus?.activity?.statistics || {},
        metadata: {
          metrics: monitor.metrics,
          collectionHistory: monitor.collectionHistory.slice(-10)
        }
      };

      // Evaluate each pattern
      const triggeredPatterns: Array<{ pattern: ActivityPattern; result: DetectionResult }> = [];

      for (const patternId of monitor.patterns) {
        const pattern = this.patterns.get(patternId);
        if (!pattern || !pattern.enabled) continue;

        const result = await pattern.detector.evaluate(context);
        
        if (result.triggered) {
          triggeredPatterns.push({ pattern, result });
        }
      }

      // Sort by priority and confidence
      triggeredPatterns.sort((a, b) => {
        const priorityDiff = b.pattern.priority - a.pattern.priority;
        return priorityDiff !== 0 ? priorityDiff : b.result.confidence - a.result.confidence;
      });

      // Execute highest priority action
      if (triggeredPatterns.length > 0) {
        const { pattern, result } = triggeredPatterns[0];
        
        // Check if pattern was recently triggered
        const recentTrigger = monitor.collectionHistory.find(
          e => e.patternId === pattern.id && 
               Date.now() - e.timestamp.getTime() < 300000 // 5 minutes
        );

        if (!recentTrigger) {
          // Execute action
          const actionContext: ActionContext = {
            ...context,
            pattern,
            detectionResult: result
          };

          try {
            await pattern.action.execute(actionContext);
            
            // Record collection event
            monitor.collectionHistory.push({
              timestamp: new Date(),
              patternId: pattern.id,
              result: 'success',
              metadata: result.metadata
            });

            // Emit pattern triggered event
            this.emit('pattern:triggered', {
              workspaceId,
              pattern: pattern.name,
              confidence: result.confidence,
              reason: result.reason
            });

            // Learn from successful trigger
            await this.learningEngine.recordTrigger(context, pattern, result, true);

          } catch (error) {
            logger.error(`Failed to execute action for pattern ${pattern.name}:`, error);
            
            monitor.collectionHistory.push({
              timestamp: new Date(),
              patternId: pattern.id,
              result: 'failed',
              metadata: { error: error.message }
            });

            // Learn from failed trigger
            await this.learningEngine.recordTrigger(context, pattern, result, false);
          }
        }
      }

      // Update metrics
      this.updateWorkspaceMetrics(monitor, recentActivity);

      // Update last analysis time
      monitor.lastAnalysis = new Date();

    } catch (error) {
      logger.error(`Failed to analyze workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Update workspace metrics
   */
  private updateWorkspaceMetrics(monitor: WorkspaceMonitor, recentActivity: ActivityEvent[]): void {
    const now = Date.now();
    
    // Calculate average change rate (changes per minute)
    const changesLastMinute = recentActivity.filter(
      e => now - e.timestamp.getTime() < 60000
    ).length;
    
    monitor.metrics.averageChangeRate = 
      (monitor.metrics.averageChangeRate * 0.7) + (changesLastMinute * 0.3);

    // Update file type distribution
    for (const event of recentActivity) {
      if (event.data?.path) {
        const ext = path.extname(event.data.path);
        monitor.metrics.fileTypes[ext] = (monitor.metrics.fileTypes[ext] || 0) + 1;
      }
    }

    // Calculate idle time
    const lastActivity = recentActivity[recentActivity.length - 1];
    if (lastActivity) {
      monitor.metrics.idleTime = now - lastActivity.timestamp.getTime();
    }

    // Update productivity trend (keep last 20 values)
    const productivity = Math.min(monitor.metrics.averageChangeRate * 5, 100);
    monitor.metrics.productivityTrend.push(productivity);
    if (monitor.metrics.productivityTrend.length > 20) {
      monitor.metrics.productivityTrend.shift();
    }
  }

  /**
   * Subscribe to file watcher events
   */
  private subscribeToFileWatcher(): void {
    enhancedFileWatcher.on('change:important', (change) => {
      // Find relevant monitors
      for (const [workspaceId, monitor] of this.workspaceMonitors.entries()) {
        if (change.path.startsWith(workspaceId)) {
          // Add to activity history
          monitor.activityHistory.push({
            timestamp: new Date(),
            type: 'file:change',
            data: change
          });

          // Trim history
          if (monitor.activityHistory.length > this.HISTORY_LIMIT) {
            monitor.activityHistory = monitor.activityHistory.slice(-this.HISTORY_LIMIT);
          }
        }
      }
    });
  }

  /**
   * Subscribe to barn collection events
   */
  private subscribeToBarnCollection(): void {
    barnCollectionService.on('collection:completed', (event) => {
      const monitor = this.workspaceMonitors.get(event.workspaceId);
      if (monitor) {
        // Add to activity history
        monitor.activityHistory.push({
          timestamp: new Date(),
          type: 'collection:completed',
          data: event
        });
      }
    });
  }

  /**
   * Get monitoring status
   */
  public getMonitoringStatus(workspaceId: string): any {
    const monitor = this.workspaceMonitors.get(workspaceId);
    if (!monitor) return null;

    return {
      workspaceId,
      farmId: monitor.farmId,
      agentId: monitor.agentId,
      patterns: Array.from(monitor.patterns),
      metrics: monitor.metrics,
      lastAnalysis: monitor.lastAnalysis,
      recentCollections: monitor.collectionHistory.slice(-5)
    };
  }

  /**
   * Get all monitoring sessions
   */
  public getAllMonitoringSessions(): any[] {
    return Array.from(this.workspaceMonitors.keys()).map(id => 
      this.getMonitoringStatus(id)
    );
  }

  /**
   * Shutdown the engine
   */
  public async shutdown(): Promise<void> {
    // Stop analysis loop
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }

    // Stop all monitoring
    for (const workspaceId of this.workspaceMonitors.keys()) {
      await this.stopMonitoring(workspaceId);
    }

    logger.info('ProactiveCollectionEngine shut down');
  }
}

/**
 * Simple learning engine for pattern detection
 */
class LearningEngine {
  private triggerHistory: any[] = [];
  private readonly HISTORY_SIZE = 1000;

  async predictCompletion(context: DetectionContext): Promise<any> {
    // Simple heuristic-based prediction
    const features = this.extractFeatures(context);
    const confidence = this.calculateConfidence(features);

    return {
      confidence,
      features
    };
  }

  private extractFeatures(context: DetectionContext): any {
    const recentChanges = context.recentChanges || [];
    
    return {
      changeCount: recentChanges.length,
      changeRate: recentChanges.length / Math.max(1, (Date.now() - (recentChanges[0]?.timestamp || Date.now())) / 60000),
      fileTypes: new Set(recentChanges.map(c => path.extname(c.data?.path || ''))).size,
      hasTests: recentChanges.some(c => /\.test\.|\.spec\./.test(c.data?.path || '')),
      hasBuild: recentChanges.some(c => /build|dist|out/.test(c.data?.path || '')),
      idleTime: Date.now() - (recentChanges[recentChanges.length - 1]?.timestamp || Date.now())
    };
  }

  private calculateConfidence(features: any): number {
    let score = 0;

    // High change rate followed by idle
    if (features.changeRate > 5 && features.idleTime > 30000) {
      score += 0.3;
    }

    // Multiple file types
    if (features.fileTypes >= 3) {
      score += 0.2;
    }

    // Has test files
    if (features.hasTests) {
      score += 0.25;
    }

    // Has build output
    if (features.hasBuild) {
      score += 0.25;
    }

    return Math.min(score, 1);
  }

  async recordTrigger(
    context: DetectionContext,
    pattern: ActivityPattern,
    result: DetectionResult,
    success: boolean
  ): Promise<void> {
    // Record trigger for future learning
    this.triggerHistory.push({
      timestamp: new Date(),
      patternId: pattern.id,
      context: this.extractFeatures(context),
      result,
      success
    });

    // Trim history
    if (this.triggerHistory.length > this.HISTORY_SIZE) {
      this.triggerHistory = this.triggerHistory.slice(-this.HISTORY_SIZE);
    }
  }
}

// Export singleton instance
export const proactiveCollectionEngine = new ProactiveCollectionEngine();