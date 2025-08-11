import * as fs from 'fs/promises';
import * as path from 'path';
import { pathConfig } from '../config/paths';
import { logger } from '../utils/logger';

/**
 * Service to count tasks completed based on files created by agents
 * Each file created by an agent represents a completed task
 */
export class TaskCountService {
  private static instance: TaskCountService;

  private constructor() {}

  static getInstance(): TaskCountService {
    if (!TaskCountService.instance) {
      TaskCountService.instance = new TaskCountService();
    }
    return TaskCountService.instance;
  }

  /**
   * Count files created in a farm's workspace
   * This represents the number of tasks completed by all agents in the farm
   */
  async countTasksForFarm(farmId: string): Promise<number> {
    try {
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
      
      // Check if workspace exists
      try {
        await fs.access(workspacePath);
      } catch {
        // Workspace doesn't exist yet, no tasks completed
        return 0;
      }

      // Count all files recursively in the workspace
      const count = await this.countFilesRecursively(workspacePath);
      
      logger.debug(`[TaskCountService] Farm ${farmId} has ${count} files (tasks completed)`);
      return count;
    } catch (error) {
      logger.error(`[TaskCountService] Error counting tasks for farm ${farmId}:`, error);
      return 0;
    }
  }

  /**
   * Count files created by a specific agent in a farm
   * Agents typically work in their own subdirectories
   */
  async countTasksForAgent(farmId: string, agentId: string | number): Promise<number> {
    try {
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
      const agentPath = path.join(workspacePath, `agent_${agentId}`);
      
      // Check if agent directory exists
      try {
        await fs.access(agentPath);
      } catch {
        // Agent directory doesn't exist, try counting in the main workspace
        // Some agents might create files directly in the workspace
        return this.countFilesWithAgentMarker(workspacePath, agentId);
      }

      // Count files in agent's directory
      const count = await this.countFilesRecursively(agentPath);
      
      logger.debug(`[TaskCountService] Agent ${agentId} in farm ${farmId} has ${count} files (tasks completed)`);
      return count;
    } catch (error) {
      logger.error(`[TaskCountService] Error counting tasks for agent ${agentId} in farm ${farmId}:`, error);
      return 0;
    }
  }

  /**
   * Count files in harvest storage for a farm
   * This represents completed and collected tasks
   */
  async countHarvestedTasks(farmId: string): Promise<number> {
    try {
      // Check both active and completed harvests
      const activeCount = await this.countHarvestFiles(farmId, false);
      const completedCount = await this.countHarvestFiles(farmId, true);
      
      const total = activeCount + completedCount;
      logger.debug(`[TaskCountService] Farm ${farmId} has ${total} harvested files`);
      return total;
    } catch (error) {
      logger.error(`[TaskCountService] Error counting harvested tasks for farm ${farmId}:`, error);
      return 0;
    }
  }

  /**
   * Get detailed task statistics for a farm
   */
  async getTaskStatistics(farmId: string): Promise<{
    totalTasks: number;
    harvestedTasks: number;
    pendingTasks: number;
    tasksByType: Record<string, number>;
  }> {
    try {
      const totalTasks = await this.countTasksForFarm(farmId);
      const harvestedTasks = await this.countHarvestedTasks(farmId);
      const tasksByType = await this.categorizeTasksByFileType(farmId);
      
      return {
        totalTasks,
        harvestedTasks,
        pendingTasks: Math.max(0, totalTasks - harvestedTasks),
        tasksByType
      };
    } catch (error) {
      logger.error(`[TaskCountService] Error getting task statistics for farm ${farmId}:`, error);
      return {
        totalTasks: 0,
        harvestedTasks: 0,
        pendingTasks: 0,
        tasksByType: {}
      };
    }
  }

