/**
 * Farm Mode Optimizations
 *
 * Provides optimized configurations and launch strategies for each farm mode
 * to ensure high success rates and consistent performance.
 */

import { FarmMode } from '../types/farm';

// Re-export FarmMode for consumers
export { FarmMode };

/**
 * Plugin Configuration for blerbz-plugins integration
 * Controls inference-confidenz, inference-continuez, and inference-planz
 */
export interface PluginConfig {
  /** Enable all plugins */
  pluginsEnabled: boolean;
  /** Enable confidence scoring (inference-confidenz) */
  confidenzEnabled: boolean;
  /** Enable auto-continuation (inference-continuez) */
  continuezEnabled: boolean;
  /** Confidence threshold for auto-continuation (0-99) */
  continuezThreshold: number;
  /** Enable planning workflow (inference-planz) */
  planzEnabled: boolean;
  /** Run pre-launch survey for GoWild mode */
  planzPrelaunchSurvey: boolean;
}

/**
 * Mode-specific plugin configuration defaults
 * As documented in CLAUDE.md:
 * - Quick Task: 85% threshold, no planz
 * - Farm/Harvest: 80% threshold, no planz
 * - GoWild: 60% threshold, planz enabled with pre-launch survey
 */
export const MODE_PLUGIN_DEFAULTS: Record<FarmMode, PluginConfig> = {
  [FarmMode.QUICK_TASK]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 85,
    planzEnabled: false,
    planzPrelaunchSurvey: false,
  },
  [FarmMode.HARVEST]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 80,
    planzEnabled: false,
    planzPrelaunchSurvey: false,
  },
  [FarmMode.GO_WILD]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 60,
    planzEnabled: true,
    planzPrelaunchSurvey: true,
  },
  [FarmMode.COLLABORATIVE]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 80,
    planzEnabled: false,
    planzPrelaunchSurvey: false,
  },
  [FarmMode.SEQUENTIAL]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 80,
    planzEnabled: false,
    planzPrelaunchSurvey: false,
  },
  [FarmMode.AUTONOMOUS]: {
    pluginsEnabled: true,
    confidenzEnabled: true,
    continuezEnabled: true,
    continuezThreshold: 70,
    planzEnabled: true,
    planzPrelaunchSurvey: false,
  },
};

/**
 * Get plugin configuration for a specific farm mode
 */
export function getPluginConfig(mode: FarmMode): PluginConfig {
  return MODE_PLUGIN_DEFAULTS[mode] || MODE_PLUGIN_DEFAULTS[FarmMode.HARVEST];
}

export interface ModeOptimization {
  // Timing configurations
  timing: {
    sessionCreationDelay: number;      // ms to wait after tmux session creation
    orchestratorStartDelay: number;    // ms to wait after orchestrator launch
    paneCreationDelay: number;         // ms between pane creations
    streamingSetupDelay: number;       // ms to wait before streaming setup
    verificationInterval: number;       // ms between verification checks
    maxVerificationAttempts: number;   // max attempts for verification
  };

  // Resource configurations
  resources: {
    nodeMemoryPerAgent: number;        // MB per agent process
    maxConcurrentAgents: number;       // max agents that can run concurrently
    cpuThrottling: boolean;           // whether to apply CPU throttling
    diskIOPriority: 'low' | 'normal' | 'high';
  };

  // Recovery configurations
  recovery: {
    autoRestart: boolean;              // auto-restart failed agents
    maxRestartAttempts: number;        // max restart attempts per agent
    restartDelay: number;              // ms between restart attempts
    healthCheckInterval: number;       // ms between health checks
    gracefulShutdownTimeout: number;   // ms for graceful shutdown
  };

  // Launch strategy
  strategy: {
    parallelAgentLaunch: boolean;      // launch agents in parallel vs sequential
    prewarmWorkspace: boolean;         // pre-create workspace structure
    bufferTerminalOutput: boolean;     // buffer terminal output before streaming
    useSessionPool: boolean;           // maintain pool of pre-created sessions
  };
}

