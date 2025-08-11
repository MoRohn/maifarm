import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { TmuxHelper } from './tmuxHelper';
import { HarvestYield } from '../../src/types/harvest';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig, getHarvestPath } from '../config/paths';
import { fileManager } from './fileManagerService';
import { 
  FILE_COLLECTION_TIMEOUT, 
  FILE_COLLECTION_RETRY_DELAY, 
  FILE_COLLECTION_MAX_RETRIES 
} from '../constants/timing';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  children?: FileTreeNode[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface HarvestFileCollection {
  harvestId: string;
  rootPath: string;
  fileTree: FileTreeNode;
  totalFiles: number;
  totalSize: number;
  collectedAt: Date;
}

export class HarvestFileCollector {
  private baseStoragePath: string;
  private coordinationDir: string;

  constructor() {
    // Use centralized path configuration for isolated storage
    const paths = pathConfig.getPaths();
    this.baseStoragePath = paths.HARVEST_STORAGE_ACTIVE;
    this.coordinationDir = paths.COORDINATION_DIR;
    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      // Use fileManager to ensure directory exists with proper validation
      await fileManager.ensureDirectory(this.baseStoragePath);
      logger.info(`[HarvestFileCollector] Storage initialized at ${this.baseStoragePath} (isolated)`);
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to initialize storage:', error);
    }
  }

  /**
   * Collect all files for a harvest with retry logic and validation
   */
  async collectHarvestFiles(
    harvestId: string,
    farmId: string,
    farmName: string,
    agentIds: string[] = []
  ): Promise<HarvestFileCollection> {
    let retryCount = 0;
    const collectionErrors: string[] = [];

    while (retryCount <= FILE_COLLECTION_MAX_RETRIES) {
      try {
        // Use centralized path helper for harvest path
        const harvestPath = getHarvestPath(harvestId, false);
        await this.createHarvestDirectoryStructure(harvestPath);

        // Emit start event
        websocketManager.broadcast('harvest:collection-started', {
          harvestId,
          timestamp: new Date(),
          retry: retryCount > 0 ? retryCount : undefined
        });

        // Collect with validation for each step
        const collectionSteps = [
          {
            name: 'config',
            fn: async () => {
              await this.collectFarmYamlWithRetry(harvestPath, farmId);
              websocketManager.broadcast('harvest:file-collected', {
                harvestId,
                type: 'config',
                file: 'farm.yaml'
              });
            }
          },
          {
            name: 'logs',
            fn: async () => {
              const sessionName = `farm_${farmId.substring(0, 8)}`;
              await this.collectAgentLogsWithRetry(harvestPath, sessionName, agentIds);
              websocketManager.broadcast('harvest:file-collected', {
                harvestId,
                type: 'logs',
                count: agentIds.length
              });
            }
          },
          {
            name: 'workspace',
            fn: async () => {
              const filesCollected = await this.collectWorkspaceFiles(harvestPath, farmId);
              if (filesCollected > 0) {
                websocketManager.broadcast('harvest:file-collected', {
                  harvestId,
                  type: 'workspace',
                  count: filesCollected
                });
              }
            }
          },
          {
            name: 'summary',
            fn: async () => {
              await this.generateHarvestSummary(harvestPath, {
                harvestId,
                farmId,
                farmName,
                collectedAt: new Date(),
                agentCount: agentIds.length
              });
              websocketManager.broadcast('harvest:file-collected', {
                harvestId,
                type: 'summary',
                file: 'harvest-summary.json'
              });
            }
          }
        ];

        // Execute collection steps with error tracking
        for (const step of collectionSteps) {
          try {
            await step.fn();
          } catch (stepError) {
            const errorMsg = `Failed to collect ${step.name}: ${stepError}`;
            logger.warn(`[HarvestFileCollector] ${errorMsg}`);
            collectionErrors.push(errorMsg);
            // Continue with other steps even if one fails
          }
        }

        // Build and validate file tree
        const fileTree = await this.buildFileTree(harvestPath);
        const stats = await this.calculateTreeStats(fileTree);
        
        // Validate collection completeness
        const validation = await this.validateCollection(harvestPath, stats);
        if (!validation.isValid) {
          throw new Error(`Collection validation failed: ${validation.errors.join(', ')}`);
        }

        // Emit completion event
        websocketManager.broadcast('harvest:file-tree-ready', {
          harvestId,
          fileTree,
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          validationPassed: true
        });

        const collection: HarvestFileCollection = {
          harvestId,
          rootPath: harvestPath,
          fileTree,
          totalFiles: stats.totalFiles,
          totalSize: stats.totalSize,
          collectedAt: new Date()
        };

        logger.info(`[HarvestFileCollector] Successfully collected ${stats.totalFiles} files for harvest ${harvestId}`, {
          retries: retryCount,
          errors: collectionErrors.length
        });
        
        return collection;
        
      } catch (error) {
        retryCount++;
        logger.error(`[HarvestFileCollector] Collection attempt ${retryCount} failed for harvest ${harvestId}:`, error);
        
        if (retryCount > FILE_COLLECTION_MAX_RETRIES) {
          logger.error(`[HarvestFileCollector] Max retries exceeded for harvest ${harvestId}`);
          throw new Error(`File collection failed after ${FILE_COLLECTION_MAX_RETRIES} retries: ${error}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, FILE_COLLECTION_RETRY_DELAY));
      }
    }
    
    throw new Error('File collection failed: Max retries exceeded');
  }

  /**
   * Create directory structure for harvest
   */
  private async createHarvestDirectoryStructure(harvestPath: string): Promise<void> {
    const directories = [
      path.join(harvestPath, 'config'),
      path.join(harvestPath, 'logs'),
      path.join(harvestPath, 'yield', 'code'),
      path.join(harvestPath, 'yield', 'docs'),
      path.join(harvestPath, 'yield', 'data'),
      path.join(harvestPath, 'yield', 'reports'),
      path.join(harvestPath, 'summary')
    ];

    for (const dir of directories) {
      // Use fileManager for directory creation with validation
      await fileManager.ensureDirectory(dir);
    }
  }

  /**
   * Validate collection completeness
   */
  private async validateCollection(
    harvestPath: string, 
    stats: { totalFiles: number; totalSize: number }
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Check minimum file requirements
      if (stats.totalFiles === 0) {
        errors.push('No files collected');
      }
      
      // Check required directories exist
      const requiredDirs = ['config', 'logs', 'yield', 'summary'];
      for (const dir of requiredDirs) {
        const dirPath = path.join(harvestPath, dir);
        try {
          const stat = await fs.stat(dirPath);
          if (!stat.isDirectory()) {
            errors.push(`Required directory missing: ${dir}`);
          }
        } catch {
          errors.push(`Required directory missing: ${dir}`);
        }
      }
      
      // Check for harvest summary file
      const summaryPath = path.join(harvestPath, 'summary', 'harvest-summary.json');
      try {
        await fs.access(summaryPath);
      } catch {
        errors.push('Harvest summary file missing');
      }
      
      // Validate file sizes (ensure no corrupted empty files)
      if (stats.totalSize === 0 && stats.totalFiles > 0) {
        errors.push('All collected files are empty');
      }
      
    } catch (error) {
      logger.error('[HarvestFileCollector] Validation error:', error);
      errors.push(`Validation error: ${error}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Collect farm YAML configuration with retry
   */
  private async collectFarmYamlWithRetry(harvestPath: string, farmId: string): Promise<void> {
    let attempts = 0;
    while (attempts < FILE_COLLECTION_MAX_RETRIES) {
      try {
        await this.collectFarmYaml(harvestPath, farmId);
        return;
      } catch (error) {
        attempts++;
        if (attempts >= FILE_COLLECTION_MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, FILE_COLLECTION_RETRY_DELAY));
      }
    }
  }

  /**
   * Collect agent logs with retry
   */
  private async collectAgentLogsWithRetry(
    harvestPath: string, 
    sessionName: string, 
    agentIds: string[]
  ): Promise<void> {
    let attempts = 0;
    while (attempts < FILE_COLLECTION_MAX_RETRIES) {
      try {
        await this.collectAgentLogs(harvestPath, sessionName, agentIds);
        return;
      } catch (error) {
        attempts++;
        if (attempts >= FILE_COLLECTION_MAX_RETRIES) {
          throw error;
        }
        logger.warn(`[HarvestFileCollector] Retrying agent log collection, attempt ${attempts}`);
        await new Promise(resolve => setTimeout(resolve, FILE_COLLECTION_RETRY_DELAY));
      }
    }
  }

  /**
   * Collect farm YAML configuration
   */
  private async collectFarmYaml(harvestPath: string, farmId: string): Promise<void> {
    try {
      const yamlPath = pathConfig.getFarmCoordinationPath(farmId);
      const destPath = path.join(harvestPath, 'config', 'farm.yaml');
      
      try {
        if (await fileManager.exists(yamlPath)) {
          await fileManager.copyFile(yamlPath, destPath);
          logger.info(`[HarvestFileCollector] Collected farm YAML for ${farmId}`);
        } else {
          // YAML file might not exist, create a placeholder
          const placeholder = `# Farm Configuration\nfarmId: ${farmId}\ncreatedAt: ${new Date().toISOString()}\n`;
          await fileManager.writeFile(destPath, placeholder);
          logger.warn(`[HarvestFileCollector] Farm YAML not found, created placeholder for ${farmId}`);
        }
      } catch (error) {
        // Create placeholder on any error
        const placeholder = `# Farm Configuration\nfarmId: ${farmId}\ncreatedAt: ${new Date().toISOString()}\n`;
        await fileManager.writeFile(destPath, placeholder);
        logger.warn(`[HarvestFileCollector] Error collecting YAML, created placeholder for ${farmId}`);
      }
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to collect farm YAML:', error);
    }
  }

  /**
   * Collect agent logs from tmux sessions
   */
  private async collectAgentLogs(
    harvestPath: string,
    sessionName: string,
    agentIds: string[]
  ): Promise<void> {
    try {
      const logsDir = path.join(harvestPath, 'logs');
      const sessionExists = await TmuxHelper.sessionExists(sessionName);
      
      if (!sessionExists) {
        logger.warn(`[HarvestFileCollector] Tmux session ${sessionName} not found`);
        // Create placeholder log file
        const placeholder = `# No active tmux session found for ${sessionName}\n# Session may have been terminated\n`;
        await fs.writeFile(path.join(logsDir, 'session-not-found.log'), placeholder);
        return;
      }

      // Get list of panes in the session
      const panes = await TmuxHelper.listPanes(sessionName);
      
      // Collect logs from each pane
      const combinedLogs: string[] = [];
      
      for (let i = 0; i < panes.length; i++) {
        const paneLog = await TmuxHelper.capturePane(sessionName, 10000, i);
        const agentId = agentIds[i] || `agent-${i + 1}`;
        const logFile = path.join(logsDir, `${agentId}.log`);
        
        // Add timestamp and agent identifier
        const logContent = `# Agent: ${agentId}\n# Captured: ${new Date().toISOString()}\n# Pane: ${i}\n\n${paneLog}`;
        await fs.writeFile(logFile, logContent);
        
        combinedLogs.push(`\n=== ${agentId} ===\n${paneLog}`);
        logger.info(`[HarvestFileCollector] Collected logs for ${agentId}`);
      }
      
      // Create combined log file
      const combinedLogFile = path.join(logsDir, 'combined.log');
      await fs.writeFile(
        combinedLogFile,
        `# Combined Agent Logs\n# Session: ${sessionName}\n# Captured: ${new Date().toISOString()}\n${combinedLogs.join('\n')}`
      );
      
      logger.info(`[HarvestFileCollector] Collected logs from ${panes.length} agents`);
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to collect agent logs:', error);
      // Create error log file
      const errorLog = path.join(harvestPath, 'logs', 'collection-error.log');
      await fs.writeFile(errorLog, `Error collecting logs: ${error}\n`);
    }
  }

  /**
   * Collect files from farm workspace to harvest yield
   */
  async collectWorkspaceFiles(harvestPath: string, farmId: string): Promise<number> {
    try {
      const workspacePath = path.join(pathConfig.getPath('FARM_WORKSPACES_ACTIVE'), farmId);
      let filesCollected = 0;

      // Check if workspace exists
      try {
        await fs.access(workspacePath);
        logger.info(`[HarvestFileCollector] Found workspace for farm ${farmId} at: ${workspacePath}`);
      } catch {
        logger.warn(`[HarvestFileCollector] Workspace not found for farm ${farmId} at expected path: ${workspacePath}`);
        
        // Try to create a basic workspace structure if missing
        logger.info(`[HarvestFileCollector] Attempting to create missing workspace structure for farm ${farmId}`);
        try {
          await fs.mkdir(workspacePath, { recursive: true });
          await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
          await fs.mkdir(path.join(workspacePath, 'output'), { recursive: true });
          logger.info(`[HarvestFileCollector] Created basic workspace structure for farm ${farmId}`);
        } catch (createError) {
          logger.error(`[HarvestFileCollector] Failed to create workspace: ${createError}`);
          return 0;
        }
      }

      // Define directories to scan for files
      const scanDirs = ['src', 'output', 'docs', 'tests', 'work_claims'];
      
      for (const dir of scanDirs) {
        const sourcePath = path.join(workspacePath, dir);
        
        try {
          await fs.access(sourcePath);
          
          // Determine target yield directory based on source directory
          let targetSubDir = 'yield';
          switch (dir) {
            case 'src':
            case 'tests':
              targetSubDir = path.join('yield', 'code');
              break;
            case 'docs':
              targetSubDir = path.join('yield', 'docs');
              break;
            case 'output':
              targetSubDir = path.join('yield', 'data');
              break;
            case 'work_claims':
              targetSubDir = path.join('yield', 'reports');
              break;
          }
          
          const targetPath = path.join(harvestPath, targetSubDir);
          await fileManager.ensureDirectory(targetPath);
          
          // Copy all files from source to target
          const copiedCount = await this.copyDirectoryRecursive(sourcePath, targetPath);
          filesCollected += copiedCount;
          
          if (copiedCount > 0) {
            logger.info(`[HarvestFileCollector] Collected ${copiedCount} files from ${dir} to ${targetSubDir}`);
          }
        } catch (error) {
          // Directory doesn't exist, skip it
          continue;
        }
      }

      // Also check for special harvest summary files in workspace root
      const specialFiles = ['HARVEST_SUMMARY.md', 'COMPLETION_REPORT.txt', 'README.md'];
      for (const file of specialFiles) {
        const sourcePath = path.join(workspacePath, file);
        try {
          await fs.access(sourcePath);
          const targetPath = path.join(harvestPath, 'yield', 'docs', file);
          await fileManager.ensureDirectory(path.dirname(targetPath));
          await fs.copyFile(sourcePath, targetPath);
          filesCollected++;
          logger.info(`[HarvestFileCollector] Collected special file: ${file}`);
        } catch {
          // File doesn't exist, skip it
        }
      }

      logger.info(`[HarvestFileCollector] Total files collected from workspace: ${filesCollected}`);
      return filesCollected;
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to collect workspace files:', error);
      return 0;
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectoryRecursive(source: string, target: string): Promise<number> {
    let filesCopied = 0;
    
    try {
      const entries = await fs.readdir(source, { withFileTypes: true });
      
      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          
          await fileManager.ensureDirectory(targetPath);
          const subCount = await this.copyDirectoryRecursive(sourcePath, targetPath);
          filesCopied += subCount;
        } else if (entry.isFile()) {
          // Skip hidden files and certain extensions
          if (entry.name.startsWith('.') || entry.name.endsWith('.log')) {
            continue;
          }
          
          await fs.copyFile(sourcePath, targetPath);
          filesCopied++;
        }
      }
    } catch (error) {
      logger.warn(`[HarvestFileCollector] Error copying directory ${source}:`, error);
    }
    
    return filesCopied;
  }

  /**
   * Store yielded items in appropriate directories
   */
  async storeYieldItem(
    harvestId: string,
    yieldItem: HarvestYield,
    content: Buffer | string
  ): Promise<string> {
    try {
      const harvestPath = getHarvestPath(harvestId, false);
      
      // Determine subdirectory based on type
      let subDir = 'yield';
      switch (yieldItem.type) {
        case 'code':
          subDir = path.join('yield', 'code');
          break;
        case 'documentation':
          subDir = path.join('yield', 'docs');
          break;
        case 'data':
          subDir = path.join('yield', 'data');
          break;
        case 'report':
          subDir = path.join('yield', 'reports');
          break;
        default:
          subDir = 'yield';
      }
      
      const filePath = path.join(harvestPath, subDir, yieldItem.name);
      
      // Use fileManager for safe file operations
      await fileManager.ensureDirectory(path.dirname(filePath));
      
      // Write file with validation
      const result = await fileManager.writeFile(filePath, content);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to write yield item');
      }
      
      logger.info(`[HarvestFileCollector] Stored yield item ${yieldItem.name} for harvest ${harvestId} (isolated)`);
      
      // Return relative path for storage in database
      return path.relative(this.baseStoragePath, filePath);
    } catch (error) {
      logger.error(`[HarvestFileCollector] Failed to store yield item:`, error);
      throw error;
    }
  }

  /**
   * Generate harvest summary files
   */
  private async generateHarvestSummary(
    harvestPath: string,
    summary: Record<string, any>
  ): Promise<void> {
    try {
      const summaryDir = path.join(harvestPath, 'summary');
      
      // JSON summary
      const jsonPath = path.join(summaryDir, 'harvest-summary.json');
      await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
      
      // Markdown summary
      const mdPath = path.join(summaryDir, 'harvest-summary.md');
      const mdContent = this.generateMarkdownSummary(summary);
      await fs.writeFile(mdPath, mdContent);
      
      logger.info('[HarvestFileCollector] Generated harvest summary files');
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to generate summary:', error);
    }
  }

  /**
   * Generate markdown summary content
   */
  private generateMarkdownSummary(summary: Record<string, any>): string {
    return `# Harvest Summary

## Overview
- **Harvest ID**: ${summary.harvestId}
- **Farm ID**: ${summary.farmId}
- **Farm Name**: ${summary.farmName}
- **Collected At**: ${summary.collectedAt}
- **Agent Count**: ${summary.agentCount}

## Files Collected
- Farm configuration (YAML)
- Agent logs (${summary.agentCount} agents)
- Yielded items (organized by type)
- This summary

## Directory Structure
\`\`\`
${summary.harvestId}/
├── config/
│   └── farm.yaml
├── logs/
│   ├── agent-*.log
│   └── combined.log
├── yield/
│   ├── code/
│   ├── docs/
│   ├── data/
│   └── reports/
└── summary/
    ├── harvest-summary.json
    └── harvest-summary.md
\`\`\`

---
*Generated by MaiFarm Harvest Collector*
`;
  }

  /**
   * Build file tree from directory
   */
  async buildFileTree(dirPath: string): Promise<FileTreeNode> {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);
    
    const node: FileTreeNode = {
      id: randomUUID(),
      name,
      path: dirPath,
      type: 'directory',
      createdAt: stats.ctime,
      children: []
    };
    
    if (stats.isDirectory()) {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const itemStats = await fs.stat(itemPath);
        
        if (itemStats.isDirectory()) {
          const childNode = await this.buildFileTree(itemPath);
          node.children!.push(childNode);
        } else {
          const fileNode: FileTreeNode = {
            id: randomUUID(),
            name: item,
            path: itemPath,
            type: 'file',
            size: itemStats.size,
            mimeType: this.getMimeType(item),
            createdAt: itemStats.ctime
          };
          node.children!.push(fileNode);
        }
      }
    }
    
    return node;
  }

  /**
   * Calculate statistics for file tree
   */
  private async calculateTreeStats(node: FileTreeNode): Promise<{ totalFiles: number; totalSize: number }> {
    let totalFiles = 0;
    let totalSize = 0;
    
    const traverse = (n: FileTreeNode) => {
      if (n.type === 'file') {
        totalFiles++;
        totalSize += n.size || 0;
      } else if (n.children) {
        n.children.forEach(traverse);
      }
    };
    
    traverse(node);
    
    return { totalFiles, totalSize };
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.log': 'text/plain',
      '.txt': 'text/plain',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.py': 'text/x-python',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get file content
   */
  async getFileContent(filePath: string): Promise<Buffer> {
    try {
      // Ensure the file is within the harvest storage path
      const resolvedPath = path.resolve(filePath);
      const basePath = path.resolve(this.baseStoragePath);
      
      if (!resolvedPath.startsWith(basePath)) {
        throw new Error('Access denied: File outside harvest storage');
      }
      
      return await fs.readFile(resolvedPath);
    } catch (error) {
      logger.error(`[HarvestFileCollector] Failed to read file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old harvests and move to completed
   */
  async cleanupOldHarvests(daysToKeep: number = 30): Promise<number> {
    try {
      const harvests = await fileManager.listDirectory(this.baseStoragePath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let cleaned = 0;
      const completedPath = pathConfig.getPath('HARVEST_STORAGE_COMPLETED');
      
      for (const harvestId of harvests) {
        const harvestPath = path.join(this.baseStoragePath, harvestId);
        const stats = await fileManager.getStats(harvestPath);
        
        if (stats && stats.isDirectory() && stats.mtime < cutoffDate) {
          // Move to completed instead of deleting
          const destPath = path.join(completedPath, harvestId);
          const result = await fileManager.moveFile(harvestPath, destPath);
          
          if (result.success) {
            cleaned++;
            logger.info(`[HarvestFileCollector] Moved harvest ${harvestId} to completed storage`);
          }
        }
      }
      
      return cleaned;
    } catch (error) {
      logger.error('[HarvestFileCollector] Failed to clean up old harvests:', error);
      return 0;
    }
  }
}

export const harvestFileCollector = new HarvestFileCollector();