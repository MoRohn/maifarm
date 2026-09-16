/**
 * Farm Lifecycle State Machine
 *
 * Provides explicit state transitions with validation to prevent invalid state changes
 * and ensure farms follow the correct lifecycle flow.
 *
 * Valid State Transitions:
 * - idle → launching → active → running → harvesting → completed
 * - idle → launching → active → running → completed (shortcut when orchestrator signals completion)
 * - any → failed (error state)
 * - any → terminated (user stop)
 *
 * This prevents common issues like:
 * - Farms getting stuck in "running" without transitioning to "completed"
 * - Invalid transitions that skip critical lifecycle phases
 * - Race conditions during concurrent status updates
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { FarmStatus } from '../types/farm';

export interface StateTransition {
  from: FarmStatus;
  to: FarmStatus;
  reason?: string;
  triggeredBy?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface StateTransitionRule {
  from: FarmStatus;
  to: FarmStatus;
  allowed: boolean;
  condition?: (context: StateTransitionContext) => boolean;
  preHook?: (context: StateTransitionContext) => Promise<void>;
  postHook?: (context: StateTransitionContext) => Promise<void>;
}

export interface StateTransitionContext {
  farmId: string;
  currentState: FarmStatus;
  targetState: FarmStatus;
  reason?: string;
  triggeredBy?: string;
  metadata?: Record<string, any>;
}

export class FarmLifecycleStateMachine extends EventEmitter {
  private static instance: FarmLifecycleStateMachine;
  private transitionHistory: Map<string, StateTransition[]> = new Map();
  private currentStates: Map<string, FarmStatus> = new Map();

  // Define valid state transitions
  private readonly transitionRules: StateTransitionRule[] = [
    // Normal flow: idle → launching
    {
      from: FarmStatus.IDLE,
      to: FarmStatus.LAUNCHING,
      allowed: true
    },

    // Normal flow: launching → active (orchestrator ready)
    {
      from: FarmStatus.LAUNCHING,
      to: FarmStatus.ACTIVE,
      allowed: true,
      postHook: async (ctx) => {
        logger.info(LogCategory.FARM, `Farm ${ctx.farmId} transitioned to ACTIVE - agents ready`);
        this.emit('farm:agents-ready', { farmId: ctx.farmId });
      }
    },

    // Normal flow: active → running (agents working)
    {
      from: FarmStatus.ACTIVE,
      to: FarmStatus.RUNNING,
      allowed: true,
      postHook: async (ctx) => {
        logger.info(LogCategory.FARM, `Farm ${ctx.farmId} transitioned to RUNNING - work in progress`);
        this.emit('farm:work-started', { farmId: ctx.farmId });
      }
    },

    // Normal flow: running → harvesting (harvest collection phase)
    {
      from: FarmStatus.RUNNING,
      to: FarmStatus.HARVESTING,
      allowed: true,
      preHook: async (ctx) => {
        logger.info(LogCategory.FARM, `Farm ${ctx.farmId} entering HARVESTING state - starting harvest collection`);
        this.emit('farm:harvesting', { farmId: ctx.farmId });
      }
    },

    // Normal flow: harvesting → completed (success)
    {
      from: FarmStatus.HARVESTING,
      to: FarmStatus.COMPLETED,
      allowed: true,
      postHook: async (ctx) => {
        logger.info(LogCategory.FARM, `Farm ${ctx.farmId} successfully completed`);
        this.emit('farm:completed', { farmId: ctx.farmId, metadata: ctx.metadata });
      }
    },

    // Shortcut: active → completed (immediate completion)
    {
      from: FarmStatus.ACTIVE,
      to: FarmStatus.COMPLETED,
      allowed: true,
      condition: (ctx) => {
        // Only allow if explicitly requested
        return ctx.reason === 'immediate_completion' || ctx.reason === 'completion';
      }
    },

    // Shortcut: running → completed (orchestrator signals completion)
    {
      from: FarmStatus.RUNNING,
      to: FarmStatus.COMPLETED,
      allowed: true,
      condition: (ctx) => {
        // Only allow if orchestrator signaled completion
        return ctx.reason === 'completion' || ctx.reason === 'orchestrator_completed';
      },
      preHook: async (ctx) => {
        logger.info(LogCategory.FARM, `Farm ${ctx.farmId} completing - orchestrator signaled done`);
        this.emit('farm:harvesting', { farmId: ctx.farmId });
      }
    },

    // Error transitions: any → failed
    {
      from: FarmStatus.IDLE,
      to: FarmStatus.FAILED,
      allowed: true
    },
    {
      from: FarmStatus.LAUNCHING,
      to: FarmStatus.FAILED,
      allowed: true
    },
    {
      from: FarmStatus.ACTIVE,
      to: FarmStatus.FAILED,
      allowed: true
    },
    {
      from: FarmStatus.RUNNING,
      to: FarmStatus.FAILED,
      allowed: true
    },
    {
      from: FarmStatus.HARVESTING,
      to: FarmStatus.FAILED,
      allowed: true
    },

    // User stop: any → terminated
    {
      from: FarmStatus.LAUNCHING,
      to: FarmStatus.TERMINATED,
      allowed: true
    },
    {
      from: FarmStatus.ACTIVE,
      to: FarmStatus.TERMINATED,
      allowed: true
    },
    {
      from: FarmStatus.RUNNING,
      to: FarmStatus.TERMINATED,
      allowed: true
    },

    // Recovery transitions
    {
      from: FarmStatus.FAILED,
      to: FarmStatus.LAUNCHING,
      allowed: true,
      condition: (ctx) => ctx.reason === 'retry' || ctx.reason === 'recovery'
    },
    {
      from: FarmStatus.ORPHANED,
      to: FarmStatus.FAILED,
      allowed: true
    },
    {
      from: FarmStatus.ORPHANED,
      to: FarmStatus.TERMINATED,
      allowed: true
    }
  ];

  private constructor() {
    super();
  }

  static getInstance(): FarmLifecycleStateMachine {
    if (!FarmLifecycleStateMachine.instance) {
      FarmLifecycleStateMachine.instance = new FarmLifecycleStateMachine();
    }
    return FarmLifecycleStateMachine.instance;
  }

  /**
   * Initialize state for a farm
   */
  initializeState(farmId: string, initialState: FarmStatus = FarmStatus.IDLE): void {
    this.currentStates.set(farmId, initialState);
    this.transitionHistory.set(farmId, [{
      from: FarmStatus.IDLE,
      to: initialState,
      reason: 'initialization',
      timestamp: new Date()
    }]);

    logger.debug(LogCategory.FARM, `Initialized state machine for farm ${farmId}: ${initialState}`);
  }

  /**
   * Attempt a state transition with validation
   */
  async transition(context: StateTransitionContext): Promise<boolean> {
    const { farmId, currentState: providedCurrentState, targetState, reason, triggeredBy, metadata } = context;

    // Use provided current state if available, otherwise get from internal map
    let currentState = providedCurrentState || this.currentStates.get(farmId);

    if (!currentState) {
      logger.warn(LogCategory.FARM,
        `Farm ${farmId} not initialized in state machine - initializing with targetState ${targetState}`);
      this.initializeState(farmId, targetState);
      return true; // Allow transition since we're initializing
    }

    // Update internal map with actual current state
    if (providedCurrentState) {
      this.currentStates.set(farmId, providedCurrentState);
    }

    // Check if already in target state
    if (currentState === targetState) {
      logger.debug(LogCategory.FARM,
        `Farm ${farmId} already in state ${targetState} - skipping transition`);
      return true;
    }

    // Find matching transition rule
    const rule = this.findTransitionRule(currentState, targetState);

    if (!rule) {
      logger.error(LogCategory.FARM,
        `Invalid state transition for farm ${farmId}: ${currentState} → ${targetState} (reason: ${reason})`);
      this.emit('transition:rejected', {
        farmId,
        from: currentState,
        to: targetState,
        reason: 'no_valid_transition_rule'
      });
      return false;
    }

    // Check condition if specified
    if (rule.condition && !rule.condition(context)) {
      logger.warn(LogCategory.FARM,
        `Transition condition failed for farm ${farmId}: ${currentState} → ${targetState}`);
      this.emit('transition:rejected', {
        farmId,
        from: currentState,
        to: targetState,
        reason: 'condition_not_met'
      });
      return false;
    }

    try {
      // Execute pre-hook if specified
      if (rule.preHook) {
        await rule.preHook(context);
      }

      // Perform transition
      this.currentStates.set(farmId, targetState);

      // Record transition in history
      const transition: StateTransition = {
        from: currentState,
        to: targetState,
        reason,
        triggeredBy,
        timestamp: new Date(),
        metadata
      };

      const history = this.transitionHistory.get(farmId) || [];
      history.push(transition);
      this.transitionHistory.set(farmId, history);

      // Emit transition event
      this.emit('transition:completed', {
        farmId,
        from: currentState,
        to: targetState,
        reason,
        metadata
      });

      logger.info(LogCategory.FARM,
        `Farm ${farmId} state transition: ${currentState} → ${targetState} (${reason || 'no reason'})`);

      // Execute post-hook if specified
      if (rule.postHook) {
        await rule.postHook(context);
      }

      return true;

    } catch (error) {
      logger.error(LogCategory.FARM,
        `Error during state transition for farm ${farmId}:`, error);
      this.emit('transition:error', {
        farmId,
        from: currentState,
        to: targetState,
        error
      });
      return false;
    }
  }

  /**
   * Find transition rule for a specific state change
   */
  private findTransitionRule(from: FarmStatus, to: FarmStatus): StateTransitionRule | undefined {
    return this.transitionRules.find(rule =>
      rule.from === from && rule.to === to && rule.allowed
    );
  }

  /**
   * Get current state for a farm
   */
  getCurrentState(farmId: string): FarmStatus | undefined {
    return this.currentStates.get(farmId);
  }

  /**
   * Get transition history for a farm
   */
  getTransitionHistory(farmId: string): StateTransition[] {
    return this.transitionHistory.get(farmId) || [];
  }

  /**
   * Get last transition for a farm
   */
  getLastTransition(farmId: string): StateTransition | undefined {
    const history = this.getTransitionHistory(farmId);
    return history[history.length - 1];
  }

  /**
   * Check if a transition is valid (without executing it)
   */
  isTransitionValid(farmId: string, targetState: FarmStatus): boolean {
    const currentState = this.currentStates.get(farmId);
    if (!currentState) return false;

    const rule = this.findTransitionRule(currentState, targetState);
    return rule !== undefined;
  }

  /**
   * Get all valid next states for a farm
   */
  getValidNextStates(farmId: string): FarmStatus[] {
    const currentState = this.currentStates.get(farmId);
    if (!currentState) return [];

    return this.transitionRules
      .filter(rule => rule.from === currentState && rule.allowed)
      .map(rule => rule.to);
  }

  /**
   * Clear state for a farm (cleanup)
   */
  clearState(farmId: string): void {
    this.currentStates.delete(farmId);
    this.transitionHistory.delete(farmId);
    logger.debug(LogCategory.FARM, `Cleared state machine data for farm ${farmId}`);
  }

  /**
   * Get statistics for all farms
   */
  getStatistics(): {
    totalFarms: number;
    byState: Record<string, number>;
    totalTransitions: number;
  } {
    const byState: Record<string, number> = {
      [FarmStatus.IDLE]: 0,
      [FarmStatus.LAUNCHING]: 0,
      [FarmStatus.ACTIVE]: 0,
      [FarmStatus.RUNNING]: 0,
      [FarmStatus.PAUSED]: 0,
      [FarmStatus.HARVESTING]: 0,
      [FarmStatus.COMPLETED]: 0,
      [FarmStatus.FAILED]: 0,
      [FarmStatus.CRASHED]: 0,
      [FarmStatus.TERMINATED]: 0,
      [FarmStatus.STOPPED]: 0,
      [FarmStatus.STALE]: 0,
      [FarmStatus.RECOVERING]: 0,
      [FarmStatus.ORPHANED]: 0
    };

    for (const state of this.currentStates.values()) {
      byState[state] = (byState[state] || 0) + 1;
    }

    let totalTransitions = 0;
    for (const history of this.transitionHistory.values()) {
      totalTransitions += history.length;
    }

    return {
      totalFarms: this.currentStates.size,
      byState,
      totalTransitions
    };
  }

  /**
   * Setup push notification integration
   * Listens to state transitions and sends notifications to user devices
   */
  async setupNotificationIntegration(): Promise<void> {
    // Avoid duplicate listeners
    this.removeAllListeners('transition:completed');

    this.on('transition:completed', async (data: {
      farmId: string;
      from: FarmStatus;
      to: FarmStatus;
      reason?: string;
      metadata?: Record<string, any>;
    }) => {
      try {
        // Get farm info for notification
        const farmInfo = data.metadata?.farmInfo || {};
        const userId = farmInfo.userId;
        const farmName = farmInfo.name || `Farm ${data.farmId.substring(0, 8)}`;
        const agentCount = farmInfo.agentCount;

        if (!userId) {
          logger.debug(LogCategory.FARM, 'No userId in transition metadata, skipping notification');
          return;
        }

        // Dynamically import to avoid circular dependencies
        const { pushNotificationService } = await import('./pushNotificationService');

        // Send notification based on state transition
        await pushNotificationService.notifyFarmStatusChange({
          farmId: data.farmId,
          farmName,
          userId,
          previousStatus: data.from,
          newStatus: data.to,
          agentCount,
          errorMessage: data.metadata?.error,
          progress: data.metadata?.progress,
        });

        logger.debug(LogCategory.FARM, `Push notification sent for farm ${data.farmId}: ${data.from} → ${data.to}`);
      } catch (error) {
        logger.error(LogCategory.FARM, 'Failed to send push notification for state transition', {
          error: error instanceof Error ? error.message : 'Unknown error',
          farmId: data.farmId,
        });
      }
    });

    logger.info(LogCategory.FARM, 'Push notification integration setup complete');
  }
}

export const farmLifecycleStateMachine = FarmLifecycleStateMachine.getInstance();
