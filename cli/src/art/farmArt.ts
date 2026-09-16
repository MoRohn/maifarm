/**
 * Farm ASCII Art and Visual Elements
 *
 * "A farm without art is just a field!" 🎨
 */

import chalk from 'chalk';
import figlet from 'figlet';

export class FarmArt {
  /**
   * Get farm animal emoji based on agent count
   */
  static getAnimalEmoji(count: number): string {
    const emojis = ['🐄', '🐷', '🐔', '🐑', '🐐', '🦆', '🐓', '🐴', '🐰', '🦙'];
    if (count === 0) return '🌵';
    if (count === 1) return emojis[0];
    if (count <= 3) return emojis.slice(0, count).join('');
    return emojis.slice(0, 3).join('') + `+${count - 3}`;
  }

  /**
   * Get random farm scene ASCII art
   */
  static getRandomScene(): string {
    const scenes = [
      // Scene 1: Barn and Field
      `
     __________
    |  ______  |     🌞
    | |      | |    ___
    | |  🐄  | |   /   \\
    | |______| |  |🌾🌾🌾|
    |__________|  |_____|
      `,
      // Scene 2: Tractor
      `
        🚜
       __|__
      |     |
     _|_____|_
    (_________)
      `,
      // Scene 3: Farm Animals
      `
    🐓 🐷 🐑
    🌾 🌾 🌾
    🚜 → → →
      `,
      // Scene 4: Sunset Farm
      `
      🌅
    ___|___
   |  🏚️  |
   |_______|
   🐄 🌾 🐷
      `
    ];

    return scenes[Math.floor(Math.random() * scenes.length)];
  }

  /**
   * Get status-based art
   */
  static getStatusArt(status: string): string {
    const statusArt: Record<string, string> = {
      idle: chalk.gray('💤 Zzz...'),
      launching: chalk.yellow('🚜 Vrooom!'),
      running: chalk.green('🌱 Growing...'),
      completed: chalk.blue('🌾 Harvest ready!'),
      failed: chalk.red('💀 Crop failure!'),
      harvesting: chalk.yellow('🧺 Collecting...')
    };

    return statusArt[status] || chalk.gray('🌵 Unknown');
  }

  /**
   * Create a progress bar with farm theme
   */
  static createProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;

    const filledChar = '🌾';
    const emptyChar = '·';
    const tractor = '🚜';

    let bar = filledChar.repeat(Math.max(0, filled - 1));
    if (filled > 0 && filled < width) {
      bar += tractor;
    } else if (filled === width) {
      bar += filledChar;
    }
    bar += emptyChar.repeat(empty);

    return `[${bar}] ${progress}%`;
  }

  /**
   * Get seasonal decoration
   */
  static getSeasonalDecoration(): string {
    const month = new Date().getMonth();

    if (month >= 2 && month <= 4) {
      // Spring
      return '🌸 Spring Planting Season! 🌱';
    } else if (month >= 5 && month <= 7) {
      // Summer
      return '☀️ Summer Growing Season! 🌻';
    } else if (month >= 8 && month <= 10) {
      // Fall
      return '🍂 Harvest Season! 🌾';
    } else {
      // Winter
      return '❄️ Winter Planning Season! 📋';
    }
  }

  /**
   * Create ASCII banner for different commands
   */
  static getBanner(text: string, font: any = 'Standard'): string {
    try {
      return figlet.textSync(text, {
        font,
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
      });
    } catch {
      return text; // Fallback to plain text
    }
  }

  /**
   * Get mode-specific art
   */
  static getModeArt(mode: string): string {
    const modeArt: Record<string, string> = {
      standard: `
    🌾 Standard Farm 🌾
    [ Steady & Reliable ]
      `,
      quick: `
    ⚡ Quick Task ⚡
    [ 5-minute Sprint ]
      `,
      wild: `
    🦅 WILD MODE 🦅
    [ Autonomous Chaos ]
      `
    };

    return modeArt[mode] || modeArt.standard;
  }

  /**
   * Create a farm field visualization
   */
  static createField(agents: number): string {
    const rows = Math.ceil(agents / 3);
    let field = chalk.green('\n  🌱 Your Digital Farm Field 🌱\n');
    field += chalk.gray('  ┌─────────────────────┐\n');

    for (let row = 0; row < rows; row++) {
      field += chalk.gray('  │ ');
      for (let col = 0; col < 3; col++) {
        const agentIndex = row * 3 + col;
        if (agentIndex < agents) {
          field += `🤖 `;
        } else {
          field += '   ';
        }
      }
      field += chalk.gray('     │\n');
    }

    field += chalk.gray('  └─────────────────────┘\n');
    field += chalk.yellow(`     ${agents} agents working\n`);

    return field;
  }

  /**
   * Get harvest celebration art
   */
  static getHarvestCelebration(): string {
    return `
    🎉 HARVEST COMPLETE! 🎉

         🌾🌾🌾
        🧺🧺🧺🧺
       💰💰💰💰💰

    Your digital crops are ready!
    `;
  }

  /**
   * Create agent status indicators
   */
  static getAgentStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      idle: '😴',
      working: '🔨',
      thinking: '🤔',
      writing: '✍️',
      debugging: '🐛',
      completed: '✅',
      failed: '❌',
      harvesting: '🧺'
    };

    return icons[status] || '❓';
  }

  /**
   * Get time-based greeting art
   */
  static getTimeBasedGreeting(): string {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return chalk.yellow('☀️ Good morning, farmer! Time to tend the fields!');
    } else if (hour >= 12 && hour < 17) {
      return chalk.blue('🌞 Good afternoon! The crops are growing nicely!');
    } else if (hour >= 17 && hour < 21) {
      return chalk.yellow('🌅 Good evening! Almost time to rest the tractors!');
    } else {
      return chalk.magenta('🌙 Working late, farmer? The moonlight helps the code grow!');
    }
  }

  /**
   * Create a simple loading animation frames
   */
  static getLoadingFrames(): string[] {
    return [
      '🚜     ',
      ' 🚜    ',
      '  🚜   ',
      '   🚜  ',
      '    🚜 ',
      '     🚜',
      '    🚜 ',
      '   🚜  ',
      '  🚜   ',
      ' 🚜    '
    ];
  }
}

export default FarmArt;