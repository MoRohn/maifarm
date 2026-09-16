/**
 * Farm Launch Timing Configuration
 *
 * Centralizes all timing constants for farm launch orchestration to ensure
 * consistent, repeatable launches across different farm modes.
 *
 * ALL TIMING VALUES IN MILLISECONDS unless otherwise specified.
 */

export type FarmMode = 'harvest' | 'quick_task' | 'go_wild';
export type ProviderType = 'claude' | 'openai' | 'ollama' | 'mock';

/**
 * Session Creation Delays
 *
 * Time to wait after creating tmux session before proceeding.
 * Ensures session is fully initialized before verification.
 */
export const SESSION_CREATION_DELAY: Record<FarmMode, number> = {
  harvest: 2000,     // 2s - Standard mode
  quick_task: 1000,  // 1s - Faster for quick tasks (2 agents only)
  go_wild: 3000      // 3s - Slower for many agents (up to 12)
};

/**
 * Agent Initialization Delays
 *
 * Time to wait for each agent type to fully initialize after launch.
 * Based on empirical testing of each provider's startup time.
 */
export const AGENT_INIT_DELAY: Record<ProviderType, number> = {
  claude: 8000,  // 8s - Claude CLI takes 6s to init + 2s buffer for prompt processing
  openai: 5000,  // 5s - OpenAI provider (if implemented)
  ollama: 4000,  // 4s - Ollama local models
  mock: 2000     // 2s - Mock agents (environment setup only)
};

/**
 * Orchestrator Spawn Timeouts
 *
 * Maximum time to wait for orchestrator process to spawn and respond.
 */
export const ORCHESTRATOR_TIMING = {
  /** Time to wait for Python process to spawn */
  SPAWN_TIMEOUT: 10000,      // 10s

  /** Time to wait for first orchestrator heartbeat file */
  HEARTBEAT_TIMEOUT: 15000,  // 15s

  /** Time to wait for session_verified.json to appear */
  VERIFICATION_TIMEOUT: 30000 // 30s
};

/**
 * Health Check Timing
 *
 * Controls when and how often agent health is checked.
 * CRITICAL: Initial delay must be long enough for all agents to initialize.
 */
export const HEALTH_CHECK_TIMING = {
  /**
   * Initial delay before first health check (in Python orchestrator)
   * Must exceed longest agent initialization time (Claude: 8s) + prompt processing
   */
  INITIAL_DELAY: 30000,      // 30s - Allows Claude agents to fully initialize

  /** Interval between subsequent health checks */
  CHECK_INTERVAL: 30000,     // 30s - Balance between responsiveness and overhead

  /** Maximum consecutive failed checks before marking agent as dead */
  MAX_FAILED_CHECKS: 2,

  /** Timeout for verifying agent is "ready" after launch */
  AGENT_READY_TIMEOUT: 30000 // 30s - Used in _verify_agent_ready()
};

/**
 * Pipe-Pane Timing
 *
 * Controls terminal output capture setup and verification.
 */
export const PIPE_PANE_TIMING = {
  /** Delay after setting up pipe-pane before sending commands */
  SETUP_DELAY: 100,          // 100ms - Ensures pipe-pane is established

  /** Timeout for verifying pipe-pane is working */
  VERIFY_TIMEOUT: 10000,     // 10s

  /** Time to wait before checking log file has content */
  LOG_CHECK_DELAY: 5000      // 5s - File should have some output by then
};

/**
 * Command Execution Delays (in Python orchestrator)
 *
 * Small delays between tmux commands to ensure proper sequencing.
 */
export const COMMAND_DELAYS = {
  /** After clear or cd commands */
  AFTER_CLEAR_CD: 100,       // 100ms

  /** After exporting environment variables */
  AFTER_ENV_EXPORT: 200,     // 200ms

  /** After launching Claude CLI */
  AFTER_CLAUDE_LAUNCH: 6000, // 6s - Critical for Claude initialization

  /** After sending prompt via paste-buffer */
  AFTER_PROMPT_SEND: 2000    // 2s - Processing time
};

/**
 * Overall Farm Runtime Timeout
 *
 * Maximum time for farm to run from launch to completion.
 * This is NOT the launch timeout - it's the total runtime including agent work.
 */
export const FARM_RUNTIME_TIMEOUT: Record<FarmMode, number> = {
  harvest: 600000,    // 10 minutes - Standard farms with complex tasks
  quick_task: 300000, // 5 minutes  - Quick tasks with focused work
  go_wild: 600000     // 10 minutes - Creative exploration farms
};

