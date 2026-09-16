/**
 * Orchestrator Health Monitor Service
 *
 * Monitors orchestrator.py health status files and emits WebSocket events
 * when agent health changes are detected.
 */

import { watch, FSWatcher } from 'chokidar';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';

interface AgentHealthStatus {
  agent_id: number;
  agent_name: string;
  pane: string;
  session_name: string;
  farm_id: string;
  timestamp: string;
  pane_exists: boolean;
  has_output: boolean;
  output_size: number;
  status: 'healthy' | 'warning' | 'stuck' | 'error' | 'dead';
  uptime_seconds: number;
  issue?: string;
}

interface HealthSummary {
  farm_id: string;
  session_name: string;
  total_agents: number;
  timestamp: string;
  agents: AgentHealthStatus[];
  overall_status: 'healthy' | 'warning' | 'degraded' | 'critical' | 'unknown';
}

interface MonitoredFarm {
  farmId: string;
  coordinationDir: string;
  watcher: FSWatcher | null;
  lastStatus: HealthSummary | null;
  lastEmit: number;
  pollInterval: NodeJS.Timeout | null;
  startTime: number; // CRITICAL FIX: Track when monitoring started for grace period
}

class OrchestratorHealthMonitor {
  private static instance: OrchestratorHealthMonitor;
  private monitoredFarms = new Map<string, MonitoredFarm>();
  private readonly POLL_INTERVAL = 5000; // Poll every 5 seconds
  private readonly MIN_EMIT_INTERVAL = 2000; // Minimum 2s between emissions
  private readonly INITIALIZATION_GRACE_PERIOD = 45000; // CRITICAL FIX: 45 seconds grace period for orchestrator initialization

  private constructor() {
    logger.info(LogCategory.FARM, 'Orchestrator Health Monitor initialized');
  }

  static getInstance(): OrchestratorHealthMonitor {
    if (!this.instance) {
      this.instance = new OrchestratorHealthMonitor();
    }
    return this.instance;
  }

  /**
   * Start monitoring a farm's orchestrator health
   */
  async startMonitoring(farmId: string): Promise<void> {
    if (this.monitoredFarms.has(farmId)) {
      logger.debug(LogCategory.FARM, `Already monitoring farm ${farmId}`);
      return;
    }

    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );

    const monitoredFarm: MonitoredFarm = {
      farmId,
      coordinationDir,
      watcher: null,
      lastStatus: null,
      lastEmit: 0,
      pollInterval: null,
      startTime: Date.now() // CRITICAL FIX: Record start time for grace period
    };

    this.monitoredFarms.set(farmId, monitoredFarm);

    logger.info(LogCategory.FARM,
      `Farm ${farmId} has ${this.INITIALIZATION_GRACE_PERIOD / 1000}s grace period before emitting health warnings`);

    // Set up file watcher for the health summary file
    const summaryFile = path.join(coordinationDir, 'agents_health_summary.json');

    if (existsSync(summaryFile)) {
      this.setupFileWatcher(farmId, summaryFile);
    }

    // Also poll periodically in case file watcher misses updates
    this.setupPolling(farmId);

