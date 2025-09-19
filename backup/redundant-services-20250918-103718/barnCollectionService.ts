import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';
import { websocketManager } from '../websocket/websocketManager';
import { harvestService } from './harvestService';
import { barnService } from './barnService';

interface WorkspaceActivity {
  workspaceId: string;
  farmId: string;
  agentId?: string;
  lastActivity: Date;
  fileChanges: FileChange[];
  statistics: WorkspaceStatistics;
  collectionScheduled?: Date;
  gracePeriodEnd?: Date; // Optional grace period to prevent immediate collection
}

interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  timestamp: Date;
  size: number;
  hash?: string;
  category: 'code' | 'config' | 'output' | 'temp' | 'unknown';
}

interface WorkspaceStatistics {
  totalFiles: number;
  totalSize: number;
  changeRate: number; // changes per minute
  lastCollection: Date | null;
  productivityScore: number; // 0-100
}

interface CollectionPolicy {
  autoCollect: boolean;
  minChangeThreshold: number; // minimum changes before collection
  idleTimeThreshold: number; // ms of inactivity before collection
  maxTimeBetweenCollections: number; // max ms between collections
  filePatterns: string[]; // glob patterns to watch
  ignorePatterns: string[]; // glob patterns to ignore
  priorityExtensions: string[]; // high-priority file extensions
}

interface CollectionTrigger {
  type: 'activity' | 'idle' | 'scheduled' | 'manual' | 'threshold';
  reason: string;
  timestamp: Date;
  metrics?: Record<string, any>;
}

