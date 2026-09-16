/**
 * Farm-themed agent name generator for MaiFarm
 * Generates creative farm animal and character names for AI agents
 */

export interface FarmAgentName {
  name: string;
  animal: string;
  personality: string;
  emoji: string;
}

// Farm animals and characters with personalities
const farmCharacters: FarmAgentName[] = [
  // Traditional Farm Animals
  { name: "Bessie", animal: "Cow", personality: "Methodical and thorough", emoji: "🐄" },
  { name: "Wilbur", animal: "Pig", personality: "Clever problem solver", emoji: "🐷" },
  { name: "Clucky", animal: "Chicken", personality: "Detail-oriented and precise", emoji: "🐔" },
  { name: "Woolsworth", animal: "Sheep", personality: "Team player and coordinator", emoji: "🐑" },
  { name: "Neighton", animal: "Horse", personality: "Fast and efficient worker", emoji: "🐴" },
  { name: "Billy", animal: "Goat", personality: "Tackles tough problems", emoji: "🐐" },
  { name: "Quackers", animal: "Duck", personality: "Adaptable and resourceful", emoji: "🦆" },
  { name: "Tom", animal: "Turkey", personality: "Comprehensive reviewer", emoji: "🦃" },
  { name: "Hopper", animal: "Rabbit", personality: "Quick and agile thinker", emoji: "🐰" },
  { name: "Spot", animal: "Dog", personality: "Loyal and dependable", emoji: "🐕" },
  
  // Farm Birds
  { name: "Rooster Rick", animal: "Rooster", personality: "Early starter and leader", emoji: "🐓" },
  { name: "Penny Peahen", animal: "Peahen", personality: "Elegant solution finder", emoji: "🦚" },
  { name: "Gander Gary", animal: "Goose", personality: "Protective and thorough", emoji: "🦢" },
  
  // Farm Cats
  { name: "Whiskers", animal: "Barn Cat", personality: "Independent debugger", emoji: "🐈" },
  { name: "Mittens", animal: "Farm Cat", personality: "Stealthy bug hunter", emoji: "🐱" },
  
  // Working Animals
  { name: "Duke", animal: "Draft Horse", personality: "Heavy lifter for complex tasks", emoji: "🐎" },
  { name: "Shep", animal: "Sheepdog", personality: "Keeps everyone organized", emoji: "🦮" },
  { name: "Buzz", animal: "Bee", personality: "Busy and productive worker", emoji: "🐝" },
  
  // Farm Characters
  { name: "Farmer Joe", animal: "Human Farmer", personality: "Overall project coordinator", emoji: "👨‍🌾" },
  { name: "Farmer Jane", animal: "Human Farmer", personality: "Strategic planner", emoji: "👩‍🌾" },
  { name: "Scarecrow Sam", animal: "Scarecrow", personality: "Guards against bugs", emoji: "🌾" },
  
  // Specialty Animals
  { name: "Alpaca Al", animal: "Alpaca", personality: "Soft approach to problems", emoji: "🦙" },
  { name: "Dolly", animal: "Donkey", personality: "Persistent and hardworking", emoji: "🫏" },
  { name: "Ferdinand", animal: "Bull", personality: "Powerful problem crusher", emoji: "🐂" },
  { name: "Gertie", animal: "Guinea Fowl", personality: "Alert to issues", emoji: "🦜" },
  
  // Fun Additions
  { name: "Hammy", animal: "Hamster", personality: "Stores and organizes data", emoji: "🐹" },
  { name: "Squeaky", animal: "Mouse", personality: "Finds small details", emoji: "🐭" },
  { name: "Chester", animal: "Chipmunk", personality: "Quick collector of resources", emoji: "🐿️" },
  { name: "Owlbert", animal: "Barn Owl", personality: "Wise code reviewer", emoji: "🦉" },
  { name: "Freddy", animal: "Frog", personality: "Leaps through tasks", emoji: "🐸" }
];

// Role-based name suggestions for specific agent types
const roleBasedNames: Record<string, string[]> = {
  analyzer: ["Owlbert", "Whiskers", "Clucky", "Squeaky"],
  reviewer: ["Bessie", "Tom", "Owlbert", "Farmer Joe"],
  tester: ["Clucky", "Squeaky", "Gertie", "Buzz"],
  developer: ["Wilbur", "Neighton", "Duke", "Ferdinand"],
  debugger: ["Whiskers", "Mittens", "Squeaky", "Spot"],
  auditor: ["Tom", "Owlbert", "Farmer Jane", "Gander Gary"],
  coordinator: ["Farmer Joe", "Farmer Jane", "Shep", "Rooster Rick"],
  general: ["Billy", "Hopper", "Woolsworth", "Quackers"]
};

/**
 * Get a farm-themed name for an agent based on role and index
 * @param agentType - The type/role of the agent
 * @param index - The index of the agent (for uniqueness)
 * @returns A farm character name object
 */
