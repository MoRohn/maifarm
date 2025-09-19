import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { websocketManager } from '../websocket/websocketManager';

interface CollectionResult {
  success: boolean;
  filesCollected: number;
  errors: string[];
  artifacts: CollectedArtifact[];
  duration: number;
}

interface CollectedArtifact {
  path: string;
  type: string;
  size: number;
  content?: string;
  metadata?: Record<string, any>;
}

export class HarvestFileCollector extends EventEmitter {
  private static instance: HarvestFileCollector;
  private activeCollections = new Map<string, CollectionResult>();

  private constructor() {
    super();
  }

  static getInstance(): HarvestFileCollector {
    if (!this.instance) {
      this.instance = new HarvestFileCollector();
    }
    return this.instance;
  }

  async collectFiles(farmId: string, workspacePath?: string): Promise<CollectionResult> {
    const startTime = Date.now();
    const result: CollectionResult = {
      success: false,
      filesCollected: 0,
      errors: [],
      artifacts: [],
      duration: 0
    };

    try {
      logger.info(LogCategory.HARVEST, `Starting file collection for farm ${farmId}`);

      // Determine workspace path
      const targetPath = workspacePath || pathConfig.getWorkspacePath(farmId);

      // Check if directory exists
      try {
        await fs.access(targetPath);
      } catch {
        logger.warn(LogCategory.HARVEST, `Workspace ${targetPath} does not exist`);
        result.errors.push(`Workspace not found: ${targetPath}`);
        return result;
      }

      // Collect files recursively
      const artifacts = await this.scanDirectory(targetPath);
      result.artifacts = artifacts;
      result.filesCollected = artifacts.length;
      result.success = true;

      logger.info(LogCategory.HARVEST, `Collected ${result.filesCollected} files from farm ${farmId}`);

      // Emit progress event
      websocketManager.emitToFarm(farmId, 'harvest:collection:progress', {
        farmId,
        filesCollected: result.filesCollected,
        status: 'completed'
      });

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error collecting files for farm ${farmId}:`, error);
      result.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      result.duration = Date.now() - startTime;
    }

    this.activeCollections.set(farmId, result);
    this.emit('collection:completed', { farmId, result });

    return result;
  }

  private async scanDirectory(dirPath: string, basePath?: string): Promise<CollectedArtifact[]> {
    const artifacts: CollectedArtifact[] = [];
    const base = basePath || dirPath;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(base, fullPath);

        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subArtifacts = await this.scanDirectory(fullPath, base);
          artifacts.push(...subArtifacts);
        } else {
          // Collect file info
          const stats = await fs.stat(fullPath);
          const artifact: CollectedArtifact = {
            path: relativePath,
            type: this.getFileType(entry.name),
            size: stats.size,
            metadata: {
              fullPath,
              modified: stats.mtime,
              created: stats.ctime
            }
          };

          // For small text files, include content
          if (artifact.type === 'text' && stats.size < 100000) {
            try {
              artifact.content = await fs.readFile(fullPath, 'utf-8');
            } catch (error) {
              logger.warn(LogCategory.HARVEST, `Could not read file ${fullPath}:`, error);
            }
          }

          artifacts.push(artifact);
        }
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error scanning directory ${dirPath}:`, error);
    }

    return artifacts;
  }

  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const textExtensions = ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.yaml', '.yml', '.css', '.html', '.xml'];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const codeExtensions = ['.py', '.java', '.cpp', '.c', '.h', '.rs', '.go', '.rb', '.php'];

    if (textExtensions.includes(ext) || codeExtensions.includes(ext)) {
      return 'text';
    } else if (imageExtensions.includes(ext)) {
      return 'image';
    } else {
      return 'binary';
    }
  }

  async getFileContent(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error reading file ${filePath}:`, error);
      return null;
    }
  }

  async saveHarvestArtifacts(farmId: string, artifacts: CollectedArtifact[]): Promise<string> {
    const harvestPath = path.join(pathConfig.getBarnPath(), 'harvests', farmId, Date.now().toString());

    try {
      // Create harvest directory
      await fs.mkdir(harvestPath, { recursive: true });

      // Save artifacts metadata
      const metadataPath = path.join(harvestPath, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify({
        farmId,
        timestamp: new Date(),
        artifactCount: artifacts.length,
        artifacts: artifacts.map(a => ({
          path: a.path,
          type: a.type,
          size: a.size
        }))
      }, null, 2));

      // Save actual files
      for (const artifact of artifacts) {
        if (artifact.content) {
          const artifactPath = path.join(harvestPath, artifact.path);
          await fs.mkdir(path.dirname(artifactPath), { recursive: true });
          await fs.writeFile(artifactPath, artifact.content);
        }
      }

      logger.info(LogCategory.HARVEST, `Saved ${artifacts.length} artifacts to ${harvestPath}`);
      return harvestPath;

    } catch (error) {
      logger.error(LogCategory.HARVEST, `Error saving harvest artifacts:`, error);
      throw error;
    }
  }

  getActiveCollections(): Map<string, CollectionResult> {
    return new Map(this.activeCollections);
  }

  clearCollection(farmId: string): void {
    this.activeCollections.delete(farmId);
  }

  async retryCollection(farmId: string, maxRetries: number = 3): Promise<CollectionResult> {
    let lastResult: CollectionResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(LogCategory.HARVEST, `Collection attempt ${attempt}/${maxRetries} for farm ${farmId}`);

      lastResult = await this.collectFiles(farmId);

      if (lastResult.success) {
        return lastResult;
      }

      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return lastResult || {
      success: false,
      filesCollected: 0,
      errors: ['Max retries exceeded'],
      artifacts: [],
      duration: 0
    };
  }
}

export const harvestFileCollector = HarvestFileCollector.getInstance();