/**
 * Launch Initialization Timeout
 *
 * Maximum time for farm to reach "active" state (agents initialized and ready).
 * This is separate from total runtime - it's just the setup phase.
 */
export const LAUNCH_INIT_TIMEOUT: Record<FarmMode, number> = {
  harvest: 120000,    // 2 minutes - Session + orchestrator + 3 agents
  quick_task: 90000,  // 1.5 minutes - Session + orchestrator + 2 agents
  go_wild: 180000     // 3 minutes - Session + orchestrator + up to 12 agents
};

/**
 * Graceful Shutdown Timing
 *
 * Time allocated for clean shutdown and harvest collection.
 */
export const SHUTDOWN_TIMING = {
  /** Time reserved before timeout for graceful shutdown */
  GRACE_PERIOD: 30000,       // 30s

  /** Time to wait for orchestrator to acknowledge shutdown signal */
  SHUTDOWN_ACK_TIMEOUT: 5000, // 5s

  /** Time to wait for agents to finish current work */
  AGENT_FINISH_TIMEOUT: 20000 // 20s
};

/**
 * Validation Timeouts
 *
 * Used in various verification steps during launch.
 */
export const VALIDATION_TIMING = {
  /** Timeout for tmux session to appear */
  SESSION_EXISTS: 10000,     // 10s

  /** Timeout for panes to be created */
  PANES_READY: 15000,        // 15s

  /** Timeout for coordination files to appear */
  COORDINATION_FILE: 5000    // 5s
};

/**
 * Get session creation delay for a specific farm mode
 */
export function getSessionDelay(mode: FarmMode): number {
  return SESSION_CREATION_DELAY[mode] || SESSION_CREATION_DELAY.harvest;
}

/**
 * Get agent initialization delay for a specific provider
 */
export function getAgentInitDelay(provider: ProviderType): number {
  return AGENT_INIT_DELAY[provider] || AGENT_INIT_DELAY.mock;
}

/**
 * Get farm runtime timeout for a specific farm mode
 */
export function getFarmRuntimeTimeout(mode: FarmMode): number {
  return FARM_RUNTIME_TIMEOUT[mode] || FARM_RUNTIME_TIMEOUT.harvest;
}

/**
 * Get launch initialization timeout for a specific farm mode
 */
export function getLaunchInitTimeout(mode: FarmMode): number {
  return LAUNCH_INIT_TIMEOUT[mode] || LAUNCH_INIT_TIMEOUT.harvest;
}

/**
 * Calculate total expected launch time for a farm configuration
 */
export function calculateExpectedLaunchTime(
  mode: FarmMode,
  provider: ProviderType,
  agentCount: number
): number {
  const sessionDelay = getSessionDelay(mode);
  const agentDelay = getAgentInitDelay(provider);
  const orchestratorDelay = ORCHESTRATOR_TIMING.SPAWN_TIMEOUT;
  const healthCheckDelay = HEALTH_CHECK_TIMING.INITIAL_DELAY;

  // Conservative estimate: session + orchestrator + (agent_delay * count) + health check
  return sessionDelay + orchestratorDelay + (agentDelay * agentCount) + healthCheckDelay;
}

/**
 * Check if a timeout value exceeds JavaScript's setTimeout limit
 */
export function isSafeTimeout(timeoutMs: number): boolean {
  const MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1 (max 32-bit signed integer)
  return timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS;
}

/**
 * Cap a timeout value to prevent setTimeout overflow
 */
export function capTimeout(timeoutMs: number): number {
  const MAX_TIMEOUT_MS = 2147483647;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    console.warn(`Timeout ${timeoutMs}ms exceeds maximum, capping to ${MAX_TIMEOUT_MS}ms`);
    return MAX_TIMEOUT_MS;
  }
  return timeoutMs;
}

/**
 * Detect if a timeout value is likely in seconds vs milliseconds
 * Values > 86400 (24 hours in seconds) are assumed to be milliseconds
 */
export function detectTimeoutUnit(timeout: number): 'seconds' | 'milliseconds' {
  const LIKELY_SECONDS_THRESHOLD = 86400; // 24 hours
  return timeout > LIKELY_SECONDS_THRESHOLD ? 'milliseconds' : 'seconds';
}

/**
 * Convert timeout to milliseconds, auto-detecting units
 */
export function normalizeTimeout(timeout: number): number {
  const unit = detectTimeoutUnit(timeout);
  const timeoutMs = unit === 'seconds' ? timeout * 1000 : timeout;
  return capTimeout(timeoutMs);
}
