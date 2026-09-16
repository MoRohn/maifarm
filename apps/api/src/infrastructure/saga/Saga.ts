import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { eventBus } from '../events/EventBus';

export enum SagaState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
  ABORTED = 'ABORTED'
}

export interface SagaStep {
  id: string;
  name: string;
  transaction: () => Promise<any>;
  compensation?: () => Promise<void>;
  retryable?: boolean;
  maxRetries?: number;
  timeout?: number;
  dependencies?: string[];
}

export interface SagaContext {
  sagaId: string;
  correlationId: string;
  userId?: string;
  data: Map<string, any>;
  completedSteps: string[];
  failedStep?: string;
  error?: Error;
}

export interface SagaOptions {
  name: string;
  timeout?: number;
  maxRetries?: number;
  compensationStrategy?: 'sequential' | 'parallel';
  isolationLevel?: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
}

export interface SagaResult {
  success: boolean;
  sagaId: string;
  data?: any;
  error?: Error;
  completedSteps: string[];
  compensatedSteps?: string[];
  duration: number;
}

/**
 * Saga implementation for distributed transactions
 * Implements the Saga pattern with compensation logic
 */
export class Saga extends EventEmitter {
  private id: string;
  private name: string;
  private state: SagaState = SagaState.PENDING;
  private steps: SagaStep[] = [];
  private context: SagaContext;
  private startTime?: Date;
  private endTime?: Date;
  private timeout: number;
  private maxRetries: number;
  private compensationStrategy: 'sequential' | 'parallel';
  private compensatedSteps: string[] = [];

  constructor(options: SagaOptions) {
    super();
    this.id = uuidv4();
    this.name = options.name;
    this.timeout = options.timeout || 60000; // 1 minute default
    this.maxRetries = options.maxRetries || 3;
    this.compensationStrategy = options.compensationStrategy || 'sequential';
    
    this.context = {
      sagaId: this.id,
      correlationId: uuidv4(),
      data: new Map(),
      completedSteps: []
    };
  }

  /**
   * Add a step to the saga
   */
  addStep(step: SagaStep): Saga {
    if (this.state !== SagaState.PENDING) {
      throw new Error('Cannot add steps to a running or completed saga');
    }
    
    this.steps.push({
      ...step,
      id: step.id || uuidv4(),
      maxRetries: step.maxRetries ?? this.maxRetries,
      timeout: step.timeout ?? this.timeout
    });
    
    return this;
  }