    logger.info(LogCategory.FARM, `Started health monitoring for farm ${farmId}`);
  }

  /**
   * Stop monitoring a farm
   */
  stopMonitoring(farmId: string): void {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    if (farm.watcher) {
      farm.watcher.close();
    }

    if (farm.pollInterval) {
      clearInterval(farm.pollInterval);
    }

    this.monitoredFarms.delete(farmId);

    logger.info(LogCategory.FARM, `Stopped health monitoring for farm ${farmId}`);
  }

  /**
   * Set up file watcher for health summary
   */
  private setupFileWatcher(farmId: string, summaryFile: string): void {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    const watcher = watch(summaryFile, {
      persistent: true,
      usePolling: true,
      interval: 1000,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    watcher.on('change', async () => {
      await this.checkHealth(farmId);
    });

    watcher.on('add', async () => {
      await this.checkHealth(farmId);
    });

    farm.watcher = watcher;

    logger.debug(LogCategory.FARM, `File watcher set up for ${summaryFile}`);
  }

  /**
   * Set up periodic polling as backup
   */
  private setupPolling(farmId: string): void {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    farm.pollInterval = setInterval(async () => {
      await this.checkHealth(farmId);
    }, this.POLL_INTERVAL);

    logger.debug(LogCategory.FARM, `Polling set up for farm ${farmId} (every ${this.POLL_INTERVAL}ms)`);
  }

  /**
   * Check health status from orchestrator files
   */
  private async checkHealth(farmId: string): Promise<void> {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    try {
      const summaryFile = path.join(farm.coordinationDir, 'agents_health_summary.json');

      if (!existsSync(summaryFile)) {
        logger.debug(LogCategory.FARM, `Health summary not found yet for ${farmId}`);
        return;
      }

      const content = await readFile(summaryFile, 'utf-8');
      const healthSummary: HealthSummary = JSON.parse(content);

      // Check if status has changed or enough time has passed
      const now = Date.now();
      const hasChanged = this.hasStatusChanged(farm.lastStatus, healthSummary);
      const shouldEmit = hasChanged || (now - farm.lastEmit > this.MIN_EMIT_INTERVAL);

      if (shouldEmit) {
        this.emitHealthUpdate(farmId, healthSummary);
        farm.lastStatus = healthSummary;
        farm.lastEmit = now;

        // Detect and handle critical issues
        this.handleHealthIssues(farmId, healthSummary);
      }

    } catch (error) {
      logger.error(LogCategory.FARM, `Error checking health for farm ${farmId}:`, error);
    }
  }

  /**
   * Check if health status has meaningfully changed
   */
  private hasStatusChanged(oldStatus: HealthSummary | null, newStatus: HealthSummary): boolean {
    if (!oldStatus) return true;

    // Check overall status change
    if (oldStatus.overall_status !== newStatus.overall_status) {
      return true;
    }

    // Check individual agent status changes
    for (let i = 0; i < newStatus.agents.length; i++) {
      const oldAgent = oldStatus.agents[i];
      const newAgent = newStatus.agents[i];

      if (!oldAgent || oldAgent.status !== newAgent.status) {
        return true;
      }
    }

    return false;
  }

  /**
   * Emit health update via WebSocket
   */
  private emitHealthUpdate(farmId: string, healthSummary: HealthSummary): void {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    // CRITICAL FIX: Skip emitting warnings during initialization grace period
    const timeSinceStart = Date.now() - farm.startTime;
    const inGracePeriod = timeSinceStart < this.INITIALIZATION_GRACE_PERIOD;

    const eventData = {
      farmId,
      ...healthSummary,
      monitoredAt: new Date()
    };

    // Broadcast to farm-specific rooms
    websocketManager.broadcastToFarm(farmId, 'farm:health:update', eventData);
    websocketManager.broadcast('orchestrator:health', eventData);

    if (inGracePeriod) {
      // During grace period, only log debug info
      logger.debug(LogCategory.FARM,
        `[GRACE PERIOD ${Math.floor(timeSinceStart / 1000)}s/${this.INITIALIZATION_GRACE_PERIOD / 1000}s] ` +
        `Farm ${farmId}: ${healthSummary.overall_status} ` +
        `(${healthSummary.agents.filter(a => a.status === 'healthy').length}/${healthSummary.total_agents} healthy) - suppressing warnings`
      );
      return; // Don't log individual agent warnings during grace period
    }

    logger.info(LogCategory.FARM,
      `Health update for farm ${farmId}: ${healthSummary.overall_status} ` +
      `(${healthSummary.agents.filter(a => a.status === 'healthy').length}/${healthSummary.total_agents} healthy)`
    );

    // Log individual agent issues
    for (const agent of healthSummary.agents) {
      if (agent.status !== 'healthy') {
        logger.warn(LogCategory.FARM,
          `Agent ${agent.agent_id} (${agent.agent_name}): ${agent.status} - ${agent.issue || 'unknown issue'}`
        );
      }
    }
  }

  /**
   * Handle critical health issues
   */
  private handleHealthIssues(farmId: string, healthSummary: HealthSummary): void {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) return;

    // CRITICAL FIX: Don't trigger recovery attempts during initialization grace period
    const timeSinceStart = Date.now() - farm.startTime;
    if (timeSinceStart < this.INITIALIZATION_GRACE_PERIOD) {
      logger.debug(LogCategory.FARM,
        `[GRACE PERIOD] Suppressing health issue handling for farm ${farmId} (${Math.floor(timeSinceStart / 1000)}s/${this.INITIALIZATION_GRACE_PERIOD / 1000}s)`
      );
      return;
    }

    const criticalAgents = healthSummary.agents.filter(a => a.status === 'dead' || a.status === 'error');

    if (criticalAgents.length > 0) {
      logger.error(LogCategory.FARM,
        `CRITICAL: Farm ${farmId} has ${criticalAgents.length} agents with critical issues`
      );

      // Emit critical alert
      websocketManager.broadcastToFarm(farmId, 'farm:health:critical', {
        farmId,
        timestamp: new Date(),
        criticalAgents: criticalAgents.map(a => ({
          id: a.agent_id,
          name: a.agent_name,
          status: a.status,
          issue: a.issue
        })),
        message: `${criticalAgents.length} agent(s) have critical issues`
      });
    }

    // Detect stuck agents
    const stuckAgents = healthSummary.agents.filter(a => a.status === 'stuck');
    if (stuckAgents.length > 0) {
      logger.warn(LogCategory.FARM,
        `Farm ${farmId} has ${stuckAgents.length} potentially stuck agents`
      );

      websocketManager.broadcastToFarm(farmId, 'farm:health:warning', {
        farmId,
        timestamp: new Date(),
        stuckAgents: stuckAgents.map(a => ({
          id: a.agent_id,
          name: a.agent_name,
          uptime: a.uptime_seconds
        })),
        message: `${stuckAgents.length} agent(s) may be stuck (no recent output)`
      });
    }
  }

  /**
   * Get current health status for a farm
   */
  async getHealthStatus(farmId: string): Promise<HealthSummary | null> {
    const farm = this.monitoredFarms.get(farmId);
    if (!farm) {
      logger.debug(LogCategory.FARM, `Farm ${farmId} not being monitored`);
      return null;
    }

    try {
      const summaryFile = path.join(farm.coordinationDir, 'agents_health_summary.json');

      if (!existsSync(summaryFile)) {
        return null;
      }

      const content = await readFile(summaryFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(LogCategory.FARM, `Error reading health status for farm ${farmId}:`, error);
      return null;
    }
  }

  /**
   * Get list of all monitored farms
   */
  getMonitoredFarms(): string[] {
    return Array.from(this.monitoredFarms.keys());
  }
}

export const orchestratorHealthMonitor = OrchestratorHealthMonitor.getInstance();
export default orchestratorHealthMonitor;
