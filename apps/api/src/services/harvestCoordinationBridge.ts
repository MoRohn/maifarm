/**
 * Harvest Coordination Bridge Service
 *
 * Bridges the gap between Python orchestrator and TypeScript harvest service by:
 * - Watching coordination directory for harvest signals
 * - Detecting agent completion status
 * - Implementing harvest lock mechanism to prevent premature collection
 * - Syncing with shutdownCoordinator for proper timing
 */

import { EventEmitter } from 'events';
import { FSWatcher, watch } from 'chokidar';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { harvestService } from './harvestService';
import { shutdownCoordinator } from './shutdownCoordinator';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

interface HarvestSignal {
  farmId: string;
  harvestId?: string;
  sessionName: string;
  provider: string;
  agents: number;
  agentStatuses?: any[];
  startedAt: string;
  finishedAt?: string;
  workspaceDir?: string;
  coordinationDir?: string;
  correlationId?: string;
}

interface AgentCompletionSignal {
  agentId: number;
  farmId: string;
  status: string;
  completedAt: string;
  hasOutput: boolean;
  outputSize?: number;
}

interface HarvestCoordinationState {
  farmId: string;
  harvestId: string;
  totalAgents: number;
  completedAgents: number;
  collectionLocked: boolean;
  pendingCollection: boolean;
  startTime: Date;
  correlationId: string;
}

class HarvestCoordinationBridge extends EventEmitter {
  private static instance: HarvestCoordinationBridge;
  private coordinationWatcher?: FSWatcher;
  private activeHarvests: Map<string, HarvestCoordinationState> = new Map();
  private completionTimers: Map<string, NodeJS.Timeout> = new Map();
  private isWatching: boolean = false;

  private readonly COMPLETION_WAIT_TIME = 5000; // Wait 5s after last agent completion
  private readonly MAX_COLLECTION_WAIT = 30000; // Maximum 30s wait for collection

  private constructor() {
    super();
    this.setupShutdownHandlers();
  }

  static getInstance(): HarvestCoordinationBridge {
    if (!HarvestCoordinationBridge.instance) {
      HarvestCoordinationBridge.instance = new HarvestCoordinationBridge();
    }
    return HarvestCoordinationBridge.instance;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    process.on('SIGINT', () => this.stopWatching());
    process.on('SIGTERM', () => this.stopWatching());
  }

