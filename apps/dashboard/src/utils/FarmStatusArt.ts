/**
 * FarmStatusArt.ts
 * ASCII art and fun messages for farm status display
 *
 * Each status has themed ASCII art featuring farm animals
 * and encouraging/informative messages for the user.
 */

import type { FarmStatus, AgentStatus, HarvestStatus } from '@/types';

// ============================================
// Farm Status ASCII Art
// ============================================

export const FARM_STATUS_ART: Record<FarmStatus, string> = {
  idle: `
    __
   (  )
  (    )
 (      )
  ~~~~~~
   |  |
   |__|
  /    \\
 [______]
  BARN
`,

  launching: `
       *  *
    *   __   *
   *   /  \\   *
      | () |
   ___/    \\___
  |  LAUNCHING |
  |  .  .  .   |
  |____________|
     || ||
`,

  active: `
  ^__^    ^__^
  (oo)    (oo)
 /------\\/------\\
/ |    ||    | \\
*  ||--||--||  *
   ^^    ^^
 [ FARM ACTIVE ]
`,

  running: `
     ,
    /|
   / |__
  *  |o \\___
     |     *>
     |  __/
     |_/
  ~RUNNING~
`,

  paused: `
    ZZZ
   z   z
  z ___  z
   /   \\
  | @ @ |
  |  ~  |
   \\___/
  PAUSED
`,

  harvesting: `
    \\\\\\|///
     \\ | /
      \\|/
   ____Y____
  |  WHEAT  |
  | \\\\\\\\|//// |
  |  ~~~~~~  |
  [__________]
   HARVESTING
`,

  completed: `
      .-"""-.
     /        \\
    |  O    O  |
    |    __    |
     \\  \\__/  /
      '-.  .-'
    *  SUCCESS  *
`,

  failed: `
      .---.
     /     \\
    | x   x |
    |   ^   |
     \\ === /
      '---'
   [ FAILED ]
`,

  terminated: `
     _____
    /     \\
   | STOP  |
   |_______|
      ||
     _||_
    |    |
    |____|
  TERMINATED
`,
};

// ============================================
// Agent Status ASCII Art (smaller, inline)
// ============================================

export const AGENT_STATUS_ART: Record<AgentStatus, string> = {
  idle: `(-.-)`,
  initializing: `(@.@)`,
  active: `(^o^)`,
  working: `(>.<)`,
  busy: `(@_@)`,
  completed: `(^_^)`,
  paused: `(-_-)zzZ`,
  error: `(o.O)`,
  failed: `(x_x)`,
  terminating: `(;_;)`,
  terminated: `[___]`,
};

// ============================================
// Fun Messages by Status
// ============================================

export const FARM_STATUS_MESSAGES: Record<FarmStatus, string[]> = {
  idle: [
    'The barn is quiet... waiting for action!',
    'Farm is ready and rested.',
    'All agents are snoozing in the hay.',
    'Perfect time to start a new project!',
    'The rooster hasn\'t crowed yet.',
  ],

  launching: [
    'Waking up the farm animals...',
    'The roosters are crowing!',
    'Agents are stretching their legs...',
    'Opening the barn doors...',
    'Feeding the agents their morning coffee...',
    'Hitching up the horses!',
  ],

  active: [
    'The farm is buzzing with activity!',
    'Agents are hard at work!',
    'Productivity is growing like corn in July!',
    'Everyone\'s pulling their weight!',
    'The harvest will be bountiful!',
  ],

  running: [
    'Full steam ahead!',
    'The farm is in full operation!',
    'Watch those agents go!',
    'Making progress like a tractor in spring!',
    'The code fields are being tended!',
  ],

  paused: [
    'Taking a well-deserved break...',
    'The animals are napping.',
    'Siesta time on the farm!',
    'Conserving energy for the next push.',
    'Even farmers need rest.',
  ],

  harvesting: [
    'Gathering the fruits of your labor!',
    'Time to bring in the harvest!',
    'Collecting all that beautiful output!',
    'The barn is filling up nicely!',
    'Bundle up those results!',
  ],

  completed: [
    'Another successful harvest!',
    'The barn is full of goodies!',
    'Mission accomplished, farmer!',
    'Time to celebrate with some apple cider!',
    'Outstanding work from all agents!',
    'The crops have been brought in!',
  ],

  failed: [
    'The crop didn\'t make it this time...',
    'Even the best farmers have tough seasons.',
    'Don\'t worry, we\'ll try again!',
    'Sometimes the weather just doesn\'t cooperate.',
    'The agents ran into some trouble.',
  ],

  terminated: [
    'Farm operations have been stopped.',
    'The barn doors are closed.',
    'All agents have returned to the barn.',
    'Session ended by request.',
    'Until next time, partner!',
  ],
};

