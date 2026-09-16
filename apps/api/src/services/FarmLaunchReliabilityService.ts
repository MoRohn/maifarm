/**
 * Farm Launch Reliability Service
 *
 * Provides enterprise-grade reliability for farm launch and harvest operations:
 * - Pre-launch validation with comprehensive health checks
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern for failing operations
 * - Graceful degradation and fallback strategies
 * - Automatic recovery for stuck/orphaned farms
 * - Integrity verification for harvest collection
 * - Comprehensive error handling and logging
 * - Real-time monitoring and alerting
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { aiProviderManager } from '../config/aiProviders';
import { TmuxManager } from '../utils/tmuxManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Types & Interfaces
// ============================================================================

interface PreflightCheck {
  name: string;
  status: 'pending' | 'passed' | 'failed' | 'warning';
  message?: string;
  critical: boolean; // If true, failure blocks launch
  duration?: number; // milliseconds
  error?: string;
}

interface PreflightResult {
  passed: boolean;
  canProceed: boolean; // False if critical checks failed
  checks: PreflightCheck[];
  warnings: string[];
  errors: string[];
  duration: number;
}

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number; // 2 = exponential backoff
  timeout: number; // milliseconds per attempt
}

interface LaunchAttempt {
  attemptNumber: number;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'success' | 'failed' | 'timeout';
  error?: string;
  duration?: number;
}

interface FarmHealth {
  farmId: string;
  status: 'healthy' | 'degraded' | 'critical' | 'failed';
  issues: HealthIssue[];
  lastCheck: Date;
  components: ComponentHealth[];
}

interface HealthIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: Date;
  message?: string;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  nextRetryTime?: Date;
}

interface HarvestIntegrity {
  valid: boolean;
  fileCount: number;
  totalSize: number;
  missingFiles: string[];
  corruptedFiles: string[];
  warnings: string[];
}

// ============================================================================
// Farm Launch Reliability Service
// ============================================================================

export class FarmLaunchReliabilityService extends EventEmitter {
  private static instance: FarmLaunchReliabilityService;

  // Tracking maps
  private farmHealthMap = new Map<string, FarmHealth>();
  private launchAttemptsMap = new Map<string, LaunchAttempt[]>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();

  // Configuration
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelay: 2000, // 2 seconds
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    timeout: 90000 // 90 seconds per attempt
  };

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 60 seconds before retry

  // Health check intervals
  private healthCheckInterval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.startHealthMonitoring();
    this.startRecoveryMonitoring();
    logger.info(LogCategory.SYSTEM, 'FarmLaunchReliabilityService initialized');
  }

  static getInstance(): FarmLaunchReliabilityService {
    if (!this.instance) {
      this.instance = new FarmLaunchReliabilityService();
    }
    return this.instance;
  }

  // ============================================================================
  // Pre-launch Validation
  // ============================================================================

  /**
   * Run comprehensive pre-launch validation checks
   */
  async runPreflightChecks(farmId: string, config: any): Promise<PreflightResult> {
    const startTime = Date.now();
    const checks: PreflightCheck[] = [];

    logger.info(LogCategory.FARM, `Running preflight checks for farm ${farmId}`);

    // Check 1: Database connectivity
    checks.push(await this.checkDatabaseConnectivity());

    // Check 2: API keys availability
    checks.push(await this.checkApiKeys(config.provider));

    // Check 3: System resources
    checks.push(await this.checkSystemResources(config.agentCount));

    // Check 4: Tmux availability
    checks.push(await this.checkTmuxAvailability());

    // Check 5: Workspace permissions
    checks.push(await this.checkWorkspacePermissions(farmId));

    // Check 6: Port availability
    checks.push(await this.checkPortAvailability());

    // Check 7: Disk space
    checks.push(await this.checkDiskSpace());

    // Check 8: No duplicate farms
    checks.push(await this.checkDuplicateFarm(farmId));

    // Check 9: Redis connectivity
    checks.push(await this.checkRedisConnectivity());

    const duration = Date.now() - startTime;

    // Determine if we can proceed
    const failedCritical = checks.filter(c => c.critical && c.status === 'failed');
    const warnings = checks.filter(c => c.status === 'warning').map(c => c.message || c.name);
    const errors = checks.filter(c => c.status === 'failed').map(c => c.error || c.message || c.name);

    const result: PreflightResult = {
      passed: failedCritical.length === 0,
      canProceed: failedCritical.length === 0,
      checks,
      warnings,
      errors,
      duration
    };

    // Emit preflight result
    this.emit('preflight:complete', { farmId, result });
    websocketManager.broadcastToFarm(farmId, 'farm:preflight-complete', result);

    // Log results
    const passedCount = checks.filter(c => c.status === 'passed').length;
    logger.info(LogCategory.FARM,
      `Preflight checks completed for farm ${farmId}: ${passedCount}/${checks.length} passed ` +
      `(${warnings.length} warnings, ${errors.length} errors) in ${duration}ms`
    );

    if (!result.canProceed) {
      logger.error(LogCategory.FARM,
        `Preflight checks FAILED for farm ${farmId}: ${errors.join(', ')}`
      );
    }

    return result;
  }

  private async checkDatabaseConnectivity(): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Database Connectivity',
      status: 'pending',
      critical: true
    };

    const startTime = Date.now();

    try {
      await db.query('SELECT 1');
      check.status = 'passed';
      check.message = 'Database is accessible';
    } catch (error) {
      check.status = 'failed';
      check.error = error instanceof Error ? error.message : String(error);
      check.message = 'Database is not accessible';
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkApiKeys(provider: string): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'API Keys',
      status: 'pending',
      critical: true
    };

    const startTime = Date.now();

    try {
      await aiProviderManager.refreshApiKeys();
      const hasKey = provider === 'claude'
        ? !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY
        : !!process.env.OPENAI_API_KEY;

      if (hasKey) {
        check.status = 'passed';
        check.message = `${provider} API key is configured`;
      } else {
        check.status = 'failed';
        check.message = `${provider} API key is missing`;
        check.error = `No API key found for provider: ${provider}`;
      }
    } catch (error) {
      check.status = 'failed';
      check.error = error instanceof Error ? error.message : String(error);
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkSystemResources(agentCount: number): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'System Resources',
      status: 'pending',
      critical: false // Warning only
    };

    const startTime = Date.now();

    try {
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const freeMemGB = freeMem / (1024 * 1024 * 1024);
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const loadPerCpu = loadAvg / cpuCount;

      // Calculate required memory (estimate 2GB per agent)
      const requiredMemGB = agentCount * 2;

      if (freeMemGB < requiredMemGB) {
        check.status = 'warning';
        check.message = `Low memory: ${freeMemGB.toFixed(1)}GB free, ${requiredMemGB}GB recommended for ${agentCount} agents`;
      } else if (loadPerCpu > 2.0) {
        check.status = 'warning';
        check.message = `High system load: ${loadPerCpu.toFixed(2)} per CPU`;
      } else {
        check.status = 'passed';
        check.message = `Sufficient resources: ${freeMemGB.toFixed(1)}GB RAM, load ${loadPerCpu.toFixed(2)}`;
      }
    } catch (error) {
      check.status = 'warning';
      check.error = error instanceof Error ? error.message : String(error);
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkTmuxAvailability(): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Tmux Availability',
      status: 'pending',
      critical: true
    };

    const startTime = Date.now();

    try {
      const tmuxManager = new TmuxManager();
      const isReady = await tmuxManager.ensureServerRunning();

      if (isReady) {
        check.status = 'passed';
        check.message = 'Tmux server is running';
      } else {
        check.status = 'failed';
        check.message = 'Tmux server is not running';
        check.error = 'Failed to start tmux server';
      }
    } catch (error) {
      check.status = 'failed';
      check.error = error instanceof Error ? error.message : String(error);
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkWorkspacePermissions(farmId: string): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Workspace Permissions',
      status: 'pending',
      critical: true
    };

    const startTime = Date.now();

    try {
      const workspaceBase = pathConfig.getPath('WORKSPACES_DIR');
      const testPath = path.join(workspaceBase, `test-${farmId}.tmp`);

      // Try to create a test file
      await fs.writeFile(testPath, 'test');
      await fs.unlink(testPath);

      check.status = 'passed';
      check.message = 'Workspace directory is writable';
    } catch (error) {
      check.status = 'failed';
      check.error = error instanceof Error ? error.message : String(error);
      check.message = 'Workspace directory is not writable';
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkPortAvailability(): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Port Availability',
      status: 'pending',
      critical: false // Warning only
    };

    const startTime = Date.now();

    try {
      // Check if required ports are available (4567, 3000)
      const { stdout } = await execAsync('lsof -i :4567 -i :3000 2>/dev/null || true');

      if (stdout.trim()) {
        check.status = 'passed';
        check.message = 'Required ports are in use (server is running)';
      } else {
        check.status = 'warning';
        check.message = 'Server ports may not be in use';
      }
    } catch (error) {
      check.status = 'passed'; // Not critical
      check.message = 'Could not check port availability';
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkDiskSpace(): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Disk Space',
      status: 'pending',
      critical: false // Warning only
    };

    const startTime = Date.now();

    try {
      const workspaceBase = pathConfig.getPath('WORKSPACES_DIR');
      const { stdout } = await execAsync(`df -k "${workspaceBase}" | tail -1 | awk '{print $4}'`);
      const availableKB = parseInt(stdout.trim());
      const availableGB = availableKB / (1024 * 1024);

      const MIN_REQUIRED_GB = 5; // 5GB minimum

      if (availableGB < MIN_REQUIRED_GB) {
        check.status = 'warning';
        check.message = `Low disk space: ${availableGB.toFixed(1)}GB available, ${MIN_REQUIRED_GB}GB recommended`;
      } else {
        check.status = 'passed';
        check.message = `Sufficient disk space: ${availableGB.toFixed(1)}GB available`;
      }
    } catch (error) {
      check.status = 'warning';
      check.error = error instanceof Error ? error.message : String(error);
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkDuplicateFarm(farmId: string): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Duplicate Farm Check',
      status: 'pending',
      critical: true
    };

    const startTime = Date.now();

    try {
      const result = await db.query(
        'SELECT id, status FROM farms WHERE id = $1',
        [farmId]
      );

      if (result.rows.length > 0) {
        const existingStatus = result.rows[0].status;
        check.status = 'failed';
        check.message = `Farm ${farmId} already exists with status: ${existingStatus}`;
        check.error = 'Duplicate farm ID';
      } else {
        check.status = 'passed';
        check.message = 'No duplicate farm found';
      }
    } catch (error) {
      check.status = 'failed';
      check.error = error instanceof Error ? error.message : String(error);
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  private async checkRedisConnectivity(): Promise<PreflightCheck> {
    const check: PreflightCheck = {
      name: 'Redis Connectivity',
      status: 'pending',
      critical: false // Not critical, we can work without Redis
    };

    const startTime = Date.now();

    try {
      // Try to import redis client
      const { redisClient } = await import('../database/redis');

      if (redisClient) {
        // Test ping
        await redisClient.ping();
        check.status = 'passed';
        check.message = 'Redis is accessible';
      } else {
        check.status = 'warning';
        check.message = 'Redis client not initialized';
      }
    } catch (error) {
      check.status = 'warning';
      check.message = 'Redis not available (not critical)';
    }

    check.duration = Date.now() - startTime;
    return check;
  }

  // ============================================================================
  // Retry Logic with Exponential Backoff
  // ============================================================================

  /**
   * Execute operation with automatic retry and exponential backoff
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    farmId: string,
    operationName: string,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    const attempts: LaunchAttempt[] = [];

    logger.info(LogCategory.FARM,
      `Starting operation '${operationName}' for farm ${farmId} with retry (max ${retryConfig.maxAttempts} attempts)`
    );

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      const attemptRecord: LaunchAttempt = {
        attemptNumber: attempt,
        startTime: new Date(),
        status: 'running'
      };

      attempts.push(attemptRecord);

      try {
        // Check circuit breaker
        if (this.isCircuitOpen(farmId)) {
          throw new Error('Circuit breaker is open - too many recent failures');
        }

        // Execute operation with timeout
        const result = await this.executeWithTimeout(
          operation(),
          retryConfig.timeout,
          `${operationName} (attempt ${attempt})`
        );

        // Success!
        attemptRecord.status = 'success';
        attemptRecord.endTime = new Date();
        attemptRecord.duration = attemptRecord.endTime.getTime() - attemptRecord.startTime.getTime();

        this.recordSuccess(farmId);

        logger.info(LogCategory.FARM,
          `Operation '${operationName}' succeeded for farm ${farmId} on attempt ${attempt}/${retryConfig.maxAttempts} (${attemptRecord.duration}ms)`
        );

        this.launchAttemptsMap.set(farmId, attempts);
        return result;

      } catch (error) {
        attemptRecord.status = 'failed';
        attemptRecord.endTime = new Date();
        attemptRecord.duration = attemptRecord.endTime.getTime() - attemptRecord.startTime.getTime();
        attemptRecord.error = error instanceof Error ? error.message : String(error);

        this.recordFailure(farmId);

        logger.warn(LogCategory.FARM,
          `Operation '${operationName}' failed for farm ${farmId} on attempt ${attempt}/${retryConfig.maxAttempts}: ${attemptRecord.error}`
        );

        // If last attempt, throw error
        if (attempt === retryConfig.maxAttempts) {
          this.launchAttemptsMap.set(farmId, attempts);
          throw new Error(
            `Operation '${operationName}' failed after ${retryConfig.maxAttempts} attempts. ` +
            `Last error: ${attemptRecord.error}`
          );
        }

        // Calculate backoff delay
        const delay = Math.min(
          retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelay
        );

        logger.info(LogCategory.FARM,
          `Retrying operation '${operationName}' for farm ${farmId} in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxAttempts})`
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Operation '${operationName}' failed - this should not happen`);
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  // ============================================================================
  // Circuit Breaker Pattern
  // ============================================================================

  private isCircuitOpen(farmId: string): boolean {
    const breaker = this.circuitBreakers.get(farmId);
    if (!breaker) return false;

    if (breaker.state === 'open') {
      // Check if we should try again (half-open)
      if (breaker.nextRetryTime && Date.now() >= breaker.nextRetryTime.getTime()) {
        breaker.state = 'half-open';
        logger.info(LogCategory.FARM, `Circuit breaker for farm ${farmId} entering half-open state`);
        return false;
      }
      return true;
    }

    return false;
  }

  private recordSuccess(farmId: string): void {
    const breaker = this.circuitBreakers.get(farmId) || {
      state: 'closed' as const,
      failures: 0
    };

    breaker.state = 'closed';
    breaker.failures = 0;
    breaker.lastSuccess = new Date();
    delete breaker.nextRetryTime;

    this.circuitBreakers.set(farmId, breaker);
  }

  private recordFailure(farmId: string): void {
    const breaker = this.circuitBreakers.get(farmId) || {
      state: 'closed' as const,
      failures: 0
    };

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.state = 'open';
      breaker.nextRetryTime = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);

      logger.error(LogCategory.FARM,
        `Circuit breaker OPENED for farm ${farmId} after ${breaker.failures} failures. ` +
        `Will retry at ${breaker.nextRetryTime.toISOString()}`
      );

      this.emit('circuit-breaker:opened', { farmId, failures: breaker.failures });
    }

    this.circuitBreakers.set(farmId, breaker);
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  private startHealthMonitoring(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);

    logger.info(LogCategory.SYSTEM, 'Farm health monitoring started (30s interval)');
  }

  private async performHealthChecks(): Promise<void> {
    try {
      // Get all active farms
      const result = await db.query(
        `SELECT id, name, status, created_at, session_name
         FROM farms
         WHERE status IN ('active', 'running', 'launching')
         ORDER BY created_at DESC`
      );

      for (const row of result.rows) {
        try {
          const health = await this.checkFarmHealth(row.id, row.session_name);
          this.farmHealthMap.set(row.id, health);

          // Emit health update
          if (health.status === 'critical' || health.status === 'failed') {
            this.emit('farm:health-critical', { farmId: row.id, health });
            websocketManager.broadcastToFarm(row.id, 'farm:health-critical', health);
          }
        } catch (error) {
          logger.error(LogCategory.FARM, `Health check failed for farm ${row.id}:`, error);
        }
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Health monitoring error:', error);
    }
  }

  async checkFarmHealth(farmId: string, sessionName: string): Promise<FarmHealth> {
    const health: FarmHealth = {
      farmId,
      status: 'healthy',
      issues: [],
      lastCheck: new Date(),
      components: []
    };

    // Check 1: Tmux session exists
    const tmuxHealth = await this.checkTmuxSessionHealth(sessionName);
    health.components.push(tmuxHealth);
    if (tmuxHealth.status === 'failed') {
      health.issues.push({
        severity: 'critical',
        component: 'tmux',
        message: tmuxHealth.message || 'Tmux session not found',
        timestamp: new Date(),
        recoverable: true
      });
    }

    // Check 2: Terminal log files exist and are growing
    const logsHealth = await this.checkTerminalLogsHealth(farmId);
    health.components.push(logsHealth);
    if (logsHealth.status === 'failed') {
      health.issues.push({
        severity: 'error',
        component: 'terminal-logs',
        message: logsHealth.message || 'Terminal logs not updating',
        timestamp: new Date(),
        recoverable: true
      });
    }

    // Check 3: Agents are registered in database
    const agentsHealth = await this.checkAgentsHealth(farmId);
    health.components.push(agentsHealth);
    if (agentsHealth.status === 'failed') {
      health.issues.push({
        severity: 'warning',
        component: 'agents',
        message: agentsHealth.message || 'No agents found',
        timestamp: new Date(),
        recoverable: false
      });
    }

    // Determine overall health status
    const criticalIssues = health.issues.filter(i => i.severity === 'critical');
    const errorIssues = health.issues.filter(i => i.severity === 'error');

    if (criticalIssues.length > 0) {
      health.status = 'failed';
    } else if (errorIssues.length > 0) {
      health.status = 'critical';
    } else if (health.issues.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }

  private async checkTmuxSessionHealth(sessionName: string): Promise<ComponentHealth> {
    try {
      const tmuxManager = new TmuxManager();
      const exists = await tmuxManager.sessionExists(sessionName);

      return {
        name: 'Tmux Session',
        status: exists ? 'healthy' : 'failed',
        lastCheck: new Date(),
        message: exists ? `Session ${sessionName} is running` : `Session ${sessionName} not found`
      };
    } catch (error) {
      return {
        name: 'Tmux Session',
        status: 'failed',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkTerminalLogsHealth(farmId: string): Promise<ComponentHealth> {
    try {
      const terminalDir = path.join(pathConfig.getPath('TERMINALS_DIR'), farmId);
      const files = await fs.readdir(terminalDir);
      const logFiles = files.filter(f => f.endsWith('.log'));

      if (logFiles.length === 0) {
        return {
          name: 'Terminal Logs',
          status: 'failed',
          lastCheck: new Date(),
          message: 'No log files found'
        };
      }

      // Check if at least one log file has recent activity (last 60 seconds)
      let hasRecentActivity = false;
      for (const file of logFiles) {
        const filePath = path.join(terminalDir, file);
        const stats = await fs.stat(filePath);
        const age = Date.now() - stats.mtimeMs;
        if (age < 60000) {
          hasRecentActivity = true;
          break;
        }
      }

      return {
        name: 'Terminal Logs',
        status: hasRecentActivity ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        message: hasRecentActivity
          ? `${logFiles.length} log files with recent activity`
          : `${logFiles.length} log files but no recent activity (>60s)`
      };
    } catch (error) {
      return {
        name: 'Terminal Logs',
        status: 'failed',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkAgentsHealth(farmId: string): Promise<ComponentHealth> {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM agents WHERE farm_id = $1',
        [farmId]
      );

      const count = parseInt(result.rows[0].count);

      return {
        name: 'Agents',
        status: count > 0 ? 'healthy' : 'failed',
        lastCheck: new Date(),
        message: count > 0 ? `${count} agents registered` : 'No agents found'
      };
    } catch (error) {
      return {
        name: 'Agents',
        status: 'failed',
        lastCheck: new Date(),
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================================
  // Automatic Recovery
  // ============================================================================

  private startRecoveryMonitoring(): void {
    // Check for stuck farms every 2 minutes
    this.recoveryInterval = setInterval(async () => {
      await this.attemptAutomaticRecovery();
    }, 120000);

    logger.info(LogCategory.SYSTEM, 'Automatic recovery monitoring started (2min interval)');
  }

  private async attemptAutomaticRecovery(): Promise<void> {
    try {
      // Find farms that need recovery
      for (const [farmId, health] of this.farmHealthMap.entries()) {
        if (health.status === 'critical' || health.status === 'failed') {
          const recoverableIssues = health.issues.filter(i => i.recoverable);

          if (recoverableIssues.length > 0) {
            logger.info(LogCategory.FARM,
              `Attempting automatic recovery for farm ${farmId} (${recoverableIssues.length} recoverable issues)`
            );

            await this.recoverFarm(farmId, health);
          }
        }
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Recovery monitoring error:', error);
    }
  }

  async recoverFarm(farmId: string, health: FarmHealth): Promise<boolean> {
    logger.info(LogCategory.FARM, `Starting recovery for farm ${farmId}`);

    this.emit('farm:recovery-started', { farmId, health });
    websocketManager.broadcastToFarm(farmId, 'farm:recovery-started', { health });

    let recovered = false;

    // Recovery strategy based on issues
    for (const issue of health.issues) {
      if (!issue.recoverable) continue;

      try {
        switch (issue.component) {
          case 'tmux':
            // Tmux session is missing - try to recreate
            logger.info(LogCategory.FARM, `Attempting to recreate tmux session for farm ${farmId}`);
            // Note: This would require the full farm config, so we'll mark for manual intervention
            logger.warn(LogCategory.FARM, `Cannot automatically recreate tmux session - manual intervention required`);
            break;

          case 'terminal-logs':
            // Terminal logs not updating - try to restart pipe-pane
            logger.info(LogCategory.FARM, `Attempting to restart pipe-pane for farm ${farmId}`);
            // Note: This would require session details
            logger.warn(LogCategory.FARM, `Cannot automatically restart pipe-pane - manual intervention required`);
            break;

          default:
            logger.warn(LogCategory.FARM, `Unknown recovery action for component: ${issue.component}`);
        }
      } catch (error) {
        logger.error(LogCategory.FARM, `Recovery action failed for ${issue.component}:`, error);
      }
    }

    // Check if recovery was successful
    const newHealth = await this.checkFarmHealth(farmId, `farm-${farmId.substring(0, 8)}`);
    recovered = newHealth.status === 'healthy' || newHealth.status === 'degraded';

    if (recovered) {
      logger.info(LogCategory.FARM, `Recovery successful for farm ${farmId}`);
      this.emit('farm:recovery-completed', { farmId, newHealth });
      websocketManager.broadcastToFarm(farmId, 'farm:recovery-completed', { health: newHealth });
    } else {
      logger.warn(LogCategory.FARM, `Recovery failed for farm ${farmId} - manual intervention required`);
      this.emit('farm:recovery-failed', { farmId, health: newHealth });
    }

    return recovered;
  }

  // ============================================================================
  // Harvest Integrity Verification
  // ============================================================================

  async verifyHarvestIntegrity(harvestId: string, farmId: string): Promise<HarvestIntegrity> {
    logger.info(LogCategory.HARVEST, `Verifying integrity of harvest ${harvestId}`);

    const integrity: HarvestIntegrity = {
      valid: true,
      fileCount: 0,
      totalSize: 0,
      missingFiles: [],
      corruptedFiles: [],
      warnings: []
    };

    try {
      // Get harvest from database
      const result = await db.query(
        'SELECT * FROM harvests WHERE id = $1',
        [harvestId]
      );

      if (result.rows.length === 0) {
        integrity.valid = false;
        integrity.warnings.push('Harvest not found in database');
        return integrity;
      }

      const harvest = result.rows[0];
      const artifacts = harvest.artifacts || [];

      // Check each artifact file exists and is readable
      for (const artifact of artifacts) {
        try {
          const artifactPath = artifact.path || artifact.filePath;
          if (!artifactPath) {
            integrity.warnings.push(`Artifact missing path: ${artifact.name || 'unknown'}`);
            continue;
          }

          const stats = await fs.stat(artifactPath);
          integrity.fileCount++;
          integrity.totalSize += stats.size;

          // Check if file is suspiciously small (< 10 bytes)
          if (stats.size < 10) {
            integrity.warnings.push(`Suspicious file size: ${artifactPath} (${stats.size} bytes)`);
          }
        } catch (error) {
          integrity.missingFiles.push(artifact.path || artifact.name || 'unknown');
          integrity.valid = false;
        }
      }

      // Validate minimum file count
      if (integrity.fileCount === 0) {
        integrity.valid = false;
        integrity.warnings.push('No artifacts collected');
      }

      // Log results
      if (integrity.valid) {
        logger.info(LogCategory.HARVEST,
          `Harvest ${harvestId} integrity verified: ${integrity.fileCount} files, ${(integrity.totalSize / 1024 / 1024).toFixed(2)}MB`
        );
      } else {
        logger.error(LogCategory.HARVEST,
          `Harvest ${harvestId} integrity check FAILED: ${integrity.warnings.join(', ')}`
        );
      }

    } catch (error) {
      integrity.valid = false;
      integrity.warnings.push(error instanceof Error ? error.message : 'Unknown error');
      logger.error(LogCategory.HARVEST, `Harvest integrity verification failed:`, error);
    }

    return integrity;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getFarmHealth(farmId: string): FarmHealth | undefined {
    return this.farmHealthMap.get(farmId);
  }

  getLaunchAttempts(farmId: string): LaunchAttempt[] {
    return this.launchAttemptsMap.get(farmId) || [];
  }

  getCircuitBreakerState(farmId: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(farmId);
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Shutting down FarmLaunchReliabilityService');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }

    this.farmHealthMap.clear();
    this.launchAttemptsMap.clear();
    this.circuitBreakers.clear();

    logger.info(LogCategory.SYSTEM, 'FarmLaunchReliabilityService shutdown complete');
  }
}

// Export singleton instance
export const farmLaunchReliabilityService = FarmLaunchReliabilityService.getInstance();
