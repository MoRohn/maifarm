/**
 * Unified Quick Task Service
 * Optimized quick task execution with enforced timeouts
 * Replaces: quickTaskService, quickTaskServiceV2, quickTaskExecutor, etc.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { farmService, FarmMode, FarmConfig } from './farmService';
import { stateCoordinator, EntityType, StateEvent } from './stateCoordinator';
import { websocketHub } from './websocketHub';
import { terminalService } from './terminalService';
import { db, redis } from '../../database/connection';
import { logger } from '../../utils/logger';
import {
  QUICK_TASK_TIMEOUT,
  GRACEFUL_SHUTDOWN_PERIOD
} from '../../constants/timing';
import {
  MaiFarmError,
  ErrorCode,
  ErrorSeverity,
  ValidationError
} from '../../types/errors';

export interface QuickTaskRequest {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  contextFiles?: string[];
  metadata?: Record<string, any>;
  maxAgents?: number; // Optional number of agents (defaults to 2)
}

export interface QuickTaskResult {
  taskId: string;
  farmId: string;
  status: QuickTaskStatus;
  sessionName: string;
  harvestId?: string;
  result?: any;
  error?: string;
  metrics?: QuickTaskMetrics;
  createdAt: Date;
  completedAt?: Date;
}

export interface QuickTaskMetrics {
  launchTime: number;
  executionTime: number;
  timeToFirstOutput: number;
  totalOutputLines: number;
  exitCode?: number;
  timedOut: boolean;
}

export enum QuickTaskStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  LAUNCHING = 'launching',
  PROCESSING = 'processing',
  COMPLETING = 'completing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

interface QuickTaskInternal {
  id: string;
  farmId: string;
  request: QuickTaskRequest;
  status: QuickTaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metrics: QuickTaskMetrics;
  timeoutHandle?: NodeJS.Timeout;
  gracefulShutdownHandle?: NodeJS.Timeout;
  outputBuffer: string[];
}

class UnifiedQuickTaskService extends EventEmitter {
  private static instance: UnifiedQuickTaskService;
  private tasks: Map<string, QuickTaskInternal> = new Map();
  private taskQueue: QuickTaskInternal[] = [];
  private activeTasks: Set<string> = new Set();

  private readonly MAX_CONCURRENT_TASKS = 5;
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly DEFAULT_AGENT_COUNT = 2; // Default agent count for quick tasks
  private readonly OUTPUT_BUFFER_SIZE = 1000;

  private queueProcessor: NodeJS.Timer | null = null;
  private metricsCollector: NodeJS.Timer | null = null;
  private isProcessing = false;

  private constructor() {
    super();
    this.initialize();
  }

  public static getInstance(): UnifiedQuickTaskService {
    if (!UnifiedQuickTaskService.instance) {
      UnifiedQuickTaskService.instance = new UnifiedQuickTaskService();
    }
    return UnifiedQuickTaskService.instance;
  }

  private initialize(): void {
    // Start queue processor
    this.startQueueProcessor();

    // Start metrics collection
    this.startMetricsCollection();

    // Setup event handlers
    this.setupEventHandlers();

    // Load persisted tasks
    this.loadPersistedTasks();

    logger.info('UnifiedQuickTaskService initialized');
  }

  /**
   * Create and execute a quick task
   */
  public async createQuickTask(
    request: QuickTaskRequest,
    userId: string = 'system'
  ): Promise<QuickTaskResult> {
    try {
      const normalizedRequest = this.normalizeRequest(request);

      // Validate request
      this.validateRequest(normalizedRequest);

      // Create task
      const task = this.createTask(normalizedRequest);

      // Check if we can execute immediately or need to queue
      if (this.activeTasks.size < this.MAX_CONCURRENT_TASKS) {
        await this.executeTask(task, userId);
      } else {
        this.queueTask(task);
      }

      // Return initial result
      return this.createTaskResult(task);

    } catch (error) {
      throw new MaiFarmError(
        ErrorCode.QUICK_TASK_FAILED,
        `Failed to create quick task: ${error.message}`,
        ErrorSeverity.HIGH,
        { request }
      );
    }
  }

  /**
   * Create task object
   */
  private createTask(request: QuickTaskRequest): QuickTaskInternal {
    const taskId = uuidv4();
    const farmId = uuidv4();

    const task: QuickTaskInternal = {
      id: taskId,
      farmId,
      request,
      status: QuickTaskStatus.CREATED,
      createdAt: new Date(),
      metrics: {
        launchTime: 0,
        executionTime: 0,
        timeToFirstOutput: 0,
        totalOutputLines: 0,
        timedOut: false
      },
      outputBuffer: []
    };

    // Store task
    this.tasks.set(taskId, task);

    // Update state coordinator
    stateCoordinator.upsertEntity(
      taskId,
      EntityType.TASK,
      QuickTaskStatus.CREATED,
      { farmId, type: 'quick-task' },
      'quicktask'
    );

    return task;
  }

  /**
   * Execute a task
   */
  private async executeTask(task: QuickTaskInternal, userId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as launching
      await this.updateTaskStatus(task, QuickTaskStatus.LAUNCHING);
      this.activeTasks.add(task.id);
      task.startedAt = new Date();

      // Create farm configuration
      const farmConfig: FarmConfig = {
        id: task.farmId,
        name: task.request.title,
        description: task.request.description,
        mode: FarmMode.QUICK_TASK,
        provider: 'claude', // Default to Claude for quick tasks
        numberOfAgents: task.request.maxAgents || this.DEFAULT_AGENT_COUNT,
        prompt: this.buildPrompt(task.request),
        yamlContent: this.generateQuickTaskYaml(task.request),
        timeout: QUICK_TASK_TIMEOUT,
        userId,
        contextFiles: task.request.contextFiles,
        staggerDelay: 0, // No delay for quick tasks
        debug: false
      };

      // Launch farm
      const launchResult = await farmService.createFarm(farmConfig);

      if (!launchResult.success) {
        throw new Error(launchResult.error || 'Farm launch failed');
      }

      task.metrics.launchTime = Date.now() - startTime;

      // Update status to processing
      await this.updateTaskStatus(task, QuickTaskStatus.PROCESSING);

      // Setup terminal streaming
      this.setupTerminalStreaming(task);

      // Setup timeout enforcement (CRITICAL)
      this.enforceTimeout(task);

      // Setup graceful shutdown handler
      this.setupGracefulShutdown(task);

      // Persist task
      await this.persistTask(task);

      logger.info(`Quick task ${task.id} launched successfully`, {
        farmId: task.farmId,
        launchTime: task.metrics.launchTime
      });

    } catch (error) {
      logger.error(`Quick task ${task.id} execution failed:`, error);

      // Mark as failed
      task.metrics.executionTime = Date.now() - startTime;
      await this.updateTaskStatus(task, QuickTaskStatus.FAILED);

      // Clean up
      this.cleanupTask(task);

      throw error;
    }
  }

  /**
   * Enforce strict timeout for quick task
   * CRITICAL: Quick tasks MUST complete within 5 minutes
   * NOTE: Shutdown begins AT the 5-minute mark, not before
   */
  private enforceTimeout(task: QuickTaskInternal): void {
    // Set hard timeout at exactly QUICK_TASK_TIMEOUT (5 minutes)
    // The graceful shutdown will BEGIN at this point, giving agents 30s to wrap up
    task.timeoutHandle = setTimeout(async () => {
      logger.warn(`Quick task ${task.id} reached 5-minute timeout - initiating graceful shutdown`);

      // Mark as timed out
      task.metrics.timedOut = true;
      await this.updateTaskStatus(task, QuickTaskStatus.TIMEOUT);

      // Initiate graceful shutdown NOW (at the 5-minute mark)
      await farmService.gracefulShutdownFarm(task.farmId, 'quick-task', 'timeout');

      // After grace period, force stop
      task.gracefulShutdownHandle = setTimeout(async () => {
        logger.warn(`Quick task ${task.id} grace period expired, forcing termination`);
        await this.forceStopTask(task);
      }, GRACEFUL_SHUTDOWN_PERIOD);

    }, QUICK_TASK_TIMEOUT);

    logger.info(`Timeout enforced for quick task ${task.id}: ${QUICK_TASK_TIMEOUT}ms`);
  }

  /**
   * Setup graceful shutdown monitoring
   */
  private setupGracefulShutdown(task: QuickTaskInternal): void {
    // Listen for farm completion events
    const farmStatusHandler = (data: any) => {
      if (data.farmId !== task.farmId) return;

      if (data.currentStatus === 'completed' || data.currentStatus === 'failed') {
        this.handleTaskCompletion(task, data.currentStatus);
      }
    };

    websocketHub.on('state:farm:status_changed', farmStatusHandler);

    // Store handler for cleanup
    task['farmStatusHandler'] = farmStatusHandler;
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(
    task: QuickTaskInternal,
    farmStatus: string
  ): Promise<void> {
    // Clear timeouts
    if (task.timeoutHandle) {
      clearTimeout(task.timeoutHandle);
    }
    if (task.gracefulShutdownHandle) {
      clearTimeout(task.gracefulShutdownHandle);
    }

    // Calculate metrics
    task.completedAt = new Date();
    task.metrics.executionTime = task.completedAt.getTime() - task.startedAt!.getTime();

    // Update status
    const finalStatus = farmStatus === 'completed'
      ? QuickTaskStatus.COMPLETED
      : QuickTaskStatus.FAILED;

    await this.updateTaskStatus(task, finalStatus);

    // Trigger harvest if completed
    if (finalStatus === QuickTaskStatus.COMPLETED) {
      await this.triggerHarvest(task);
    }

    // Clean up
    this.cleanupTask(task);

    logger.info(`Quick task ${task.id} completed`, {
      status: finalStatus,
      executionTime: task.metrics.executionTime,
      timedOut: task.metrics.timedOut
    });
  }

  /**
   * Force stop a task
   */
  private async forceStopTask(task: QuickTaskInternal): Promise<void> {
    try {
      // Stop farm
      await farmService.stopFarm(task.farmId);

      // Update status
      await this.updateTaskStatus(task, QuickTaskStatus.CANCELLED);

      // Clean up
      this.cleanupTask(task);

      logger.info(`Quick task ${task.id} forcefully stopped`);

    } catch (error) {
      logger.error(`Failed to force stop task ${task.id}:`, error);
    }
  }

  /**
   * Setup terminal streaming for output monitoring
   */
  private setupTerminalStreaming(task: QuickTaskInternal): void {
    const startTime = Date.now();
    let firstOutputReceived = false;

    // Subscribe to terminal output
    const outputHandler = (data: any) => {
      if (data.sessionName !== `farm-${task.farmId}`) return;

      // Track time to first output
      if (!firstOutputReceived) {
        firstOutputReceived = true;
        task.metrics.timeToFirstOutput = Date.now() - startTime;
      }

      // Buffer output
      if (task.outputBuffer.length < this.OUTPUT_BUFFER_SIZE) {
        task.outputBuffer.push(data.content);
      }

      // Update metrics
      task.metrics.totalOutputLines++;

      // Broadcast to clients
      websocketHub.broadcastToRoom(`quicktask:${task.id}`, 'quicktask:output', {
        taskId: task.id,
        content: data.content,
        agentId: data.agentId,
        timestamp: new Date()
      });
    };

    websocketHub.on('terminal:output', outputHandler);

    // Store handler for cleanup
    task['outputHandler'] = outputHandler;
  }

  /**
   * Trigger harvest for completed task
   */
  private async triggerHarvest(task: QuickTaskInternal): Promise<void> {
    try {
      const farm = farmService.getFarm(task.farmId);
      if (farm && farm.harvestId) {
        // Harvest already initiated by farm service
        logger.info(`Harvest ${farm.harvestId} already initiated for task ${task.id}`);
      }
    } catch (error) {
      logger.error(`Failed to trigger harvest for task ${task.id}:`, error);
    }
  }

  /**
   * Queue a task for later execution
   */
  private queueTask(task: QuickTaskInternal): void {
    if (this.taskQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new MaiFarmError(
        ErrorCode.OPERATION_FAILED,
        'Quick task queue is full',
        ErrorSeverity.HIGH
      );
    }

    task.status = QuickTaskStatus.QUEUED;
    this.taskQueue.push(task);

    logger.info(`Quick task ${task.id} queued (position: ${this.taskQueue.length})`);
  }

  /**
   * Process queued tasks
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (
        this.taskQueue.length > 0 &&
        this.activeTasks.size < this.MAX_CONCURRENT_TASKS
      ) {
        const task = this.taskQueue.shift()!;
        await this.executeTask(task, 'system');
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Update task status
   */
  private async updateTaskStatus(
    task: QuickTaskInternal,
    status: QuickTaskStatus
  ): Promise<void> {
    const previousStatus = task.status;
    task.status = status;

    // Update state coordinator
    await stateCoordinator.updateEntityStatus(task.id, status, 'quicktask');

    // Broadcast status change
    websocketHub.broadcast('quicktask:status', {
      taskId: task.id,
      previousStatus,
      currentStatus: status,
      timestamp: new Date()
    });

    // Emit event
    this.emit('task:status:changed', {
      taskId: task.id,
      previousStatus,
      currentStatus: status
    });
  }

  /**
   * Clean up task resources
   */
  private cleanupTask(task: QuickTaskInternal): void {
    // Remove from active tasks
    this.activeTasks.delete(task.id);

    // Clear timeouts
    if (task.timeoutHandle) {
      clearTimeout(task.timeoutHandle);
    }
    if (task.gracefulShutdownHandle) {
      clearTimeout(task.gracefulShutdownHandle);
    }

    // Remove event handlers
    if (task['outputHandler']) {
      websocketHub.removeListener('terminal:output', task['outputHandler']);
    }
    if (task['farmStatusHandler']) {
      websocketHub.removeListener('state:farm:status_changed', task['farmStatusHandler']);
    }

    // Process next queued task
    this.processQueue();
  }

  /**
   * Validate quick task request
   */
  private validateRequest(request: QuickTaskRequest): void {
    const errors: string[] = [];

    if (!request.title || request.title.trim().length < 3) {
      errors.push('Title must be at least 3 characters');
    }

    if (!request.description || request.description.trim().length < 5) {
      errors.push('Description must be at least 5 characters');
    }

    if (request.contextFiles && request.contextFiles.length > 10) {
      errors.push('Maximum 10 context files allowed');
    }

    if (errors.length > 0) {
      throw new ValidationError(
        `Invalid quick task request: ${errors.join(', ')}`,
        { request }
      );
    }
  }

  /**
   * Build prompt for task
   */
  private buildPrompt(request: QuickTaskRequest): string {
    let prompt = request.description.trim();

    if (request.priority === 'critical') {
      prompt = `[CRITICAL PRIORITY] ${prompt}`;
    } else if (request.priority === 'high') {
      prompt = `[HIGH PRIORITY] ${prompt}`;
    }

    if (request.contextFiles && request.contextFiles.length > 0) {
      prompt += `\n\nContext files:\n${request.contextFiles.join('\n')}`;
    }

    return prompt;
  }

  /**
   * Generate minimal YAML for quick task
   */
  private generateQuickTaskYaml(request: QuickTaskRequest): string {
    const yaml = {
      name: request.title,
      type: 'quick-task',
      timeout: QUICK_TASK_TIMEOUT,
      agents: [
        {
          name: 'Agent 1',
          role: 'primary',
          capabilities: ['analysis', 'execution']
        },
        {
          name: 'Agent 2',
          role: 'assistant',
          capabilities: ['verification', 'documentation']
        }
      ],
      workflow: {
        type: 'collaborative',
        steps: [
          {
            name: 'execute',
            description: request.description,
            agents: ['Agent 1', 'Agent 2']
          }
        ]
      }
    };

    return JSON.stringify(yaml, null, 2);
  }

  /**
   * Create task result object
   */
  private createTaskResult(task: QuickTaskInternal): QuickTaskResult {
    return {
      taskId: task.id,
      farmId: task.farmId,
      status: task.status,
      sessionName: `farm-${task.farmId}`,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      metrics: task.metrics
    };
  }

  private normalizeRequest(request: QuickTaskRequest): QuickTaskRequest {
    const trimmedDescription = request.description?.trim() || '';
    const normalizedTitle = this.generateTaskName(request.title, trimmedDescription);

    return {
      ...request,
      title: normalizedTitle,
      description: trimmedDescription
    };
  }

  private generateTaskName(rawTitle: string | undefined, description: string): string {
    const title = rawTitle?.trim();
    if (title && !this.looksLikeGeneratedTitle(title)) {
      return title;
    }

    const sourceText = description.trim();
    if (!sourceText) {
      return title && title.length >= 3 ? title : 'Quick Task';
    }

    const firstLine = sourceText
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.length > 0) || sourceText;

    if (!firstLine) {
      return 'Quick Task';
    }

    const normalized = firstLine.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'Quick Task';
    }

    const sentenceCase = normalized[0].toUpperCase() + normalized.slice(1);
    return sentenceCase.length > 60 ? `${sentenceCase.slice(0, 57).trim()}…` : sentenceCase;
  }

  private looksLikeGeneratedTitle(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    if (normalized === 'quick task') {
      return true;
    }
    return /^quick task[^\w]*\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(normalized);
  }

  /**
   * Persist task to database
   */
  private async persistTask(task: QuickTaskInternal): Promise<void> {
    try {
      await db.query(
        `INSERT INTO tasks (
          id, farm_id, type, priority, status,
          payload, metadata, timeout, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          status = $5, metadata = $7, updated_at = $10`,
        [
          task.id,
          task.farmId,
          'quick-task',
          task.request.priority || 'medium',
          task.status,
          JSON.stringify(task.request),
          JSON.stringify({
            ...task.request.metadata,
            metrics: task.metrics
          }),
          QUICK_TASK_TIMEOUT,
          task.createdAt,
          new Date()
        ]
      );
    } catch (error) {
      logger.error(`Failed to persist task ${task.id}:`, error);
    }
  }

  /**
   * Load persisted tasks on startup
   */
  private async loadPersistedTasks(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT * FROM tasks
         WHERE type = 'quick-task'
         AND status IN ($1, $2, $3)`,
        [QuickTaskStatus.QUEUED, QuickTaskStatus.LAUNCHING, QuickTaskStatus.PROCESSING]
      );

      for (const row of result.rows) {
        // Reconstruct task
        const task: QuickTaskInternal = {
          id: row.id,
          farmId: row.farm_id,
          request: row.payload,
          status: row.status,
          createdAt: new Date(row.created_at),
          startedAt: row.started_at ? new Date(row.started_at) : undefined,
          metrics: row.metadata?.metrics || {
            launchTime: 0,
            executionTime: 0,
            timeToFirstOutput: 0,
            totalOutputLines: 0,
            timedOut: false
          },
          outputBuffer: []
        };

        this.tasks.set(task.id, task);

        // Re-queue if needed
        if (task.status === QuickTaskStatus.QUEUED) {
          this.taskQueue.push(task);
        }
      }

      logger.info(`Loaded ${this.tasks.size} persisted quick tasks`);

    } catch (error) {
      logger.error('Failed to load persisted tasks:', error);
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    this.queueProcessor = setInterval(() => {
      this.processQueue();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsCollector = setInterval(() => {
      const metrics = this.getMetrics();

      // Broadcast metrics
      websocketHub.broadcast('quicktask:metrics', metrics);

      logger.debug('Quick task metrics:', metrics);

    }, 30000); // Every 30 seconds
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle process exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Get current metrics
   */
  public getMetrics(): {
    totalTasks: number;
    activeTasks: number;
    queuedTasks: number;
    completedTasks: number;
    failedTasks: number;
    timedOutTasks: number;
    averageExecutionTime: number;
    averageLaunchTime: number;
  } {
    const tasks = Array.from(this.tasks.values());
    const completed = tasks.filter(t => t.status === QuickTaskStatus.COMPLETED);
    const failed = tasks.filter(t => t.status === QuickTaskStatus.FAILED);
    const timedOut = tasks.filter(t => t.metrics.timedOut);

    const avgExecTime = completed.length > 0
      ? completed.reduce((sum, t) => sum + t.metrics.executionTime, 0) / completed.length
      : 0;

    const avgLaunchTime = tasks.length > 0
      ? tasks.reduce((sum, t) => sum + t.metrics.launchTime, 0) / tasks.length
      : 0;

    return {
      totalTasks: tasks.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      timedOutTasks: timedOut.length,
      averageExecutionTime: Math.round(avgExecTime),
      averageLaunchTime: Math.round(avgLaunchTime)
    };
  }

  /**
   * Get task by ID
   */
  public getTask(taskId: string): QuickTaskResult | undefined {
    const task = this.tasks.get(taskId);
    return task ? this.createTaskResult(task) : undefined;
  }

  /**
   * Get all tasks
   */
  public getAllTasks(): QuickTaskResult[] {
    return Array.from(this.tasks.values()).map(t => this.createTaskResult(t));
  }

  /**
   * Cancel a task
   */
  public async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new MaiFarmError(
        ErrorCode.TASK_NOT_FOUND,
        `Task ${taskId} not found`,
        ErrorSeverity.LOW
      );
    }

    if (task.status === QuickTaskStatus.COMPLETED ||
        task.status === QuickTaskStatus.FAILED) {
      throw new MaiFarmError(
        ErrorCode.OPERATION_FAILED,
        `Cannot cancel task in status ${task.status}`,
        ErrorSeverity.LOW
      );
    }

    await this.forceStopTask(task);
  }

  /**
   * Shutdown service
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down UnifiedQuickTaskService');

    // Stop intervals
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }
    if (this.metricsCollector) {
      clearInterval(this.metricsCollector);
    }

    // Cancel all active tasks
    for (const taskId of this.activeTasks) {
      const task = this.tasks.get(taskId);
      if (task) {
        await this.forceStopTask(task);
      }
    }

    logger.info('UnifiedQuickTaskService shutdown complete');
  }
}

// Export singleton instance
export const quickTaskService = UnifiedQuickTaskService.getInstance();