export class BarnCollectionService extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private workspaceActivity: Map<string, WorkspaceActivity> = new Map();
  private collectionPolicies: Map<string, CollectionPolicy> = new Map();
  private pendingCollections: Set<string> = new Set();
  private collectionQueue: Array<{ workspaceId: string; trigger: CollectionTrigger }> = [];
  private isProcessingQueue = false;
  private monitoringInterval?: NodeJS.Timeout;
  private analyticsInterval?: NodeJS.Timeout;

  // Default collection policy
  private readonly defaultPolicy: CollectionPolicy = {
    autoCollect: false, // DISABLED: Collections should only happen at farm timeout via ShutdownCoordinator
    minChangeThreshold: 50, // High threshold to prevent premature collection
    idleTimeThreshold: 7200000, // 2 hours (effectively disabled - farms timeout before this)
    maxTimeBetweenCollections: 7200000, // 2 hours
    filePatterns: ['**/*'],
    ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/tmp/**', '**/*.log'],
    priorityExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.yaml', '.json', '.md']
  };

  constructor() {
    super();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Start monitoring interval for idle detection
      this.monitoringInterval = setInterval(() => {
        this.checkIdleWorkspaces();
      }, 5000); // Check every 5 seconds

      // Start analytics interval for productivity scoring
      this.analyticsInterval = setInterval(() => {
        this.updateProductivityScores();
      }, 30000); // Update every 30 seconds

      // Start queue processor
      this.processCollectionQueue();

      logger.info('BarnCollectionService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize BarnCollectionService:', error);
    }
  }

  /**
   * Start collection for a workspace
   */
  public async startCollection(
    workspaceId: string,
    farmId: string,
    agentId?: string,
    policy?: Partial<CollectionPolicy>
  ): Promise<void> {
    try {
      // Determine workspace path correctly
      let workspacePath: string;
      if (workspaceId.startsWith('/')) {
        // Already a full path
        workspacePath = workspaceId;
      } else if (workspaceId.includes('/')) {
        // Relative path, resolve it
        workspacePath = path.resolve(workspaceId);
      } else {
        // Assume it's a farmId, get the workspace path
        workspacePath = pathConfig.getFarmWorkspacePath(farmId);
      }
      
      // Validate path safety
      if (!pathConfig.isPathSafe(workspacePath)) {
        throw new Error(`Unsafe workspace path: ${workspacePath}`);
      }
      
      // Ensure workspace exists before setting up watchers
      try {
        await fs.access(workspacePath);
      } catch (error) {
        logger.warn(`[BarnCollectionService] Workspace doesn't exist yet: ${workspacePath}, creating it`);
        await fileManager.ensureDirectory(workspacePath);
      }

      // Set collection policy
      const finalPolicy = { ...this.defaultPolicy, ...policy };
      this.collectionPolicies.set(workspaceId, finalPolicy);

      // Initialize workspace activity tracking with grace period
      const now = new Date();
      this.workspaceActivity.set(workspaceId, {
        workspaceId,
        farmId,
        agentId,
        lastActivity: now,
        fileChanges: [],
        statistics: {
          totalFiles: 0,
          totalSize: 0,
          changeRate: 0,
          lastCollection: null,
          productivityScore: 0
        },
        // Add grace period to prevent immediate collection on workspace creation
        gracePeriodEnd: new Date(now.getTime() + 60000) // 1 minute grace period
      });

      // Create watcher with chokidar for robust monitoring
      const watcher = chokidar.watch(workspacePath, {
        persistent: true,
        ignoreInitial: true, // Changed to true to prevent triggering on existing files during workspace creation
        followSymlinks: false,
        usePolling: false, // Use native events for better performance
        interval: 100,
        binaryInterval: 300,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        },
        ignored: finalPolicy.ignorePatterns,
        depth: 10
      });

      // Handle file events
      watcher
        .on('add', (filePath, stats) => {
          this.handleFileChange(workspaceId, filePath, 'added', stats);
        })
        .on('change', (filePath, stats) => {
          this.handleFileChange(workspaceId, filePath, 'modified', stats);
        })
        .on('unlink', filePath => {
          this.handleFileChange(workspaceId, filePath, 'deleted');
        })
        .on('error', error => {
          logger.error(`Watcher error for workspace ${workspaceId}:`, error);
        });

      this.watchers.set(workspaceId, watcher);

      // Emit collection started event
      this.emit('collection:started', { workspaceId, farmId, agentId });
      
      // Broadcast via WebSocket
      websocketManager.broadcast('barn:collection:started', {
        workspaceId,
        farmId,
        agentId,
        policy: finalPolicy
      });

      logger.info(`Started collection for workspace: ${workspaceId}`);
    } catch (error) {
      logger.error(`Failed to start collection for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Stop collection for a workspace
   * @param workspaceId - The workspace to stop collection for
   * @param skipFinalCollection - If true, skips the final collection (default: false)
   */
  public async stopCollection(workspaceId: string, skipFinalCollection: boolean = false): Promise<void> {
    try {
      const watcher = this.watchers.get(workspaceId);
      if (watcher) {
        await watcher.close();
        this.watchers.delete(workspaceId);
      }

      // Only trigger final collection if not explicitly skipped
      // This prevents premature collection when monitoring is stopped early
      if (!skipFinalCollection) {
        const activity = this.workspaceActivity.get(workspaceId);
        if (activity && activity.fileChanges.length > 0) {
          await this.triggerCollection(workspaceId, {
            type: 'manual',
            reason: 'Final collection before stopping collection',
            timestamp: new Date()
          });
        }
      }

      this.workspaceActivity.delete(workspaceId);
      this.collectionPolicies.delete(workspaceId);

      // Emit collection stopped event
      this.emit('collection:stopped', { workspaceId });
      
      // Broadcast via WebSocket
      websocketManager.broadcast('barn:collection:stopped', { workspaceId });

      logger.info(`Stopped collection for workspace: ${workspaceId}`);
    } catch (error) {
      logger.error(`Failed to stop collection for workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Handle file change events
   */
  private handleFileChange(
    workspaceId: string,
    filePath: string,
    type: 'added' | 'modified' | 'deleted',
    stats?: any
  ): void {
    try {
      const activity = this.workspaceActivity.get(workspaceId);
      if (!activity) return;

      // Categorize the file
      const category = this.categorizeFile(filePath);
      
      // Create file change record
      const change: FileChange = {
        path: filePath,
        type,
        timestamp: new Date(),
        size: stats?.size || 0,
        category
      };

      // Add to activity tracking
      activity.fileChanges.push(change);
      activity.lastActivity = new Date();

      // Update statistics
      if (type === 'added') {
        activity.statistics.totalFiles++;
        activity.statistics.totalSize += change.size;
      } else if (type === 'deleted') {
        activity.statistics.totalFiles--;
        activity.statistics.totalSize -= change.size;
      }

      // Calculate change rate
      const changeWindow = 60000; // 1 minute window
      const recentChanges = activity.fileChanges.filter(
        c => c.timestamp.getTime() > Date.now() - changeWindow
      );
      activity.statistics.changeRate = recentChanges.length;

      // Emit change event
      this.emit('file:changed', { workspaceId, change });

      // Broadcast via WebSocket for real-time updates
      websocketManager.broadcast('barn:file:changed', {
        workspaceId,
        farmId: activity.farmId,
        agentId: activity.agentId,
        change,
        statistics: activity.statistics
      });

      // Check collection triggers
      this.checkCollectionTriggers(workspaceId);

    } catch (error) {
      logger.error(`Error handling file change for workspace ${workspaceId}:`, error);
    }
  }

  /**
   * Categorize file based on extension and path
   */
  private categorizeFile(filePath: string): FileChange['category'] {
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath);

    // Code files
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs'].includes(ext)) {
      return 'code';
    }

    // Config files
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) ||
        ['package.json', 'tsconfig.json', '.eslintrc', '.prettierrc'].includes(baseName)) {
      return 'config';
    }

    // Output files
    if (['.log', '.out', '.txt', '.csv', '.md'].includes(ext) ||
        filePath.includes('/output/') || filePath.includes('/results/')) {
      return 'output';
    }

    // Temp files
    if (filePath.includes('/tmp/') || filePath.includes('/temp/') || 
        baseName.startsWith('.') || baseName.endsWith('~')) {
      return 'temp';
    }

    return 'unknown';
  }

  /**
   * Check if collection should be triggered
   */
  private checkCollectionTriggers(workspaceId: string): void {
    const activity = this.workspaceActivity.get(workspaceId);
    const policy = this.collectionPolicies.get(workspaceId);
    
    if (!activity || !policy || !policy.autoCollect) return;

    // Already has pending collection
    if (this.pendingCollections.has(workspaceId)) return;

    // Check if we're still in grace period (prevents immediate collection on workspace creation)
    if ((activity as any).gracePeriodEnd && new Date() < (activity as any).gracePeriodEnd) {
      logger.debug(`[BarnCollectionService] Still in grace period for workspace ${workspaceId}, skipping collection`);
      return;
    }

    // Check threshold trigger
    if (activity.fileChanges.length >= policy.minChangeThreshold) {
      this.scheduleCollection(workspaceId, {
        type: 'threshold',
        reason: `Reached change threshold (${activity.fileChanges.length} changes)`,
        timestamp: new Date(),
        metrics: { changeCount: activity.fileChanges.length }
      });
      return;
    }

    // Check max time trigger
    if (activity.statistics.lastCollection) {
      const timeSinceLastCollection = Date.now() - activity.statistics.lastCollection.getTime();
      if (timeSinceLastCollection >= policy.maxTimeBetweenCollections) {
        this.scheduleCollection(workspaceId, {
          type: 'scheduled',
          reason: 'Maximum time between collections reached',
          timestamp: new Date(),
          metrics: { timeSinceLastCollection }
        });
      }
    }

    // Check for high-priority file changes
    const hasPriorityChanges = activity.fileChanges.some(change => {
      const ext = path.extname(change.path).toLowerCase();
      return policy.priorityExtensions.includes(ext);
    });

    if (hasPriorityChanges && activity.fileChanges.length >= 3) {
      this.scheduleCollection(workspaceId, {
        type: 'activity',
        reason: 'High-priority file changes detected',
        timestamp: new Date(),
        metrics: { priorityChanges: true }
      });
    }
  }

  /**
   * Check for idle workspaces
   */
  private checkIdleWorkspaces(): void {
    const now = Date.now();

    for (const [workspaceId, activity] of this.workspaceActivity.entries()) {
      const policy = this.collectionPolicies.get(workspaceId);
      if (!policy || !policy.autoCollect) continue;

      const idleTime = now - activity.lastActivity.getTime();
      
      // Check if workspace is idle and has changes
      if (idleTime >= policy.idleTimeThreshold && 
          activity.fileChanges.length > 0 &&
          !this.pendingCollections.has(workspaceId)) {
        
        this.scheduleCollection(workspaceId, {
          type: 'idle',
          reason: `Workspace idle for ${Math.round(idleTime / 1000)}s with pending changes`,
          timestamp: new Date(),
          metrics: { idleTime, changeCount: activity.fileChanges.length }
        });
      }
    }
  }

  /**
   * Update productivity scores for all workspaces
   */
  private updateProductivityScores(): void {
    for (const [workspaceId, activity] of this.workspaceActivity.entries()) {
      // Calculate productivity score based on various factors
      let score = 0;
      
      // Factor 1: Change rate (0-40 points)
      score += Math.min(activity.statistics.changeRate * 2, 40);
      
      // Factor 2: File diversity (0-30 points)
      const categories = new Set(activity.fileChanges.map(c => c.category));
      score += Math.min(categories.size * 10, 30);
      
      // Factor 3: Consistent activity (0-30 points)
      const activityWindow = 300000; // 5 minutes
      const recentActivity = activity.fileChanges.filter(
        c => c.timestamp.getTime() > Date.now() - activityWindow
      ).length;
      score += Math.min(recentActivity * 3, 30);
      
      activity.statistics.productivityScore = Math.min(score, 100);

      // Emit productivity update
      websocketManager.broadcast('barn:productivity:updated', {
        workspaceId,
        farmId: activity.farmId,
        agentId: activity.agentId,
        score: activity.statistics.productivityScore,
        statistics: activity.statistics
      });
    }
  }

  /**
   * Schedule a collection for a workspace
   */
  private scheduleCollection(workspaceId: string, trigger: CollectionTrigger): void {
    if (this.pendingCollections.has(workspaceId)) return;

    this.pendingCollections.add(workspaceId);
    this.collectionQueue.push({ workspaceId, trigger });

    // Emit collection scheduled event
    this.emit('collection:scheduled', { workspaceId, trigger });
    
    websocketManager.broadcast('barn:collection:scheduled', {
      workspaceId,
      trigger,
      queueLength: this.collectionQueue.length
    });

    logger.info(`Scheduled collection for workspace ${workspaceId}: ${trigger.reason}`);
  }

  /**
   * Process the collection queue
   */
  private async processCollectionQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    while (true) {
      try {
        if (this.collectionQueue.length === 0) {
          await this.delay(1000); // Wait 1 second before checking again
          continue;
        }

        const { workspaceId, trigger } = this.collectionQueue.shift()!;
        
        // Perform collection
        await this.performCollection(workspaceId, trigger);
        
        // Remove from pending
        this.pendingCollections.delete(workspaceId);

        // Small delay between collections
        await this.delay(500);

      } catch (error) {
        logger.error('Error processing collection queue:', error);
        await this.delay(5000); // Wait 5 seconds on error
      }
    }
  }

  /**
   * Perform actual collection for a workspace
   */
  private async performCollection(workspaceId: string, trigger: CollectionTrigger): Promise<void> {
    try {
      const activity = this.workspaceActivity.get(workspaceId);
      if (!activity) return;

      logger.info(`Starting collection for workspace ${workspaceId}`);
      
      // Emit collection started event
      this.emit('collection:started', { workspaceId, trigger });
      
      websocketManager.broadcast('barn:collection:started', {
        workspaceId,
        farmId: activity.farmId,
        agentId: activity.agentId,
        trigger
      });

      // Get changed files since last collection
      const lastCollection = activity.statistics.lastCollection;
      const filesToCollect = activity.fileChanges.filter(change => {
        if (!lastCollection) return true;
        return change.timestamp > lastCollection;
      });

      // Group files by category for organized collection
      const filesByCategory = this.groupFilesByCategory(filesToCollect);

      // First create the harvest in harvestService
      const harvest = await harvestService.createHarvest({
        farmId: activity.farmId || workspaceId,
        farmName: `Workspace ${workspaceId.slice(-8)}`,
        userId: 'system',
        description: `Auto-collected workspace files (${trigger})`,
        tags: ['workspace-collection', trigger]
      });

      // Collect files to barn
      const collectionResult = await this.collectFilesToBarn(workspaceId, filesToCollect);

      // Add yield to harvest
      for (const file of collectionResult.files) {
        await harvestService.addYield(harvest.id, {
          type: 'file',
          path: file.relativePath,
          content: file.content,
          category: file.category || 'workspace'
        });
      }

      // Complete the harvest
      await harvestService.completeHarvest(harvest.id, 'system', {
        summary: {
          totalFiles: filesToCollect.length,
          categories: Object.keys(filesByCategory),
          productivityScore: activity.statistics.productivityScore,
          collectionTime: new Date(),
          trigger,
          statistics: activity.statistics,
          collectionDuration: collectionResult.duration
        }
      });

      // Update activity statistics
      activity.statistics.lastCollection = new Date();
      activity.fileChanges = []; // Clear processed changes

      // Store in barn
      await barnService.storeHarvest(harvest.id, {
        metadata: {
          trigger,
          statistics: activity.statistics,
          collectionDuration: collectionResult.duration
        }
      });

      // Emit collection completed event
      this.emit('collection:completed', {
        workspaceId,
        harvestId: harvest.id,
        filesCollected: collectionResult.files.length,
        trigger
      });

      websocketManager.broadcast('barn:collection:completed', {
        workspaceId,
        farmId: activity.farmId,
        agentId: activity.agentId,
        harvestId: harvest.id,
        filesCollected: collectionResult.files.length,
        trigger,
        statistics: activity.statistics
      });

      logger.info(`Collection completed for workspace ${workspaceId}: ${collectionResult.files.length} files collected`);

    } catch (error) {
      logger.error(`Failed to perform collection for workspace ${workspaceId}:`, error);
      
      this.emit('collection:failed', { workspaceId, error: error.message });
      
      websocketManager.broadcast('barn:collection:failed', {
        workspaceId,
        error: error.message
      });
    }
  }

  /**
   * Group files by category
   */
  private groupFilesByCategory(files: FileChange[]): Record<string, FileChange[]> {
    const grouped: Record<string, FileChange[]> = {};
    
    for (const file of files) {
      if (!grouped[file.category]) {
        grouped[file.category] = [];
      }
      grouped[file.category].push(file);
    }
    
    return grouped;
  }

  /**
   * Collect files to barn storage
   */
  private async collectFilesToBarn(
    workspaceId: string,
    files: FileChange[]
  ): Promise<{ files: any[]; duration: number }> {
    const startTime = Date.now();
    const collectedFiles: any[] = [];

    for (const file of files) {
      if (file.type === 'deleted') continue;

      try {
        // Read file content if it exists
        const exists = await fileManager.fileExists(file.path);
        if (!exists) continue;

        // Check if it's a directory and skip if so
        const stats = await fs.stat(file.path);
        if (stats.isDirectory()) {
          logger.debug(`[BarnCollection] Skipping directory: ${file.path}`);
          continue;
        }

        const content = await fileManager.readFile(file.path);

        collectedFiles.push({
          path: file.path,
          relativePath: path.relative(workspaceId.startsWith('/') ? workspaceId : pathConfig.getFarmWorkspacePath(workspaceId), file.path),
          content,
          size: stats.size,
          modified: stats.mtime,
          category: file.category
        });

      } catch (error) {
        logger.warn(`Failed to collect file ${file.path}:`, error);
      }
    }

    return {
      files: collectedFiles,
      duration: Date.now() - startTime
    };
  }

  /**
   * Get collection status for a workspace
   */
  public getCollectionStatus(workspaceId: string): any {
    const activity = this.workspaceActivity.get(workspaceId);
    const policy = this.collectionPolicies.get(workspaceId);
    const isWatching = this.watchers.has(workspaceId);
    const isPending = this.pendingCollections.has(workspaceId);

    return {
      workspaceId,
      isActive: isWatching,
      hasPendingCollection: isPending,
      activity: activity ? {
        lastActivity: activity.lastActivity,
        pendingChanges: activity.fileChanges.length,
        statistics: activity.statistics
      } : null,
      policy
    };
  }

  /**
   * Get all active collection sessions
   */
  public getActiveCollection(): any[] {
    const active: any[] = [];
    
    for (const workspaceId of this.watchers.keys()) {
      active.push(this.getCollectionStatus(workspaceId));
    }
    
    return active;
  }

  /**
   * Trigger manual collection
   */
  public async triggerManualCollection(workspaceId: string): Promise<void> {
    const activity = this.workspaceActivity.get(workspaceId);
    if (!activity) {
      throw new Error(`No collection active for workspace ${workspaceId}`);
    }

    await this.triggerCollection(workspaceId, {
      type: 'manual',
      reason: 'Manual collection triggered by user',
      timestamp: new Date()
    });
  }

  /**
   * Internal trigger collection method
   */
  private async triggerCollection(workspaceId: string, trigger: CollectionTrigger): Promise<void> {
    this.scheduleCollection(workspaceId, trigger);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on service shutdown
   */
  public async shutdown(): Promise<void> {
    // Stop all watchers
    for (const [workspaceId, watcher] of this.watchers.entries()) {
      await watcher.close();
    }
    this.watchers.clear();

    // Clear intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
    }

    logger.info('BarnCollectionService shut down');
  }
}

// Export singleton instance
export const barnCollectionService = new BarnCollectionService();