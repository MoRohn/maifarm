import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';

const execAsync = promisify(exec);

export interface SandboxConfig {
  id: string;
  type: 'docker' | 'chroot' | 'firejail' | 'native';
  memoryLimitMB?: number;
  cpuLimit?: number;
  timeoutMs?: number;
  networkAccess?: boolean;
  readOnlyPaths?: string[];
  writablePaths?: string[];
  blockedSyscalls?: string[];
  environment?: Record<string, string>;
}

export interface SandboxExecution {
  executionId: string;
  sandboxId: string;
  command: string;
  args: string[];
  workDir: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  startTime: Date;
  endTime?: Date;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  resourceUsage?: ResourceUsage;
  securityEvents?: SecurityEvent[];
}

export interface ResourceUsage {
  cpuTimeMs: number;
  memoryPeakMB: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  networkInBytes: number;
  networkOutBytes: number;
}

export interface SecurityEvent {
  timestamp: Date;
  type: 'syscall_blocked' | 'file_access_denied' | 'network_blocked' | 'resource_limit';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  details?: any;
}

export class SandboxExecutor extends EventEmitter {
  private sandboxes: Map<string, SandboxConfig> = new Map();
  private executions: Map<string, SandboxExecution> = new Map();
  private dockerAvailable: boolean = false;
  private firejailAvailable: boolean = false;
  
  private readonly DEFAULT_MEMORY_LIMIT = 512; // MB
  private readonly DEFAULT_CPU_LIMIT = 50; // percentage
  private readonly DEFAULT_TIMEOUT = 300000; // 5 minutes
  private readonly SANDBOX_BASE_PATH = path.join(pathConfig.getPath('MAIBARN_ROOT'), 'sandboxes');

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the sandbox executor
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('[SandboxExecutor] Initializing sandbox executor...');

      // Check available sandbox technologies
      await this.detectAvailableSandboxes();

      // Create sandbox base directory
      await fileManager.ensureDirectory(this.SANDBOX_BASE_PATH);

      // Load sandbox configurations
      await this.loadSandboxConfigs();