  /**
   * Count files recursively in a directory
   */
  private async countFilesRecursively(dirPath: string): Promise<number> {
    let count = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip special directories
          if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.cache') {
            continue;
          }
          // Recursively count files in subdirectories
          count += await this.countFilesRecursively(fullPath);
        } else if (entry.isFile()) {
          // Skip special files
          if (!entry.name.startsWith('.') && entry.name !== 'package-lock.json') {
            count++;
          }
        }
      }
    } catch (error) {
      logger.warn(`[TaskCountService] Error reading directory ${dirPath}:`, error);
    }
    
    return count;
  }

  /**
   * Count files that might have been created by a specific agent
   * Look for files with agent markers in their name or content
   */
  private async countFilesWithAgentMarker(workspacePath: string, agentId: string | number): Promise<number> {
    let count = 0;
    
    try {
      const entries = await fs.readdir(workspacePath, { withFileTypes: true });
      const agentMarker = `agent_${agentId}`;
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.includes(agentMarker)) {
          count++;
        }
      }
    } catch (error) {
      logger.warn(`[TaskCountService] Error counting agent files:`, error);
    }
    
    return count;
  }

  /**
   * Count files in harvest storage
   */
  private async countHarvestFiles(farmId: string, completed: boolean): Promise<number> {
    try {
      const harvestPath = pathConfig.getHarvestPath(farmId, completed);
      
      try {
        await fs.access(harvestPath);
      } catch {
        return 0; // Harvest directory doesn't exist
      }
      
      // Count yield files specifically (these are the actual task outputs)
      const yieldPath = path.join(harvestPath, 'yield');
      
      try {
        await fs.access(yieldPath);
        return await this.countFilesRecursively(yieldPath);
      } catch {
        // No yield directory, count all files
        return await this.countFilesRecursively(harvestPath);
      }
    } catch (error) {
      logger.warn(`[TaskCountService] Error counting harvest files:`, error);
      return 0;
    }
  }

  /**
   * Categorize tasks by file type
   */
  private async categorizeTasksByFileType(farmId: string): Promise<Record<string, number>> {
    const categories: Record<string, number> = {
      code: 0,
      documentation: 0,
      data: 0,
      config: 0,
      other: 0
    };
    
    try {
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
      
      try {
        await fs.access(workspacePath);
      } catch {
        return categories;
      }
      
      await this.categorizeFilesRecursively(workspacePath, categories);
    } catch (error) {
      logger.warn(`[TaskCountService] Error categorizing tasks:`, error);
    }
    
    return categories;
  }

  /**
   * Recursively categorize files by type
   */
  private async categorizeFilesRecursively(dirPath: string, categories: Record<string, number>): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip special directories
          if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.cache') {
            continue;
          }
          await this.categorizeFilesRecursively(fullPath, categories);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          // Categorize by extension
          if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs'].includes(ext)) {
            categories.code++;
          } else if (['.md', '.txt', '.doc', '.pdf', '.rst'].includes(ext)) {
            categories.documentation++;
          } else if (['.json', '.csv', '.xml', '.sql', '.db'].includes(ext)) {
            categories.data++;
          } else if (['.yaml', '.yml', '.toml', '.ini', '.env', '.config'].includes(ext)) {
            categories.config++;
          } else if (!entry.name.startsWith('.')) {
            categories.other++;
          }
        }
      }
    } catch (error) {
      logger.warn(`[TaskCountService] Error categorizing files in ${dirPath}:`, error);
    }
  }

  /**
   * Watch for new files (tasks) in a farm workspace
   * Returns a cleanup function to stop watching
   */
  async watchTaskCompletion(
    farmId: string, 
    callback: (newTaskCount: number) => void
  ): Promise<() => void> {
    try {
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
      
      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Use fs.watch for real-time updates
      const watcher = (await import('chokidar')).watch(workspacePath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true
      });
      
      // Debounce function to avoid too many updates
      let debounceTimer: NodeJS.Timeout;
      const debouncedUpdate = async () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const count = await this.countTasksForFarm(farmId);
          callback(count);
        }, 1000); // Wait 1 second after last change
      };
      
      watcher.on('add', debouncedUpdate);
      watcher.on('unlink', debouncedUpdate);
      
      // Return cleanup function
      return () => {
        clearTimeout(debounceTimer);
        watcher.close();
      };
    } catch (error) {
      logger.error(`[TaskCountService] Error setting up task watcher for farm ${farmId}:`, error);
      return () => {}; // Return no-op cleanup function
    }
  }
}

// Export singleton instance
export const taskCountService = TaskCountService.getInstance();