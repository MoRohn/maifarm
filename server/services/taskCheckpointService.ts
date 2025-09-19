import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';

export interface TaskCheckpoint {
  checkpointId: string;
  taskId: string;
  agentId: string;
  farmId: string;
  stage: string;
  progress: number;
  state: {
    variables: Record<string, any>;
    files: string[];
    outputs: string[];
    dependencies: string[];
  };
  metadata: {
    createdAt: Date;
    duration: number;
    memoryUsage: number;
    retryable: boolean;
  };
}

export interface CheckpointRestoreResult {
  success: boolean;
  checkpointId: string;
  restoredTo: string;
  newAgentId?: string;
  error?: string;
}

export class TaskCheckpointService {
  private readonly CHECKPOINT_DIR: string;
  private readonly MAX_CHECKPOINTS_PER_TASK = 10;
  private readonly CHECKPOINT_RETENTION_HOURS = 24;
  private activeCheckpoints: Map<string, TaskCheckpoint[]> = new Map();

  constructor() {
    const paths = pathConfig.getPaths();
    this.CHECKPOINT_DIR = path.join(paths.MAIBARN_ROOT, 'checkpoints');
    this.initializeCheckpointStorage();
    this.startCleanupScheduler();
  }

  /**
   * Initialize checkpoint storage directory
   */
  private async initializeCheckpointStorage(): Promise<void> {
    try {
      await fileManager.ensureDirectory(this.CHECKPOINT_DIR);
      logger.info('[TaskCheckpointService] Checkpoint storage initialized');
    } catch (error) {
      logger.error('[TaskCheckpointService] Failed to initialize checkpoint storage:', error);
    }
  }

