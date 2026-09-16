/**
 * Agent Activity Heartbeat Service
 *
 * Real-time agent activity monitoring and broadcasting system that provides
 * sub-second latency updates to the frontend for live streaming UX.
 *
 * Features:
 * - Real-time heartbeat tracking (500ms interval)
 * - Guaranteed delivery via Event Outbox integration
 * - Activity change detection and broadcasting
 * - Last seen tracking with automatic stale detection
 * - Performance metrics for monitoring
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { eventOutboxService } from './EventOutboxService';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface AgentActivity {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;

  // Activity tracking
  lastSeen: number;
  lastHeartbeat: number;
  lastOutputTime: number;
  lastStatusChange: number;

  // State
  status: 'initializing' | 'active' | 'idle' | 'processing' | 'completed' | 'error';
  isActive: boolean;
  isStreaming: boolean;

  // Metrics
  heartbeatCount: number;
  outputLineCount: number;
  errorCount: number;

  // Performance
  avgResponseTime: number;
  cpuUsage?: number;
  memoryUsage?: number;
}

interface ActivityMetrics {
  totalAgents: number;
  activeAgents: number;
  streamingAgents: number;
  idleAgents: number;
  errorAgents: number;
  avgHeartbeatLatency: number;
  totalHeartbeats: number;
  missedHeartbeats: number;
}

interface HeartbeatConfig {
  heartbeatInterval: number;      // How often to check activity (500ms)
  staleThreshold: number;          // When to mark as stale (5s)
  broadcastThrottle: number;       // Min time between broadcasts (250ms)
  guaranteedDelivery: boolean;    // Use Event Outbox for critical updates
  trackPerformance: boolean;       // Track CPU/memory metrics
}

// ============================================================================
// Agent Activity Heartbeat Service
// ============================================================================

export class AgentActivityHeartbeatService extends EventEmitter {
  private static instance: AgentActivityHeartbeatService;

  // Activity tracking
  private activities = new Map<string, AgentActivity>(); // farmId:agentIndex -> activity
  private lastBroadcast = new Map<string, number>(); // farmId:agentIndex -> timestamp

  // Intervals
  private heartbeatInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  // Metrics
  private metrics: ActivityMetrics = {
    totalAgents: 0,
    activeAgents: 0,
    streamingAgents: 0,
    idleAgents: 0,
    errorAgents: 0,
    avgHeartbeatLatency: 0,
    totalHeartbeats: 0,
    missedHeartbeats: 0
  };

  // Configuration
  private config: HeartbeatConfig = {
    heartbeatInterval: 500,          // 500ms = real-time feel
    staleThreshold: 5000,            // 5s without activity = stale
    broadcastThrottle: 250,          // Max 4 broadcasts/second per agent
    guaranteedDelivery: true,        // Use Event Outbox for status changes
    trackPerformance: true           // Track performance metrics
  };

  private constructor() {
    super();
    this.startHeartbeatMonitoring();
    this.startMetricsCollection();
    logger.info(LogCategory.AGENT, 'AgentActivityHeartbeatService initialized');
  }

  static getInstance(): AgentActivityHeartbeatService {
    if (!AgentActivityHeartbeatService.instance) {
      AgentActivityHeartbeatService.instance = new AgentActivityHeartbeatService();
    }
    return AgentActivityHeartbeatService.instance;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Register an agent for activity tracking
   */
  registerAgent(
    farmId: string,
    agentIndex: number,
    agentId: string,
    agentName: string
  ): void {
    const key = this.getActivityKey(farmId, agentIndex);

    const activity: AgentActivity = {
      farmId,
      agentId,
      agentIndex,
      agentName,
      lastSeen: Date.now(),
      lastHeartbeat: Date.now(),
      lastOutputTime: 0,
      lastStatusChange: Date.now(),
      status: 'initializing',
      isActive: true,
      isStreaming: false,
      heartbeatCount: 0,
      outputLineCount: 0,
      errorCount: 0,
      avgResponseTime: 0
    };

    this.activities.set(key, activity);
    this.metrics.totalAgents++;

    logger.info(LogCategory.AGENT,
      `Registered agent activity: ${agentName} (${farmId}:${agentIndex})`);

    // Broadcast initial status
    this.broadcastActivityUpdate(activity, 'registered');
  }

  /**
   * Update agent activity (called when terminal output or status changes)
   */
  updateActivity(
    farmId: string,
    agentIndex: number,
    updates: {
      status?: AgentActivity['status'];
      isStreaming?: boolean;
      outputLineCount?: number;
      errorCount?: number;
      cpuUsage?: number;
      memoryUsage?: number;
    }
  ): void {
    const key = this.getActivityKey(farmId, agentIndex);
    const activity = this.activities.get(key);

    if (!activity) {
      logger.warn(LogCategory.AGENT,
        `Activity not found for ${farmId}:${agentIndex}`);
      return;
    }

    const now = Date.now();
    let statusChanged = false;

    // Update activity
    activity.lastSeen = now;
    activity.lastHeartbeat = now;
    activity.heartbeatCount++;

    if (updates.status && updates.status !== activity.status) {
      activity.status = updates.status;
      activity.lastStatusChange = now;
      statusChanged = true;
    }

    if (updates.isStreaming !== undefined) {
      activity.isStreaming = updates.isStreaming;
    }

    if (updates.outputLineCount !== undefined) {
      const newLines = updates.outputLineCount - activity.outputLineCount;
      if (newLines > 0) {
        activity.outputLineCount = updates.outputLineCount;
        activity.lastOutputTime = now;
      }
    }

    if (updates.errorCount !== undefined) {
      activity.errorCount = updates.errorCount;
    }

    if (updates.cpuUsage !== undefined) {
      activity.cpuUsage = updates.cpuUsage;
    }

    if (updates.memoryUsage !== undefined) {
      activity.memoryUsage = updates.memoryUsage;
    }

    // Calculate avg response time (simple moving average)
    const timeSinceLastOutput = now - activity.lastOutputTime;
    activity.avgResponseTime = activity.avgResponseTime === 0
      ? timeSinceLastOutput
      : (activity.avgResponseTime * 0.9 + timeSinceLastOutput * 0.1);

    // Broadcast if status changed or enough time passed since last broadcast
    const shouldBroadcast = statusChanged ||
      this.shouldBroadcastActivity(key, now);

    if (shouldBroadcast) {
      this.broadcastActivityUpdate(activity, statusChanged ? 'status_change' : 'heartbeat');
      this.lastBroadcast.set(key, now);
    }
  }

  /**
   * Record terminal output for an agent (updates last seen and output count)
   */
  recordTerminalOutput(farmId: string, agentIndex: number, lineCount: number): void {
    const key = this.getActivityKey(farmId, agentIndex);
    const activity = this.activities.get(key);

    if (!activity) return;

    const now = Date.now();
    activity.lastSeen = now;
    activity.lastOutputTime = now;
    activity.outputLineCount += lineCount;
    activity.isStreaming = true;

    // If agent was idle, mark as active
    if (activity.status === 'idle') {
      this.updateActivity(farmId, agentIndex, { status: 'active' });
    }
  }

  /**
   * Unregister agent (when farm stops or agent terminates)
   */
  unregisterAgent(farmId: string, agentIndex: number): void {
    const key = this.getActivityKey(farmId, agentIndex);
    const activity = this.activities.get(key);

    if (activity) {
      this.activities.delete(key);
      this.lastBroadcast.delete(key);
      this.metrics.totalAgents--;

      logger.info(LogCategory.AGENT,
        `Unregistered agent activity: ${activity.agentName}`);

      // Broadcast final status
      this.broadcastActivityUpdate(activity, 'unregistered');
    }
  }

  /**
   * Get activity for a specific agent
   */
  getActivity(farmId: string, agentIndex: number): AgentActivity | null {
    const key = this.getActivityKey(farmId, agentIndex);
    return this.activities.get(key) || null;
  }

  /**
   * Get all activities for a farm
   */
  getFarmActivities(farmId: string): AgentActivity[] {
    const activities: AgentActivity[] = [];

    for (const [key, activity] of this.activities.entries()) {
      if (activity.farmId === farmId) {
        activities.push(activity);
      }
    }

    return activities.sort((a, b) => a.agentIndex - b.agentIndex);
  }

  /**
   * Get service metrics
   */
  getMetrics(): ActivityMetrics {
    return { ...this.metrics };
  }

  // ============================================================================
  // Private Methods - Heartbeat Monitoring
  // ============================================================================

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeatCheck();
    }, this.config.heartbeatInterval);

    logger.info(LogCategory.AGENT,
      `Heartbeat monitoring started (interval: ${this.config.heartbeatInterval}ms)`);
  }

  private async performHeartbeatCheck(): Promise<void> {
    const now = Date.now();
    let activeCount = 0;
    let streamingCount = 0;
    let idleCount = 0;
    let errorCount = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const [key, activity] of this.activities.entries()) {
      // Check if agent is stale (no activity for threshold period)
      const timeSinceLastSeen = now - activity.lastSeen;
      const isStale = timeSinceLastSeen > this.config.staleThreshold;

      if (isStale && activity.status !== 'idle' && activity.status !== 'completed') {
        // Mark as idle
        activity.status = 'idle';
        activity.isStreaming = false;
        activity.lastStatusChange = now;
        this.metrics.missedHeartbeats++;

        // Broadcast status change
        this.broadcastActivityUpdate(activity, 'stale_detected');
        this.lastBroadcast.set(key, now);

        logger.debug(LogCategory.AGENT,
          `Agent ${activity.agentName} marked as idle (${timeSinceLastSeen}ms since last activity)`);
      }

      // Update metrics
      if (activity.status === 'active' || activity.status === 'processing') {
        activeCount++;
      } else if (activity.status === 'idle') {
        idleCount++;
      } else if (activity.status === 'error') {
        errorCount++;
      }

      if (activity.isStreaming) {
        streamingCount++;
      }

      // Track heartbeat latency
      const heartbeatLatency = now - activity.lastHeartbeat;
      totalLatency += heartbeatLatency;
      latencyCount++;
    }

    // Update global metrics
    this.metrics.activeAgents = activeCount;
    this.metrics.streamingAgents = streamingCount;
    this.metrics.idleAgents = idleCount;
    this.metrics.errorAgents = errorCount;
    this.metrics.totalHeartbeats++;

    if (latencyCount > 0) {
      this.metrics.avgHeartbeatLatency = totalLatency / latencyCount;
    }
  }

  private shouldBroadcastActivity(key: string, now: number): boolean {
    const lastBroadcastTime = this.lastBroadcast.get(key) || 0;
    const timeSinceLastBroadcast = now - lastBroadcastTime;

    return timeSinceLastBroadcast >= this.config.broadcastThrottle;
  }

  private async broadcastActivityUpdate(
    activity: AgentActivity,
    changeType: 'registered' | 'unregistered' | 'heartbeat' | 'status_change' | 'stale_detected'
  ): Promise<void> {
    const payload = {
      farmId: activity.farmId,
      agentId: activity.agentId,
      agentIndex: activity.agentIndex,
      agentName: activity.agentName,
      status: activity.status,
      isActive: activity.isActive,
      isStreaming: activity.isStreaming,
      lastSeen: activity.lastSeen,
      lastOutputTime: activity.lastOutputTime,
      outputLineCount: activity.outputLineCount,
      errorCount: activity.errorCount,
      heartbeatCount: activity.heartbeatCount,
      avgResponseTime: activity.avgResponseTime,
      cpuUsage: activity.cpuUsage,
      memoryUsage: activity.memoryUsage,
      changeType,
      timestamp: new Date().toISOString()
    };

    // Use Event Outbox for guaranteed delivery on critical updates
    if (this.config.guaranteedDelivery && (changeType === 'status_change' || changeType === 'registered')) {
      try {
        await eventOutboxService.publishIdempotent(
          'agent:activity:update',
          payload,
          {
            aggregateId: `${activity.farmId}:${activity.agentIndex}`,
            aggregateType: 'agent',
            priority: changeType === 'status_change' ? 1 : 2,
            targetRoom: `farm:${activity.farmId}`
          }
        );

        logger.debug(LogCategory.AGENT,
          `Agent activity update queued for guaranteed delivery: ${activity.agentName}`);
      } catch (error) {
        logger.error(LogCategory.AGENT,
          `Failed to queue agent activity update: ${error}`);
        // Fallback to direct broadcast
        this.directBroadcast(activity.farmId, payload);
      }
    } else {
      // Direct broadcast for non-critical updates (heartbeat, stale detection)
      this.directBroadcast(activity.farmId, payload);
    }

    // Emit local event
    this.emit('activity:update', payload);
  }

  private directBroadcast(farmId: string, payload: any): void {
    try {
      logger.info(LogCategory.AGENT,
        `Broadcasting agent activity: ${payload.agentName} (${payload.changeType}) to farm:${farmId}`);

      websocketManager.sendToRoom(`farm:${farmId}`, 'agent:activity:update', payload);
      websocketManager.broadcast('agent:activity:update', payload); // Also broadcast globally
    } catch (error) {
      logger.error(LogCategory.AGENT,
        `Failed to broadcast agent activity: ${error}`);
    }
  }

  // ============================================================================
  // Private Methods - Metrics Collection
  // ============================================================================

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds
  }

  private collectMetrics(): void {
    logger.info(LogCategory.AGENT, 'Agent Activity Metrics:', {
      totalAgents: this.metrics.totalAgents,
      activeAgents: this.metrics.activeAgents,
      streamingAgents: this.metrics.streamingAgents,
      idleAgents: this.metrics.idleAgents,
      errorAgents: this.metrics.errorAgents,
      avgHeartbeatLatency: `${this.metrics.avgHeartbeatLatency.toFixed(2)}ms`,
      totalHeartbeats: this.metrics.totalHeartbeats,
      missedHeartbeats: this.metrics.missedHeartbeats,
      heartbeatHealth: `${((this.metrics.totalHeartbeats - this.metrics.missedHeartbeats) / Math.max(1, this.metrics.totalHeartbeats) * 100).toFixed(2)}%`
    });

    // Emit metrics event
    this.emit('metrics', this.metrics);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private getActivityKey(farmId: string, agentIndex: number): string {
    return `${farmId}:${agentIndex}`;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.AGENT, 'Shutting down AgentActivityHeartbeatService');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.activities.clear();
    this.lastBroadcast.clear();

    logger.info(LogCategory.AGENT, 'AgentActivityHeartbeatService shutdown complete');
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const agentActivityHeartbeatService = AgentActivityHeartbeatService.getInstance();