// ============================================
// Harvest Status Messages
// ============================================

export const HARVEST_STATUS_MESSAGES: Record<HarvestStatus, string[]> = {
  pending: [
    'Harvest is queued up!',
    'Sharpening the sickle...',
    'Getting the baskets ready!',
  ],

  collecting: [
    'Gathering outputs from the fields...',
    'Picking the finest produce!',
    'Loading up the wagon!',
  ],

  processing: [
    'Sorting and packaging the harvest...',
    'Quality control in progress!',
    'Making everything nice and tidy!',
  ],

  completed: [
    'Harvest complete! Check the barn!',
    'All outputs safely stored!',
    'A bountiful collection!',
  ],

  failed: [
    'Harvest ran into trouble...',
    'Some outputs may have been lost.',
    'Try harvesting again when ready.',
  ],
};

// ============================================
// Farm Animal Names for Agents
// ============================================

export const FARM_ANIMAL_NAMES: string[] = [
  'Bessie the Cow',
  'Cluck the Chicken',
  'Woolsworth the Sheep',
  'Oink McPorkchop',
  'Neigh-sayer the Horse',
  'Billy the Goat',
  'Quackers the Duck',
  'Gobbles the Turkey',
  'Baaarbara the Lamb',
  'Henny Penny',
  'Sir Moos-a-Lot',
  'Lady Cluckington',
  'Professor Oinksworth',
  'Duke of Duckingham',
  'Baron von Baa',
  'Countess Cud-Chewer',
  'Earl of Eggs',
  'Captain Cornpecker',
  'Admiral Alfalfa',
  'General Grazer',
];

// ============================================
// Progress Bar Art
// ============================================

export function getProgressBar(
  progress: number,
  width: number = 20,
  fillChar: string = '#',
  emptyChar: string = '-'
): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
  return `[${bar}] ${progress}%`;
}

export function getFarmProgressBar(progress: number): string {
  const width = 20;
  const filled = Math.round((progress / 100) * width);
  const crops = ['🌱', '🌿', '🌾'];
  const empty = '·';

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      bar += crops[i % crops.length];
    } else {
      bar += empty;
    }
  }
  return `[${bar}] ${progress}%`;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get a random message for a farm status
 */
