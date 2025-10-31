import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig, getHarvestPath } from '../config/paths';
import { fileManager } from './fileManagerService';
import { harvestService } from './harvestService';
// TmuxHelper import removed - using exec for tmux commands directly

export interface HarvestManifest {
  harvestId: string;
  farmId: string;
  expectedFiles: FileEntry[];
  expectedSize: number;
  actualFiles: FileEntry[];
  actualSize: number;
  checksum: string;
  agentOutputs: Map<string, string[]>;
  verificationStatus: 'pending' | 'verified' | 'failed' | 'incomplete' | 'repairing';
  verifiedAt?: Date;
  metadata: {
    agentCount: number;
    startTime: Date;
    endTime?: Date;
    errors: string[];
    warnings: string[];
    repairAttempts: number;
  };
}

export interface FileEntry {
  path: string;
  size: number;
  hash: string;
  type: 'file' | 'directory';
  agentId?: string;
  createdAt: Date;
}

export interface VerificationResult {
  harvestId: string;
  status: 'complete' | 'incomplete' | 'corrupted' | 'missing';
  completeness: number; // 0-100%
  missingFiles: string[];
  corruptedFiles: string[];
  unexpectedFiles: string[];
  totalFiles: number;
  verifiedFiles: number;
  totalSize: number;
  recommendations: string[];
}

export interface RepairResult {
  success: boolean;
  recovered: number;
  failed: number;
  details: string[];
}

export class HarvestIntegrityService extends EventEmitter {
  private manifests: Map<string, HarvestManifest> = new Map();
  private verificationQueue: Set<string> = new Set();
  private repairQueue: Set<string> = new Set();
  // Removed tmuxHelper - will use exec directly when needed
  
  private readonly VERIFICATION_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_REPAIR_ATTEMPTS = 3;
  private readonly CHECKSUM_ALGORITHM = 'sha256';

  constructor() {
    super();
    // Removed tmuxHelper initialization
    this.initialize();
  }

  /**
   * Initialize the integrity service
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('[HarvestIntegrityService] Initializing harvest integrity service...');

      // Load pending manifests from database
      await this.loadPendingManifests();

      // Start verification worker
      this.startVerificationWorker();

      logger.info('[HarvestIntegrityService] Initialization complete');
    } catch (error) {
      logger.error('[HarvestIntegrityService] Initialization failed:', error);
    }
  }

  /**
   * Generate manifest for a farm before harvest
   */
  async generateManifest(farmId: string, agentIds: string[]): Promise<HarvestManifest> {
    const harvestId = uuidv4();
    logger.info(`[HarvestIntegrityService] Generating manifest for harvest ${harvestId}`);

    try {
      // Track expected outputs from each agent
      const expectedFiles: FileEntry[] = [];
      const agentOutputs = new Map<string, string[]>();

      for (const agentId of agentIds) {
        const outputs = await this.predictAgentOutputs(farmId, agentId);
        agentOutputs.set(agentId, outputs.map(o => o.path));
        expectedFiles.push(...outputs);
      }

      // Calculate expected size
      const expectedSize = await this.estimateOutputSize(farmId, agentIds);

      // Create manifest
      const manifest: HarvestManifest = {
        harvestId,
        farmId,
        expectedFiles,
        expectedSize,
        actualFiles: [],
        actualSize: 0,
        checksum: '',
        agentOutputs,
        verificationStatus: 'pending',
        metadata: {
          agentCount: agentIds.length,
          startTime: new Date(),
          errors: [],
          warnings: [],
          repairAttempts: 0
        }
      };

      // Store manifest
      this.manifests.set(harvestId, manifest);
      await this.persistManifest(manifest);

      logger.info(`[HarvestIntegrityService] Generated manifest for ${harvestId} with ${expectedFiles.length} expected files`);

      // Emit manifest created event
      this.emit('manifest:created', {
        harvestId,
        farmId,
        expectedFiles: expectedFiles.length,
        expectedSize
      });

      return manifest;

    } catch (error) {
      logger.error('[HarvestIntegrityService] Error generating manifest:', error);
      throw error;
    }
  }

