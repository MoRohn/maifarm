/**
 * Timing constants for MaiFarm operations
 * All values are in milliseconds unless otherwise specified
 */

// Graceful shutdown timing - aligned with legacy XenoSync CLI behavior
export const GRACEFUL_SHUTDOWN_PERIOD = 30000; // 30 seconds for all modes (matching XenoSync CLI)
export const GRACEFUL_SHUTDOWN_MIN_TIME = 10000; // Minimum 10 seconds for shutdown
export const GRACEFUL_SHUTDOWN_MAX_TIME = 30000; // Maximum 30 seconds (simplified)

// File collection timing
export const FILE_COLLECTION_TIMEOUT = 15000; // 15 seconds max for file collection
export const FILE_COLLECTION_RETRY_DELAY = 2000; // 2 seconds between retries
export const FILE_COLLECTION_MAX_RETRIES = 3; // Maximum 3 retries for file collection

// Agent output capture timing
export const AGENT_OUTPUT_CAPTURE_DELAY = 3000; // 3 seconds to wait for agent output
export const AGENT_CLOSING_PROMPT_TIMEOUT = 5000; // 5 seconds for agents to respond to closing prompt

// Default timeouts for different modes (ENHANCED for extended farming sessions)
export const QUICK_TASK_TIMEOUT = 900000; // 15 minutes (in ms) - FIXED, not configurable
export const DEFAULT_FARM_TIMEOUT = 7200; // 2 hours (in seconds) - configurable via settings
export const DEFAULT_GOWILD_TIMEOUT = 5400; // 1.5 hours (in seconds) - configurable via settings

// Extended session thresholds (for sessions >= 2 hours)
export const EXTENDED_SESSION_IDLE_THRESHOLD = 120000; // 2 min idle detection for long sessions
export const EXTENDED_SESSION_STUCK_THRESHOLD = 600000; // 10 min stuck detection
export const EXTENDED_SESSION_DISCONNECTED_THRESHOLD = 900000; // 15 min disconnected tolerance

// Standard session thresholds (for sessions < 2 hours)
export const STANDARD_SESSION_IDLE_THRESHOLD = 30000; // 30s idle detection
export const STANDARD_SESSION_STUCK_THRESHOLD = 120000; // 2 min stuck detection
export const STANDARD_SESSION_DISCONNECTED_THRESHOLD = 300000; // 5 min disconnected tolerance

// Timeout tiers (in seconds) for UI presets
export const TIMEOUT_TIERS = {
  SPRINT: 1800,    // 30 minutes - bug fixes, reviews, small features
  STANDARD: 7200,  // 2 hours - full features, refactoring (DEFAULT)
  EXTENDED: 14400, // 4 hours - large features, migrations
  MARATHON: 28800  // 8 hours - major rewrites, complex integrations
} as const;

// WebSocket and polling intervals
export const WEBSOCKET_HEARTBEAT_INTERVAL = 30000; // 30 seconds
export const HARVEST_STATUS_POLL_INTERVAL = 5000; // 5 seconds
export const FARM_STATUS_UPDATE_INTERVAL = 10000; // 10 seconds

// Barn storage timing
export const BARN_STORAGE_TIMEOUT = 10000; // 10 seconds to store in barn
export const BARN_VERIFICATION_DELAY = 2000; // 2 seconds before verifying barn storage

/**
 * Calculate when to trigger graceful shutdown based on total timeout
 * SIMPLIFIED: Always use 30 seconds before timeout, consistent with XenoSync CLI
 * @param totalTimeoutMs Total timeout in milliseconds
 * @returns Time in milliseconds when graceful shutdown should start
 */
export function calculateGracefulShutdownTime(totalTimeoutMs: number): number {
  // Simple calculation: total time minus 30 seconds
  const shutdownTime = totalTimeoutMs - GRACEFUL_SHUTDOWN_PERIOD;
  
  // If timeout is less than 30 seconds, trigger immediately
  if (shutdownTime <= 0) {
    return 0;
  }
  
  return shutdownTime;
}

/**
 * Get the grace period - SIMPLIFIED to always be 30 seconds
 * @param totalTimeoutMs Total timeout in milliseconds (unused now)
 * @returns Grace period in milliseconds (always 30 seconds)
 */
export function getGracePeriod(totalTimeoutMs: number): number {
  // Always use 30 second grace period, as in the XenoSync CLI
  return GRACEFUL_SHUTDOWN_PERIOD;
}