  /**
   * Create a checkpoint for a task
   */
  async createCheckpoint(
    taskId: string,
    agentId: string,
    farmId: string,
    stage: string,
    progress: number,
    state: TaskCheckpoint['state']
  ): Promise<TaskCheckpoint> {
    const checkpointId = uuidv4();
    const checkpoint: TaskCheckpoint = {
      checkpointId,
      taskId,
      agentId,
      farmId,
      stage,
      progress,
      state,
      metadata: {
        createdAt: new Date(),
        duration: 0, // Will be calculated from task start time
        memoryUsage: process.memoryUsage().heapUsed,
        retryable: true
      }
    };

    try {
      // Save checkpoint to filesystem
      await this.saveCheckpointToFile(checkpoint);

      // Save checkpoint metadata to database
      await this.saveCheckpointToDatabase(checkpoint);

      // Update in-memory cache
      const taskCheckpoints = this.activeCheckpoints.get(taskId) || [];
      taskCheckpoints.push(checkpoint);
      
      // Limit checkpoints per task
      if (taskCheckpoints.length > this.MAX_CHECKPOINTS_PER_TASK) {
        const removed = taskCheckpoints.shift();
        if (removed) {
          await this.deleteCheckpointFile(removed.checkpointId);
        }
      }
      
      this.activeCheckpoints.set(taskId, taskCheckpoints);

      // Emit checkpoint created event
      websocketManager.broadcast('task:checkpoint:created', {
        taskId,
        checkpointId,
        stage,
        progress,
        timestamp: checkpoint.metadata.createdAt
      });

      logger.info(`[TaskCheckpointService] Created checkpoint ${checkpointId} for task ${taskId} at stage ${stage} (${progress}%)`);

      return checkpoint;
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to create checkpoint for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Resume a task from checkpoint
   */
  async resumeFromCheckpoint(
    checkpointId: string,
    newAgentId?: string
  ): Promise<CheckpointRestoreResult> {
    try {
      // Load checkpoint
      const checkpoint = await this.loadCheckpoint(checkpointId);
      if (!checkpoint) {
        return {
          success: false,
          checkpointId,
          restoredTo: '',
          error: 'Checkpoint not found'
        };
      }

      // Use new agent or same agent
      const targetAgentId = newAgentId || checkpoint.agentId;

      // Restore task state
      await this.restoreTaskState(checkpoint, targetAgentId);

      // Update task assignment
      await db.query(
        `UPDATE tasks 
         SET agent_id = $1, 
             status = 'processing', 
             metadata = jsonb_set(metadata, '{resumedFrom}', $2::jsonb),
             updated_at = NOW()
         WHERE id = $3`,
        [targetAgentId, JSON.stringify(checkpointId), checkpoint.taskId]
      );

      // Restore files to workspace
      await this.restoreWorkspaceFiles(checkpoint, targetAgentId);

      // Emit resume event
      websocketManager.broadcast('task:resumed', {
        taskId: checkpoint.taskId,
        checkpointId,
        agentId: targetAgentId,
        stage: checkpoint.stage,
        progress: checkpoint.progress,
        timestamp: new Date()
      });

      logger.info(`[TaskCheckpointService] Successfully resumed task ${checkpoint.taskId} from checkpoint ${checkpointId}`);

      return {
        success: true,
        checkpointId,
        restoredTo: checkpoint.stage,
        newAgentId: targetAgentId
      };
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to resume from checkpoint ${checkpointId}:`, error);
      return {
        success: false,
        checkpointId,
        restoredTo: '',
        error: error.message
      };
    }
  }

  /**
   * Get all checkpoints for a task
   */
  async getTaskCheckpoints(taskId: string): Promise<TaskCheckpoint[]> {
    try {
      // Check cache first
      const cached = this.activeCheckpoints.get(taskId);
      if (cached && cached.length > 0) {
        return cached;
      }

      // Load from database
      const result = await db.query(
        `SELECT * FROM task_checkpoints 
         WHERE task_id = $1 
         ORDER BY created_at DESC`,
        [taskId]
      );

      const checkpoints: TaskCheckpoint[] = [];
      for (const row of result.rows) {
        const checkpoint = await this.loadCheckpoint(row.checkpoint_id);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }

      // Update cache
      this.activeCheckpoints.set(taskId, checkpoints);

      return checkpoints;
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to get checkpoints for task ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Get the latest checkpoint for a task
   */
  async getLatestCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    const checkpoints = await this.getTaskCheckpoints(taskId);
    return checkpoints.length > 0 ? checkpoints[0] : null;
  }

  /**
   * Delete checkpoints for a task
   */
  async deleteTaskCheckpoints(taskId: string): Promise<void> {
    try {
      const checkpoints = await this.getTaskCheckpoints(taskId);
      
      // Delete files
      for (const checkpoint of checkpoints) {
        await this.deleteCheckpointFile(checkpoint.checkpointId);
      }

      // Delete from database
      await db.query('DELETE FROM task_checkpoints WHERE task_id = $1', [taskId]);

      // Clear cache
      this.activeCheckpoints.delete(taskId);

      logger.info(`[TaskCheckpointService] Deleted ${checkpoints.length} checkpoints for task ${taskId}`);
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to delete checkpoints for task ${taskId}:`, error);
    }
  }

  /**
   * Save checkpoint to file
   */
  private async saveCheckpointToFile(checkpoint: TaskCheckpoint): Promise<void> {
    const checkpointPath = path.join(this.CHECKPOINT_DIR, `${checkpoint.checkpointId}.json`);
    await fileManager.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Save checkpoint metadata to database
   */
  private async saveCheckpointToDatabase(checkpoint: TaskCheckpoint): Promise<void> {
    await db.query(
      `INSERT INTO task_checkpoints 
       (checkpoint_id, task_id, agent_id, farm_id, stage, progress, state, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        checkpoint.checkpointId,
        checkpoint.taskId,
        checkpoint.agentId,
        checkpoint.farmId,
        checkpoint.stage,
        checkpoint.progress,
        JSON.stringify(checkpoint.state),
        JSON.stringify(checkpoint.metadata),
        checkpoint.metadata.createdAt
      ]
    );
  }

  /**
   * Load checkpoint from storage
   */
  private async loadCheckpoint(checkpointId: string): Promise<TaskCheckpoint | null> {
    try {
      const checkpointPath = path.join(this.CHECKPOINT_DIR, `${checkpointId}.json`);
      const data = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  /**
   * Delete checkpoint file
   */
  private async deleteCheckpointFile(checkpointId: string): Promise<void> {
    try {
      const checkpointPath = path.join(this.CHECKPOINT_DIR, `${checkpointId}.json`);
      await fs.unlink(checkpointPath);
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to delete checkpoint file ${checkpointId}:`, error);
    }
  }

  /**
   * Restore task state from checkpoint
   */
  private async restoreTaskState(checkpoint: TaskCheckpoint, agentId: string): Promise<void> {
    // Save state to coordination files for agent to pick up
    const coordinationPath = path.join(
      pathConfig.getPath('COORDINATION_DIR'),
      'task_state',
      checkpoint.taskId
    );

    await fileManager.ensureDirectory(coordinationPath);
    
    // Write state files
    await fileManager.writeFile(
      path.join(coordinationPath, 'checkpoint.json'),
      JSON.stringify({
        checkpointId: checkpoint.checkpointId,
        stage: checkpoint.stage,
        progress: checkpoint.progress,
        agentId,
        restoredAt: new Date()
      })
    );

    await fileManager.writeFile(
      path.join(coordinationPath, 'state.json'),
      JSON.stringify(checkpoint.state)
    );
  }

  /**
   * Restore workspace files from checkpoint
   */
  private async restoreWorkspaceFiles(checkpoint: TaskCheckpoint, agentId: string): Promise<void> {
    if (!checkpoint.state.files || checkpoint.state.files.length === 0) {
      return;
    }

    const workspacePath = await this.getAgentWorkspace(checkpoint.farmId, agentId);
    
    for (const file of checkpoint.state.files) {
      try {
        // Copy file from checkpoint storage to workspace
        const checkpointFilePath = path.join(this.CHECKPOINT_DIR, 'files', checkpoint.checkpointId, file);
        const workspaceFilePath = path.join(workspacePath, file);
        
        // Ensure directory exists
        await fileManager.ensureDirectory(path.dirname(workspaceFilePath));
        
        // Copy file
        await fs.copyFile(checkpointFilePath, workspaceFilePath);
      } catch (error) {
        logger.warn(`[TaskCheckpointService] Failed to restore file ${file}:`, error);
      }
    }
  }

  /**
   * Get agent workspace path
   */
  private async getAgentWorkspace(farmId: string, agentId: string): Promise<string> {
    const workspacePath = path.join(
      pathConfig.getPath('WORKSPACE_ROOT'),
      farmId
    );
    await fileManager.ensureDirectory(workspacePath);
    return workspacePath;
  }

  /**
   * Start cleanup scheduler for old checkpoints
   */
  private startCleanupScheduler(): void {
    // Run cleanup every hour
    setInterval(async () => {
      await this.cleanupOldCheckpoints();
    }, 3600000); // 1 hour

    logger.info('[TaskCheckpointService] Started checkpoint cleanup scheduler');
  }

  /**
   * Clean up old checkpoints
   */
  private async cleanupOldCheckpoints(): Promise<void> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - this.CHECKPOINT_RETENTION_HOURS);

