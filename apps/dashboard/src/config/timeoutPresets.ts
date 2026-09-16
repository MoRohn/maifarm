/**
 * Timeout presets for different task types
 * All values are in seconds
 *
 * ENHANCED: Tiered presets for extended farming sessions
 * Default is now 2 hours (Standard tier) for comprehensive project work
 */

export interface TimeoutPreset {
  name: string;
  value: number; // seconds
  description: string;
  recommended: boolean;
  category: 'quick' | 'standard' | 'long' | 'extended' | 'continuous';
  tier?: 'sprint' | 'standard' | 'extended' | 'marathon'; // New tier system
  icon?: string;
  useCase?: string; // Detailed use case description
}

// Timeout tier constants (in seconds) - matches backend TIMEOUT_TIERS
export const TIMEOUT_TIERS = {
  SPRINT: 1800,    // 30 minutes
  STANDARD: 7200,  // 2 hours (NEW DEFAULT)
  EXTENDED: 14400, // 4 hours
  MARATHON: 28800  // 8 hours
} as const;

export const TIMEOUT_PRESETS: TimeoutPreset[] = [
  // Quick Tasks (15 min) - for immediate fixes
  {
    name: 'Quick Task',
    value: 900, // 15 minutes (extended from 5 min)
    description: 'Bug fixes, code reviews, small tweaks',
    recommended: false,
    category: 'quick',
    tier: undefined,
    icon: '⚡',
    useCase: 'Single-file bug fixes, quick code reviews, simple formatting'
  },

  // TIER: Sprint (30 min) - focused work
  {
    name: 'Sprint',
    value: TIMEOUT_TIERS.SPRINT, // 30 minutes
    description: 'Quick features, targeted bug fixes, reviews',
    recommended: false,
    category: 'standard',
    tier: 'sprint',
    icon: '🏃',
    useCase: 'Small features, targeted bug fixes, code reviews'
  },

  // TIER: Standard (2 hours) - RECOMMENDED DEFAULT
  {
    name: 'Standard',
    value: TIMEOUT_TIERS.STANDARD, // 2 hours
    description: 'Full features, refactoring, comprehensive work',
    recommended: true, // NEW DEFAULT
    category: 'standard',
    tier: 'standard',
    icon: '✅',
    useCase: 'Complete feature implementation, refactoring, test suites'
  },

  // TIER: Extended (4 hours) - large features
  {
    name: 'Extended',
    value: TIMEOUT_TIERS.EXTENDED, // 4 hours
    description: 'Large features, migrations, multi-file changes',
    recommended: false,
    category: 'long',
    tier: 'extended',
    icon: '🚀',
    useCase: 'Multi-component features, database migrations, architectural changes'
  },

  // TIER: Marathon (8 hours) - major projects
  {
    name: 'Marathon',
    value: TIMEOUT_TIERS.MARATHON, // 8 hours
    description: 'Major rewrites, complex integrations, full systems',
    recommended: false,
    category: 'extended',
    tier: 'marathon',
    icon: '🏗️',
    useCase: 'Major rewrites, complex integrations, full system implementations'
  },

  // Continuous - unlimited (use with caution)
  {
    name: 'Continuous',
    value: 0, // No timeout
    description: 'Runs until manually stopped - use with caution',
    recommended: false,
    category: 'continuous',
    tier: undefined,
    icon: '♾️',
    useCase: 'Long-running processes, continuous monitoring'
  }
];

/**
 * Get timeout preset by value
 */
export function getTimeoutPreset(seconds: number): TimeoutPreset | undefined {
  return TIMEOUT_PRESETS.find(preset => preset.value === seconds);
}

/**
 * Get timeout presets by category
 */
export function getTimeoutPresetsByCategory(category: TimeoutPreset['category']): TimeoutPreset[] {
  return TIMEOUT_PRESETS.filter(preset => preset.category === category);
}

/**
 * Format timeout duration for display
 */
export function formatTimeout(seconds: number): string {
  if (seconds === 0) return 'No timeout';
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Get recommended timeout based on task type
 * ENHANCED: Updated for extended farming sessions
 */
export function getRecommendedTimeout(taskType: string): number {
  const taskTypeMap: Record<string, number> = {
    // Quick tasks - 15 minutes
    'quick-task': 900,
    'bug-fix': 900,
    'review': 900,
    'documentation': 900,

    // Sprint tier - 30 minutes
    'small-feature': TIMEOUT_TIERS.SPRINT,
    'test': TIMEOUT_TIERS.SPRINT,

    // Standard tier - 2 hours (NEW DEFAULT)
    'feature': TIMEOUT_TIERS.STANDARD,
    'refactor': TIMEOUT_TIERS.STANDARD,
    'collaborative': TIMEOUT_TIERS.STANDARD,
    'sequential': TIMEOUT_TIERS.STANDARD,
    'farm': TIMEOUT_TIERS.STANDARD,

    // Extended tier - 4 hours
    'large-feature': TIMEOUT_TIERS.EXTENDED,
    'migration': TIMEOUT_TIERS.EXTENDED,
    'exploration': TIMEOUT_TIERS.EXTENDED,

    // Marathon tier - 8 hours
    'major-rewrite': TIMEOUT_TIERS.MARATHON,
    'complex-integration': TIMEOUT_TIERS.MARATHON,

    // GoWild - 1.5 hours
    'go-wild': 5400
  };

  return taskTypeMap[taskType] || TIMEOUT_TIERS.STANDARD; // Default to 2 hours
}

/**
 * Get timeout presets filtered by tier
 */
export function getPresetsByTier(tier: 'sprint' | 'standard' | 'extended' | 'marathon'): TimeoutPreset[] {
  return TIMEOUT_PRESETS.filter(preset => preset.tier === tier);
}

/**
 * Get the recommended preset (Standard tier)
 */
export function getRecommendedPreset(): TimeoutPreset {
  return TIMEOUT_PRESETS.find(p => p.recommended) || TIMEOUT_PRESETS[2];
}

/**
 * Get tier display info for UI
 */
export function getTierDisplayInfo(): Array<{
  tier: 'sprint' | 'standard' | 'extended' | 'marathon';
  name: string;
  duration: string;
  description: string;
  seconds: number;
}> {
  return [
    {
      tier: 'sprint',
      name: 'Sprint',
      duration: '30 min',
      description: 'Bug fixes, reviews, small features',
      seconds: TIMEOUT_TIERS.SPRINT
    },
    {
      tier: 'standard',
      name: 'Standard',
      duration: '2 hours',
      description: 'Full features, refactoring (Recommended)',
      seconds: TIMEOUT_TIERS.STANDARD
    },
    {
      tier: 'extended',
      name: 'Extended',
      duration: '4 hours',
      description: 'Large features, migrations',
      seconds: TIMEOUT_TIERS.EXTENDED
    },
    {
      tier: 'marathon',
      name: 'Marathon',
      duration: '8 hours',
      description: 'Major rewrites, complex integrations',
      seconds: TIMEOUT_TIERS.MARATHON
    }
  ];
}

export default TIMEOUT_PRESETS;