      logger.info('[SandboxExecutor] Initialization complete');
      logger.info(`[SandboxExecutor] Available sandboxes: Docker=${this.dockerAvailable}, Firejail=${this.firejailAvailable}`);

    } catch (error) {
      logger.error('[SandboxExecutor] Initialization failed:', error);
    }
  }

  /**
   * Execute command in sandbox
   */
  async executeInSandbox(
    command: string,
    args: string[],
    sandboxConfig?: Partial<SandboxConfig>
  ): Promise<SandboxExecution> {
    const executionId = uuidv4();
    const sandboxId = sandboxConfig?.id || uuidv4();
    
    logger.info(`[SandboxExecutor] Starting execution ${executionId} in sandbox ${sandboxId}`);

    // Merge with default config
    const config: SandboxConfig = {
      id: sandboxId,
      type: this.selectBestSandboxType(),
      memoryLimitMB: this.DEFAULT_MEMORY_LIMIT,
      cpuLimit: this.DEFAULT_CPU_LIMIT,
      timeoutMs: this.DEFAULT_TIMEOUT,
      networkAccess: false,
      readOnlyPaths: ['/'],
      writablePaths: [],
      blockedSyscalls: [],
      environment: {},
      ...sandboxConfig
    };

    // Create sandbox workspace
    const sandboxPath = path.join(this.SANDBOX_BASE_PATH, executionId);
    await this.createSandboxWorkspace(sandboxPath, config);

    // Create execution record
    const execution: SandboxExecution = {
      executionId,
      sandboxId,
      command,
      args,
      workDir: sandboxPath,
      status: 'pending',
      startTime: new Date(),
      securityEvents: []
    };

    this.executions.set(executionId, execution);

    try {
      // Execute based on sandbox type
      switch (config.type) {
        case 'docker':
          await this.executeInDocker(execution, config);
          break;
        case 'firejail':
          await this.executeInFirejail(execution, config);
          break;
        case 'chroot':
          await this.executeInChroot(execution, config);
          break;
        default:
          await this.executeNative(execution, config);
      }

      // Update execution status
      execution.status = execution.exitCode === 0 ? 'completed' : 'failed';
      execution.endTime = new Date();

      // Collect resource usage
      execution.resourceUsage = await this.collectResourceUsage(executionId);

      // Persist execution record
      await this.persistExecution(execution);

      // Emit completion event
      this.emit('execution:complete', execution);

      logger.info(`[SandboxExecutor] Execution ${executionId} completed with exit code ${execution.exitCode}`);

      return execution;

    } catch (error) {
      logger.error(`[SandboxExecutor] Execution ${executionId} failed:`, error);
      
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.stderr = error.message;
      
      await this.persistExecution(execution);
      
      throw error;
      
    } finally {
      // Cleanup sandbox workspace
      await this.cleanupSandbox(sandboxPath);
    }
  }

  /**
   * Execute in Docker container
   */
  private async executeInDocker(execution: SandboxExecution, config: SandboxConfig): Promise<void> {
    logger.info(`[SandboxExecutor] Executing in Docker: ${execution.command}`);

    execution.status = 'running';

    // Build Docker run command
    const dockerArgs = [
      'run',
      '--rm',
      '--name', `sandbox-${execution.executionId}`,
      '--memory', `${config.memoryLimitMB}m`,
      '--cpus', `${(config.cpuLimit || 50) / 100}`,
      '--read-only'
    ];

    // Add network configuration
    if (!config.networkAccess) {
      dockerArgs.push('--network', 'none');
    }

    // Add volume mounts
    for (const writablePath of config.writablePaths || []) {
      dockerArgs.push('-v', `${writablePath}:${writablePath}`);
    }

    // Add environment variables
    for (const [key, value] of Object.entries(config.environment || {})) {
      dockerArgs.push('-e', `${key}=${value}`);
    }

    // Add work directory
    dockerArgs.push('-w', '/workspace');
    dockerArgs.push('-v', `${execution.workDir}:/workspace`);

    // Use Alpine Linux as base image
    dockerArgs.push('alpine:latest');
    
    // Add command and arguments
    dockerArgs.push(execution.command, ...execution.args);

    try {
      // Execute with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), config.timeoutMs);
      });

      const execPromise = execAsync(`docker ${dockerArgs.join(' ')}`, {
        maxBuffer: 10 * 1024 * 1024 // 10MB output buffer
      });

      const result = await Promise.race([execPromise, timeoutPromise]) as any;
      
      execution.stdout = result.stdout;
      execution.stderr = result.stderr;
      execution.exitCode = 0;

    } catch (error: any) {
      if (error.message === 'Execution timeout') {
        execution.status = 'timeout';
        await this.killDockerContainer(`sandbox-${execution.executionId}`);
      } else {
        execution.exitCode = error.code || 1;
        execution.stdout = error.stdout || '';
        execution.stderr = error.stderr || error.message;
      }
    }
  }

  /**
   * Execute in Firejail sandbox
   */
  private async executeInFirejail(execution: SandboxExecution, config: SandboxConfig): Promise<void> {
    logger.info(`[SandboxExecutor] Executing in Firejail: ${execution.command}`);

    execution.status = 'running';

    // Build Firejail command
    const firejailArgs = [
      '--quiet',
      `--rlimit-as=${config.memoryLimitMB}m`,
      '--cpu=0', // Use CPU 0 only
      '--private=' + execution.workDir
    ];

    // Add network configuration
    if (!config.networkAccess) {
      firejailArgs.push('--net=none');
    }

    // Add read-only paths
    for (const roPath of config.readOnlyPaths || []) {
      firejailArgs.push(`--read-only=${roPath}`);
    }

    // Add blocked syscalls
    if (config.blockedSyscalls && config.blockedSyscalls.length > 0) {
      firejailArgs.push(`--seccomp.drop=${config.blockedSyscalls.join(',')}`);
    }

    // Build full command
    const fullCommand = `firejail ${firejailArgs.join(' ')} -- ${execution.command} ${execution.args.join(' ')}`;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), config.timeoutMs);
      });

      const execPromise = execAsync(fullCommand, {
        cwd: execution.workDir,
        env: { ...process.env, ...config.environment },
        maxBuffer: 10 * 1024 * 1024
      });

      const result = await Promise.race([execPromise, timeoutPromise]) as any;
      
      execution.stdout = result.stdout;
      execution.stderr = result.stderr;
      execution.exitCode = 0;

    } catch (error: any) {
      if (error.message === 'Execution timeout') {
        execution.status = 'timeout';
        // Kill firejail process
        await execAsync(`pkill -f "firejail.*${execution.executionId}"`).catch(() => {});
      } else {
        execution.exitCode = error.code || 1;
        execution.stdout = error.stdout || '';
        execution.stderr = error.stderr || error.message;
      }
    }
  }

  /**
   * Execute in chroot environment
   */
  private async executeInChroot(execution: SandboxExecution, config: SandboxConfig): Promise<void> {
    logger.info(`[SandboxExecutor] Executing in chroot: ${execution.command}`);

    execution.status = 'running';

    // Create minimal chroot environment
    await this.setupChrootEnvironment(execution.workDir);

    // Build chroot command
    const chrootCommand = `chroot ${execution.workDir} ${execution.command} ${execution.args.join(' ')}`;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), config.timeoutMs);
      });

      const execPromise = execAsync(chrootCommand, {
        env: config.environment,
        maxBuffer: 10 * 1024 * 1024
      });

      const result = await Promise.race([execPromise, timeoutPromise]) as any;
      
      execution.stdout = result.stdout;
      execution.stderr = result.stderr;
      execution.exitCode = 0;

    } catch (error: any) {
      if (error.message === 'Execution timeout') {
        execution.status = 'timeout';
      } else {
        execution.exitCode = error.code || 1;
        execution.stdout = error.stdout || '';
        execution.stderr = error.stderr || error.message;
      }
    }
  }

  /**
   * Execute natively with basic isolation
   */
  private async executeNative(execution: SandboxExecution, config: SandboxConfig): Promise<void> {
    logger.info(`[SandboxExecutor] Executing natively with basic isolation: ${execution.command}`);

    execution.status = 'running';

    // Create isolated environment
    const isolatedEnv = {
      HOME: execution.workDir,
      PATH: '/usr/local/bin:/usr/bin:/bin',
      TMPDIR: path.join(execution.workDir, 'tmp'),
      ...config.environment
    };

    // Remove dangerous environment variables
    delete isolatedEnv.LD_PRELOAD;
    delete isolatedEnv.LD_LIBRARY_PATH;
    delete isolatedEnv.DYLD_INSERT_LIBRARIES;

    try {
      const child = spawn(execution.command, execution.args, {
        cwd: execution.workDir,
        env: isolatedEnv,
        timeout: config.timeoutMs,
        killSignal: 'SIGKILL'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > 10 * 1024 * 1024) {
          child.kill('SIGKILL');
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 10 * 1024 * 1024) {
          child.kill('SIGKILL');
        }
      });

      // Monitor resource usage
      const monitor = setInterval(() => {
        this.checkResourceLimits(child.pid!, config, execution);
      }, 1000);

      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code, signal) => {
          clearInterval(monitor);
          execution.exitCode = code || 0;
          execution.stdout = stdout;
          execution.stderr = stderr;
          
          if (signal === 'SIGKILL') {
            execution.status = 'killed';
            execution.securityEvents?.push({
              timestamp: new Date(),
              type: 'resource_limit',
              severity: 'warning',
              description: 'Process killed due to resource limits'
            });
          }
          
          resolve();
        });

        child.on('error', (error) => {
          clearInterval(monitor);
          reject(error);
        });
      });

    } catch (error: any) {
      execution.exitCode = 1;
      execution.stderr = error.message;
    }
  }

  /**
   * Check resource limits
   */
  private async checkResourceLimits(
    pid: number,
    config: SandboxConfig,
    execution: SandboxExecution
  ): Promise<void> {
    try {
      // Get process memory usage
      const { stdout } = await execAsync(`ps -o rss= -p ${pid}`);
      const memoryMB = parseInt(stdout.trim()) / 1024;

      if (memoryMB > (config.memoryLimitMB || this.DEFAULT_MEMORY_LIMIT)) {
        execution.securityEvents?.push({
          timestamp: new Date(),
          type: 'resource_limit',
          severity: 'critical',
          description: `Memory limit exceeded: ${memoryMB}MB`,
          details: { memoryMB, limit: config.memoryLimitMB }
        });

        // Kill process
        process.kill(pid, 'SIGKILL');
      }

      // Check CPU usage (simplified)
      const cpuCheck = await execAsync(`ps -o %cpu= -p ${pid}`);
      const cpuPercent = parseFloat(cpuCheck.stdout.trim());

      if (cpuPercent > (config.cpuLimit || this.DEFAULT_CPU_LIMIT)) {
        execution.securityEvents?.push({
          timestamp: new Date(),
          type: 'resource_limit',
          severity: 'warning',
          description: `High CPU usage: ${cpuPercent}%`,
          details: { cpuPercent, limit: config.cpuLimit }
        });
      }

    } catch (error) {
      // Process might have already exited
    }
  }

  /**
   * Detect available sandbox technologies
   */
  private async detectAvailableSandboxes(): Promise<void> {
    // Check for Docker
    try {
      await execAsync('docker --version');
      this.dockerAvailable = true;
    } catch (error) {
      this.dockerAvailable = false;
    }

    // Check for Firejail
    try {
      await execAsync('firejail --version');
      this.firejailAvailable = true;
    } catch (error) {
      this.firejailAvailable = false;
    }
  }

  /**
   * Select best available sandbox type
   */
  private selectBestSandboxType(): SandboxConfig['type'] {
    if (this.dockerAvailable) return 'docker';
    if (this.firejailAvailable) return 'firejail';
    if (process.platform === 'linux') return 'chroot';
    return 'native';
  }

  /**
   * Create sandbox workspace
   */
  private async createSandboxWorkspace(sandboxPath: string, config: SandboxConfig): Promise<void> {
    await fileManager.ensureDirectory(sandboxPath);
    await fileManager.ensureDirectory(path.join(sandboxPath, 'tmp'));
    
    // Create restricted file indicating sandbox
    await fileManager.writeFile(
      path.join(sandboxPath, '.sandbox'),
      JSON.stringify({
        id: config.id,
        type: config.type,
        created: new Date()
      })
    );
  }

  /**
   * Setup chroot environment
   */
  private async setupChrootEnvironment(chrootPath: string): Promise<void> {
    // Create minimal directory structure
    const dirs = ['bin', 'lib', 'lib64', 'usr', 'tmp', 'dev', 'proc'];
    for (const dir of dirs) {
      await fileManager.ensureDirectory(path.join(chrootPath, dir));
    }

    // Copy essential binaries (simplified - would need more in production)
    try {
      await execAsync(`cp /bin/sh ${chrootPath}/bin/`);
      await execAsync(`cp /bin/bash ${chrootPath}/bin/`);
      
      // Copy required libraries (would need ldd analysis in production)
      await execAsync(`cp -r /lib/* ${chrootPath}/lib/ 2>/dev/null || true`);
      await execAsync(`cp -r /lib64/* ${chrootPath}/lib64/ 2>/dev/null || true`);
    } catch (error) {
      logger.warn('[SandboxExecutor] Error setting up chroot environment:', error);
    }
  }

  /**
   * Kill Docker container
   */
  private async killDockerContainer(containerName: string): Promise<void> {
    try {
      await execAsync(`docker kill ${containerName}`);
    } catch (error) {
      // Container might have already stopped
    }
  }

  /**
   * Cleanup sandbox workspace
   */
  private async cleanupSandbox(sandboxPath: string): Promise<void> {
    try {
      // Remove sandbox directory
      await fs.rm(sandboxPath, { recursive: true, force: true });
    } catch (error) {
      logger.error('[SandboxExecutor] Error cleaning up sandbox:', error);
    }
  }

  /**
   * Collect resource usage statistics
   */
  private async collectResourceUsage(executionId: string): Promise<ResourceUsage> {
    // This would need platform-specific implementation
    // For now, return mock data
    return {
      cpuTimeMs: 0,
      memoryPeakMB: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
      networkInBytes: 0,
      networkOutBytes: 0
    };
  }

  /**
   * Load sandbox configurations from database
   */
  private async loadSandboxConfigs(): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM sandbox_configs WHERE enabled = true');
      
      for (const row of result.rows) {
        const config: SandboxConfig = {
          id: row.id,
          type: row.type,
          memoryLimitMB: row.memory_limit_mb,
          cpuLimit: row.cpu_limit,
          timeoutMs: row.timeout_ms,
          networkAccess: row.network_access,
          readOnlyPaths: row.read_only_paths,
          writablePaths: row.writable_paths,
          blockedSyscalls: row.blocked_syscalls,
          environment: row.environment
        };
        
        this.sandboxes.set(config.id, config);
      }

      logger.info(`[SandboxExecutor] Loaded ${this.sandboxes.size} sandbox configurations`);

    } catch (error) {
      logger.error('[SandboxExecutor] Error loading sandbox configs:', error);
    }
  }

  /**
   * Persist execution record to database
   */
  private async persistExecution(execution: SandboxExecution): Promise<void> {
    try {
      await db.query(`
        INSERT INTO sandbox_executions 
        (execution_id, sandbox_id, command, args, work_dir, status, 
         start_time, end_time, exit_code, stdout, stderr, 
         resource_usage, security_events)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        execution.executionId,
        execution.sandboxId,
        execution.command,
        JSON.stringify(execution.args),
        execution.workDir,
        execution.status,
        execution.startTime,
        execution.endTime,
        execution.exitCode,
        execution.stdout,
        execution.stderr,
        JSON.stringify(execution.resourceUsage),
        JSON.stringify(execution.securityEvents)
      ]);
    } catch (error) {
      logger.error('[SandboxExecutor] Error persisting execution:', error);
    }
  }

  /**
   * Get execution statistics
   */
  async getStatistics(): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    timeoutExecutions: number;
    averageExecutionTime: number;
    securityEventsCount: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'timeout' THEN 1 END) as timeout,
          AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_time,
          SUM(COALESCE(array_length(security_events::text[], 1), 0)) as security_events
        FROM sandbox_executions
        WHERE start_time > NOW() - INTERVAL '30 days'
      `);

      const stats = result.rows[0];

      return {
        totalExecutions: parseInt(stats.total) || 0,
        successfulExecutions: parseInt(stats.successful) || 0,
        failedExecutions: parseInt(stats.failed) || 0,
        timeoutExecutions: parseInt(stats.timeout) || 0,
        averageExecutionTime: parseFloat(stats.avg_time) || 0,
        securityEventsCount: parseInt(stats.security_events) || 0
      };
    } catch (error) {
      logger.error('[SandboxExecutor] Error getting statistics:', error);
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        timeoutExecutions: 0,
        averageExecutionTime: 0,
        securityEventsCount: 0
      };
    }
  }
}

// Export singleton instance
export const sandboxExecutor = new SandboxExecutor();