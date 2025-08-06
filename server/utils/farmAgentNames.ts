/**
 * Farm-themed agent name generator for MaiFarm (Server version)
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
  coordinator: ["Farmer Joe", "Farmer Jane", "Shep", "Rooster Rick"],
  developer: ["Wilbur", "Neighton", "Duke", "Ferdinand"],
  tester: ["Clucky", "Squeaky", "Gertie", "Buzz"],
  analyzer: ["Owlbert", "Whiskers", "Clucky", "Squeaky"],
  documenter: ["Tom", "Owlbert", "Farmer Jane", "Gander Gary"],
  debugger: ["Whiskers", "Mittens", "Squeaky", "Spot"],
  linter: ["Clucky", "Gertie", "Squeaky", "Mittens"],
  security: ["Spot", "Shep", "Gander Gary", "Scarecrow Sam"],
  performance: ["Neighton", "Buzz", "Duke", "Ferdinand"],
  general: ["Billy", "Hopper", "Woolsworth", "Quackers"]
};

/**
 * Get a farm-themed name for an agent based on role and index
 */
export function getFarmAgentName(roleName: string = 'general', index: number = 0): FarmAgentName {
  // Get role-specific suggestions
  const roleSuggestions = roleBasedNames[roleName] || roleBasedNames.general;
  
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
 * Format agent name with emoji for display
 */
export function formatFarmAgentName(farmAgent: FarmAgentName): string {
  return `${farmAgent.emoji} ${farmAgent.name} the ${farmAgent.animal}`;
}

/**
 * Format agent name WITHOUT emoji for YAML generation
 */
export function formatFarmAgentNameNoEmoji(farmAgent: FarmAgentName): string {
  return `${farmAgent.name} the ${farmAgent.animal}`;
}

export default {
  getFarmAgentName,
  formatFarmAgentName,
  formatFarmAgentNameNoEmoji
};