export function getFarmAgentName(agentType: string = 'general', index: number = 0): FarmAgentName {
  // Get role-specific suggestions
  const roleSuggestions = roleBasedNames[agentType] || roleBasedNames.general;
  
  // Try to get a role-appropriate character
  if (index < roleSuggestions.length) {
    const suggestedName = roleSuggestions[index];
    const character = farmCharacters.find(c => c.name === suggestedName);
    if (character) return character;
  }
  
  // Fallback: cycle through all characters
  const characterIndex = index % farmCharacters.length;
  return farmCharacters[characterIndex];
}

/**
 * Get multiple unique farm agent names
 * @param count - Number of names needed
 * @param agentTypes - Optional array of agent types
 * @returns Array of unique farm character names
 */
/**
 * Get SIMPLE agent name by index - matches backend UnifiedFarmLaunchOrchestrator
 * This ensures naming consistency across frontend and backend
 */
export function getSimpleAgentName(index: number): string {
  const simpleNames = [
    'Bessie the Cow',
    'Cluck the Chicken',
    'Wilbur the Pig',
    'Charlotte the Spider',
    'Babe the Sheep',
    'Donald the Duck',
    'Henrietta the Hen',
    'Ferdinand the Bull',
    'Peggy the Goat'
  ];

  if (index < simpleNames.length) {
    return simpleNames[index];
  }

  // Fallback for more than 9 agents
  return `Agent ${index + 1}`;
}

export function getFarmAgentNames(count: number, agentTypes?: string[]): FarmAgentName[] {
  const names: FarmAgentName[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < count; i++) {
    const agentType = agentTypes?.[i] || 'general';

    // Try to get a unique character
    let attempts = 0;
    let character: FarmAgentName;
    let characterIndex: number;

    do {
      if (agentTypes && attempts < 5) {
        // Try role-based selection first
        character = getFarmAgentName(agentType, attempts);
        characterIndex = farmCharacters.findIndex(c => c.name === character.name);
      } else {
        // Use sequential selection to ensure uniqueness
        characterIndex = (i + attempts) % farmCharacters.length;
        character = farmCharacters[characterIndex];
      }
      attempts++;
    } while (usedIndices.has(characterIndex) && attempts < farmCharacters.length);

    usedIndices.add(characterIndex);
    names.push(character);
  }

  return names;
}

/**
 * Format agent name with emoji for display
 * @param farmAgent - The farm agent name object
 * @param includePersonality - Whether to include personality description
 * @returns Formatted string
 */
export function formatFarmAgentName(farmAgent: FarmAgentName, includePersonality: boolean = false): string {
  if (includePersonality) {
    return `${farmAgent.emoji} ${farmAgent.name} the ${farmAgent.animal} - ${farmAgent.personality}`;
  }
  return `${farmAgent.emoji} ${farmAgent.name} the ${farmAgent.animal}`;
}

/**
 * Format agent name WITHOUT emoji for YAML generation
 * @param farmAgent - The farm agent name object
 * @param includePersonality - Whether to include personality description
 * @returns Formatted string without emoji
 */
export function formatFarmAgentNameNoEmoji(farmAgent: FarmAgentName, includePersonality: boolean = false): string {
  if (includePersonality) {
    return `${farmAgent.name} the ${farmAgent.animal} - ${farmAgent.personality}`;
  }
  return `${farmAgent.name} the ${farmAgent.animal}`;
}

/**
 * Get a random farm-themed name
 * @returns A random farm character
 */
export function getRandomFarmAgent(): FarmAgentName {
  const index = Math.floor(Math.random() * farmCharacters.length);
  return farmCharacters[index];
}

/**
 * Generate a farm team name based on the agents
 * @param agents - Array of farm agents
 * @returns A creative team name
 */
export function generateFarmTeamName(agents: FarmAgentName[]): string {
  const animalTypes = [...new Set(agents.map(a => a.animal))];
  
  if (animalTypes.length === 1) {
    return `The ${animalTypes[0]} Squad`;
  } else if (animalTypes.length === 2) {
    return `The ${animalTypes[0]} & ${animalTypes[1]} Crew`;
  } else {
    const prefixes = ["Barnyard", "Meadow", "Pasture", "Harvest", "Prairie", "Orchard"];
    const suffixes = ["Brigade", "Alliance", "Collective", "Assembly", "Force", "Team"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    return `The ${prefix} ${suffix}`;
  }
}

/**
 * Get agent name string directly by index (convenience method)
 * Returns formatted name WITHOUT emoji for compatibility
 */
export function getAgentNameByIndex(index: number): string {
  const farmAgent = getFarmAgentName('general', index);
  return formatFarmAgentNameNoEmoji(farmAgent);
}

export default {
  getFarmAgentName,
  getFarmAgentNames,
  formatFarmAgentName,
  formatFarmAgentNameNoEmoji,
  getRandomFarmAgent,
  generateFarmTeamName,
  getAgentNameByIndex,
  farmCharacters
};