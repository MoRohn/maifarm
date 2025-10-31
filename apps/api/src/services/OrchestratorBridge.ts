/**
 * Orchestrator Bridge Service
 *
 * Provides event-driven coordination between Python orchestrator and Node.js services.
 * Replaces inefficient polling with file-based event signaling for robust farm launches.
 *
 * Key Features:
 * - File watcher for orchestrator status updates
 * - Structured status tracking with timeout handling
 * - Event emission for downstream services
 * - Comprehensive error recovery
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';

export enum OrchestratorStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  CREATING_SESSION = 'creating_session',
  LAUNCHING_AGENTS = 'launching_agents',
  READY = 'ready',
  COMPLETED = 'completed',
  ERROR = 'error',
  TIMEOUT = 'timeout'
}

export interface OrchestratorStatusData {
  status: OrchestratorStatus;
  sessionName: string;
  farmId: string;
  panesCreated: number;
  panesReady: number[];
  timestamp: string;
  orchestratorPid: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface WaitOptions {
  timeout?: number;
  pollInterval?: number;
  requiredStatus?: OrchestratorStatus[];
}

interface ActiveWatch {
  farmId: string;
  watcher: FSWatcher;
  statusFile: string;
  timer: NodeJS.Timeout;
  resolve: (status: OrchestratorStatusData) => void;
  reject: (error: Error) => void;
}

export class OrchestratorBridge extends EventEmitter {
  private static instance: OrchestratorBridge;
  private activeWatches: Map<string, ActiveWatch> = new Map();
  private statusCache: Map<string, OrchestratorStatusData> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  private constructor() {
    super();
    this.setupCleanupHandlers();
  }

  static getInstance(): OrchestratorBridge {
    if (!OrchestratorBridge.instance) {
      OrchestratorBridge.instance = new OrchestratorBridge();
    }
    return OrchestratorBridge.instance;
  }

  /**
   * Wait for orchestrator to reach ready state
   * Uses file watching instead of polling for efficiency
   */
  async waitForOrchestratorReady(
    farmId: string,
    options: WaitOptions = {}
  ): Promise<OrchestratorStatusData> {
    const {
      timeout = 90000, // 90 seconds - generous for multi-agent farms
      requiredStatus = [OrchestratorStatus.READY]
    } = options;

    // Check cache first
    const cached = this.statusCache.get(farmId);
    if (cached && requiredStatus.includes(cached.status)) {
      logger.debug(LogCategory.FARM, `Using cached orchestrator status for farm ${farmId}`);
      return cached;
    }

    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );
    const statusFile = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

    logger.info(LogCategory.FARM,
      `Waiting for orchestrator status: ${statusFile} (timeout: ${timeout}ms)`
    );

    // Ensure coordination directory exists
    await fs.mkdir(coordinationDir, { recursive: true });

    return new Promise<OrchestratorStatusData>((resolve, reject) => {
      // Setup timeout
      const timer = setTimeout(() => {
        this.cleanupWatch(farmId);
        reject(new Error(
          `Orchestrator not ready after ${timeout}ms for farm ${farmId}. ` +
          `Check orchestrator logs and ensure Python process started.`
        ));
      }, timeout);

      // Check if file already exists and is ready
      this.checkStatusFile(statusFile, farmId, requiredStatus)
        .then(status => {
          if (status) {
            clearTimeout(timer);
            this.cleanupWatch(farmId);
            this.cacheStatus(farmId, status);
            resolve(status);
            return;
          }

          // File doesn't exist or not ready - setup watcher
          this.setupWatcher(farmId, statusFile, requiredStatus, resolve, reject, timer);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check orchestrator status without waiting
   */
  async getOrchestratorStatus(farmId: string): Promise<OrchestratorStatusData | null> {
    const cached = this.statusCache.get(farmId);
    if (cached) {
      return cached;
    }

    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );
    const statusFile = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

    try {
      const content = await fs.readFile(statusFile, 'utf-8');
      const status = JSON.parse(content) as OrchestratorStatusData;
      this.cacheStatus(farmId, status);
      return status;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update orchestrator status (called by orchestrator or for testing)
   */
  async updateOrchestratorStatus(farmId: string, status: OrchestratorStatusData): Promise<void> {
    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );
    await fs.mkdir(coordinationDir, { recursive: true });

    const statusFile = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

    // Write atomically
    const tempFile = `${statusFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(status, null, 2));
    await fs.rename(tempFile, statusFile);

    this.cacheStatus(farmId, status);

    logger.info(LogCategory.FARM,
      `Updated orchestrator status for farm ${farmId}: ${status.status}`
    );

    // Emit event
    this.emit('status-updated', { farmId, status });
  }

  /**
   * Clear orchestrator status (for cleanup)
   */
  async clearOrchestratorStatus(farmId: string): Promise<void> {
    this.statusCache.delete(farmId);
    this.cleanupWatch(farmId);

    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );
    const statusFile = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

    try {
      await fs.unlink(statusFile);
      logger.debug(LogCategory.FARM, `Cleared orchestrator status for farm ${farmId}`);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Setup file watcher for orchestrator status
   */
  private setupWatcher(
    farmId: string,
    statusFile: string,
    requiredStatus: OrchestratorStatus[],
    resolve: (status: OrchestratorStatusData) => void,
    reject: (error: Error) => void,
    timer: NodeJS.Timeout
  ): void {
    const watcher = watch(statusFile, {
      persistent: false,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    const checkAndResolve = async () => {
      try {
        const status = await this.checkStatusFile(statusFile, farmId, requiredStatus);
        if (status) {
          clearTimeout(timer);
          this.cleanupWatch(farmId);
          this.cacheStatus(farmId, status);
          resolve(status);
        }
      } catch (error) {
        logger.warn(LogCategory.FARM, `Error checking status file for farm ${farmId}:`, error);
      }
    };

    watcher.on('add', checkAndResolve);
    watcher.on('change', checkAndResolve);
    watcher.on('error', (error) => {
      logger.error(LogCategory.FARM, `Watcher error for farm ${farmId}:`, error);
      clearTimeout(timer);
      this.cleanupWatch(farmId);
      reject(error);
    });

    this.activeWatches.set(farmId, {
      farmId,
      watcher,
      statusFile,
      timer,
      resolve,
      reject
    });

    logger.debug(LogCategory.FARM, `Setup status watcher for farm ${farmId}: ${statusFile}`);
  }

  /**
   * Check if status file exists and meets requirements
   */
  private async checkStatusFile(
    statusFile: string,
    farmId: string,
    requiredStatus: OrchestratorStatus[]
  ): Promise<OrchestratorStatusData | null> {
    try {
      const content = await fs.readFile(statusFile, 'utf-8');
      const status = JSON.parse(content) as OrchestratorStatusData;

      // Validate status structure
      if (!status.status || !status.sessionName || !status.farmId) {
        logger.warn(LogCategory.FARM, `Invalid status structure for farm ${farmId}`);
        return null;
      }

      // Check if status meets requirements
      if (requiredStatus.includes(status.status)) {
        logger.info(LogCategory.FARM,
          `Orchestrator ready for farm ${farmId}: status=${status.status}, ` +
          `panes=${status.panesCreated}, pid=${status.orchestratorPid}`
        );
        return status;
      }

      // Check for error status
      if (status.status === OrchestratorStatus.ERROR) {
        throw new Error(
          `Orchestrator error for farm ${farmId}: ${status.error || 'Unknown error'}`
        );
      }

      // Status exists but not ready yet
      logger.debug(LogCategory.FARM,
        `Orchestrator status for farm ${farmId}: ${status.status} (waiting for ${requiredStatus.join(' or ')})`
      );
      return null;

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - this is normal
        return null;
      }

      if (error.message?.includes('Orchestrator error')) {
        throw error; // Re-throw orchestrator errors
      }

      // JSON parse error or other issue
      logger.warn(LogCategory.FARM, `Error reading status file for farm ${farmId}:`, error);
      return null;
    }
  }

  /**
   * Cache status with TTL
   */
  private cacheStatus(farmId: string, status: OrchestratorStatusData): void {
    this.statusCache.set(farmId, status);

    // Clear cache after TTL
    setTimeout(() => {
      this.statusCache.delete(farmId);
    }, this.CACHE_TTL);
  }

  /**
   * Cleanup watch for a farm
   */
  private cleanupWatch(farmId: string): void {
    const watch = this.activeWatches.get(farmId);
    if (watch) {
      try {
        watch.watcher.close();
        clearTimeout(watch.timer);
      } catch (error) {
        logger.debug(LogCategory.FARM, `Error cleaning up watch for farm ${farmId}:`, error);
      }
      this.activeWatches.delete(farmId);
    }
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      logger.info(LogCategory.FARM, 'Cleaning up orchestrator bridge');
      for (const [farmId] of this.activeWatches) {
        this.cleanupWatch(farmId);
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Get active watches (for debugging)
   */
  getActiveWatches(): string[] {
    return Array.from(this.activeWatches.keys());
  }

  /**
   * Get cached status entries (for debugging)
   */
  getCachedStatuses(): Map<string, OrchestratorStatusData> {
    return new Map(this.statusCache);
  }

  /**
   * Start monitoring for orchestrator completion
   * This continuously watches the status file and emits 'completed' event when agents finish
   */
  async monitorForCompletion(farmId: string): Promise<void> {
    const coordinationDir = path.join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );
    const statusFile = path.join(coordinationDir, `orchestrator_status_${farmId}.json`);

    logger.info(LogCategory.FARM, `Starting completion monitoring for farm ${farmId}`);

    const watcher = watch(statusFile, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    const checkCompletion = async () => {
      try {
        const content = await fs.readFile(statusFile, 'utf-8');
        const status = JSON.parse(content) as OrchestratorStatusData;

        if (status.status === OrchestratorStatus.COMPLETED) {
          logger.info(LogCategory.FARM,
            `Orchestrator completed for farm ${farmId} - triggering harvest collection`
          );

          // Emit completion event for farm service to handle
          this.emit('orchestrator-completed', { farmId, status });

          // Cleanup watcher
          watcher.close();
          this.activeWatches.delete(`completion-${farmId}`);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn(LogCategory.FARM, `Error checking completion status for farm ${farmId}:`, error);
        }
      }
    };

    watcher.on('add', checkCompletion);
    watcher.on('change', checkCompletion);
    watcher.on('error', (error) => {
      logger.error(LogCategory.FARM, `Completion watcher error for farm ${farmId}:`, error);
      watcher.close();
      this.activeWatches.delete(`completion-${farmId}`);
    });

    // Store watcher for cleanup
    this.activeWatches.set(`completion-${farmId}`, {
      farmId,
      watcher,
      statusFile,
      timer: setTimeout(() => {}, 0), // Dummy timer
      resolve: () => {},
      reject: () => {}
    });
  }
}

export const orchestratorBridge = OrchestratorBridge.getInstance();
