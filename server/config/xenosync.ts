/**
 * XenoSync Configuration
 * Settings and configuration for the XenoSync orchestrator integration
 */

export interface XenoSyncSettings {
  enabled: boolean;
  defaultMode: 'parallel' | 'collaborative';
  minAgents: number;
  maxAgents: number;
  agentMonitorInterval: number;
  messageGracePeriod: number;
  useTmux: boolean;
  logLevel: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  claudeArgs: string[];
}

export const defaultXenoSyncSettings: XenoSyncSettings = {
  enabled: false, // Disabled by default, user must opt-in
  defaultMode: 'parallel',
  minAgents: 2, // XenoSync requires minimum 2 agents
  maxAgents: 20, // XenoSync supports up to 20 agents
  agentMonitorInterval: 30, // Check agents every 30 seconds
  messageGracePeriod: 60, // Wait 60 seconds after sending work
  useTmux: true, // Always use tmux for visual monitoring
  logLevel: 'INFO',
  claudeArgs: ['--dangerously-skip-permissions']
};

/**
 * XenoSync prompt templates for common tasks
 */
export const xenoSyncPromptTemplates = {
  'retro-game': {
    name: 'Retro Game Development',
    description: 'Build a complete Pac-Man style arcade game',
    mode: 'collaborative' as const,
    agents: 4,
    steps: [
      'Set up the project structure and dependencies',
      'Implement the core game logic',
      'Add graphics and animations',
      'Implement AI for ghosts',
      'Add sound effects and music',
      'Create responsive controls',
      'Add scoring system and power-ups',
      'Test and polish the game'
    ]
  },
  'api-development': {
    name: 'API Development',
    description: 'Build a RESTful API with authentication',
    mode: 'parallel' as const,
    agents: 3,
    steps: [
      'Design API endpoints and data models',
      'Implement authentication and authorization',
      'Create CRUD operations',
      'Add validation and error handling',
      'Write comprehensive tests',
      'Create API documentation'
    ]
  },
  'frontend-dashboard': {
    name: 'Frontend Dashboard',
    description: 'Create an interactive analytics dashboard',
    mode: 'collaborative' as const,
    agents: 4,
    steps: [
      'Set up React/Vue/Angular project',
      'Design component architecture',
      'Implement data visualization',
      'Add real-time updates',
      'Create responsive layout',
      'Add user interactions',
      'Optimize performance'
    ]
  },
  'refactor-codebase': {
    name: 'Code Refactoring',
    description: 'Refactor and modernize existing codebase',
    mode: 'parallel' as const,
    agents: 5,
    steps: [
      'Analyze current code structure',
      'Identify refactoring opportunities',
      'Update dependencies',
      'Refactor core modules',
      'Improve error handling',
      'Add missing tests',
      'Update documentation'
    ]
  }
};

/**
 * Map MaiFarm concepts to XenoSync equivalents
 */
export const conceptMapping = {
  farm: 'session',
  agent: 'agent',
  harvest: 'output_collection',
  barn: 'artifact_storage',
  workspace: 'working_directory',
  seed: 'prompt_template',
  farmer: 'orchestrator'
};

/**
 * XenoSync file patterns for coordination
 */
export const xenoSyncFilePatterns = {
  sessionFile: '.xenosync_session',
  coordinationDir: '.xenosync_coordination',
  agentInfoPattern: 'agent_*.json',
  workClaimsFile: 'work_claims.json',
  activeWorkRegistry: 'active_work_registry.json',
  completedWorkLog: 'completed_work_log.json',
  plannedWorkQueue: 'planned_work_queue.json'
};

/**
 * Validate XenoSync configuration
 */
export function validateXenoSyncConfig(config: Partial<XenoSyncSettings>): XenoSyncSettings {
  const merged = { ...defaultXenoSyncSettings, ...config };
  
  // Enforce minimum agents
  if (merged.minAgents < 2) {
    merged.minAgents = 2;
  }
  
  // Enforce maximum agents
  if (merged.maxAgents > 20) {
    merged.maxAgents = 20;
  }
  
  // Ensure min <= max
  if (merged.minAgents > merged.maxAgents) {
    merged.minAgents = merged.maxAgents;
  }
  
  return merged;
}

/**
 * Get XenoSync environment variables
 */
export function getXenoSyncEnv(farmId: string, workspacePath: string): Record<string, string> {
  return {
    XENOSYNC_FARM_ID: farmId,
    XENOSYNC_WORKSPACE: workspacePath,
    XENOSYNC_COORDINATION_DIR: `${workspacePath}/.xenosync_coordination`,
    XENOSYNC_MODE: 'maifarm_integrated',
    PYTHONUNBUFFERED: '1' // Ensure Python output is not buffered
  };
}