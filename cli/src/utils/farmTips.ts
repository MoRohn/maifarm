/**
 * Farm Tips and Best Practices
 *
 * "Wisdom passed down through generations of digital farmers!" 📚
 */

import chalk from 'chalk';

export class FarmTips {
  private static tips = [
    '💡 Use parallel agents for faster harvests - more hands make light work!',
    '💡 Quick mode is perfect for small bug fixes - 5 minutes or less!',
    '💡 Wild mode unleashes creativity - let agents explore solutions freely!',
    '💡 Check your harvest regularly - fresh code is best code!',
    '💡 The barn stores reusable components - share across farms!',
    '💡 Name your farms descriptively - "fix-auth-bug" beats "farm-123"',
    '💡 Use --fast-launch to skip delays when you\'re in a hurry!',
    '💡 Tmux sessions persist - detach and come back later!',
    '💡 Monitor CPU usage - too many agents can overwhelm the system!',
    '💡 Harvest failures aren\'t failures - they\'re learning opportunities!',
    '💡 Use interactive mode when you\'re not sure what to do!',
    '💡 WebSocket provides real-time updates - no polling needed!',
    '💡 Farm names support emojis - make them fun! 🚜',
    '💡 Press Ctrl+B, D to detach from tmux without killing agents!',
    '💡 Use "farm stats" to monitor system health!',
    '💡 XenoSync mode coordinates agents more efficiently!',
    '💡 The weather report reflects actual system status!',
    '💡 Agent animals have personalities - Bessie is methodical!',
    '💡 Timeout settings prevent runaway farms!',
    '💡 Use "farm watch" to see live agent progress!',
    '💡 Barn items persist between sessions - build a library!',
    '💡 Failed agents auto-recover - resilience is built-in!',
    '💡 Use environment variables for API keys - keep them secret!',
    '💡 The dashboard command shows everything at a glance!',
    '💡 Harvest early and often - incremental progress is key!'
  ];

  private static bestPractices = {
    architecture: [
      '🏗️ Keep farms focused - one task per farm',
      '🏗️ Use appropriate agent counts - 2-3 for most tasks',
      '🏗️ Structure prompts clearly - agents follow instructions literally',
      '🏗️ Break complex tasks into smaller farms',
      '🏗️ Use the barn for shared utilities and components'
    ],
    performance: [
      '⚡ Limit concurrent farms to avoid resource exhaustion',
      '⚡ Use quick mode for time-sensitive fixes',
      '⚡ Monitor memory usage with large agent counts',
      '⚡ Clean up completed farms regularly',
      '⚡ Use --no-launch to prepare farms without starting'
    ],
    debugging: [
      '🐛 Watch individual agent panes in tmux',
      '🐛 Check logs in /var/maibarn/terminals/',
      '🐛 Use verbose mode (-v) for detailed output',
      '🐛 Test prompts with single agents first',
      '🐛 Review harvest artifacts before implementing'
    ],
    collaboration: [
      '👥 Share barn items with your team',
      '👥 Document your farm patterns',
      '👥 Use consistent naming conventions',
      '👥 Tag harvests for easy searching',
      '👥 Create reusable prompt templates'
    ]
  };

  /**
   * Get a random tip
   */
  static getRandomTip(): string {
    return this.tips[Math.floor(Math.random() * this.tips.length)];
  }

  /**
   * Get tips for specific category
   */
  static getCategoryTips(category: keyof typeof FarmTips.bestPractices): string[] {
    return this.bestPractices[category] || [];
  }

  /**
   * Get contextual tip based on command
   */
  static getContextualTip(command: string): string {
    const contextualTips: Record<string, string[]> = {
      create: [
        '💡 Give your farm a memorable name!',
        '💡 Start with 2-3 agents for most tasks',
        '💡 Write clear, specific prompts'
      ],
      watch: [
        '💡 Press Q to quit watching',
        '💡 Use arrow keys to scroll',
        '💡 Space bar pauses output'
      ],
      harvest: [
        '💡 Preview before harvesting with --preview',
        '💡 Specify output location with -o',
        '💡 Harvests are stored in /var/maibarn/harvests/'
      ],
      wild: [
        '💡 Wild mode works best with 3+ agents',
        '💡 Set appropriate timeouts',
        '💡 Monitor progress - agents can go off track!'
      ],
      quick: [
        '💡 Quick tasks auto-harvest after 5 minutes',
        '💡 Perfect for small fixes',
        '💡 Use 2 agents for optimal speed'
      ]
    };

    const tips = contextualTips[command] || [this.getRandomTip()];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  /**
   * Get pro tips for advanced users
   */
  static getProTip(): string {
    const proTips = [
      '🎯 Chain farms together with harvest outputs as inputs',
      '🎯 Use tmux scripting for automated workflows',
      '🎯 Create custom agent personalities in templates',
      '🎯 Implement pre-commit hooks that use quick farms',
      '🎯 Build a CI/CD pipeline with farm commands',
      '🎯 Use the API directly for programmatic control',
      '🎯 Create bash aliases for common farm patterns',
      '🎯 Integrate with VS Code tasks for seamless workflow',
      '🎯 Use environment-specific configurations',
      '🎯 Monitor WebSocket events for custom automation'
    ];

    return chalk.magenta(proTips[Math.floor(Math.random() * proTips.length)]);
  }

  /**
   * Get troubleshooting tips
   */
  static getTroubleshootingTip(error: string): string {
    const troubleshooting: Record<string, string> = {
      'connection': '🔧 Check if the API server is running on port 4567',
      'timeout': '🔧 Increase timeout or use fewer agents',
      'memory': '🔧 Reduce agent count or close other applications',
      'permission': '🔧 Check file permissions in /var/maibarn/',
      'tmux': '🔧 Ensure tmux is installed: brew install tmux',
      'notfound': '🔧 Farm may have been harvested or cleaned up',
      'auth': '🔧 Check your API keys in .env file',
      'port': '🔧 Port 4567 might be in use - kill existing process'
    };

    // Find matching error type
    for (const [key, tip] of Object.entries(troubleshooting)) {
      if (error.toLowerCase().includes(key)) {
        return tip;
      }
    }

    return '🔧 Check the logs for more details: npm run logs';
  }

  /**
   * Get seasonal farming advice
   */
  static getSeasonalAdvice(): string {
    const month = new Date().getMonth();

    if (month >= 2 && month <= 4) {
      // Spring
      return '🌸 Spring Tip: Perfect time to plant new features and refactor old code!';
    } else if (month >= 5 && month <= 7) {
      // Summer
      return '☀️ Summer Tip: Long days mean more coding time - pace yourself!';
    } else if (month >= 8 && month <= 10) {
      // Fall
      return '🍂 Fall Tip: Harvest season! Collect and document your code victories!';
    } else {
      // Winter
      return '❄️ Winter Tip: Time for maintenance and planning next year\'s features!';
    }
  }

  /**
   * Get efficiency tips
   */
  static getEfficiencyTip(): string {
    const efficiencyTips = [
      '⚙️ Keyboard shortcuts save time - learn tmux bindings!',
      '⚙️ Template common prompts for consistency',
      '⚙️ Use bash history to repeat commands quickly',
      '⚙️ Set up aliases for frequently used farms',
      '⚙️ Keep a farm journal of successful patterns',
      '⚙️ Batch similar tasks into one farm',
      '⚙️ Use the JSON output flag for scripting',
      '⚙️ Monitor resource usage to optimize agent count'
    ];

    return efficiencyTips[Math.floor(Math.random() * efficiencyTips.length)];
  }
}

export default FarmTips;