// Optimized configurations for each mode
export const MODE_OPTIMIZATIONS: Record<FarmMode, ModeOptimization> = {
  [FarmMode.HARVEST]: {
    timing: {
      sessionCreationDelay: 3000,      // 3s for stable session
      orchestratorStartDelay: 4000,    // 4s for orchestrator initialization
      paneCreationDelay: 500,          // 0.5s between panes
      streamingSetupDelay: 1000,       // 1s before streaming
      verificationInterval: 1000,      // Check every 1s
      maxVerificationAttempts: 5
    },
    resources: {
      nodeMemoryPerAgent: 2048,        // 2GB per agent
      maxConcurrentAgents: 10,
      cpuThrottling: false,
      diskIOPriority: 'normal'
    },
    recovery: {
      autoRestart: true,
      maxRestartAttempts: 3,
      restartDelay: 5000,              // 5s between restarts
      healthCheckInterval: 10000,      // Check every 10s
      gracefulShutdownTimeout: 30000   // 30s graceful shutdown
    },
    strategy: {
      parallelAgentLaunch: false,      // Sequential for stability
      prewarmWorkspace: true,
      bufferTerminalOutput: true,
      useSessionPool: false
    }
  },

  [FarmMode.QUICK_TASK]: {
    timing: {
      sessionCreationDelay: 1500,      // 1.5s - faster for single agent
      orchestratorStartDelay: 2000,    // 2s - minimal wait
      paneCreationDelay: 0,            // No additional panes
      streamingSetupDelay: 500,        // 0.5s quick setup
      verificationInterval: 500,       // Check every 0.5s
      maxVerificationAttempts: 3       // Fail fast for quick tasks
    },
    resources: {
      nodeMemoryPerAgent: 1536,        // 1.5GB - single agent
      maxConcurrentAgents: 1,
      cpuThrottling: false,
      diskIOPriority: 'high'           // Priority for quick completion
    },
    recovery: {
      autoRestart: false,              // No restart for quick tasks
      maxRestartAttempts: 0,
      restartDelay: 0,
      healthCheckInterval: 15000,      // Less frequent checks
      gracefulShutdownTimeout: 5000    // 5s quick shutdown
    },
    strategy: {
      parallelAgentLaunch: false,
      prewarmWorkspace: false,         // Skip for speed
      bufferTerminalOutput: false,     // Direct streaming
      useSessionPool: true              // Use pre-created sessions if available
    }
  },

  [FarmMode.GO_WILD]: {
    timing: {
      sessionCreationDelay: 4000,      // 4s for multiple agents
      orchestratorStartDelay: 5000,    // 5s for complex setup
      paneCreationDelay: 750,          // 0.75s between panes
      streamingSetupDelay: 1500,       // 1.5s for multiple streams
      verificationInterval: 1500,      // Check every 1.5s
      maxVerificationAttempts: 7       // More attempts for complex setup
    },
    resources: {
      nodeMemoryPerAgent: 3072,        // 3GB per agent - creative tasks
      maxConcurrentAgents: 20,
      cpuThrottling: true,             // Prevent system overload
      diskIOPriority: 'low'            // Background priority
    },
    recovery: {
      autoRestart: true,
      maxRestartAttempts: 5,           // More restart attempts
      restartDelay: 3000,              // 3s between restarts
      healthCheckInterval: 8000,       // Check every 8s
      gracefulShutdownTimeout: 45000   // 45s extended shutdown
    },
    strategy: {
      parallelAgentLaunch: true,       // Parallel for performance
      prewarmWorkspace: true,
      bufferTerminalOutput: true,
      useSessionPool: false             // Fresh sessions for isolation
    }
  },

  // Extended modes - default to HARVEST-like behavior
  [FarmMode.COLLABORATIVE]: {
    timing: {
      sessionCreationDelay: 3000,
      orchestratorStartDelay: 4000,
      paneCreationDelay: 500,
      streamingSetupDelay: 1000,
      verificationInterval: 1000,
      maxVerificationAttempts: 5
    },
    resources: {
      nodeMemoryPerAgent: 2048,
      maxConcurrentAgents: 10,
      cpuThrottling: false,
      diskIOPriority: 'normal'
    },
    recovery: {
      autoRestart: true,
      maxRestartAttempts: 3,
      restartDelay: 5000,
      healthCheckInterval: 10000,
      gracefulShutdownTimeout: 30000
    },
    strategy: {
      parallelAgentLaunch: false,
      prewarmWorkspace: true,
      bufferTerminalOutput: true,
      useSessionPool: false
    }
  },

  [FarmMode.SEQUENTIAL]: {
    timing: {
      sessionCreationDelay: 3000,
      orchestratorStartDelay: 4000,
      paneCreationDelay: 500,
      streamingSetupDelay: 1000,
      verificationInterval: 1000,
      maxVerificationAttempts: 5
    },
    resources: {
      nodeMemoryPerAgent: 2048,
      maxConcurrentAgents: 10,
      cpuThrottling: false,
      diskIOPriority: 'normal'
    },
    recovery: {
      autoRestart: true,
      maxRestartAttempts: 3,
      restartDelay: 5000,
      healthCheckInterval: 10000,
      gracefulShutdownTimeout: 30000
    },
    strategy: {
      parallelAgentLaunch: false,
      prewarmWorkspace: true,
      bufferTerminalOutput: true,
      useSessionPool: false
    }
  },

  [FarmMode.AUTONOMOUS]: {
    timing: {
      sessionCreationDelay: 4000,
      orchestratorStartDelay: 5000,
      paneCreationDelay: 750,
      streamingSetupDelay: 1500,
      verificationInterval: 1500,
      maxVerificationAttempts: 7
    },
    resources: {
      nodeMemoryPerAgent: 3072,
      maxConcurrentAgents: 20,
      cpuThrottling: true,
      diskIOPriority: 'low'
    },
    recovery: {
      autoRestart: true,
      maxRestartAttempts: 5,
      restartDelay: 3000,
      healthCheckInterval: 8000,
      gracefulShutdownTimeout: 45000
    },
    strategy: {
      parallelAgentLaunch: true,
      prewarmWorkspace: true,
      bufferTerminalOutput: true,
      useSessionPool: false
    }
  }
};