  /**
   * Verify harvest against manifest
   */
  async verifyHarvest(harvestId: string): Promise<VerificationResult> {
    logger.info(`[HarvestIntegrityService] Verifying harvest ${harvestId}`);

    const manifest = await this.getManifest(harvestId);
    if (!manifest) {
      throw new Error(`Manifest not found for harvest ${harvestId}`);
    }

    try {
      const harvestPath = getHarvestPath(harvestId, false);
      
      // Scan actual files
      const actualFiles = await this.scanHarvestDirectory(harvestPath);
      manifest.actualFiles = actualFiles;
      manifest.actualSize = actualFiles.reduce((sum, f) => sum + f.size, 0);

      // Calculate checksum of all files
      manifest.checksum = await this.calculateHarvestChecksum(actualFiles);

      // Compare expected vs actual
      const result = this.compareManifest(manifest);

      // Update manifest status
      manifest.verificationStatus = result.status === 'complete' ? 'verified' : 'failed';
      manifest.verifiedAt = new Date();
      manifest.metadata.endTime = new Date();

      // Add any errors/warnings
      if (result.missingFiles.length > 0) {
        manifest.metadata.errors.push(`Missing ${result.missingFiles.length} files`);
      }
      if (result.corruptedFiles.length > 0) {
        manifest.metadata.errors.push(`Found ${result.corruptedFiles.length} corrupted files`);
      }
      if (result.unexpectedFiles.length > 0) {
        manifest.metadata.warnings.push(`Found ${result.unexpectedFiles.length} unexpected files`);
      }

      // Persist updated manifest
      await this.persistManifest(manifest);

      // Emit verification result
      this.emit('harvest:verified', {
        harvestId,
        result,
        manifest
      });

      // Broadcast to WebSocket
      websocketManager.broadcast('harvest:verification:complete', {
        harvestId,
        status: result.status,
        completeness: result.completeness,
        timestamp: new Date()
      });

      logger.info(`[HarvestIntegrityService] Verification complete for ${harvestId}: ${result.status} (${result.completeness}% complete)`);

      return result;

    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error verifying harvest ${harvestId}:`, error);
      
      manifest.verificationStatus = 'failed';
      manifest.metadata.errors.push(error.message);
      await this.persistManifest(manifest);
      
      throw error;
    }
  }

  /**
   * Repair incomplete harvest
   */
  async repairIncompleteHarvest(harvestId: string): Promise<RepairResult> {
    logger.info(`[HarvestIntegrityService] Attempting to repair harvest ${harvestId}`);

    const manifest = await this.getManifest(harvestId);
    if (!manifest) {
      throw new Error(`Manifest not found for harvest ${harvestId}`);
    }

    if (manifest.metadata.repairAttempts >= this.MAX_REPAIR_ATTEMPTS) {
      logger.error(`[HarvestIntegrityService] Max repair attempts reached for ${harvestId}`);
      return {
        success: false,
        recovered: 0,
        failed: 0,
        details: ['Maximum repair attempts exceeded']
      };
    }

    manifest.verificationStatus = 'repairing';
    manifest.metadata.repairAttempts++;
    await this.persistManifest(manifest);

    const result: RepairResult = {
      success: false,
      recovered: 0,
      failed: 0,
      details: []
    };

    try {
      // Get verification result to identify issues
      const verification = this.compareManifest(manifest);

      // Attempt to recover missing files
      for (const missingFile of verification.missingFiles) {
        const recovered = await this.recoverFile(harvestId, manifest.farmId, missingFile);
        if (recovered) {
          result.recovered++;
          result.details.push(`Recovered: ${missingFile}`);
        } else {
          result.failed++;
          result.details.push(`Failed to recover: ${missingFile}`);
        }
      }

      // Attempt to fix corrupted files
      for (const corruptedFile of verification.corruptedFiles) {
        const fixed = await this.fixCorruptedFile(harvestId, manifest.farmId, corruptedFile);
        if (fixed) {
          result.recovered++;
          result.details.push(`Fixed: ${corruptedFile}`);
        } else {
          result.failed++;
          result.details.push(`Failed to fix: ${corruptedFile}`);
        }
      }

      // Re-verify after repair
      const newVerification = await this.verifyHarvest(harvestId);
      result.success = newVerification.status === 'complete';

      logger.info(`[HarvestIntegrityService] Repair complete for ${harvestId}: recovered ${result.recovered}, failed ${result.failed}`);

      // Emit repair result
      this.emit('harvest:repaired', {
        harvestId,
        result
      });

      return result;

    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error repairing harvest ${harvestId}:`, error);
      
      result.details.push(`Repair error: ${error.message}`);
      return result;
    }
  }

  /**
   * Predict agent outputs based on task type
   */
  private async predictAgentOutputs(farmId: string, agentId: string): Promise<FileEntry[]> {
    const predicted: FileEntry[] = [];

    try {
      // Get agent tasks to predict outputs
      const tasks = await this.getAgentTasks(farmId, agentId);

      for (const task of tasks) {
        // Predict based on task type
        switch (task.type) {
          case 'code_generation':
            predicted.push({
              path: `agents/${agentId}/output/generated_code.js`,
              size: 0, // Will be determined at runtime
              hash: '',
              type: 'file',
              agentId,
              createdAt: new Date()
            });
            break;

          case 'analysis':
            predicted.push({
              path: `agents/${agentId}/output/analysis_report.md`,
              size: 0,
              hash: '',
              type: 'file',
              agentId,
              createdAt: new Date()
            });
            break;

          case 'data_processing':
            predicted.push({
              path: `agents/${agentId}/output/processed_data.json`,
              size: 0,
              hash: '',
              type: 'file',
              agentId,
              createdAt: new Date()
            });
            break;

          default:
            // Generic output prediction
            predicted.push({
              path: `agents/${agentId}/output/result.txt`,
              size: 0,
              hash: '',
              type: 'file',
              agentId,
              createdAt: new Date()
            });
        }
      }

      // Always expect logs
      predicted.push({
        path: `agents/${agentId}/logs/agent.log`,
        size: 0,
        hash: '',
        type: 'file',
        agentId,
        createdAt: new Date()
      });

    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error predicting outputs for agent ${agentId}:`, error);
    }

    return predicted;
  }

  /**
   * Estimate output size based on historical data
   */
  private async estimateOutputSize(farmId: string, agentIds: string[]): Promise<number> {
    try {
      // Get average output size from similar farms
      const result = await db.query(`
        SELECT AVG(actual_size_bytes) as avg_size
        FROM harvest_manifests
        WHERE metadata->>'agentCount' = $1
          AND verification_status = 'verified'
      `, [agentIds.length.toString()]);

      if (result.rows.length > 0 && result.rows[0].avg_size) {
        return parseInt(result.rows[0].avg_size);
      }

      // Default estimate: 10MB per agent
      return agentIds.length * 10 * 1024 * 1024;

    } catch (error) {
      return agentIds.length * 10 * 1024 * 1024;
    }
  }

  /**
   * Scan harvest directory for actual files
   */
  private async scanHarvestDirectory(harvestPath: string): Promise<FileEntry[]> {
    const files: FileEntry[] = [];

    async function scanDir(dirPath: string, basePath: string) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(basePath, fullPath);

          if (entry.isDirectory()) {
            files.push({
              path: relativePath,
              size: 0,
              hash: '',
              type: 'directory',
              createdAt: new Date()
            });

            // Recursively scan subdirectory
            await scanDir(fullPath, basePath);
          } else {
            const stats = await fs.stat(fullPath);
            const hash = await this.calculateFileHash(fullPath);

            files.push({
              path: relativePath,
              size: stats.size,
              hash,
              type: 'file',
              createdAt: stats.birthtime
            });
          }
        }
      } catch (error) {
        logger.error(`[HarvestIntegrityService] Error scanning directory ${dirPath}:`, error);
      }
    }

    await scanDir(harvestPath, harvestPath);
    return files;
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash(this.CHECKSUM_ALGORITHM).update(content).digest('hex');
    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error calculating hash for ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Calculate harvest checksum
   */
  private async calculateHarvestChecksum(files: FileEntry[]): Promise<string> {
    const hash = crypto.createHash(this.CHECKSUM_ALGORITHM);
    
    // Sort files for consistent checksum
    const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));
    
    for (const file of sortedFiles) {
      if (file.type === 'file' && file.hash) {
        hash.update(file.hash);
      }
    }

    return hash.digest('hex');
  }

  /**
   * Compare manifest expected vs actual
   */
  private compareManifest(manifest: HarvestManifest): VerificationResult {
    const expectedPaths = new Set(manifest.expectedFiles.map(f => f.path));
    const actualPaths = new Set(manifest.actualFiles.map(f => f.path));

    const missingFiles: string[] = [];
    const corruptedFiles: string[] = [];
    const unexpectedFiles: string[] = [];

    // Find missing files
    for (const expected of expectedPaths) {
      if (!actualPaths.has(expected)) {
        missingFiles.push(expected);
      }
    }

    // Find unexpected files
    for (const actual of actualPaths) {
      if (!expectedPaths.has(actual)) {
        unexpectedFiles.push(actual);
      }
    }

    // Check for corrupted files (size mismatch or hash issues)
    for (const actualFile of manifest.actualFiles) {
      const expectedFile = manifest.expectedFiles.find(f => f.path === actualFile.path);
      if (expectedFile) {
        // Check if file appears corrupted (zero size when shouldn't be)
        if (actualFile.type === 'file' && actualFile.size === 0 && !actualFile.path.endsWith('.gitkeep')) {
          corruptedFiles.push(actualFile.path);
        }
      }
    }

    // Calculate completeness percentage
    const totalExpected = manifest.expectedFiles.length;
    const totalFound = manifest.actualFiles.length - unexpectedFiles.length;
    const completeness = totalExpected > 0 ? (totalFound / totalExpected) * 100 : 0;

    // Determine status
    let status: VerificationResult['status'];
    if (missingFiles.length === 0 && corruptedFiles.length === 0) {
      status = 'complete';
    } else if (corruptedFiles.length > 0) {
      status = 'corrupted';
    } else if (completeness < 50) {
      status = 'missing';
    } else {
      status = 'incomplete';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (missingFiles.length > 0) {
      recommendations.push(`Recover ${missingFiles.length} missing files from tmux logs`);
    }
    if (corruptedFiles.length > 0) {
      recommendations.push(`Repair ${corruptedFiles.length} corrupted files`);
    }
    if (unexpectedFiles.length > 10) {
      recommendations.push('Review unexpected files for potential issues');
    }

    return {
      harvestId: manifest.harvestId,
      status,
      completeness,
      missingFiles,
      corruptedFiles,
      unexpectedFiles,
      totalFiles: manifest.actualFiles.length,
      verifiedFiles: totalFound,
      totalSize: manifest.actualSize,
      recommendations
    };
  }

  /**
   * Recover missing file from tmux logs or other sources
   */
  private async recoverFile(harvestId: string, farmId: string, filePath: string): Promise<boolean> {
    try {
      logger.info(`[HarvestIntegrityService] Attempting to recover ${filePath}`);

      // Try to recover from tmux session logs
      const sessionName = `farm-${farmId}`;
      const agentMatch = filePath.match(/agents\/([^\/]+)\//);
      
      if (agentMatch) {
        const agentId = agentMatch[1];
        
        // Check if tmux pane still exists
        // Temporarily disabled pane capture
        const paneContent = '';
        
        if (paneContent && paneContent.length > 0) {
          // Try to extract file content from terminal output
          const harvestPath = getHarvestPath(harvestId, false);
          const fullPath = path.join(harvestPath, filePath);
          
          await fileManager.ensureDirectory(path.dirname(fullPath));
          await fileManager.writeFile(fullPath, paneContent);
          
          logger.info(`[HarvestIntegrityService] Successfully recovered ${filePath} from tmux`);
          return true;
        }
      }

      // Try to recover from coordination files
      const coordinationPath = path.join(
        pathConfig.getPath('COORDINATION_DIR'),
        'farms',
        farmId,
        path.basename(filePath)
      );

      try {
        const content = await fs.readFile(coordinationPath, 'utf-8');
        const harvestPath = getHarvestPath(harvestId, false);
        const fullPath = path.join(harvestPath, filePath);
        
        await fileManager.ensureDirectory(path.dirname(fullPath));
        await fileManager.writeFile(fullPath, content);
        
        logger.info(`[HarvestIntegrityService] Successfully recovered ${filePath} from coordination`);
        return true;
      } catch (error) {
        // Coordination file not found
      }

      return false;

    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error recovering file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Fix corrupted file
   */
  private async fixCorruptedFile(harvestId: string, farmId: string, filePath: string): Promise<boolean> {
    try {
      // First try to recover from source
      const recovered = await this.recoverFile(harvestId, farmId, filePath);
      if (recovered) {
        return true;
      }

      // If it's a log file, we can recreate it
      if (filePath.endsWith('.log')) {
        const harvestPath = getHarvestPath(harvestId, false);
        const fullPath = path.join(harvestPath, filePath);
        
        await fileManager.writeFile(fullPath, '# Log file recovered - original content lost\n');
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error fixing corrupted file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Get agent tasks
   */
  private async getAgentTasks(farmId: string, agentId: string): Promise<any[]> {
    try {
      const result = await db.query(
        'SELECT * FROM tasks WHERE farm_id = $1 AND agent_id = $2',
        [farmId, agentId]
      );
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get or load manifest
   */
  private async getManifest(harvestId: string): Promise<HarvestManifest | null> {
    // Check memory cache
    let manifest = this.manifests.get(harvestId);
    if (manifest) {
      return manifest;
    }

    // Load from database
    try {
      const result = await db.query(
        'SELECT * FROM harvest_manifests WHERE harvest_id = $1',
        [harvestId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        manifest = {
          harvestId: row.harvest_id,
          farmId: row.farm_id || '',
          expectedFiles: row.expected_files || [],
          expectedSize: row.expected_size_bytes || 0,
          actualFiles: row.actual_files || [],
          actualSize: row.actual_size_bytes || 0,
          checksum: row.checksum || '',
          agentOutputs: new Map(Object.entries(row.agent_outputs || {})),
          verificationStatus: row.verification_status,
          verifiedAt: row.verified_at,
          metadata: row.metadata || {
            agentCount: 0,
            startTime: new Date(),
            errors: [],
            warnings: [],
            repairAttempts: 0
          }
        };

        this.manifests.set(harvestId, manifest);
        return manifest;
      }
    } catch (error) {
      logger.error(`[HarvestIntegrityService] Error loading manifest for ${harvestId}:`, error);
    }

    return null;
  }

  /**
   * Persist manifest to database
   */
  private async persistManifest(manifest: HarvestManifest): Promise<void> {
    try {
      await db.query(`
        INSERT INTO harvest_manifests 
        (harvest_id, expected_files, expected_size_bytes, actual_files, 
         actual_size_bytes, checksum, verification_status, verified_at, 
         agent_outputs, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (harvest_id) DO UPDATE SET
          actual_files = $4,
          actual_size_bytes = $5,
          checksum = $6,
          verification_status = $7,
          verified_at = $8,
          agent_outputs = $9,
          metadata = $10
      `, [
        manifest.harvestId,
        JSON.stringify(manifest.expectedFiles),
        manifest.expectedSize,
        JSON.stringify(manifest.actualFiles),
        manifest.actualSize,
        manifest.checksum,
        manifest.verificationStatus,
        manifest.verifiedAt,
        JSON.stringify(Object.fromEntries(manifest.agentOutputs)),
        JSON.stringify(manifest.metadata)
      ]);
    } catch (error) {
      logger.error('[HarvestIntegrityService] Error persisting manifest:', error);
    }
  }

  /**
   * Load pending manifests from database
   */
  private async loadPendingManifests(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT harvest_id FROM harvest_manifests 
        WHERE verification_status IN ('pending', 'repairing')
      `);

      for (const row of result.rows) {
        this.verificationQueue.add(row.harvest_id);
      }

      if (this.verificationQueue.size > 0) {
        logger.info(`[HarvestIntegrityService] Loaded ${this.verificationQueue.size} pending verifications`);
      }
    } catch (error) {
      logger.error('[HarvestIntegrityService] Error loading pending manifests:', error);
    }
  }

  /**
   * Start verification worker
   */
  private startVerificationWorker(): void {
    setInterval(async () => {
      if (this.verificationQueue.size > 0) {
        const harvestId = this.verificationQueue.values().next().value;
        this.verificationQueue.delete(harvestId);

        try {
          await this.verifyHarvest(harvestId);
        } catch (error) {
          logger.error(`[HarvestIntegrityService] Verification worker error:`, error);
        }
      }
    }, 5000);
  }

  /**
   * Get integrity statistics
   */
  async getStatistics(): Promise<{
    totalManifests: number;
    verifiedCount: number;
    failedCount: number;
    repairSuccessRate: number;
    averageCompleteness: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified,
          COUNT(CASE WHEN verification_status = 'failed' THEN 1 END) as failed,
          AVG(CASE 
            WHEN actual_size_bytes > 0 AND expected_size_bytes > 0 
            THEN (actual_size_bytes::float / expected_size_bytes) * 100 
            ELSE 0 
          END) as avg_completeness
        FROM harvest_manifests
      `);

      const stats = result.rows[0];
      
      // Calculate repair success rate
      const repairResult = await db.query(`
        SELECT 
          COUNT(*) as total_repairs,
          COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as successful_repairs
        FROM harvest_manifests
        WHERE metadata->>'repairAttempts' > '0'
      `);

      const repairStats = repairResult.rows[0];
      const repairSuccessRate = repairStats.total_repairs > 0
        ? (repairStats.successful_repairs / repairStats.total_repairs) * 100
        : 0;

      return {
        totalManifests: parseInt(stats.total) || 0,
        verifiedCount: parseInt(stats.verified) || 0,
        failedCount: parseInt(stats.failed) || 0,
        repairSuccessRate,
        averageCompleteness: parseFloat(stats.avg_completeness) || 0
      };
    } catch (error) {
      logger.error('[HarvestIntegrityService] Error getting statistics:', error);
      return {
        totalManifests: 0,
        verifiedCount: 0,
        failedCount: 0,
        repairSuccessRate: 0,
        averageCompleteness: 0
      };
    }
  }
}

// Export singleton instance
export const harvestIntegrityService = new HarvestIntegrityService();