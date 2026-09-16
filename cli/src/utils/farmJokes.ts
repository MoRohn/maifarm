/**
 * Farm Jokes and Witty Messages
 *
 * "Laughter is the best fertilizer for code!" 😄
 */

export class FarmJokes {
  private static jokes = [
    "Why don't agents tell secrets on a farm? Because the potatoes have eyes and the corn has ears! 🌽",
    "What do you call a cow that codes? A MOO-grammer! 🐄",
    "Why did the scarecrow win an award? He was outstanding in his field... of AI agents! 🌾",
    "What's a farm's favorite programming language? Hay-TML! 🌾",
    "Why do farmers make great programmers? They're experts at debugging! 🐛",
    "What do you call a pig that does machine learning? HAM-L! 🐷",
    "Why did the chicken cross the codebase? To get to the other pipeline! 🐔",
    "What's a farmer's favorite git command? git harvest! 🧺",
    "Why are farms great at parallel processing? They have multiple cores... of corn! 🌽",
    "What do you call a sheep that knows TypeScript? A lamb-da function! 🐑",
    "Why don't bugs survive on digital farms? Too many debug pesticides! 🐛",
    "What's a tractor's favorite npm command? npm run field! 🚜",
    "Why did the database go to the farm? To work on its fields! 📊",
    "What do you call an asynchronous cow? A-moo-sync! 🐄",
    "Why do farmers love Redis? It's great for storing hay-sh tables! 🌾"
  ];

  private static harvestJokes = [
    "Time to reap what you've coded! 🌾",
    "Your digital crops are ready! No pesticides needed! 🧺",
    "Harvest complete! No actual vegetables were harmed! 🥕",
    "Your code harvest is GMO-free and organic! 🌱",
    "Fresh code, straight from the digital fields! 🚜"
  ];

  private static wildJokes = [
    "Your agents have gone feral! They're coding without supervision! 🦅",
    "Wild mode activated! Your agents are free-range now! 🏃",
    "Let them roam free! What could possibly go wrong? 🦅",
    "Your agents are running wild! Hope they remember to commit! 🐎",
    "Autonomous agents unleashed! May the odds be ever in your favor! 🎲"
  ];

  private static errorJokes = [
    "Looks like the crops failed... time to plant again! 🥀",
    "Even the best farmers have bad harvests sometimes! 🌧️",
    "Don't worry, digital seeds are cheap! Try again! 🌱",
    "The code gods were not pleased with this harvest! 🙏",
    "Every failed farm teaches us how to grow better code! 📚"
  ];

  private static successMessages = [
    "Outstanding! Your farm is thriving! 🎉",
    "Excellent work, farmer! The harvest looks bountiful! 🌾",
    "Your agents are performing magnificently! 🏆",
    "The digital crops are growing beautifully! 🌻",
    "Farm productivity is through the barn roof! 📈"
  ];

  /**
   * Get a random general joke
   */
  static getRandomJoke(): string {
    return this.jokes[Math.floor(Math.random() * this.jokes.length)];
  }

  /**
   * Get a harvest-specific joke
   */
  static getHarvestJoke(): string {
    return this.harvestJokes[Math.floor(Math.random() * this.harvestJokes.length)];
  }

  /**
   * Get a wild mode joke
   */
  static getWildJoke(): string {
    return this.wildJokes[Math.floor(Math.random() * this.wildJokes.length)];
  }

  /**
   * Get an error joke to lighten the mood
   */
  static getErrorJoke(): string {
    return this.errorJokes[Math.floor(Math.random() * this.errorJokes.length)];
  }

  /**
   * Get a success message
   */
  static getSuccessMessage(): string {
    return this.successMessages[Math.floor(Math.random() * this.successMessages.length)];
  }

  /**
   * Get contextual message based on time of day
   */
  static getTimeBasedMessage(): string {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 9) {
      return "Early bird gets the worm... or in this case, the bug-free code! 🐛";
    } else if (hour >= 9 && hour < 12) {
      return "Morning productivity peak! Your agents are caffeinated! ☕";
    } else if (hour >= 12 && hour < 14) {
      return "Lunch break? Your agents eat electricity! ⚡";
    } else if (hour >= 14 && hour < 17) {
      return "Afternoon grind! Keep those digital wheels turning! 🚜";
    } else if (hour >= 17 && hour < 20) {
      return "Golden hour for code harvesting! 🌅";
    } else if (hour >= 20 && hour < 23) {
      return "Night farming? Your agents don't need sleep! 🌙";
    } else {
      return "Midnight oil burning! Your dedication is outstanding! 🕯️";
    }
  }

  /**
   * Get agent-specific quips
   */
  static getAgentQuip(agentName: string): string {
    const quips: Record<string, string[]> = {
      'Bessie': [
        "Bessie says: 'Moo-ve over, bugs!'",
        "Bessie is utterly focused!",
        "Bessie's code is pasteurized for quality!"
      ],
      'Wilbur': [
        "Wilbur's bringing home the bacon!",
        "Wilbur says: 'That's all, folks!'",
        "Wilbur's code is sizzling!"
      ],
      'Clucky': [
        "Clucky's pecking at the keyboard!",
        "Clucky laid another golden function!",
        "Clucky says: 'The sky is falling... into place!'"
      ]
    };

    const agentKey = agentName.split(' ')[0]; // Get first name
    const agentQuips = quips[agentKey] || [
      `${agentName} is working hard!`,
      `${agentName} is in the zone!`,
      `${agentName} is crushing it!`
    ];

    return agentQuips[Math.floor(Math.random() * agentQuips.length)];
  }

  /**
   * Get mode-specific encouragement
   */
  static getEncouragement(mode: string): string {
    const encouragements: Record<string, string[]> = {
      standard: [
        "Steady progress wins the race! 🐢",
        "Quality over speed, that's the farm way! 🌾",
        "Your methodical approach is admirable! 📐"
      ],
      quick: [
        "Speed farming at its finest! ⚡",
        "5 minutes to glory! 🏃",
        "Quick and efficient, like a well-oiled tractor! 🚜"
      ],
      wild: [
        "Brave farmer! Letting agents roam free! 🦅",
        "Autonomous excellence in action! 🤖",
        "Wild mode: Where magic happens! ✨"
      ]
    };

    const modeEncouragements = encouragements[mode] || encouragements.standard;
    return modeEncouragements[Math.floor(Math.random() * modeEncouragements.length)];
  }

  /**
   * Get completion celebration
   */
  static getCelebration(): string {
    const celebrations = [
      "🎉 Yeehaw! Farm complete! Time to celebrate! 🎊",
      "🏆 Champion farmer! Your harvest is legendary! 🌾",
      "🎯 Bullseye! Perfect execution, farmer! 🎯",
      "⭐ Five-star harvest! Gordon Ramsay would be proud! ⭐",
      "🚀 To the moon! Your farm productivity is stellar! 🌙"
    ];

    return celebrations[Math.floor(Math.random() * celebrations.length)];
  }
}

export default FarmJokes;