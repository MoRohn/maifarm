import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';
import { workspaceManager } from './workspaceManager';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorkspaceInstance {
  workspaceId: string;
  farmId?: string;
  status: 'available' | 'reserved' | 'in_use' | 'cleaning' | 'error';
  workspacePath: string;
  templateType: 'standard' | 'nodejs' | 'python' | 'mixed';
  createdAt: Date;
  lastUsedAt?: Date;
  metadata: {
    preloadedResources?: string[];
    diskUsageMB?: number;
    initTime?: number;
  };
}

export interface WorkspaceRequirements {
  templateType?: WorkspaceInstance['templateType'];
  requiredResources?: string[];
  estimatedSizeMB?: number;
  farmId: string;
}

export interface PoolStatistics {
  totalWorkspaces: number;
  availableWorkspaces: number;
  inUseWorkspaces: number;
  averageInitTime: number;
  hitRate: number;
  missRate: number;
}

export class WorkspacePoolManager extends EventEmitter {
  private readonly DEFAULT_POOL_SIZE = 5;
  private readonly MAX_POOL_SIZE = 20;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly WORKSPACE_TTL = 3600000; // 1 hour
  
  private workspacePool: Map<string, WorkspaceInstance> = new Map();
  private poolStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    totalInitTime: 0
  };
  
  private initializationPromise: Promise<void> | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private replenishmentQueue: Set<string> = new Set();

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the workspace pool
   */
  private async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      logger.info('[WorkspacePoolManager] Initializing workspace pool...');

      // Load existing workspaces from database
      await this.loadExistingWorkspaces();

      // Initialize pool to default size
      await this.initializePool();

      // Start cleanup scheduler
      this.startCleanupScheduler();

      logger.info(`[WorkspacePoolManager] Initialized with ${this.workspacePool.size} workspaces`);

      // Emit initialization complete
      this.emit('pool:initialized', {
        poolSize: this.workspacePool.size,
        available: this.getAvailableCount()
      });

    } catch (error) {
      logger.error('[WorkspacePoolManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Initialize pool with pre-warmed workspaces
   */
  async initializePool(): Promise<void> {
    const currentSize = this.workspacePool.size;
    const targetSize = Math.min(this.DEFAULT_POOL_SIZE, this.MAX_POOL_SIZE);
    
    if (currentSize >= targetSize) {
      logger.info(`[WorkspacePoolManager] Pool already at target size: ${currentSize}`);
      return;
    }

    const promises: Promise<void>[] = [];
    const neededWorkspaces = targetSize - currentSize;

    logger.info(`[WorkspacePoolManager] Creating ${neededWorkspaces} new workspaces...`);

    // Create workspaces in parallel
    for (let i = 0; i < neededWorkspaces; i++) {
      promises.push(this.createWorkspace('standard'));
    }

    await Promise.all(promises);
  }

  /**
   * Create a new workspace and add to pool
   */
  private async createWorkspace(templateType: WorkspaceInstance['templateType']): Promise<WorkspaceInstance> {
    const startTime = Date.now();
    const workspaceId = uuidv4();
    const workspacePath = path.join(
      pathConfig.getPath('WORKSPACE_ROOT'),
      'pool',
      workspaceId
    );

    try {
      // Create workspace directory
      await fileManager.ensureDirectory(workspacePath);

      // Apply template
      await this.applyTemplate(workspacePath, templateType);

      // Pre-warm workspace (install dependencies, etc.)
      await this.preWarmWorkspace(workspacePath, templateType);

      const workspace: WorkspaceInstance = {
        workspaceId,
        status: 'available',
        workspacePath,
        templateType,
        createdAt: new Date(),
        metadata: {
          initTime: Date.now() - startTime,
          diskUsageMB: await this.calculateDiskUsage(workspacePath)
        }
      };

      // Store in pool
      this.workspacePool.set(workspaceId, workspace);

      // Persist to database
      await this.persistWorkspace(workspace);

      logger.info(`[WorkspacePoolManager] Created workspace ${workspaceId} in ${workspace.metadata.initTime}ms`);

      // Update stats
      this.poolStats.totalInitTime += workspace.metadata.initTime || 0;

      return workspace;

    } catch (error) {
      logger.error(`[WorkspacePoolManager] Failed to create workspace:`, error);
      
      // Clean up on failure
      try {
        await fs.rmdir(workspacePath, { recursive: true });
      } catch (cleanupError) {
        logger.error('Failed to clean up workspace directory:', cleanupError);
      }

      throw error;
    }
  }

  /**
   * Apply template to workspace
   */
  private async applyTemplate(workspacePath: string, templateType: string): Promise<void> {
    const templatePath = path.join(
      pathConfig.getPath('MAIFARM_ROOT'),
      'templates',
      'workspaces',
      templateType
    );

    try {
      // Check if template exists
      await fs.access(templatePath);
      
      // Copy template files
      await this.copyDirectory(templatePath, workspacePath);
      
    } catch (error) {
      // If template doesn't exist, create basic structure
      logger.warn(`[WorkspacePoolManager] Template ${templateType} not found, creating basic structure`);
      
      await fileManager.ensureDirectory(path.join(workspacePath, 'src'));
      await fileManager.ensureDirectory(path.join(workspacePath, 'output'));
      await fileManager.ensureDirectory(path.join(workspacePath, 'logs'));
      
      // Create basic package.json for Node.js workspaces
      if (templateType === 'nodejs' || templateType === 'standard') {
        const packageJson = {
          name: 'workspace',
          version: '1.0.0',
          private: true,
          dependencies: {}
        };
        await fileManager.writeFile(
          path.join(workspacePath, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );
      }
      
      // Create requirements.txt for Python workspaces
      if (templateType === 'python') {
        await fileManager.writeFile(
          path.join(workspacePath, 'requirements.txt'),
          ''
        );
      }
    }
  }

  /**
   * Pre-warm workspace by installing dependencies
   */
  private async preWarmWorkspace(workspacePath: string, templateType: string): Promise<void> {
    try {
      switch (templateType) {
        case 'nodejs':
        case 'standard':
          // Install npm dependencies if package.json exists
          const packageJsonPath = path.join(workspacePath, 'package.json');
          try {
            await fs.access(packageJsonPath);
            logger.info(`[WorkspacePoolManager] Installing npm dependencies for ${workspacePath}`);
            await execAsync('npm install --production', { cwd: workspacePath });
          } catch (error) {
            // No package.json or npm install failed - not critical
          }
          break;

        case 'python':
          // Create virtual environment
          try {
            await execAsync('python3 -m venv venv', { cwd: workspacePath });
            
            // Install requirements if file exists
            const requirementsPath = path.join(workspacePath, 'requirements.txt');
            try {
              await fs.access(requirementsPath);
              await execAsync('./venv/bin/pip install -r requirements.txt', { cwd: workspacePath });
            } catch (error) {
              // No requirements.txt - not critical
            }
          } catch (error) {
            logger.warn('[WorkspacePoolManager] Failed to create Python venv:', error);
          }
          break;

        case 'mixed':
          // Pre-warm for multiple environments
          // This is a simplified version - could be expanded
          break;
      }

      // Create symlink to barn resources
      const barnPath = pathConfig.getPath('BARN_STORAGE');
      const barnLinkPath = path.join(workspacePath, 'barn');
      try {
        await fs.symlink(barnPath, barnLinkPath, 'dir');
      } catch (error) {
        // Symlink might already exist or barn path not available
      }

    } catch (error) {
      logger.error(`[WorkspacePoolManager] Error pre-warming workspace:`, error);
      // Pre-warming failures are not critical
    }
  }

  /**
   * Acquire a workspace from the pool
   */
  async acquireWorkspace(requirements: WorkspaceRequirements): Promise<WorkspaceInstance> {
    await this.initialize();
    
    this.poolStats.totalRequests++;

    // Try to find suitable available workspace
    const availableWorkspace = this.findAvailableWorkspace(requirements);

    if (availableWorkspace) {
      // Pool hit
      this.poolStats.hits++;
      
      availableWorkspace.status = 'reserved';
      availableWorkspace.farmId = requirements.farmId;
      availableWorkspace.lastUsedAt = new Date();

      // Update database
      await this.updateWorkspaceStatus(availableWorkspace);

      logger.info(`[WorkspacePoolManager] Acquired workspace ${availableWorkspace.workspaceId} from pool (hit rate: ${this.getHitRate().toFixed(2)}%)`);

      // Trigger background replenishment
      this.scheduleReplenishment();

      // Emit acquisition event
      this.emit('workspace:acquired', {
        workspaceId: availableWorkspace.workspaceId,
        farmId: requirements.farmId,
        fromPool: true
      });

      return availableWorkspace;

    } else {
      // Pool miss - create on demand
      this.poolStats.misses++;
      
      logger.info(`[WorkspacePoolManager] No suitable workspace in pool, creating new one (miss rate: ${this.getMissRate().toFixed(2)}%)`);

      const newWorkspace = await this.createWorkspace(requirements.templateType || 'standard');
      newWorkspace.status = 'reserved';
      newWorkspace.farmId = requirements.farmId;
      newWorkspace.lastUsedAt = new Date();

      await this.updateWorkspaceStatus(newWorkspace);

      // Emit acquisition event
      this.emit('workspace:acquired', {
        workspaceId: newWorkspace.workspaceId,
        farmId: requirements.farmId,
        fromPool: false
      });

      return newWorkspace;
    }
  }

  /**
   * Release workspace back to pool
   */
  async releaseWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspacePool.get(workspaceId);
    
    if (!workspace) {
      logger.warn(`[WorkspacePoolManager] Workspace ${workspaceId} not found in pool`);
      return;
    }

    logger.info(`[WorkspacePoolManager] Releasing workspace ${workspaceId}`);

    // Mark as cleaning
    workspace.status = 'cleaning';
    await this.updateWorkspaceStatus(workspace);

    try {
      // Clean workspace
      await this.cleanWorkspace(workspace);

      // Check pool size
      if (this.workspacePool.size >= this.MAX_POOL_SIZE) {
        // Pool is full, destroy this workspace
        await this.destroyWorkspace(workspaceId);
      } else {
        // Return to pool
        workspace.status = 'available';
        workspace.farmId = undefined;
        await this.updateWorkspaceStatus(workspace);
        
        logger.info(`[WorkspacePoolManager] Workspace ${workspaceId} returned to pool`);
      }

      // Emit release event
      this.emit('workspace:released', {
        workspaceId,
        returnedToPool: workspace.status === 'available'
      });

    } catch (error) {
      logger.error(`[WorkspacePoolManager] Error releasing workspace ${workspaceId}:`, error);
      workspace.status = 'error';
      await this.updateWorkspaceStatus(workspace);
    }
  }

  /**
   * Clean workspace for reuse
   */
  private async cleanWorkspace(workspace: WorkspaceInstance): Promise<void> {
    const workspacePath = workspace.workspacePath;

    try {
      // Remove generated files but keep template structure
      const dirsToClean = ['output', 'logs', 'tmp', '.agents'];
      
      for (const dir of dirsToClean) {
        const dirPath = path.join(workspacePath, dir);
        try {
          await fs.rmdir(dirPath, { recursive: true });
          await fileManager.ensureDirectory(dirPath);
        } catch (error) {
          // Directory might not exist
        }
      }

      // Reset git repository if exists
      try {
        await execAsync('git reset --hard HEAD 2>/dev/null', { cwd: workspacePath });
        await execAsync('git clean -fd 2>/dev/null', { cwd: workspacePath });
      } catch (error) {
        // Not a git repository or git not available
      }

      logger.info(`[WorkspacePoolManager] Cleaned workspace ${workspace.workspaceId}`);

    } catch (error) {
      logger.error(`[WorkspacePoolManager] Error cleaning workspace:`, error);
      throw error;
    }
  }

  /**
   * Destroy workspace completely
   */
  private async destroyWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspacePool.get(workspaceId);
    
    if (!workspace) {
      return;
    }

    try {
      // Remove from pool
      this.workspacePool.delete(workspaceId);

      // Delete from filesystem
      await fs.rmdir(workspace.workspacePath, { recursive: true });

      // Delete from database
      await db.query('DELETE FROM workspace_pool WHERE workspace_id = $1', [workspaceId]);

      logger.info(`[WorkspacePoolManager] Destroyed workspace ${workspaceId}`);

      // Emit destruction event
      this.emit('workspace:destroyed', { workspaceId });

    } catch (error) {
      logger.error(`[WorkspacePoolManager] Error destroying workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Find available workspace matching requirements
   */
  private findAvailableWorkspace(requirements: WorkspaceRequirements): WorkspaceInstance | null {
    for (const workspace of this.workspacePool.values()) {
      if (workspace.status === 'available') {
        // Check if template type matches
        if (requirements.templateType && workspace.templateType !== requirements.templateType) {
          continue;
        }

        // Check if resources are available
        if (requirements.requiredResources && requirements.requiredResources.length > 0) {
          const hasResources = requirements.requiredResources.every(resource =>
            workspace.metadata.preloadedResources?.includes(resource)
          );
          if (!hasResources) {
            continue;
          }
        }

        return workspace;
      }
    }

    return null;
  }

  /**
   * Schedule background pool replenishment
   */
  private scheduleReplenishment(): void {
    // Debounce replenishment
    if (this.replenishmentQueue.size > 0) {
      return;
    }

    setTimeout(async () => {
      await this.replenishPool();
    }, 1000);
  }

  /**
   * Replenish pool to target size
   */
  private async replenishPool(): Promise<void> {
    const availableCount = this.getAvailableCount();
    const targetAvailable = Math.min(3, this.DEFAULT_POOL_SIZE); // Keep at least 3 available

    if (availableCount >= targetAvailable) {
      return;
    }

    const needed = targetAvailable - availableCount;
    logger.info(`[WorkspacePoolManager] Replenishing pool with ${needed} workspaces`);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      promises.push(
        this.createWorkspace('standard').catch(error => {
          logger.error('[WorkspacePoolManager] Failed to create workspace during replenishment:', error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.performCleanup();
    }, this.CLEANUP_INTERVAL);

    logger.info('[WorkspacePoolManager] Started cleanup scheduler');
  }

  /**
   * Perform periodic cleanup
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const toDestroy: string[] = [];

    for (const [workspaceId, workspace] of this.workspacePool) {
      // Clean up old unused workspaces
      if (workspace.status === 'available' && workspace.lastUsedAt) {
        const age = now - workspace.lastUsedAt.getTime();
        if (age > this.WORKSPACE_TTL) {
          toDestroy.push(workspaceId);
        }
      }

      // Clean up error workspaces
      if (workspace.status === 'error') {
        toDestroy.push(workspaceId);
      }
    }

    for (const workspaceId of toDestroy) {
      await this.destroyWorkspace(workspaceId);
    }

    if (toDestroy.length > 0) {
      logger.info(`[WorkspacePoolManager] Cleaned up ${toDestroy.length} workspaces`);
    }

    // Replenish if needed
    await this.replenishPool();
  }

  /**
   * Load existing workspaces from database
   */
  private async loadExistingWorkspaces(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM workspace_pool 
        WHERE status IN ('available', 'reserved')
      `);

      for (const row of result.rows) {
        const workspace: WorkspaceInstance = {
          workspaceId: row.workspace_id,
          farmId: row.farm_id,
          status: row.status,
          workspacePath: row.workspace_path,
          templateType: row.template_type || 'standard',
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
          metadata: row.metadata || {}
        };

        // Verify workspace still exists
        try {
          await fs.access(workspace.workspacePath);
          this.workspacePool.set(workspace.workspaceId, workspace);
        } catch (error) {
          // Workspace directory doesn't exist, clean up database
          await db.query('DELETE FROM workspace_pool WHERE workspace_id = $1', [workspace.workspaceId]);
        }
      }

      logger.info(`[WorkspacePoolManager] Loaded ${this.workspacePool.size} existing workspaces`);

    } catch (error) {
      logger.error('[WorkspacePoolManager] Error loading workspaces:', error);
    }
  }

  /**
   * Persist workspace to database
   */
  private async persistWorkspace(workspace: WorkspaceInstance): Promise<void> {
    try {
      await db.query(`
        INSERT INTO workspace_pool 
        (workspace_id, farm_id, status, workspace_path, template_type, last_used_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (workspace_id) DO UPDATE SET
          farm_id = $2,
          status = $3,
          last_used_at = $6,
          metadata = $7
      `, [
        workspace.workspaceId,
        workspace.farmId,
        workspace.status,
        workspace.workspacePath,
        workspace.templateType,
        workspace.lastUsedAt,
        JSON.stringify(workspace.metadata)
      ]);
    } catch (error) {
      logger.error('[WorkspacePoolManager] Error persisting workspace:', error);
    }
  }

  /**
   * Update workspace status in database
   */
  private async updateWorkspaceStatus(workspace: WorkspaceInstance): Promise<void> {
    try {
      await db.query(`
        UPDATE workspace_pool 
        SET status = $1, farm_id = $2, last_used_at = $3
        WHERE workspace_id = $4
      `, [workspace.status, workspace.farmId, workspace.lastUsedAt, workspace.workspaceId]);
    } catch (error) {
      logger.error('[WorkspacePoolManager] Error updating workspace status:', error);
    }
  }

  /**
   * Calculate disk usage of workspace
   */
  private async calculateDiskUsage(workspacePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sm "${workspacePath}" | cut -f1`);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fileManager.ensureDirectory(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const available = this.getAvailableCount();
    const inUse = this.getInUseCount();

    return {
      totalWorkspaces: this.workspacePool.size,
      availableWorkspaces: available,
      inUseWorkspaces: inUse,
      averageInitTime: this.poolStats.totalRequests > 0 
        ? this.poolStats.totalInitTime / this.poolStats.totalRequests 
        : 0,
      hitRate: this.getHitRate(),
      missRate: this.getMissRate()
    };
  }

  /**
   * Get available workspace count
   */
  private getAvailableCount(): number {
    let count = 0;
    for (const workspace of this.workspacePool.values()) {
      if (workspace.status === 'available') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get in-use workspace count
   */
  private getInUseCount(): number {
    let count = 0;
    for (const workspace of this.workspacePool.values()) {
      if (workspace.status === 'in_use' || workspace.status === 'reserved') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache hit rate
   */
  private getHitRate(): number {
    if (this.poolStats.totalRequests === 0) return 0;
    return (this.poolStats.hits / this.poolStats.totalRequests) * 100;
  }

  /**
   * Get cache miss rate
   */
  private getMissRate(): number {
    if (this.poolStats.totalRequests === 0) return 0;
    return (this.poolStats.misses / this.poolStats.totalRequests) * 100;
  }

  /**
   * Shutdown pool manager
   */
  async shutdown(): Promise<void> {
    logger.info('[WorkspacePoolManager] Shutting down...');

    // Stop cleanup scheduler
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean up all workspaces
    for (const workspace of this.workspacePool.values()) {
      if (workspace.status === 'available') {
        await this.destroyWorkspace(workspace.workspaceId);
      }
    }

    logger.info('[WorkspacePoolManager] Shutdown complete');
  }
}

// Export singleton instance
export const workspacePoolManager = new WorkspacePoolManager();