  /**
   * Execute the saga
   */
  async execute(initialData?: any): Promise<SagaResult> {
    if (this.state !== SagaState.PENDING) {
      throw new Error('Saga has already been executed');
    }

    this.startTime = new Date();
    this.state = SagaState.RUNNING;
    
    if (initialData) {
      this.context.data.set('initial', initialData);
    }

    logger.info(`[Saga] Starting saga ${this.name}`, {
      sagaId: this.id,
      steps: this.steps.length,
      correlationId: this.context.correlationId
    });

    // Emit saga started event
    await eventBus.emit('SAGA_STARTED', this.id, {
      name: this.name,
      steps: this.steps.map(s => ({ id: s.id, name: s.name }))
    }, {
      correlationId: this.context.correlationId
    });

    try {
      // Sort steps by dependencies
      const sortedSteps = this.topologicalSort(this.steps);
      
      // Execute steps
      for (const step of sortedSteps) {
        await this.executeStep(step);
      }

      // Mark as completed
      this.state = SagaState.COMPLETED;
      this.endTime = new Date();

      const result: SagaResult = {
        success: true,
        sagaId: this.id,
        data: Object.fromEntries(this.context.data),
        completedSteps: this.context.completedSteps,
        duration: this.endTime.getTime() - this.startTime.getTime()
      };

      logger.info(`[Saga] Completed saga ${this.name}`, {
        sagaId: this.id,
        duration: result.duration,
        steps: this.context.completedSteps.length
      });

      // Emit saga completed event
      await eventBus.emit('SAGA_COMPLETED', this.id, result, {
        correlationId: this.context.correlationId
      });

      return result;

    } catch (error) {
      logger.error(`[Saga] Failed saga ${this.name}`, {
        sagaId: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        failedStep: this.context.failedStep
      });

      // Start compensation
      await this.compensate();

      this.state = SagaState.FAILED;
      this.endTime = new Date();

      const result: SagaResult = {
        success: false,
        sagaId: this.id,
        error: error instanceof Error ? error : new Error('Unknown error'),
        completedSteps: this.context.completedSteps,
        compensatedSteps: this.compensatedSteps,
        duration: this.endTime.getTime() - this.startTime!.getTime()
      };

      // Emit saga failed event
      await eventBus.emit('SAGA_FAILED', this.id, result, {
        correlationId: this.context.correlationId
      });

      return result;
    }
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStep(step: SagaStep): Promise<void> {
    const maxRetries = step.maxRetries || this.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`[Saga] Executing step ${step.name}`, {
          sagaId: this.id,
          stepId: step.id,
          attempt
        });

        // Execute with timeout
        const result = await this.executeWithTimeout(
          step.transaction,
          step.timeout || this.timeout
        );

        // Store result in context
        this.context.data.set(step.id, result);
        this.context.completedSteps.push(step.id);

        // Emit step completed event
        await eventBus.emit('SAGA_STEP_COMPLETED', this.id, {
          stepId: step.id,
          stepName: step.name,
          result
        }, {
          correlationId: this.context.correlationId
        });

        return; // Success

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        logger.warn(`[Saga] Step ${step.name} failed on attempt ${attempt}`, {
          sagaId: this.id,
          stepId: step.id,
          error: lastError.message
        });

        // Check if retryable
        if (!step.retryable || attempt === maxRetries) {
          this.context.failedStep = step.id;
          this.context.error = lastError;
          throw lastError;
        }

        // Wait before retry with exponential backoff
        await this.delay(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
      }
    }

