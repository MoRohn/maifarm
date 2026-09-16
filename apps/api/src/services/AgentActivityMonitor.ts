/**
 * Agent Activity Monitor
 *
 * Tracks real-time agent activity and provides heartbeat detection
 * to identify idle, stuck, or disconnected agents
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { pathConfig } from '../config/paths';
import { getHealthThresholds, isExtendedSession } from '../config/farmModeOptimizations';

const execAsync = promisify(exec);

// Activity type detection patterns
const ACTIVITY_PATTERNS = {
  coding: [
    /writing.*file/i, /saving/i, /edited/i, /created.*file/i,
    /git\s+(add|commit|push|pull)/i, /npm\s+(install|run)/i,
    /function\s+\w+/i, /class\s+\w+/i, /const\s+\w+/i
  ],
  thinking: [
    /analyzing/i, /thinking/i, /planning/i, /considering/i,
    /reviewing/i, /examining/i, /let me/i, /i need to/i,
    /understanding/i, /researching/i
  ],
  error: [
    /error:/i, /exception/i, /failed/i, /fatal/i,
    /traceback/i, /stack trace/i, /undefined/i
  ]
} as const;

type ActivityType = 'coding' | 'thinking' | 'idle' | 'error';

interface AgentActivity {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  sessionName: string;

  // Activity tracking
  lastHeartbeat: Date;
  lastOutputTime: Date;
  outputLineCount: number;
  lastKnownCommand?: string;
  lastActivityType: ActivityType;

  // Status
  status: 'active' | 'idle' | 'stuck' | 'disconnected' | 'completed';
  isHealthy: boolean;
  consecutiveIdleChecks: number;

  // Performance metrics
  totalOutputBytes: number;
  averageResponseTime: number;
  errorCount: number;
}

interface FarmMonitorConfig {
  farmId: string;
  timeoutSeconds: number;
  isExtended: boolean;
  thresholds: {
    idleThreshold: number;
    stuckThreshold: number;
    disconnectedThreshold: number;
    maxConsecutiveIdle: number;
  };
}

interface FarmActivitySummary {
  farmId: string;
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  stuckAgents: number;
  disconnectedAgents: number;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
}

export class AgentActivityMonitor extends EventEmitter {
  private static instance: AgentActivityMonitor;
  private activities = new Map<string, AgentActivity>(); // farmId:agentIndex -> activity
  private farmAgents = new Map<string, Set<string>>(); // farmId -> Set<agentKeys>
  private monitorIntervals = new Map<string, NodeJS.Timeout>(); // farmId -> interval
  private farmConfigs = new Map<string, FarmMonitorConfig>(); // farmId -> config

  // Configuration - defaults, can be overridden per-farm
  private readonly HEARTBEAT_INTERVAL = 5000; // Check every 5 seconds
  // NOTE: Thresholds are now dynamic based on session duration - see getFarmThresholds()

  private constructor() {
    super();
    logger.info(LogCategory.MONITORING, 'AgentActivityMonitor initialized with dynamic thresholds');
  }

  /**
   * Get thresholds for a farm (uses dynamic config or defaults)
   */
  private getFarmThresholds(farmId: string): FarmMonitorConfig['thresholds'] {
    const config = this.farmConfigs.get(farmId);
    if (config) {
      return config.thresholds;
    }
    // Default to standard thresholds
    return getHealthThresholds(3600); // 1 hour default
  }

  /**
   * Detect activity type from terminal output
   * Used to adjust thresholds (thinking gets 1.5x, errors get 0.5x)
   */
  private detectActivityType(output: string): ActivityType {
    // Check for errors first (highest priority)
    for (const pattern of ACTIVITY_PATTERNS.error) {
      if (pattern.test(output)) {
        return 'error';
      }
    }

    // Check for coding patterns (file writes, git ops)
    for (const pattern of ACTIVITY_PATTERNS.coding) {
      if (pattern.test(output)) {
        return 'coding';
      }
    }

    // Check for thinking patterns
    for (const pattern of ACTIVITY_PATTERNS.thinking) {
      if (pattern.test(output)) {
        return 'thinking';
      }
    }

    // Default to idle if no patterns match
    return 'idle';
  }

  /**
   * Get adjusted threshold based on activity type
   * - Coding: standard thresholds
   * - Thinking: 1.5x thresholds (allow more thinking time)
   * - Error: 0.5x thresholds (quick response needed)
   */
  private getAdjustedThreshold(baseThreshold: number, activityType: ActivityType): number {
    switch (activityType) {
      case 'thinking':
        return baseThreshold * 1.5;
      case 'error':
        return baseThreshold * 0.5;
      default:
        return baseThreshold;
    }
  }

  static getInstance(): AgentActivityMonitor {
    if (!AgentActivityMonitor.instance) {
      AgentActivityMonitor.instance = new AgentActivityMonitor();
    }
    return AgentActivityMonitor.instance;
  }

  /**
   * Register a farm for activity monitoring
   * @param timeoutSeconds - Session duration in seconds, used to determine threshold configuration
   */
  async registerFarm(
    farmId: string,
    sessionName: string,
    agentCount: number,
    agentNames: string[],
    timeoutSeconds: number = 7200 // Default to 2 hours for extended sessions
  ): Promise<void> {
    // Configure thresholds based on session duration
    const thresholds = getHealthThresholds(timeoutSeconds);
    const extended = isExtendedSession(timeoutSeconds);

    logger.info(LogCategory.MONITORING,
      `Registering activity monitoring for farm ${farmId} with ${agentCount} agents ` +
      `(${extended ? 'extended' : 'standard'} session: ${timeoutSeconds}s, ` +
      `idle=${thresholds.idleThreshold}ms, stuck=${thresholds.stuckThreshold}ms)`);

    // Store farm configuration
    this.farmConfigs.set(farmId, {
      farmId,
      timeoutSeconds,
      isExtended: extended,
      thresholds
    });

    // Initialize farm agent set
    if (!this.farmAgents.has(farmId)) {
      this.farmAgents.set(farmId, new Set());
    }

    // Register each agent
    for (let i = 0; i < agentCount; i++) {
      const agentKey = `${farmId}:${i}`;
      const agentName = agentNames[i] || `Agent ${i + 1}`;

      // Get agent ID from database
      const agentResult = await db.query(
        'SELECT id FROM agents WHERE farm_id = $1 AND pane_index = $2',
        [farmId, i]
      );

      const agentId = agentResult.rows[0]?.id || `temp-${farmId}-${i}`;

      const activity: AgentActivity = {
        farmId,
        agentId,
        agentIndex: i,
        agentName,
        sessionName,
        lastHeartbeat: new Date(),
        lastOutputTime: new Date(),
        outputLineCount: 0,
        lastActivityType: 'idle',
        status: 'active',
        isHealthy: true,
        consecutiveIdleChecks: 0,
        totalOutputBytes: 0,
        averageResponseTime: 0,
        errorCount: 0
      };

      this.activities.set(agentKey, activity);
      this.farmAgents.get(farmId)!.add(agentKey);
    }

    // Start monitoring for this farm
    this.startMonitoring(farmId);

    logger.info(LogCategory.MONITORING,
      `Activity monitoring started for ${agentCount} agents in farm ${farmId}`);
  }

  /**
   * Start monitoring a farm
   */
  private startMonitoring(farmId: string): void {
    // Clear existing interval if any
    if (this.monitorIntervals.has(farmId)) {
      clearInterval(this.monitorIntervals.get(farmId)!);
    }

    // Set up heartbeat monitoring
    const interval = setInterval(async () => {
      await this.performHeartbeatCheck(farmId);
    }, this.HEARTBEAT_INTERVAL);

    this.monitorIntervals.set(farmId, interval);
  }

  /**
   * Perform heartbeat check for all agents in a farm
   * Uses dynamic thresholds based on session duration and activity type
   */
  private async performHeartbeatCheck(farmId: string): Promise<void> {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return;

    const now = Date.now();
    let activeCount = 0;
    let idleCount = 0;
    let stuckCount = 0;
    let disconnectedCount = 0;

    // Get dynamic thresholds for this farm
    const thresholds = this.getFarmThresholds(farmId);

    for (const agentKey of agentKeys) {
      const activity = this.activities.get(agentKey);
      if (!activity) continue;

      // Check terminal output for new content
      const { hasNewOutput, newContent } = await this.checkForNewOutputWithContent(activity);

      if (hasNewOutput) {
        // Detect activity type for threshold adjustment
        activity.lastActivityType = this.detectActivityType(newContent);

        // Agent is active
        activity.lastOutputTime = new Date();
        activity.lastHeartbeat = new Date();
        activity.status = 'active';
        activity.consecutiveIdleChecks = 0;
        activity.isHealthy = true;
        activeCount++;
      } else {
        // Check how long since last output
        const timeSinceOutput = now - activity.lastOutputTime.getTime();

        // Adjust thresholds based on last known activity type
        const idleThreshold = this.getAdjustedThreshold(thresholds.idleThreshold, activity.lastActivityType);
        const stuckThreshold = this.getAdjustedThreshold(thresholds.stuckThreshold, activity.lastActivityType);
        const disconnectedThreshold = this.getAdjustedThreshold(thresholds.disconnectedThreshold, activity.lastActivityType);

        if (timeSinceOutput > disconnectedThreshold) {
          activity.status = 'disconnected';
          activity.isHealthy = false;
          activity.consecutiveIdleChecks++;
          disconnectedCount++;

          // Emit warning
          this.emit('agent:disconnected', {
            farmId: activity.farmId,
            agentId: activity.agentId,
            agentName: activity.agentName,
            timeSinceOutput,
            thresholdUsed: disconnectedThreshold,
            activityType: activity.lastActivityType
          });
        } else if (timeSinceOutput > stuckThreshold) {
          activity.status = 'stuck';
          activity.isHealthy = false;
          activity.consecutiveIdleChecks++;
          stuckCount++;

          // Emit alert
          this.emit('agent:stuck', {
            farmId: activity.farmId,
            agentId: activity.agentId,
            agentName: activity.agentName,
            timeSinceOutput,
            thresholdUsed: stuckThreshold,
            activityType: activity.lastActivityType
          });
        } else if (timeSinceOutput > idleThreshold) {
          activity.status = 'idle';
          activity.consecutiveIdleChecks++;
          idleCount++;

          // Check if agent is still responding
          const isPaneAlive = await this.checkPaneAlive(activity);
          activity.isHealthy = isPaneAlive;

          if (!isPaneAlive) {
            this.emit('agent:unresponsive', {
              farmId: activity.farmId,
              agentId: activity.agentId,
              agentName: activity.agentName
            });
          }
        } else {
          // Recently active
          activity.status = 'active';
          activeCount++;
        }
      }

      // Update heartbeat
      activity.lastHeartbeat = new Date();
    }

    // Calculate overall farm health
    const totalAgents = agentKeys.size;
    const healthyPercentage = (activeCount / totalAgents) * 100;

    let overallHealth: 'healthy' | 'degraded' | 'critical';
    if (healthyPercentage >= 80) {
      overallHealth = 'healthy';
    } else if (healthyPercentage >= 50) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }

    // Broadcast farm activity summary
    const summary: FarmActivitySummary = {
      farmId,
      totalAgents,
      activeAgents: activeCount,
      idleAgents: idleCount,
      stuckAgents: stuckCount,
      disconnectedAgents: disconnectedCount,
      overallHealth,
      timestamp: new Date()
    };

    // Emit events for monitoring
    this.emit('farm:activity-update', summary);

    // Broadcast to WebSocket clients
    websocketManager.broadcastToFarm(farmId, 'farm:activity', summary);

    // Log if health is degraded or critical
    if (overallHealth !== 'healthy') {
      logger.warn(LogCategory.MONITORING,
        `Farm ${farmId} health ${overallHealth}: ` +
        `${activeCount}/${totalAgents} active, ` +
        `${stuckCount} stuck, ${disconnectedCount} disconnected`
      );
    }
  }

  /**
   * Check for new output in agent terminal log (legacy compatibility)
   */
  private async checkForNewOutput(activity: AgentActivity): Promise<boolean> {
    const result = await this.checkForNewOutputWithContent(activity);
    return result.hasNewOutput;
  }

  /**
   * Check for new output in agent terminal log and return content for analysis
   */
  private async checkForNewOutputWithContent(activity: AgentActivity): Promise<{ hasNewOutput: boolean; newContent: string }> {
    try {
      const terminalPath = pathConfig.getTerminalLogPath(activity.farmId, activity.agentIndex);

      const stats = await fs.stat(terminalPath);
      const currentSize = stats.size;

      // Check if file has grown
      if (currentSize > activity.totalOutputBytes) {
        const newBytes = currentSize - activity.totalOutputBytes;
        const readPosition = activity.totalOutputBytes;
        activity.totalOutputBytes = currentSize;

        // Read new content to count lines and for activity detection
        const fd = await fs.open(terminalPath, 'r');
        const buffer = Buffer.alloc(newBytes);
        await fd.read(buffer, 0, newBytes, readPosition);
        await fd.close();

        const newContent = buffer.toString('utf-8');
        const newLines = newContent.split('\n').length;
        activity.outputLineCount += newLines;

        return {
          hasNewOutput: newBytes > 10, // At least 10 bytes = meaningful output
          newContent
        };
      }

      return { hasNewOutput: false, newContent: '' };
    } catch (error) {
      // File might not exist yet
      return { hasNewOutput: false, newContent: '' };
    }
  }

  /**
   * Check if tmux pane is still alive and responding
   */
  private async checkPaneAlive(activity: AgentActivity): Promise<boolean> {
    try {
      const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
      const paneTarget = `${activity.sessionName}:agents.${activity.agentIndex}`;

      // Try to send a harmless command to check if pane responds
      await execAsync(
        `TMUX_TMPDIR=${tmuxTmpDir} tmux display-message -t ${paneTarget} -p "#{pane_id}"`,
        { timeout: 2000 }
      );

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Record agent activity manually (e.g., from terminal streaming service)
   */
  recordActivity(farmId: string, agentIndex: number, outputBytes: number): void {
    const agentKey = `${farmId}:${agentIndex}`;
    const activity = this.activities.get(agentKey);

    if (activity) {
      activity.lastOutputTime = new Date();
      activity.lastHeartbeat = new Date();
      activity.totalOutputBytes += outputBytes;
      activity.status = 'active';
      activity.consecutiveIdleChecks = 0;
      activity.isHealthy = true;
    }
  }

  /**
   * Get activity for a specific agent
   */
  getAgentActivity(farmId: string, agentIndex: number): AgentActivity | undefined {
    const agentKey = `${farmId}:${agentIndex}`;
    return this.activities.get(agentKey);
  }

  /**
   * Get activity summary for a farm
   */
  getFarmActivitySummary(farmId: string): FarmActivitySummary | null {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return null;

    let activeCount = 0;
    let idleCount = 0;
    let stuckCount = 0;
    let disconnectedCount = 0;

    for (const agentKey of agentKeys) {
      const activity = this.activities.get(agentKey);
      if (!activity) continue;

      switch (activity.status) {
        case 'active':
          activeCount++;
          break;
        case 'idle':
          idleCount++;
          break;
        case 'stuck':
          stuckCount++;
          break;
        case 'disconnected':
          disconnectedCount++;
          break;
      }
    }

    const totalAgents = agentKeys.size;
    const healthyPercentage = (activeCount / totalAgents) * 100;

    let overallHealth: 'healthy' | 'degraded' | 'critical';
    if (healthyPercentage >= 80) {
      overallHealth = 'healthy';
    } else if (healthyPercentage >= 50) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }

    return {
      farmId,
      totalAgents,
      activeAgents: activeCount,
      idleAgents: idleCount,
      stuckAgents: stuckCount,
      disconnectedAgents: disconnectedCount,
      overallHealth,
      timestamp: new Date()
    };
  }

  /**
   * Get all agent activities for a farm
   */
  getFarmAgentActivities(farmId: string): AgentActivity[] {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return [];

    const activities: AgentActivity[] = [];
    for (const agentKey of agentKeys) {
      const activity = this.activities.get(agentKey);
      if (activity) {
        activities.push(activity);
      }
    }

    return activities;
  }

  /**
   * Stop monitoring a farm
   */
  stopMonitoring(farmId: string): void {
    // Clear interval
    const interval = this.monitorIntervals.get(farmId);
    if (interval) {
      clearInterval(interval);
      this.monitorIntervals.delete(farmId);
    }

    // Clean up activities
    const agentKeys = this.farmAgents.get(farmId);
    if (agentKeys) {
      for (const agentKey of agentKeys) {
        this.activities.delete(agentKey);
      }
      this.farmAgents.delete(farmId);
    }

    logger.info(LogCategory.MONITORING, `Activity monitoring stopped for farm ${farmId}`);
  }

  /**
   * Get statistics for all monitored farms
   */
  getGlobalStatistics(): {
    totalFarms: number;
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    stuckAgents: number;
    disconnectedAgents: number;
  } {
    let totalAgents = 0;
    let activeAgents = 0;
    let idleAgents = 0;
    let stuckAgents = 0;
    let disconnectedAgents = 0;

    for (const activity of this.activities.values()) {
      totalAgents++;
      switch (activity.status) {
        case 'active':
          activeAgents++;
          break;
        case 'idle':
          idleAgents++;
          break;
        case 'stuck':
          stuckAgents++;
          break;
        case 'disconnected':
          disconnectedAgents++;
          break;
      }
    }

    return {
      totalFarms: this.farmAgents.size,
      totalAgents,
      activeAgents,
      idleAgents,
      stuckAgents,
      disconnectedAgents
    };
  }

  /**
   * Shutdown monitoring service
   */
  shutdown(): void {
    logger.info(LogCategory.MONITORING, 'Shutting down AgentActivityMonitor');

    // Clear all intervals
    for (const interval of this.monitorIntervals.values()) {
      clearInterval(interval);
    }

    this.monitorIntervals.clear();
    this.activities.clear();
    this.farmAgents.clear();
    this.removeAllListeners();
  }
}

export const agentActivityMonitor = AgentActivityMonitor.getInstance();
export { AgentActivity, FarmActivitySummary };
