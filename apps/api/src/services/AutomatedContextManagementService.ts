/**
 * Automated Context Management Service
 *
 * Monitors context window usage across all active farms and automatically
 * compresses context when approaching thresholds to maintain AI quality.
 * Integrates with WebSocket for real-time UI updates.
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { contextManager } from './contextManager';
import { db } from '../database/connection';
import { websocketHub } from './unified/websocketHub';

// Context thresholds configuration
const CONTEXT_THRESHOLDS = {
  WARNING: 0.75,      // 75% - yellow warning
  CAUTION: 0.85,      // 85% - orange caution
  CRITICAL: 0.95,     // 95% - red critical
  AUTO_COMPRESS: 0.90 // 90% - automatic compression trigger
};

// Compression targets based on severity
const COMPRESSION_TARGETS = {
  WARNING: 0.60,   // Compress to 60% when at warning
  CAUTION: 0.50,   // Compress to 50% when at caution
  CRITICAL: 0.40   // Compress to 40% when critical
};

interface MonitoredFarm {
  farmId: string;
  sessionId: string | null;
  lastCheck: Date;
  status: 'healthy' | 'warning' | 'caution' | 'critical';
  utilization: number;
  autoCompressionEnabled: boolean;
}

interface CompressionResult {
  farmId: string;
  sessionId: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensFreed: number;
  reason: string;
  timestamp: Date;
}

class AutomatedContextManagementService extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private monitoredFarms: Map<string, MonitoredFarm> = new Map();
  private compressionHistory: CompressionResult[] = [];
  private isRunning = false;
  private readonly MONITOR_INTERVAL = 30000; // Check every 30 seconds
  private readonly MAX_COMPRESSION_HISTORY = 100;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Start the automated context monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(LogCategory.SYSTEM, 'AutomatedContextManagementService already running');
      return;
    }

    this.isRunning = true;
    logger.info(LogCategory.SYSTEM, 'Starting Automated Context Management Service', {
      interval: this.MONITOR_INTERVAL,
      thresholds: CONTEXT_THRESHOLDS
    });

    // Initial scan
    await this.scanAllFarms();

    // Start periodic monitoring
    this.monitoringInterval = setInterval(
      () => this.monitorAllFarms(),
      this.MONITOR_INTERVAL
    );

    // Listen for context manager events
    contextManager.on('message:added', ({ sessionId }) => {
      this.checkSessionThreshold(sessionId);
    });

    contextManager.on('context:compressed', (data) => {
      this.emit('compression:completed', data);
      this.broadcastContextUpdate(data.sessionId);
    });
  }

  /**
   * Stop the automated context monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    logger.info(LogCategory.SYSTEM, 'Automated Context Management Service stopped');
  }

  /**
   * Scan all active farms and register them for monitoring
   */
  private async scanAllFarms(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT id, name, status, user_id
         FROM farms
         WHERE status IN ('running', 'active', 'launching')
         ORDER BY updated_at DESC`
      );

      for (const farm of result.rows) {
        await this.registerFarm(farm.id);
      }

      logger.info(LogCategory.SYSTEM, `Registered ${result.rows.length} farms for context monitoring`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Error scanning farms:', error);
    }
  }

  /**
   * Register a farm for context monitoring
   */
  async registerFarm(farmId: string): Promise<void> {
    const session = await contextManager.getSessionByFarmId(farmId);

    const monitoredFarm: MonitoredFarm = {
      farmId,
      sessionId: session?.id || null,
      lastCheck: new Date(),
      status: 'healthy',
      utilization: session ? session.tokenCount / session.maxTokens : 0,
      autoCompressionEnabled: session?.metadata?.compressionEnabled !== false
    };

    if (session) {
      monitoredFarm.status = this.getStatus(monitoredFarm.utilization);
    }

    this.monitoredFarms.set(farmId, monitoredFarm);
  }

  /**
   * Unregister a farm from monitoring
   */
  unregisterFarm(farmId: string): void {
    this.monitoredFarms.delete(farmId);
  }

  /**
   * Monitor all registered farms
   */
  private async monitorAllFarms(): Promise<void> {
    const farms = Array.from(this.monitoredFarms.values());

    for (const farm of farms) {
      try {
        await this.checkFarmContext(farm.farmId);
      } catch (error) {
        logger.error(LogCategory.SYSTEM, `Error monitoring farm ${farm.farmId}:`, error);
      }
    }
  }

  /**
   * Check a specific farm's context and take action if needed
   */
  private async checkFarmContext(farmId: string): Promise<void> {
    const session = await contextManager.getSessionByFarmId(farmId);

    if (!session) {
      return;
    }

    const utilization = session.tokenCount / session.maxTokens;
    const status = this.getStatus(utilization);
    const farm = this.monitoredFarms.get(farmId);

    if (farm) {
      const previousStatus = farm.status;
      farm.utilization = utilization;
      farm.status = status;
      farm.lastCheck = new Date();
      farm.sessionId = session.id;

      // Emit status change event if status changed
      if (previousStatus !== status) {
        this.emit('status:changed', {
          farmId,
          sessionId: session.id,
          previousStatus,
          newStatus: status,
          utilization
        });

        // Broadcast via WebSocket
        this.broadcastContextUpdate(session.id, {
          farmId,
          status,
          utilization,
          tokensUsed: session.tokenCount,
          maxTokens: session.maxTokens
        });

        // Log status changes
        logger.info(LogCategory.SYSTEM, `Context status changed for farm ${farmId}`, {
          previousStatus,
          newStatus: status,
          utilization: `${Math.round(utilization * 100)}%`
        });
      }

      // Check if auto-compression should trigger
      if (
        farm.autoCompressionEnabled &&
        utilization >= CONTEXT_THRESHOLDS.AUTO_COMPRESS &&
        session.metadata?.compressionEnabled !== false
      ) {
        await this.autoCompress(farmId, session.id, utilization);
      }
    }
  }

  /**
   * Check a specific session's threshold immediately
   */
  private async checkSessionThreshold(sessionId: string): Promise<void> {
    const sessions = contextManager.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) return;

    const utilization = session.tokenCount / session.maxTokens;

    if (utilization >= CONTEXT_THRESHOLDS.AUTO_COMPRESS) {
      const farm = this.monitoredFarms.get(session.farmId);

      if (farm?.autoCompressionEnabled && session.metadata?.compressionEnabled !== false) {
        await this.autoCompress(session.farmId, sessionId, utilization);
      }
    }
  }

  /**
   * Perform automatic context compression
   */
  private async autoCompress(
    farmId: string,
    sessionId: string,
    currentUtilization: number
  ): Promise<void> {
    let targetUtilization: number;
    let reason: string;

    if (currentUtilization >= CONTEXT_THRESHOLDS.CRITICAL) {
      targetUtilization = COMPRESSION_TARGETS.CRITICAL;
      reason = 'Critical threshold reached (95%+)';
    } else if (currentUtilization >= CONTEXT_THRESHOLDS.CAUTION) {
      targetUtilization = COMPRESSION_TARGETS.CAUTION;
      reason = 'Caution threshold reached (85%+)';
    } else {
      targetUtilization = COMPRESSION_TARGETS.WARNING;
      reason = 'Auto-compress threshold reached (90%+)';
    }

    try {
      const session = await contextManager.getSessionByFarmId(farmId);
      if (!session) return;

      const tokensBefore = session.tokenCount;
      const targetTokens = Math.floor(session.maxTokens * targetUtilization);
      const tokensToFree = tokensBefore - targetTokens;

      if (tokensToFree <= 0) return;

      logger.info(LogCategory.SYSTEM, `Auto-compressing context for farm ${farmId}`, {
        reason,
        currentUtilization: `${Math.round(currentUtilization * 100)}%`,
        targetUtilization: `${Math.round(targetUtilization * 100)}%`,
        tokensToFree
      });

      await contextManager.compressContext(sessionId, tokensToFree);

      // Get updated session
      const updatedSession = await contextManager.getSessionByFarmId(farmId);
      const tokensAfter = updatedSession?.tokenCount || 0;

      // Record compression
      const result: CompressionResult = {
        farmId,
        sessionId,
        tokensBefore,
        tokensAfter,
        tokensFreed: tokensBefore - tokensAfter,
        reason,
        timestamp: new Date()
      };

      this.recordCompression(result);

      // Emit events
      this.emit('auto-compression:completed', result);

      // Broadcast via WebSocket
      websocketHub.broadcast('context:compressed', {
        farmId,
        sessionId,
        ...result
      });

      logger.info(LogCategory.SYSTEM, `Auto-compression completed for farm ${farmId}`, {
        tokensFreed: result.tokensFreed,
        newUtilization: `${Math.round((tokensAfter / session.maxTokens) * 100)}%`
      });
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Auto-compression failed for farm ${farmId}:`, error);
      this.emit('auto-compression:failed', { farmId, sessionId, error });
    }
  }

  /**
   * Get status based on utilization
   */
  private getStatus(utilization: number): MonitoredFarm['status'] {
    if (utilization >= CONTEXT_THRESHOLDS.CRITICAL) {
      return 'critical';
    }
    if (utilization >= CONTEXT_THRESHOLDS.CAUTION) {
      return 'caution';
    }
    if (utilization >= CONTEXT_THRESHOLDS.WARNING) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Record a compression event
   */
  private recordCompression(result: CompressionResult): void {
    this.compressionHistory.push(result);

    // Trim history if needed
    if (this.compressionHistory.length > this.MAX_COMPRESSION_HISTORY) {
      this.compressionHistory = this.compressionHistory.slice(-this.MAX_COMPRESSION_HISTORY);
    }
  }

  /**
   * Broadcast context update via WebSocket
   */
  private broadcastContextUpdate(sessionId: string, data?: any): void {
    try {
      websocketHub.broadcast('context:updated', {
        sessionId,
        timestamp: new Date(),
        ...data
      });
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to broadcast context update:', error);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    monitoredFarms: number;
    totalCompressions: number;
    recentCompressions: CompressionResult[];
    farmsByStatus: Record<string, number>;
  } {
    const farmsByStatus: Record<string, number> = {
      healthy: 0,
      warning: 0,
      caution: 0,
      critical: 0
    };

    for (const farm of this.monitoredFarms.values()) {
      farmsByStatus[farm.status]++;
    }

    return {
      monitoredFarms: this.monitoredFarms.size,
      totalCompressions: this.compressionHistory.length,
      recentCompressions: this.compressionHistory.slice(-10),
      farmsByStatus
    };
  }

  /**
   * Get thresholds configuration
   */
  getThresholds(): typeof CONTEXT_THRESHOLDS {
    return { ...CONTEXT_THRESHOLDS };
  }

  /**
   * Update auto-compression setting for a farm
   */
  setAutoCompression(farmId: string, enabled: boolean): void {
    const farm = this.monitoredFarms.get(farmId);
    if (farm) {
      farm.autoCompressionEnabled = enabled;
      logger.info(LogCategory.SYSTEM, `Auto-compression ${enabled ? 'enabled' : 'disabled'} for farm ${farmId}`);
    }
  }
}

// Export singleton instance
export const automatedContextManagementService = new AutomatedContextManagementService();