/**
 * Get optimized launch sequence for a specific mode
 */
export function getOptimizedLaunchSequence(mode: FarmMode): string[] {
  const sequences: Record<FarmMode, string[]> = {
    [FarmMode.HARVEST]: [
      'preflight_checks',
      'workspace_creation',
      'session_prewarming',
      'harvest_initialization',
      'tmux_provisioning',
      'agent_sequential_launch',
      'streaming_setup',
      'health_monitoring_start',
      'finalization'
    ],
    [FarmMode.QUICK_TASK]: [
      'preflight_checks',
      'harvest_initialization',  // Quick init
      'tmux_provisioning',        // Use existing or create quickly
      'agent_immediate_launch',   // No delay
      'streaming_setup',          // Minimal setup
      'finalization'
    ],
    [FarmMode.GO_WILD]: [
      'preflight_checks',
      'workspace_creation',
      'harvest_initialization',
      'tmux_provisioning',
      'parallel_pane_creation',    // Create all panes at once
      'agent_parallel_launch',     // Launch all agents simultaneously
      'streaming_batch_setup',     // Setup all streams together
      'health_monitoring_start',
      'creativity_boost',           // Special step for Go Wild
      'finalization'
    ],
    // Extended modes use HARVEST-like sequence
    [FarmMode.COLLABORATIVE]: [
      'preflight_checks',
      'workspace_creation',
      'session_prewarming',
      'harvest_initialization',
      'tmux_provisioning',
      'agent_sequential_launch',
      'streaming_setup',
      'health_monitoring_start',
      'finalization'
    ],
    [FarmMode.SEQUENTIAL]: [
      'preflight_checks',
      'workspace_creation',
      'session_prewarming',
      'harvest_initialization',
      'tmux_provisioning',
      'agent_sequential_launch',
      'streaming_setup',
      'health_monitoring_start',
      'finalization'
    ],
    [FarmMode.AUTONOMOUS]: [
      'preflight_checks',
      'workspace_creation',
      'harvest_initialization',
      'tmux_provisioning',
      'parallel_pane_creation',
      'agent_parallel_launch',
      'streaming_batch_setup',
      'health_monitoring_start',
      'finalization'
    ]
  };

  return sequences[mode] || sequences[FarmMode.HARVEST];
}

/**
 * Calculate dynamic timeout based on mode and agent count
 * ENHANCED: Extended durations for comprehensive project work
 */
