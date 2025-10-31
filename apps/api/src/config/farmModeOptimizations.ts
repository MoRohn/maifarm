/**
 * Farm Mode Optimizations
 *
 * Provides optimized configurations and launch strategies for each farm mode
 * to ensure high success rates and consistent performance.
 */

export enum FarmMode {
  HARVEST = 'harvest',
  QUICK_TASK = 'quick_task',
  GO_WILD = 'go_wild'
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
    ]
  };

  return sequences[mode] || sequences[FarmMode.HARVEST];
}

/**
 * Calculate dynamic timeout based on mode and agent count
 */
export function calculateOptimalTimeout(mode: FarmMode, agentCount: number): number {
  const baseTimeouts: Record<FarmMode, number> = {
    [FarmMode.HARVEST]: 3600,      // 1 hour base
    [FarmMode.QUICK_TASK]: 300,    // 5 minutes fixed
    [FarmMode.GO_WILD]: 2700        // 45 minutes base
  };

  const agentMultipliers: Record<FarmMode, number> = {
    [FarmMode.HARVEST]: 600,       // +10 min per agent
    [FarmMode.QUICK_TASK]: 0,      // No scaling
    [FarmMode.GO_WILD]: 300        // +5 min per agent
  };

  const baseTimeout = baseTimeouts[mode];
  const multiplier = agentMultipliers[mode];

  return baseTimeout + (multiplier * Math.max(0, agentCount - 1));
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
      minMemoryGB: 8,
      minDiskSpaceGB: 10,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.8
    },
    [FarmMode.QUICK_TASK]: {
      minMemoryGB: 4,
      minDiskSpaceGB: 5,
      requiredServices: ['postgresql', 'tmux'],
      maxLoadAverage: 0.9
    },
    [FarmMode.GO_WILD]: {
      minMemoryGB: 16,
      minDiskSpaceGB: 20,
      requiredServices: ['postgresql', 'redis', 'tmux'],
      maxLoadAverage: 0.7
    }
  };

  return requirements[mode];
}