/**
 * Easter Eggs - Hidden CLI Features
 *
 * "Shhh... these are secret!" 🤫
 */

import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class EasterEggs {
  private static fartSounds: string[] = [
    'PFFFFFFFFFRRRRRTTTTTT! 💨',
    'BRRRAAAAAPPPPPP! 💨',
    'THHHHPPPPBBBBTTT! 💨',
    '*PFFT-PFFT-PFFTFTFTFT* 💨',
    'PPPPRRRRRRPPPPP! 💨',
    'FFFRRRRRAAAAPPPP! 💨',
    'BRAAAAAAAPPPPP! 💨',
    '*Trumpet Noise* 🎺💨',
    'POOT! 💨 (The silent-but-deadly type)',
    'BBBBRRRRRRTTTTTT! 💨 (Machine gun style)'
  ];

  /**
   * The fart command - plays audio and shows text
   */
  static async fart(): Promise<void> {
    // Pick a random fart sound text
    const soundText = this.fartSounds[Math.floor(Math.random() * this.fartSounds.length)];

    console.log('\n' + chalk.yellow.bold('🌬️  Did someone step on a duck? 🌬️\n'));

    // Animated fart with color
    console.log(chalk.green.bold(soundText));

    // Try to play actual audio (cross-platform)
    await this.playFartAudio().catch(() => {
      // Fallback to visual representation if audio fails
      console.log(chalk.gray('\n(Audio unavailable, but you get the idea... 👃)'));
    });

    // Random embarrassing messages
    const messages = [
      chalk.magenta('\n"Whoops! Someone confused \'farm\' with \'fart\'!" 🙈'),
      chalk.magenta('\n"That wasn\'t the kind of \'release\' we meant..." 😅'),
      chalk.magenta('\n"Even AI agents need to let one rip sometimes! 💨"'),
      chalk.magenta('\n"Your terminal now smells funny. Thanks." 🤢'),
      chalk.magenta('\n"Plot twist: This was a feature request from QA!" 🎭'),
      chalk.magenta('\n"Achievement Unlocked: Discovered the Secret Command! 🏆"')
    ];

    console.log(messages[Math.floor(Math.random() * messages.length)]);
    console.log(''); // Empty line for spacing
  }

  /**
   * Play actual fart audio (cross-platform)
   */
  private static async playFartAudio(): Promise<void> {
    const platform = process.platform;

    // Soundboard of different fart sound techniques
    try {
      if (platform === 'darwin') {
        // macOS: Use text-to-speech with various voices for realistic organic fart sounds
        // Different voices and speech rates create natural flatulence variety
        const fartSounds = [
          // 1. The Classic Wet Rumbler - Low pitched bubbling
          async () => {
            await execAsync('say -v "Zarvox" -r 80 "brrrrrrruuuuuuubbbbblllleeee pppppfffffffft"');
          },

          // 2. The Squeaky Cheek Flapper - High pitched rapid fire
          async () => {
            await execAsync('say -v "Bad News" -r 220 "pfft pfft pfft thhhbbbbbt"');
          },

          // 3. The Thunder Clapper - Deep bass rumble
          async () => {
            await execAsync('say -v "Ralph" -r 60 "brrrrrrrrraaaaaaaaaapppppppppp"');
          },

          // 4. The Stuttering Duck - Rapid vibrations
          async () => {
            await execAsync('say -v "Bubbles" -r 180 "puh-puh-puh-puh-prrrrrrrrrt"');
          },

          // 5. The Reverberating Tuba - Long sustained note
          async () => {
            await execAsync('say -v "Zarvox" -r 70 "bbbbbbbrrrrrrrrrrrrrrrrraaaaaaaaaapppppppp"');
          },

          // 6. The Wet Splatter - Squishy and messy
          async () => {
            await execAsync('say -v "Trinoids" -r 140 "pllllbbbbtttt splosh plop"');
          },

          // 7. The Descending Trombone - Musical pitch drop
          async () => {
            await execAsync('say -v "Cellos" -r 90 "bwoooooorrrrrrrrpppppp"');
          },

          // 8. The Machine Gun - Rapid staccato blasts
          async () => {
            await execAsync('say -v "Bubbles" -r 200 "pft pft pft pft brap brap brap"');
          },

          // 9. The Silent But Deadly Hiss - Quiet and sinister
          async () => {
            await execAsync('say -v "Whisper" -r 120 "ffffffffffssssssssssss"');
          },

          // 10. The Ultimate Brown Note - The legendary destroyer
          async () => {
            execAsync('say -v "Ralph" -r 50 "bbbbbbbb" &');
            await new Promise(resolve => setTimeout(resolve, 300));
            execAsync('say -v "Zarvox" -r 70 "rrrrrrrrrrr" &');
            await new Promise(resolve => setTimeout(resolve, 400));
            await execAsync('say -v "Trinoids" -r 150 "aaaaaaapppppppppp plop"');
          },
        ];

        // Randomly select a fart sound from the soundboard
        const selectedSound = fartSounds[Math.floor(Math.random() * fartSounds.length)];
        await selectedSound();

      } else if (platform === 'linux') {
        // Linux: Use beep or speaker-test for sound effect
        try {
          // Try descending frequency sweep for fart-like sound
          await execAsync('beep -f 500 -l 150 && beep -f 400 -l 150 && beep -f 300 -l 200 && beep -f 200 -l 250');
        } catch {
          try {
            await execAsync('speaker-test -t sine -f 200 -l 1');
          } catch {
            // Fallback to system beep
            await execAsync('echo -e "\\a"');
          }
        }
      } else if (platform === 'win32') {
        // Windows: Use PowerShell to play descending beeps with more variety
        try {
          await execAsync('powershell -c "[console]::beep(500,150); [console]::beep(400,150); [console]::beep(300,200); [console]::beep(200,250)"');
        } catch {
          // Silent fail on Windows if audio not available
        }
      }
    } catch {
      // Silent fail - audio is optional
    }
  }

  /**
   * Check if user might have meant "farm" instead of "fart"
   */
  static isFartTypo(input: string): boolean {
    return input.toLowerCase() === 'fart';
  }

  /**
   * Other Easter eggs can go here...
   */
  static async konami(): Promise<void> {
    console.log(chalk.magenta.bold('\n🎮 ↑ ↑ ↓ ↓ ← → ← → B A START 🎮\n'));
    console.log(chalk.green.bold('30 Extra Lives Granted! 🎉'));
    console.log(chalk.gray('(Just kidding, this is a CLI tool, not Contra)\n'));
  }

  /**
   * Show all hidden Easter eggs (meta Easter egg)
   */
  static showSecrets(): void {
    console.log(chalk.yellow.bold('\n🤫 Secret Commands Unlocked! 🤫\n'));
    console.log(chalk.cyan('Hidden commands you discovered:'));
    console.log(chalk.gray('  • fart - You know what this does... 💨'));
    console.log(chalk.gray('  • konami - Classic cheat code 🎮'));
    console.log(chalk.gray('  • secrets - This command! 🎭\n'));
    console.log(chalk.magenta('There might be more... keep exploring! 🔍\n'));
  }
}

export default EasterEggs;