export function calculateOptimalTimeout(mode: FarmMode, agentCount: number): number {
  const baseTimeouts: Record<FarmMode, number> = {
    [FarmMode.HARVEST]: 7200,      // 2 hours base (extended from 1 hour)
    [FarmMode.QUICK_TASK]: 900,    // 15 minutes fixed (extended from 5 min)
    [FarmMode.GO_WILD]: 5400,      // 1.5 hours base (extended from 45 min)
    [FarmMode.COLLABORATIVE]: 7200, // Same as HARVEST
    [FarmMode.SEQUENTIAL]: 7200,    // Same as HARVEST
    [FarmMode.AUTONOMOUS]: 5400     // Same as GO_WILD
  };

  const agentMultipliers: Record<FarmMode, number> = {
    [FarmMode.HARVEST]: 900,       // +15 min per agent (increased from +10 min)
    [FarmMode.QUICK_TASK]: 0,      // No scaling for quick tasks
    [FarmMode.GO_WILD]: 600,       // +10 min per agent (increased from +5 min)
    [FarmMode.COLLABORATIVE]: 900, // Same as HARVEST
    [FarmMode.SEQUENTIAL]: 900,    // Same as HARVEST
    [FarmMode.AUTONOMOUS]: 600     // Same as GO_WILD
  };

  const baseTimeout = baseTimeouts[mode];
  const multiplier = agentMultipliers[mode];

  return baseTimeout + (multiplier * Math.max(0, agentCount - 1));
}

/**
 * Determine if a session qualifies as extended (>= 2 hours)
 * Extended sessions get more lenient health thresholds
 */
export function isExtendedSession(timeoutSeconds: number): boolean {
  return timeoutSeconds >= 7200; // 2 hours or more
}

/**
 * Get health monitoring thresholds based on session duration
 */
export function getHealthThresholds(timeoutSeconds: number): {
  idleThreshold: number;
  stuckThreshold: number;
  disconnectedThreshold: number;
  maxConsecutiveIdle: number;
} {
  if (isExtendedSession(timeoutSeconds)) {
    // Extended sessions (>= 2 hours): more lenient thresholds
    return {
      idleThreshold: 120000,      // 2 min idle detection
      stuckThreshold: 600000,     // 10 min stuck detection
      disconnectedThreshold: 900000, // 15 min disconnected tolerance
      maxConsecutiveIdle: 10      // More tolerance for long thinking
    };
  }

  // Standard sessions (< 2 hours): normal thresholds
  return {
    idleThreshold: 30000,         // 30s idle detection
    stuckThreshold: 120000,       // 2 min stuck detection
    disconnectedThreshold: 300000, // 5 min disconnected tolerance
    maxConsecutiveIdle: 6         // Standard tolerance
  };
}

/**
 * Get pre-flight check requirements for a mode
 */
export function getPreflightRequirements(mode: FarmMode): {
  minMemoryGB: number;
  minDiskSpaceGB: number;
  requiredServices: string[];
  maxLoadAverage: number;
} {
  const requirements: Record<FarmMode, any> = {
    [FarmMode.HARVEST]: {
      minMemoryGB: 3,  // Reduced from 4GB for better dev machine compatibility
      minDiskSpaceGB: 10,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.8
    },
    [FarmMode.QUICK_TASK]: {
      minMemoryGB: 1.5,  // Reduced from 2GB for lightweight tasks
      minDiskSpaceGB: 5,
      requiredServices: ['postgresql', 'tmux'],
      maxLoadAverage: 0.9
    },
    [FarmMode.GO_WILD]: {
      minMemoryGB: 6,  // Reduced from 8GB for dev compatibility
      minDiskSpaceGB: 20,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.7
    },
    // Extended modes use HARVEST-like requirements
    [FarmMode.COLLABORATIVE]: {
      minMemoryGB: 3,
      minDiskSpaceGB: 10,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.8
    },
    [FarmMode.SEQUENTIAL]: {
      minMemoryGB: 3,
      minDiskSpaceGB: 10,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.8
    },
    [FarmMode.AUTONOMOUS]: {
      minMemoryGB: 6,
      minDiskSpaceGB: 20,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.7
    }
  };

  return requirements[mode];
}
