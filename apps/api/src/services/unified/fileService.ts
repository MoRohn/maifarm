/**
 * Unified File Service - Manages all file operations with proper isolation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseService } from './types';
import { logger, LogCategory } from '../../utils/logger';
import { pathConfig } from '../../config/paths';

export class UnifiedFileService implements BaseService {
  private paths = pathConfig.getPaths();

  async initialize(): Promise<void> {
    // Ensure all required directories exist
    await this.ensureDirectories();
    logger.info(LogCategory.FILE, 'File Service initialized');
  }

  async shutdown(): Promise<void> {
    logger.info(LogCategory.FILE, 'File Service shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await fs.access(this.paths.MAIBARN_ROOT);
      return { healthy: true, message: 'File system accessible' };
    } catch (error) {
      return { healthy: false, message: 'File system error' };
    }
  }

  getStats(): Record<string, any> {
    return {
      maibarnRoot: this.paths.MAIBARN_ROOT,
      workspacesActive: this.paths.FARM_WORKSPACES_ACTIVE
    };
  }

  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.paths.MAIBARN_ROOT,
      this.paths.FARM_WORKSPACES_ACTIVE,
      this.paths.COORDINATION_DIR,
      this.paths.HARVEST_DIR,
      this.paths.TERMINAL_DIR
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async createWorkspace(farmId: string): Promise<string> {
    const workspacePath = path.join(this.paths.FARM_WORKSPACES_ACTIVE, farmId);
    await fs.mkdir(workspacePath, { recursive: true });
    return workspacePath;
  }

  async cleanupWorkspace(farmId: string): Promise<void> {
    const workspacePath = path.join(this.paths.FARM_WORKSPACES_ACTIVE, farmId);
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(LogCategory.FILE, `Failed to cleanup workspace ${farmId}:`, error);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}