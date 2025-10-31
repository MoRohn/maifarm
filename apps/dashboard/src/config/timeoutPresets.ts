/**
 * Timeout presets for different task types
 * All values are in seconds
 */

export interface TimeoutPreset {
  name: string;
  value: number; // seconds
  description: string;
  recommended: boolean;
  category: 'quick' | 'standard' | 'long' | 'extended' | 'continuous';
  icon?: string;
}

export const TIMEOUT_PRESETS: TimeoutPreset[] = [
  {
    name: 'Quick Task',
    value: 300, // 5 minutes
    description: 'For simple, fast operations like formatting or linting',
    recommended: false,
    category: 'quick',
    icon: '⚡'
  },
  {
    name: 'Standard Task',
    value: 900, // 15 minutes
    description: 'For typical development tasks like bug fixes or small features',
    recommended: false,
    category: 'standard',
    icon: '⚙️'
  },
  {
    name: 'Medium Task',
    value: 1800, // 30 minutes
    description: 'For moderate complexity tasks like refactoring or testing',
    recommended: false,
    category: 'standard',
    icon: '🔧'
  },
  {
    name: 'Recommended',
    value: 3600, // 1 hour
    description: 'Balanced timeout for most development tasks',
    recommended: true,
    category: 'standard',
    icon: '✅'
  },
  {
    name: 'Extended Task',
    value: 7200, // 2 hours
    description: 'For complex features or multi-agent collaborations',
    recommended: false,
    category: 'long',
    icon: '🚀'
  },
  {
    name: 'Long Running',
    value: 14400, // 4 hours
    description: 'For large-scale refactoring or comprehensive testing',
    recommended: false,
    category: 'long',
    icon: '🏗️'
  },
  {
    name: 'Full Day',
    value: 28800, // 8 hours
    description: 'For extensive projects or continuous integration',
    recommended: false,
    category: 'extended',
    icon: '📅'
  },
  {
    name: 'Continuous',
    value: 0, // No timeout
    description: 'Runs until manually stopped - use with caution',
    recommended: false,
    category: 'continuous',
    icon: '♾️'
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
 */
export function getRecommendedTimeout(taskType: string): number {
  const taskTypeMap: Record<string, number> = {
    'quick-task': 300,      // 5 minutes
    'bug-fix': 900,         // 15 minutes
    'feature': 3600,        // 1 hour
    'refactor': 7200,       // 2 hours
    'test': 1800,           // 30 minutes
    'documentation': 600,   // 10 minutes
    'collaborative': 3600,  // 1 hour
    'sequential': 7200,     // 2 hours
    'exploration': 14400,   // 4 hours
    'go-wild': 0            // No timeout for exploration
  };
  
  return taskTypeMap[taskType] || 3600; // Default to 1 hour
}

export default TIMEOUT_PRESETS;