  /**
   * Start watching coordination directory for harvest signals
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) {
      logger.warn(LogCategory.HARVEST, 'Harvest coordination already watching');
      return;
    }

    const coordinationPath = pathConfig.getCoordinationPath();

    try {
      // Ensure coordination directory exists
      await fs.mkdir(coordinationPath, { recursive: true });

      // Setup file watcher
      this.coordinationWatcher = watch(coordinationPath, {
        persistent: true,
        ignoreInitial: false,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      });

      this.coordinationWatcher.on('add', this.handleFileAdded.bind(this));
      this.coordinationWatcher.on('change', this.handleFileChanged.bind(this));
      this.coordinationWatcher.on('error', this.handleWatcherError.bind(this));

      this.isWatching = true;
      logger.info(LogCategory.HARVEST, `Started watching coordination directory: ${coordinationPath}`);

      // Process any existing harvest files
      await this.processExistingFiles();

    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to start coordination watcher:', error);
      throw error;
    }
  }

  /**
   * Stop watching coordination directory
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) return;

    logger.info(LogCategory.HARVEST, 'Stopping harvest coordination watcher');

    if (this.coordinationWatcher) {
      await this.coordinationWatcher.close();
      this.coordinationWatcher = undefined;
    }

    // Clear any pending timers
    for (const timer of this.completionTimers.values()) {
      clearTimeout(timer);
    }
    this.completionTimers.clear();

    this.isWatching = false;
  }

  /**
   * Process existing harvest files on startup
   */
  private async processExistingFiles(): Promise<void> {
    const coordinationPath = pathConfig.getCoordinationPath();

    try {
      const files = await fs.readdir(coordinationPath);

      for (const file of files) {
        if (file.startsWith('harvest_') && file.endsWith('.json')) {
          const filePath = join(coordinationPath, file);
          await this.processHarvestFile(filePath);
        }

        if (file.startsWith('agent_') && file.endsWith('_status.json')) {
          const filePath = join(coordinationPath, file);
          await this.processAgentStatusFile(filePath);
        }
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Error processing existing files:', error);
    }
  }

  /**
   * Handle new file added to coordination directory
   */
  private async handleFileAdded(filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop() || '';

    if (fileName.startsWith('harvest_') && fileName.endsWith('.json')) {
      await this.processHarvestFile(filePath);
    }

    if (fileName.startsWith('agent_') && fileName.endsWith('_status.json')) {
      await this.processAgentStatusFile(filePath);
    }
  }

  /**
   * Handle file changed in coordination directory
   */
  private async handleFileChanged(filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop() || '';

    if (fileName.startsWith('harvest_') && fileName.endsWith('.json')) {
      await this.processHarvestFile(filePath);
    }

    if (fileName.startsWith('agent_') && fileName.endsWith('_health.json')) {
      await this.processAgentHealthFile(filePath);
    }
  }

  /**
   * Process harvest signal file
   */
  private async processHarvestFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const signal: HarvestSignal = JSON.parse(content);

      // Extract farmId from filename (harvest_<farmId>.json)
      const fileName = filePath.split('/').pop() || '';
      const farmId = fileName.replace('harvest_', '').replace('.json', '');

      if (!farmId || farmId === signal.farm_id) {
        logger.debug(LogCategory.HARVEST, `Processing harvest signal for farm ${farmId}`);
      }

      // Check if harvest is complete (has finishedAt)
      if (signal.finishedAt) {
        await this.handleHarvestComplete(signal);
      } else {
        await this.handleHarvestStarted(signal);
      }

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error processing harvest file ${filePath}:`, error);
    }
  }

  /**
   * Process agent status file
   */
  private async processAgentStatusFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const status = JSON.parse(content);

      // Extract agent ID from filename (agent_<id>_status.json)
      const fileName = filePath.split('/').pop() || '';
      const match = fileName.match(/agent_(\d+)_status\.json/);

      if (match && status.status === 'completed') {
        const agentId = parseInt(match[1]);
        await this.handleAgentCompletion({
          agentId,
          farmId: status.farm_id || '',
          status: status.status,
          completedAt: status.timestamp || new Date().toISOString(),
          hasOutput: true
        });
      }

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error processing agent status file ${filePath}:`, error);
    }
  }

  /**
   * Process agent health file for completion detection
   */
  private async processAgentHealthFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const health = JSON.parse(content);

      // Check if agent has completed (based on lack of recent activity)
      if (health.stuck_counter > 5 || health.status === 'dead') {
        const fileName = filePath.split('/').pop() || '';
        const match = fileName.match(/agent_(\d+)_health\.json/);

        if (match) {
          const agentId = parseInt(match[1]);
          await this.handleAgentCompletion({
            agentId,
            farmId: health.farm_id,
            status: 'completed',
            completedAt: new Date().toISOString(),
            hasOutput: health.has_output
          });
        }
      }

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error processing agent health file ${filePath}:`, error);
    }
  }

  /**
   * Handle harvest started signal
   */
  private async handleHarvestStarted(signal: HarvestSignal): Promise<void> {
    const farmId = signal.farmId;

    if (this.activeHarvests.has(farmId)) {
      logger.debug(LogCategory.HARVEST, `Harvest already active for farm ${farmId}`);
      return;
    }

    const harvestId = signal.harvestId || uuidv4();
    const correlationId = signal.correlationId || uuidv4();

    const state: HarvestCoordinationState = {
      farmId,
      harvestId,
      totalAgents: signal.agents || 0,
      completedAgents: 0,
      collectionLocked: true, // Start with collection locked
      pendingCollection: false,
      startTime: new Date(signal.startedAt || Date.now()),
      correlationId
    };

    this.activeHarvests.set(farmId, state);

    // Start harvest in harvest service
    await harvestService.startHarvest({
      farmId,
      name: `Harvest-${farmId}`,
      metadata: {
        sessionName: signal.sessionName,
        provider: signal.provider,
        agentCount: signal.agents,
        correlationId
      }
    });

    // Update database
    await this.updateHarvestLockInDB(harvestId, true, 0);

    logger.info(LogCategory.HARVEST,
      `Harvest started for farm ${farmId} with ${state.totalAgents} agents (locked)`);

    // Emit event
    websocketManager.emitToFarm(farmId, 'harvest:coordination:started', {
      farmId,
      harvestId,
      totalAgents: state.totalAgents,
      correlationId
    });
  }

  /**
   * Handle agent completion signal
   */
  private async handleAgentCompletion(signal: AgentCompletionSignal): Promise<void> {
    const { farmId, agentId } = signal;
    const state = this.activeHarvests.get(farmId);

    if (!state) {
      logger.debug(LogCategory.HARVEST, `No active harvest for farm ${farmId}`);
      return;
    }

    // Increment completed agents count
    state.completedAgents++;

    logger.info(LogCategory.HARVEST,
      `Agent ${agentId} completed in farm ${farmId} (${state.completedAgents}/${state.totalAgents})`);

    // Update database
    await this.updateHarvestLockInDB(state.harvestId, true, state.completedAgents);

    // Clear existing completion timer
    const existingTimer = this.completionTimers.get(farmId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Check if all agents have completed
    if (state.completedAgents >= state.totalAgents) {
      logger.info(LogCategory.HARVEST,
        `All agents completed for farm ${farmId}, scheduling harvest collection`);

      // Schedule harvest collection after a brief delay
      const timer = setTimeout(() => {
        this.triggerHarvestCollection(farmId);
      }, this.COMPLETION_WAIT_TIME);

      this.completionTimers.set(farmId, timer);

    } else {
      // Set a timeout to collect even if not all agents complete
      const timer = setTimeout(() => {
        logger.warn(LogCategory.HARVEST,
          `Timeout waiting for all agents in farm ${farmId}, triggering collection anyway`);
        this.triggerHarvestCollection(farmId);
      }, this.MAX_COLLECTION_WAIT);

      this.completionTimers.set(farmId, timer);
    }

    // Emit progress event
    websocketManager.emitToFarm(farmId, 'harvest:coordination:progress', {
      farmId,
      harvestId: state.harvestId,
      completedAgents: state.completedAgents,
      totalAgents: state.totalAgents,
      correlationId: state.correlationId
    });
  }

  /**
   * Handle harvest complete signal
   */
  private async handleHarvestComplete(signal: HarvestSignal): Promise<void> {
    const farmId = signal.farmId;
    const state = this.activeHarvests.get(farmId);

    if (state && state.collectionLocked) {
      // Unlock and trigger collection
      await this.triggerHarvestCollection(farmId);
    }
  }

  /**
   * Trigger harvest collection
   */
  private async triggerHarvestCollection(farmId: string): Promise<void> {
    const state = this.activeHarvests.get(farmId);
    if (!state) return;

    if (state.pendingCollection) {
      logger.debug(LogCategory.HARVEST, `Collection already pending for farm ${farmId}`);
      return;
    }

    state.pendingCollection = true;
    state.collectionLocked = false;

    logger.info(LogCategory.HARVEST,
      `Unlocking and triggering harvest collection for farm ${farmId}`);

    try {
      // Update database to unlock
      await this.updateHarvestLockInDB(state.harvestId, false, state.completedAgents);

      // Notify shutdown coordinator
      this.emit('harvest:ready', {
        farmId,
        harvestId: state.harvestId,
        completedAgents: state.completedAgents,
        totalAgents: state.totalAgents
      });

      // Complete harvest in harvest service
      const workspaceDir = pathConfig.getWorkspacePath(farmId);
      const artifacts = await this.collectArtifacts(workspaceDir);

      await harvestService.completeHarvest(state.harvestId, artifacts);

      // Clean up
      this.activeHarvests.delete(farmId);
      const timer = this.completionTimers.get(farmId);
      if (timer) {
        clearTimeout(timer);
        this.completionTimers.delete(farmId);
      }

      logger.info(LogCategory.HARVEST,
        `Harvest collection completed for farm ${farmId}`);

      // Emit completion event
      websocketManager.emitToFarm(farmId, 'harvest:coordination:completed', {
        farmId,
        harvestId: state.harvestId,
        artifacts: artifacts.length,
        correlationId: state.correlationId
      });

    } catch (error) {
      logger.error(LogCategory.HARVEST,
        `Failed to trigger harvest collection for farm ${farmId}:`, error);
      state.pendingCollection = false;
    }
  }

  /**
   * Collect artifacts from workspace
   */
  private async collectArtifacts(workspaceDir: string): Promise<any[]> {
    const artifacts: any[] = [];

    try {
      const files = await fs.readdir(workspaceDir, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const filePath = join(workspaceDir, file.name);
          const stats = await fs.stat(filePath);

          artifacts.push({
            name: file.name,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error collecting artifacts:`, error);
    }

    return artifacts;
  }

  /**
   * Update harvest lock status in database
   */
  private async updateHarvestLockInDB(
    harvestId: string,
    locked: boolean,
    agentsCompleted: number
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE harvests
         SET collection_locked = $1, agents_completed = $2
         WHERE id = $3`,
        [locked, agentsCompleted, harvestId]
      );
    } catch (error) {
      logger.error(LogCategory.HARVEST,
        `Failed to update harvest lock in DB:`, error);
    }
  }

  /**
   * Handle watcher errors
   */
  private handleWatcherError(error: Error): void {
    logger.error(LogCategory.HARVEST, 'Coordination watcher error:', error);

    // Try to restart watcher
    setTimeout(async () => {
      await this.stopWatching();
      await this.startWatching();
    }, 5000);
  }

  /**
   * Check if harvest is ready for collection
   */
  isHarvestReady(farmId: string): boolean {
    const state = this.activeHarvests.get(farmId);
    if (!state) return false;

    return state.completedAgents >= state.totalAgents && !state.collectionLocked;
  }

  /**
   * Force unlock harvest for collection
   */
  async forceUnlockHarvest(farmId: string): Promise<void> {
    const state = this.activeHarvests.get(farmId);
    if (!state) return;

    logger.warn(LogCategory.HARVEST, `Force unlocking harvest for farm ${farmId}`);
    state.collectionLocked = false;
    await this.updateHarvestLockInDB(state.harvestId, false, state.completedAgents);
    await this.triggerHarvestCollection(farmId);
  }

  /**
   * Get harvest coordination status
   */
  getHarvestStatus(farmId: string): HarvestCoordinationState | undefined {
    return this.activeHarvests.get(farmId);
  }
}

// Export singleton instance
export const harvestCoordinationBridge = HarvestCoordinationBridge.getInstance();