      // Get old checkpoints from database
      const result = await db.query(
        `SELECT checkpoint_id FROM task_checkpoints 
         WHERE created_at < $1`,
        [cutoffTime]
      );

      let deletedCount = 0;
      for (const row of result.rows) {
        await this.deleteCheckpointFile(row.checkpoint_id);
        deletedCount++;
      }

      // Delete from database
      await db.query(
        `DELETE FROM task_checkpoints WHERE created_at < $1`,
        [cutoffTime]
      );

      if (deletedCount > 0) {
        logger.info(`[TaskCheckpointService] Cleaned up ${deletedCount} old checkpoints`);
      }
    } catch (error) {
      logger.error('[TaskCheckpointService] Failed to clean up old checkpoints:', error);
    }
  }

  /**
   * Create automatic checkpoint based on task progress
   */
  async createAutomaticCheckpoint(
    taskId: string,
    agentId: string,
    farmId: string
  ): Promise<void> {
    try {
      // Get task details
      const taskResult = await db.query(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskResult.rows.length === 0) return;

      const task = taskResult.rows[0];
      const progress = task.progress || 0;

      // Create checkpoint at specific progress milestones
      const milestones = [25, 50, 75, 90];
      const shouldCheckpoint = milestones.some(m => 
        progress >= m && progress < m + 5
      );

      if (shouldCheckpoint) {
        await this.createCheckpoint(
          taskId,
          agentId,
          farmId,
          task.current_stage || 'processing',
          progress,
          {
            variables: task.state || {},
            files: task.output_files || [],
            outputs: task.outputs || [],
            dependencies: task.dependencies || []
          }
        );
      }
    } catch (error) {
      logger.error(`[TaskCheckpointService] Failed to create automatic checkpoint for task ${taskId}:`, error);
    }
  }

  /**
   * Get checkpoint statistics
   */
  async getCheckpointStats(): Promise<{
    totalCheckpoints: number;
    activeTasksWithCheckpoints: number;
    averageCheckpointsPerTask: number;
    oldestCheckpoint: Date | null;
    totalStorageSize: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT task_id) as tasks,
          MIN(created_at) as oldest
        FROM task_checkpoints
      `);

      const stats = result.rows[0];
      const avgCheckpoints = stats.tasks > 0 ? stats.total / stats.tasks : 0;

      // Calculate storage size
      const files = await fs.readdir(this.CHECKPOINT_DIR);
      let totalSize = 0;
      for (const file of files) {
        const stat = await fs.stat(path.join(this.CHECKPOINT_DIR, file));
        totalSize += stat.size;
      }

      return {
        totalCheckpoints: parseInt(stats.total),
        activeTasksWithCheckpoints: parseInt(stats.tasks),
        averageCheckpointsPerTask: avgCheckpoints,
        oldestCheckpoint: stats.oldest,
        totalStorageSize: totalSize
      };
    } catch (error) {
      logger.error('[TaskCheckpointService] Failed to get checkpoint stats:', error);
      return {
        totalCheckpoints: 0,
        activeTasksWithCheckpoints: 0,
        averageCheckpointsPerTask: 0,
        oldestCheckpoint: null,
        totalStorageSize: 0
      };
    }
  }
}

// Export singleton instance
export const taskCheckpointService = new TaskCheckpointService();