export function getRandomStatusMessage(status: FarmStatus): string {
  const messages = FARM_STATUS_MESSAGES[status];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get a random harvest message
 */
export function getRandomHarvestMessage(status: HarvestStatus): string {
  const messages = HARVEST_STATUS_MESSAGES[status];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get ASCII art for a farm status
 */
export function getFarmStatusArt(status: FarmStatus): string {
  return FARM_STATUS_ART[status] || FARM_STATUS_ART.idle;
}

/**
 * Get a farm animal name by index (cycles through available names)
 */
export function getFarmAnimalName(index: number): string {
  return FARM_ANIMAL_NAMES[index % FARM_ANIMAL_NAMES.length];
}

/**
 * Get agent face by status
 */
export function getAgentFace(status: AgentStatus): string {
  return AGENT_STATUS_ART[status] || AGENT_STATUS_ART.idle;
}

// ============================================
// Status Color Mapping
// ============================================

export const STATUS_COLORS: Record<FarmStatus, string> = {
  idle: 'text-gray-500',
  launching: 'text-yellow-500',
  active: 'text-green-500',
  running: 'text-green-600',
  paused: 'text-orange-500',
  harvesting: 'text-amber-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
  terminated: 'text-gray-600',
};

export const STATUS_BG_COLORS: Record<FarmStatus, string> = {
  idle: 'bg-gray-100',
  launching: 'bg-yellow-100',
  active: 'bg-green-100',
  running: 'bg-green-100',
  paused: 'bg-orange-100',
  harvesting: 'bg-amber-100',
  completed: 'bg-emerald-100',
  failed: 'bg-red-100',
  terminated: 'bg-gray-200',
};

// ============================================
// Animated Loading Messages
// ============================================

export const LOADING_MESSAGES: string[] = [
  'Plowing the fields...',
  'Watering the crops...',
  'Feeding the chickens...',
  'Milking the cows...',
  'Herding the sheep...',
  'Tending the garden...',
  'Checking the weather...',
  'Counting the eggs...',
  'Brushing the horses...',
  'Fixing the fence...',
];

export function getRandomLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

// ============================================
// Celebration Art (for completed farms)
// ============================================

export const CELEBRATION_ART = `
    *    *    *
  *   \\  |  /   *
    -- GREAT --
  *   /  |  \\   *
    *    *    *
      HARVEST!
`;

export const PARTY_ANIMALS_ART = `
   ^__^    (o)>   ^__^
   (oo)    / /    (^^)
  /------\\ V   /------\\
 / |    |     / |    | \\
*  ||--||    *  ||--||  *
   ^^           ^^
  [ CELEBRATION TIME! ]
`;

// ============================================
// Error Art
// ============================================

export const ERROR_ART = `
    ___________
   /           \\
  |   OOPS!    |
  |  .-"\"\"-.   |
  | /  x x  \\  |
  | |   ^   |  |
  |  \\  =  /   |
  |   '---'    |
   \\___________/
`;

export const WARNING_ART = `
      /\\
     /  \\
    / !! \\
   /______\\
   CAUTION
`;

// ============================================
// Seasonal/Time-based Art
// ============================================

export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Good morning, farmer! Rise and shine!';
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon! The sun is high, time to work!';
  } else if (hour >= 17 && hour < 21) {
    return 'Good evening! Almost time to bring in the harvest!';
  } else {
    return 'Burning the midnight oil? That\'s dedication!';
  }
}

export function getSeasonalArt(): string {
  const month = new Date().getMonth();

  // Spring (Mar-May)
  if (month >= 2 && month <= 4) {
    return `
    🌸 🌷 🌸
   \\\\\\\\\\|/////
    ~~~~~~~~
    SPRING!
    `;
  }
  // Summer (Jun-Aug)
  if (month >= 5 && month <= 7) {
    return `
      ☀️
    \\ | /
   -- O --
    / | \\
    SUMMER
    `;
  }
  // Fall (Sep-Nov)
  if (month >= 8 && month <= 10) {
    return `
    🍂 🍁 🍂
    \\\\\\|///
    HARVEST
    SEASON
    `;
  }
  // Winter (Dec-Feb)
  return `
    ❄️ ❄️ ❄️
     * * *
    WINTER
    REST
    `;
}

// ============================================
// Export Default
// ============================================

export default {
  FARM_STATUS_ART,
  AGENT_STATUS_ART,
  FARM_STATUS_MESSAGES,
  HARVEST_STATUS_MESSAGES,
  FARM_ANIMAL_NAMES,
  STATUS_COLORS,
  STATUS_BG_COLORS,
  LOADING_MESSAGES,
  CELEBRATION_ART,
  PARTY_ANIMALS_ART,
  ERROR_ART,
  WARNING_ART,
  getProgressBar,
  getFarmProgressBar,
  getRandomStatusMessage,
  getRandomHarvestMessage,
  getFarmStatusArt,
  getFarmAnimalName,
  getAgentFace,
  getRandomLoadingMessage,
  getTimeBasedGreeting,
  getSeasonalArt,
};