    throw lastError;
  }

  /**
   * Compensate completed steps
   */
  private async compensate(): Promise<void> {
    if (this.context.completedSteps.length === 0) {
      return;
    }

    this.state = SagaState.COMPENSATING;

    logger.info(`[Saga] Starting compensation for ${this.name}`, {
      sagaId: this.id,
      stepsToCompensate: this.context.completedSteps.length
    });

    // Get steps that need compensation
    const stepsToCompensate = this.steps.filter(
      step => this.context.completedSteps.includes(step.id) && step.compensation
    );

    if (this.compensationStrategy === 'sequential') {
      // Compensate in reverse order
      for (const step of stepsToCompensate.reverse()) {
        await this.compensateStep(step);
      }
    } else {
      // Compensate in parallel
      await Promise.allSettled(
        stepsToCompensate.map(step => this.compensateStep(step))
      );
    }

    this.state = SagaState.COMPENSATED;

    logger.info(`[Saga] Completed compensation for ${this.name}`, {
      sagaId: this.id,
      compensatedSteps: this.compensatedSteps.length
    });
  }

  /**
   * Compensate a single step
   */
  private async compensateStep(step: SagaStep): Promise<void> {
    if (!step.compensation) {
      return;
    }

    try {
      logger.debug(`[Saga] Compensating step ${step.name}`, {
        sagaId: this.id,
        stepId: step.id
      });

      await this.executeWithTimeout(
        step.compensation,
        step.timeout || this.timeout
      );

      this.compensatedSteps.push(step.id);

      // Emit step compensated event
      await eventBus.emit('SAGA_STEP_COMPENSATED', this.id, {
        stepId: step.id,
        stepName: step.name
      }, {
        correlationId: this.context.correlationId
      });

    } catch (error) {
      logger.error(`[Saga] Failed to compensate step ${step.name}`, {
        sagaId: this.id,
        stepId: step.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Continue compensating other steps even if one fails
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Saga step timeout after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(steps: SagaStep[]): SagaStep[] {
    const sorted: SagaStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stepMap = new Map(steps.map(s => [s.id, s]));

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected at step ${stepId}`);
      }

      visiting.add(stepId);
      const step = stepMap.get(stepId);
      
      if (step?.dependencies) {
        for (const depId of step.dependencies) {
          if (stepMap.has(depId)) {
            visit(depId);
          }
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      if (step) sorted.push(step);
    };

    steps.forEach(step => visit(step.id));
    return sorted;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get saga state
   */
  getState(): SagaState {
    return this.state;
  }

  /**
   * Get saga context
   */
  getContext(): SagaContext {
    return this.context;
  }

  /**
   * Abort saga execution
   */
  async abort(): Promise<void> {
    if (this.state !== SagaState.RUNNING) {
      throw new Error('Can only abort running sagas');
    }

    this.state = SagaState.ABORTED;
    await this.compensate();

    await eventBus.emit('SAGA_ABORTED', this.id, {
      compensatedSteps: this.compensatedSteps
    }, {
      correlationId: this.context.correlationId
    });
  }
}

/**
 * Saga Orchestrator for managing saga execution
 */
export class SagaOrchestrator {
  private static instance: SagaOrchestrator;
  private activeSagas: Map<string, Saga> = new Map();
  private sagaHistory: Map<string, SagaResult> = new Map();
  private maxHistorySize = 100;

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): SagaOrchestrator {
    if (!SagaOrchestrator.instance) {
      SagaOrchestrator.instance = new SagaOrchestrator();
    }
    return SagaOrchestrator.instance;
  }

  /**
   * Create and execute a saga
   */
  async executeSaga(
    name: string,
    steps: SagaStep[],
    initialData?: any,
    options?: Partial<SagaOptions>
  ): Promise<SagaResult> {
    const saga = new Saga({ name, ...options });
    
    // Add steps
    steps.forEach(step => saga.addStep(step));
    
    // Track active saga
    this.activeSagas.set(saga['id'], saga);
    
    try {
      // Execute saga
      const result = await saga.execute(initialData);
      
      // Store in history
      this.addToHistory(saga['id'], result);
      
      return result;
    } finally {
      // Remove from active
      this.activeSagas.delete(saga['id']);
    }
  }

  /**
   * Get active sagas
   */
  getActiveSagas(): Map<string, Saga> {
    return this.activeSagas;
  }

  /**
   * Get saga history
   */
  getSagaHistory(): Map<string, SagaResult> {
    return this.sagaHistory;
  }

  /**
   * Abort a saga
   */
  async abortSaga(sagaId: string): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }
    await saga.abort();
  }

  /**
   * Add to history with size management
   */
  private addToHistory(sagaId: string, result: SagaResult): void {
    this.sagaHistory.set(sagaId, result);
    
    // Trim history if too large
    if (this.sagaHistory.size > this.maxHistorySize) {
      const oldest = this.sagaHistory.keys().next().value;
      if (oldest) this.sagaHistory.delete(oldest);
    }
  }

  /**
   * Clean up old sagas periodically
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const cutoff = Date.now() - 3600000; // 1 hour
      
      // Clean up stuck sagas
      this.activeSagas.forEach((saga, id) => {
        const context = saga.getContext();
        if (saga['startTime'] && saga['startTime'].getTime() < cutoff) {
          logger.warn(`[SagaOrchestrator] Cleaning up stuck saga ${id}`);
          saga.abort().catch(error => {
            logger.error('[SagaOrchestrator] Failed to abort stuck saga', { error });
          });
          this.activeSagas.delete(id);
        }
      });
    }, 300000); // Every 5 minutes
  }
}

// Export singleton instance
export const sagaOrchestrator = SagaOrchestrator.getInstance();