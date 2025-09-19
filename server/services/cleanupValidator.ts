import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CleanupRule {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'process' | 'memory' | 'database';
  pattern?: string;
  condition?: string;
  action: 'delete' | 'archive' | 'compress' | 'quarantine';
  priority: number;
  metadata?: any;
}

export interface CleanupValidationResult {
  farmId: string;
  isClean: boolean;
  issues: CleanupIssue[];
  cleanedItems: CleanupItem[];
  remainingItems: CleanupItem[];
  recommendations: string[];
}

export interface CleanupIssue {
  type: 'orphaned_file' | 'leaked_process' | 'unclosed_connection' | 'memory_leak' | 'temp_file';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  remediation?: string;
}

export interface CleanupItem {
  type: string;
  path?: string;
  pid?: number;
  size?: number;
  age?: number;
  status: 'pending' | 'cleaned' | 'failed' | 'quarantined';
}

export class CleanupValidator extends EventEmitter {
  private rules: Map<string, CleanupRule> = new Map();
  private quarantineDir: string;
  private archiveDir: string;
  
  private readonly MAX_CLEANUP_ATTEMPTS = 3;
  private readonly QUARANTINE_RETENTION_DAYS = 7;
  private readonly TEMP_FILE_MAX_AGE = 3600000; // 1 hour

  constructor() {
    super();
    this.quarantineDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'quarantine');
    this.archiveDir = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'archive');
    this.initialize();
  }

  /**
   * Initialize the cleanup validator
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('[CleanupValidator] Initializing cleanup validator...');

      // Create necessary directories
      await this.ensureDirectories();

      // Load cleanup rules
      await this.loadCleanupRules();

      // Start periodic validation
      this.startPeriodicValidation();

      logger.info('[CleanupValidator] Initialization complete');
    } catch (error) {
      logger.error('[CleanupValidator] Initialization failed:', error);
    }
  }

  /**
   * Validate farm cleanup after harvest
   */
  async validateFarmCleanup(farmId: string): Promise<CleanupValidationResult> {
    logger.info(`[CleanupValidator] Validating cleanup for farm ${farmId}`);

    const issues: CleanupIssue[] = [];
    const cleanedItems: CleanupItem[] = [];
    const remainingItems: CleanupItem[] = [];
    const recommendations: string[] = [];

    try {
      // Check for orphaned files
      const orphanedFiles = await this.checkOrphanedFiles(farmId);
      issues.push(...orphanedFiles.issues);
      remainingItems.push(...orphanedFiles.items);

      // Check for leaked processes
      const leakedProcesses = await this.checkLeakedProcesses(farmId);
      issues.push(...leakedProcesses.issues);
      remainingItems.push(...leakedProcesses.items);

      // Check for unclosed connections
      const unclosedConnections = await this.checkUnclosedConnections(farmId);
      issues.push(...unclosedConnections.issues);
      remainingItems.push(...unclosedConnections.items);

      // Check for memory leaks
      const memoryLeaks = await this.checkMemoryLeaks(farmId);
      issues.push(...memoryLeaks.issues);
      remainingItems.push(...memoryLeaks.items);

      // Check for temporary files
      const tempFiles = await this.checkTemporaryFiles(farmId);
      issues.push(...tempFiles.issues);
      remainingItems.push(...tempFiles.items);

      // Attempt automatic cleanup
      if (remainingItems.length > 0) {
        const cleanupResult = await this.performCleanup(farmId, remainingItems);
        cleanedItems.push(...cleanupResult.cleaned);
        
        // Update remaining items
        const stillRemaining = remainingItems.filter(item => 
          !cleanedItems.some(cleaned => 
            (item.path && cleaned.path === item.path) ||
            (item.pid && cleaned.pid === item.pid)
          )
        );
        remainingItems.length = 0;
        remainingItems.push(...stillRemaining);
      }

      // Generate recommendations
      if (issues.some(i => i.severity === 'critical')) {
        recommendations.push('Critical issues detected - immediate manual intervention required');
      }
      if (issues.some(i => i.type === 'memory_leak')) {
        recommendations.push('Memory leaks detected - consider restarting affected services');
      }
      if (remainingItems.length > 10) {
        recommendations.push('High number of remaining items - review cleanup rules');
      }

      const isClean = issues.length === 0 && remainingItems.length === 0;

      const result: CleanupValidationResult = {
        farmId,
        isClean,
        issues,
        cleanedItems,
        remainingItems,
        recommendations
      };

      // Persist validation result
      await this.persistValidationResult(result);

      // Emit validation complete event
      this.emit('validation:complete', result);

      logger.info(`[CleanupValidator] Validation complete for farm ${farmId}: ${isClean ? 'CLEAN' : 'ISSUES FOUND'}`);

      return result;

    } catch (error) {
      logger.error(`[CleanupValidator] Error validating farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Check for orphaned files
   */
  private async checkOrphanedFiles(farmId: string): Promise<{ issues: CleanupIssue[], items: CleanupItem[] }> {
    const issues: CleanupIssue[] = [];
    const items: CleanupItem[] = [];

    try {
      // Check workspace directory
      const workspacePath = path.join(pathConfig.getPath('WORKSPACE_ROOT'), farmId);
      
      try {
        await fs.access(workspacePath);
        
        // Look for files that shouldn't exist after cleanup
        const suspiciousPatterns = [
          '*.tmp',
          '*.lock',
          '*.pid',
          '.*.swp',
          'core.*',
          'nohup.out'
        ];

        for (const pattern of suspiciousPatterns) {
          try {
            const { stdout } = await execAsync(
              `find "${workspacePath}" -name "${pattern}" -type f 2>/dev/null | head -20`
            );
            
            const files = stdout.trim().split('\n').filter(f => f);
            for (const file of files) {
              const stats = await fs.stat(file).catch(() => null);
              if (stats) {
                items.push({
                  type: 'file',
                  path: file,
                  size: stats.size,
                  age: Date.now() - stats.mtime.getTime(),
                  status: 'pending'
                });

                issues.push({
                  type: 'orphaned_file',
                  severity: 'low',
                  description: `Orphaned file found: ${path.basename(file)}`,
                  location: file,
                  remediation: 'Delete or archive file'
                });
              }
            }
          } catch (error) {
            // Find command failed - not critical
          }
        }
      } catch (error) {
        // Workspace doesn't exist - this is actually good
      }

      // Check coordination directory
      const coordPath = path.join(pathConfig.getPath('COORDINATION_DIR'), 'farms', farmId);
      try {
        await fs.access(coordPath);
        const files = await fs.readdir(coordPath);
        
        if (files.length > 0) {
          for (const file of files) {
            const filePath = path.join(coordPath, file);
            const stats = await fs.stat(filePath);
            
            items.push({
              type: 'file',
              path: filePath,
              size: stats.size,
              age: Date.now() - stats.mtime.getTime(),
              status: 'pending'
            });

            issues.push({
              type: 'orphaned_file',
              severity: 'medium',
              description: `Coordination file not cleaned: ${file}`,
              location: filePath,
              remediation: 'Remove coordination file'
            });
          }
        }
      } catch (error) {
        // Coordination directory doesn't exist - good
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error checking orphaned files:', error);
    }

    return { issues, items };
  }

  /**
   * Check for leaked processes
   */
  private async checkLeakedProcesses(farmId: string): Promise<{ issues: CleanupIssue[], items: CleanupItem[] }> {
    const issues: CleanupIssue[] = [];
    const items: CleanupItem[] = [];

    try {
      // Check for tmux sessions
      const sessionName = `farm-${farmId}`;
      try {
        const { stdout } = await execAsync(`tmux list-sessions 2>/dev/null | grep "^${sessionName}:" || true`);
        
        if (stdout.trim()) {
          items.push({
            type: 'process',
            pid: 0, // Tmux session doesn't have single PID
            status: 'pending'
          });

          issues.push({
            type: 'leaked_process',
            severity: 'high',
            description: `Tmux session still running: ${sessionName}`,
            location: sessionName,
            remediation: 'Kill tmux session'
          });
        }
      } catch (error) {
        // Tmux not available or no sessions
      }

      // Check for Node.js processes with farm ID
      try {
        const { stdout } = await execAsync(
          `ps aux | grep -E "node.*${farmId}" | grep -v grep | head -10`
        );
        
        const lines = stdout.trim().split('\n').filter(l => l);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const pid = parseInt(parts[1]);
          
          if (pid) {
            items.push({
              type: 'process',
              pid,
              status: 'pending'
            });

            issues.push({
              type: 'leaked_process',
              severity: 'high',
              description: `Node.js process still running with farm ID`,
              location: `PID: ${pid}`,
              remediation: 'Terminate process'
            });
          }
        }
      } catch (error) {
        // No matching processes found
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error checking leaked processes:', error);
    }

    return { issues, items };
  }

  /**
   * Check for unclosed connections
   */
  private async checkUnclosedConnections(farmId: string): Promise<{ issues: CleanupIssue[], items: CleanupItem[] }> {
    const issues: CleanupIssue[] = [];
    const items: CleanupItem[] = [];

    try {
      // Check database connections
      const dbResult = await db.query(`
        SELECT pid, state, query_start, state_change 
        FROM pg_stat_activity 
        WHERE application_name LIKE $1 
          AND state != 'idle'
          AND pid != pg_backend_pid()
      `, [`%${farmId}%`]);

      for (const conn of dbResult.rows) {
        items.push({
          type: 'connection',
          pid: conn.pid,
          status: 'pending'
        });

        issues.push({
          type: 'unclosed_connection',
          severity: 'medium',
          description: `Database connection not closed properly`,
          location: `PID: ${conn.pid}, State: ${conn.state}`,
          remediation: 'Terminate database connection'
        });
      }

      // Check for open file descriptors
      try {
        const { stdout } = await execAsync(
          `lsof 2>/dev/null | grep "${farmId}" | head -20`
        );
        
        const lines = stdout.trim().split('\n').filter(l => l);
        if (lines.length > 10) {
          issues.push({
            type: 'unclosed_connection',
            severity: 'medium',
            description: `Multiple open file descriptors found (${lines.length})`,
            remediation: 'Review and close file descriptors'
          });
        }
      } catch (error) {
        // lsof not available or no results
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error checking unclosed connections:', error);
    }

    return { issues, items };
  }

  /**
   * Check for memory leaks
   */
  private async checkMemoryLeaks(farmId: string): Promise<{ issues: CleanupIssue[], items: CleanupItem[] }> {
    const issues: CleanupIssue[] = [];
    const items: CleanupItem[] = [];

    try {
      // Check system memory usage
      const { stdout: memInfo } = await execAsync('free -m | grep "^Mem:"');
      const memParts = memInfo.trim().split(/\s+/);
      const totalMem = parseInt(memParts[1]);
      const usedMem = parseInt(memParts[2]);
      const memUsagePercent = (usedMem / totalMem) * 100;

      if (memUsagePercent > 90) {
        issues.push({
          type: 'memory_leak',
          severity: 'critical',
          description: `High memory usage detected: ${memUsagePercent.toFixed(1)}%`,
          remediation: 'Investigate memory consumption and restart services if needed'
        });
      }

      // Check for Node.js heap usage from metrics
      try {
        const metricsResult = await db.query(`
          SELECT MAX(value) as max_heap
          FROM metrics
          WHERE farm_id = $1
            AND metric_name = 'heap_used_mb'
            AND timestamp > NOW() - INTERVAL '10 minutes'
        `, [farmId]);

        if (metricsResult.rows[0]?.max_heap > 1024) {
          issues.push({
            type: 'memory_leak',
            severity: 'high',
            description: `High heap usage detected: ${metricsResult.rows[0].max_heap}MB`,
            remediation: 'Review agent memory consumption'
          });
        }
      } catch (error) {
        // Metrics query failed
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error checking memory leaks:', error);
    }

    return { issues, items };
  }

  /**
   * Check for temporary files
   */
  private async checkTemporaryFiles(farmId: string): Promise<{ issues: CleanupIssue[], items: CleanupItem[] }> {
    const issues: CleanupIssue[] = [];
    const items: CleanupItem[] = [];

    try {
      const tempDirs = [
        '/tmp',
        '/var/tmp',
        path.join(pathConfig.getPath('MAIBARN_ROOT'), 'tmp')
      ];

      for (const tempDir of tempDirs) {
        try {
          const { stdout } = await execAsync(
            `find "${tempDir}" -name "*${farmId}*" -type f -mmin +60 2>/dev/null | head -20`
          );
          
          const files = stdout.trim().split('\n').filter(f => f);
          for (const file of files) {
            const stats = await fs.stat(file).catch(() => null);
            if (stats) {
              const age = Date.now() - stats.mtime.getTime();
              
              if (age > this.TEMP_FILE_MAX_AGE) {
                items.push({
                  type: 'file',
                  path: file,
                  size: stats.size,
                  age,
                  status: 'pending'
                });

                issues.push({
                  type: 'temp_file',
                  severity: 'low',
                  description: `Old temporary file: ${path.basename(file)}`,
                  location: file,
                  remediation: 'Delete temporary file'
                });
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or find failed
        }
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error checking temporary files:', error);
    }

    return { issues, items };
  }

  /**
   * Perform automatic cleanup
   */
  private async performCleanup(farmId: string, items: CleanupItem[]): Promise<{ cleaned: CleanupItem[] }> {
    const cleaned: CleanupItem[] = [];

    for (const item of items) {
      try {
        let success = false;

        switch (item.type) {
          case 'file':
            if (item.path) {
              // Determine action based on rules
              const action = await this.determineAction(item);
              
              switch (action) {
                case 'delete':
                  await fs.unlink(item.path);
                  success = true;
                  break;
                  
                case 'quarantine':
                  await this.quarantineFile(item.path);
                  success = true;
                  break;
                  
                case 'archive':
                  await this.archiveFile(item.path);
                  success = true;
                  break;
              }
            }
            break;

          case 'process':
            if (item.pid && item.pid > 0) {
              try {
                await execAsync(`kill -TERM ${item.pid}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Check if process still exists
                try {
                  await execAsync(`kill -0 ${item.pid} 2>/dev/null`);
                  // Still exists, force kill
                  await execAsync(`kill -KILL ${item.pid}`);
                } catch (error) {
                  // Process no longer exists - good
                }
                success = true;
              } catch (error) {
                logger.error(`Failed to kill process ${item.pid}:`, error);
              }
            }
            break;

          case 'connection':
            if (item.pid) {
              try {
                await db.query(
                  'SELECT pg_terminate_backend($1)',
                  [item.pid]
                );
                success = true;
              } catch (error) {
                logger.error(`Failed to terminate connection ${item.pid}:`, error);
              }
            }
            break;
        }

        if (success) {
          item.status = 'cleaned';
          cleaned.push(item);
        } else {
          item.status = 'failed';
        }

      } catch (error) {
        logger.error(`[CleanupValidator] Error cleaning item:`, error);
        item.status = 'failed';
      }
    }

    return { cleaned };
  }

  /**
   * Determine cleanup action based on rules
   */
  private async determineAction(item: CleanupItem): Promise<CleanupRule['action']> {
    // Check rules in priority order
    const sortedRules = Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(item, rule)) {
        return rule.action;
      }
    }

    // Default action
    return item.path && item.path.includes('/tmp/') ? 'delete' : 'quarantine';
  }

  /**
   * Check if item matches rule
   */
  private matchesRule(item: CleanupItem, rule: CleanupRule): boolean {
    if (rule.type !== item.type) {
      return false;
    }

    if (rule.pattern && item.path) {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(item.path)) {
        return false;
      }
    }

    // Additional condition checking could be implemented here

    return true;
  }

  /**
   * Quarantine a file
   */
  private async quarantineFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantinePath = path.join(this.quarantineDir, `${timestamp}_${fileName}`);

    await fs.rename(filePath, quarantinePath);
    logger.info(`[CleanupValidator] Quarantined file: ${fileName}`);
  }

  /**
   * Archive a file
   */
  private async archiveFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(this.archiveDir, `${timestamp}_${fileName}.gz`);

    // Compress and move
    await execAsync(`gzip -c "${filePath}" > "${archivePath}"`);
    await fs.unlink(filePath);
    
    logger.info(`[CleanupValidator] Archived file: ${fileName}`);
  }

  /**
   * Load cleanup rules from database
   */
  private async loadCleanupRules(): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM cleanup_rules WHERE enabled = true');
      
      for (const row of result.rows) {
        const rule: CleanupRule = {
          id: row.id,
          name: row.name,
          type: row.type,
          pattern: row.pattern,
          condition: row.condition,
          action: row.action,
          priority: row.priority,
          metadata: row.metadata
        };
        
        this.rules.set(rule.id, rule);
      }

      logger.info(`[CleanupValidator] Loaded ${this.rules.size} cleanup rules`);

      // If no rules exist, create defaults
      if (this.rules.size === 0) {
        await this.createDefaultRules();
      }

    } catch (error) {
      logger.error('[CleanupValidator] Error loading cleanup rules:', error);
      await this.createDefaultRules();
    }
  }

  /**
   * Create default cleanup rules
   */
  private async createDefaultRules(): Promise<void> {
    const defaultRules: CleanupRule[] = [
      {
        id: 'tmp-files',
        name: 'Temporary Files',
        type: 'file',
        pattern: '.*\\.(tmp|temp|bak)$',
        action: 'delete',
        priority: 10
      },
      {
        id: 'log-files',
        name: 'Old Log Files',
        type: 'file',
        pattern: '.*\\.log$',
        action: 'archive',
        priority: 5
      },
      {
        id: 'core-dumps',
        name: 'Core Dumps',
        type: 'file',
        pattern: '^core\\.\\d+$',
        action: 'quarantine',
        priority: 15
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Ensure necessary directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.quarantineDir, { recursive: true });
    await fs.mkdir(this.archiveDir, { recursive: true });
  }

  /**
   * Start periodic validation
   */
  private startPeriodicValidation(): void {
    // Clean up old quarantined files periodically
    setInterval(async () => {
      await this.cleanupOldQuarantineFiles();
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Clean up old quarantine files
   */
  private async cleanupOldQuarantineFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.quarantineDir);
      const now = Date.now();
      const maxAge = this.QUARANTINE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.quarantineDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.info(`[CleanupValidator] Deleted old quarantine file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('[CleanupValidator] Error cleaning quarantine files:', error);
    }
  }

  /**
   * Persist validation result to database
   */
  private async persistValidationResult(result: CleanupValidationResult): Promise<void> {
    try {
      await db.query(`
        INSERT INTO cleanup_validations 
        (farm_id, is_clean, issues, cleaned_items, remaining_items, recommendations, validated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        result.farmId,
        result.isClean,
        JSON.stringify(result.issues),
        JSON.stringify(result.cleanedItems),
        JSON.stringify(result.remainingItems),
        JSON.stringify(result.recommendations)
      ]);
    } catch (error) {
      logger.error('[CleanupValidator] Error persisting validation result:', error);
    }
  }

  /**
   * Get validation statistics
   */
  async getStatistics(): Promise<{
    totalValidations: number;
    cleanValidations: number;
    issuesFound: number;
    itemsCleaned: number;
    successRate: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_clean = true THEN 1 END) as clean,
          SUM(COALESCE(array_length(issues::text[], 1), 0)) as issues,
          SUM(COALESCE(array_length(cleaned_items::text[], 1), 0)) as cleaned
        FROM cleanup_validations
        WHERE validated_at > NOW() - INTERVAL '30 days'
      `);

      const stats = result.rows[0];
      const successRate = stats.total > 0 ? (stats.clean / stats.total) * 100 : 0;

      return {
        totalValidations: parseInt(stats.total) || 0,
        cleanValidations: parseInt(stats.clean) || 0,
        issuesFound: parseInt(stats.issues) || 0,
        itemsCleaned: parseInt(stats.cleaned) || 0,
        successRate
      };
    } catch (error) {
      logger.error('[CleanupValidator] Error getting statistics:', error);
      return {
        totalValidations: 0,
        cleanValidations: 0,
        issuesFound: 0,
        itemsCleaned: 0,
        successRate: 0
      };
    }
  }
}

// Export singleton instance
export const cleanupValidator = new CleanupValidator();