/**
 * Theme Commands - Manage CLI visual themes
 *
 * Allows users to customize the CLI appearance with themes
 * matching the UI dashboard for a consistent experience
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import boxen from 'boxen';
import figlet from 'figlet';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import axios from 'axios';
import {
  getTheme,
  getThemeNames,
  allThemes,
  DEFAULT_THEME,
  type CLITheme,
  createThemedBox,
  createProgressBar,
  formatAgentMessage,
  createStatusBadge,
} from '../utils/themes.js';

const figletAsync = promisify(figlet);

export class ThemeCommands {
  private configPath: string;
  private currentTheme: string;
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.configPath = path.join(os.homedir(), '.maifarm', 'cli-theme.json');
    this.currentTheme = DEFAULT_THEME;
    this.apiUrl = apiUrl || process.env.MAIFARM_API_URL || 'http://localhost:4567';
  }

  /**
   * Initialize and load saved theme
   */
  async initialize() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Try to load from API first (user preferences)
      try {
        const response = await axios.get(`${this.apiUrl}/api/user-preferences/cliTheme`, {
          headers: {
            'x-bypass-auth': 'cli-access'
          }
        });

        if (response.data.success && response.data.value) {
          this.currentTheme = response.data.value;
          return;
        }
      } catch (apiError) {
        // API not available or no preference set, fall back to local config
      }

      // Fall back to local config
      try {
        const config = await fs.readFile(this.configPath, 'utf-8');
        const data = JSON.parse(config);
        this.currentTheme = data.theme || DEFAULT_THEME;
      } catch {
        // No saved theme, use default
        await this.saveTheme(DEFAULT_THEME);
      }
    } catch (error) {
      console.error(chalk.red('Failed to initialize theme system:'), error);
    }
  }

  /**
   * Save theme preference (both locally and to API)
   */
  private async saveTheme(themeName: string) {
    try {
      // Save to local config
      await fs.writeFile(
        this.configPath,
        JSON.stringify({ theme: themeName, savedAt: new Date().toISOString() }, null, 2)
      );
      this.currentTheme = themeName;

      // Try to sync with API (user preferences)
      try {
        await axios.post(
          `${this.apiUrl}/api/user-preferences/cliTheme`,
          { value: themeName },
          {
            headers: {
              'x-bypass-auth': 'cli-access'
            }
          }
        );
      } catch (apiError) {
        // API sync failed, but local save succeeded
        // This is okay - will sync next time API is available
      }
    } catch (error) {
      console.error(chalk.red('Failed to save theme:'), error);
    }
  }

  /**
   * List all available themes with previews
   */
  async listThemes() {
    const theme = getTheme(this.currentTheme);
    console.log('\n');

    // ASCII art header
    const title = await figletAsync('MaiFarm Themes');
    console.log(theme.colors.primary(title));
    console.log(theme.colors.muted('═'.repeat(70)));
    console.log('\n');

    const themeNames = getThemeNames();

    // Create themed table
    const table = new Table({
      head: [
        theme.colors.accent.bold('Theme'),
        theme.colors.accent.bold('Description'),
        theme.colors.accent.bold('Preview'),
        theme.colors.accent.bold('Status'),
      ],
      colWidths: [20, 35, 20, 15],
      style: {
        head: [],
        border: [],
      },
      chars: {
        top: theme.colors.primary('═'),
        'top-mid': theme.colors.primary('╤'),
        'top-left': theme.colors.primary('╔'),
        'top-right': theme.colors.primary('╗'),
        bottom: theme.colors.primary('═'),
        'bottom-mid': theme.colors.primary('╧'),
        'bottom-left': theme.colors.primary('╚'),
        'bottom-right': theme.colors.primary('╝'),
        left: theme.colors.primary('║'),
        'left-mid': theme.colors.primary('╟'),
        mid: theme.colors.primary('─'),
        'mid-mid': theme.colors.primary('┼'),
        right: theme.colors.primary('║'),
        'right-mid': theme.colors.primary('╢'),
        middle: theme.colors.primary('│'),
      },
    });

    for (const name of themeNames) {
      const t = allThemes[name];
      const isCurrent = name === this.currentTheme;

      const themeName = isCurrent
        ? t.colors.accent.bold(`${t.emoji} ${t.name}`)
        : chalk.white(`${t.emoji} ${t.name}`);

      const description = isCurrent
        ? t.colors.text(t.description)
        : chalk.gray(t.description);

      const preview = [
        t.colors.primary('■'),
        t.colors.secondary('■'),
        t.colors.accent('■'),
        t.colors.success('✓'),
        t.colors.error('✗'),
      ].join(' ');

      const status = isCurrent
        ? theme.colors.success.bold('● ACTIVE')
        : chalk.gray('○ Available');

      table.push([themeName, description, preview, status]);
    }

    console.log(table.toString());
    console.log('\n');

    // Usage instructions
    const instructions = createThemedBox(
      'Theme Commands',
      `farm theme set <name>      # Set active theme
farm theme preview <name>   # Preview theme
farm theme current          # Show current theme
farm theme demo             # Interactive demo`,
      this.currentTheme
    );

    console.log(instructions);
    console.log('\n');
  }

  /**
   * Set active theme
   */
  async setTheme(themeName: string) {
    const themeNames = getThemeNames();

    if (!themeNames.includes(themeName)) {
      console.log(chalk.red(`\n❌ Unknown theme: ${themeName}`));
      console.log(chalk.yellow(`\nAvailable themes: ${themeNames.join(', ')}`));
      console.log(chalk.gray(`\nRun 'farm theme list' to see all themes\n`));
      return;
    }

    const spinner = ora({
      text: `Applying ${themeName} theme...`,
      spinner: 'dots',
    }).start();

    // Simulate theme application
    await new Promise(resolve => setTimeout(resolve, 500));

    await this.saveTheme(themeName);
    spinner.succeed();

    const theme = getTheme(themeName);
    console.log('\n');
    console.log(
      boxen(
        `${theme.emoji} ${theme.colors.primary.bold(theme.name)} theme activated!\n\n` +
        theme.colors.text(theme.description),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );

    // Show preview
    await this.previewTheme(themeName, true);
  }

  /**
   * Preview theme without setting
   */
  async previewTheme(themeName: string, skipHeader: boolean = false) {
    const themeNames = getThemeNames();

    if (!themeNames.includes(themeName)) {
      console.log(chalk.red(`\n❌ Unknown theme: ${themeName}\n`));
      return;
    }

    const theme = getTheme(themeName);

    if (!skipHeader) {
      console.log('\n');
      console.log(theme.colors.primary.bold(`═══ ${theme.emoji} ${theme.name} Theme Preview ═══`));
      console.log(theme.colors.muted(theme.description));
      console.log('\n');
    }

    // Color palette preview
    console.log(theme.colors.accent.bold('Color Palette:'));
    console.log(
      `  ${theme.colors.primary('■')} Primary   ` +
      `${theme.colors.secondary('■')} Secondary   ` +
      `${theme.colors.accent('■')} Accent   ` +
      `${theme.colors.success('■')} Success   ` +
      `${theme.colors.warning('■')} Warning   ` +
      `${theme.colors.error('■')} Error   ` +
      `${theme.colors.info('■')} Info`
    );
    console.log('\n');

    // Status badges preview
    console.log(theme.colors.accent.bold('Status Badges:'));
    console.log(
      `  ${createStatusBadge('success', 'SUCCESS', themeName)}  ` +
      `${createStatusBadge('warning', 'WARNING', themeName)}  ` +
      `${createStatusBadge('error', 'ERROR', themeName)}  ` +
      `${createStatusBadge('info', 'INFO', themeName)}`
    );
    console.log('\n');

    // Agent messaging preview
    console.log(theme.colors.accent.bold('Agent Messages:'));
    for (let i = 0; i < 4; i++) {
      const agentNames = ['Bessie the Cow', 'Wilbur the Pig', 'Clucky the Chicken', 'Woolly the Sheep'];
      const messages = [
        'Starting task execution...',
        'Analyzing codebase structure',
        'Generating optimization suggestions',
        'Task completed successfully!',
      ];
      console.log(`  ${formatAgentMessage(i, agentNames[i], messages[i], themeName)}`);
    }
    console.log('\n');

    // Progress bar preview
    console.log(theme.colors.accent.bold('Progress Indicators:'));
    console.log(`  ${createProgressBar(25, 100, 'Farm Launch', themeName)}`);
    console.log(`  ${createProgressBar(75, 100, 'Harvest Collection', themeName)}`);
    console.log(`  ${createProgressBar(100, 100, 'Analysis Complete', themeName)}`);
    console.log('\n');

    // Boxed content preview
    const boxContent = theme.colors.text(
      `Farm Name: Production Build\n` +
      `Agents: 5 active workers\n` +
      `Status: ${theme.colors.success('Running')} \n` +
      `Uptime: 2h 34m 15s`
    );
    console.log(createThemedBox('Farm Status', boxContent, themeName));
    console.log('\n');
  }

  /**
   * Show current active theme
   */
  async showCurrent() {
    const theme = getTheme(this.currentTheme);

    console.log('\n');
    console.log(
      boxen(
        `${theme.emoji} Currently using ${theme.colors.primary.bold(theme.name)} theme\n\n` +
        theme.colors.text(theme.description) + '\n\n' +
        theme.colors.muted(`Saved at: ${this.configPath}`),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: 'cyan',
        }
      )
    );

    await this.previewTheme(this.currentTheme, true);
  }

  /**
   * Interactive theme demo
   */
  async demo() {
    console.log('\n');
    const title = await figletAsync('Theme Demo');
    console.log(chalk.cyan(title));
    console.log(chalk.gray('═'.repeat(70)));
    console.log('\n');

    const { selectedTheme } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedTheme',
        message: 'Select a theme to preview:',
        choices: getThemeNames().map(name => {
          const t = allThemes[name];
          return {
            name: `${t.emoji} ${t.name} - ${t.description}`,
            value: name,
          };
        }),
      },
    ]);

    await this.previewTheme(selectedTheme);

    const { shouldSet } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldSet',
        message: `Do you want to set ${allThemes[selectedTheme].name} as your active theme?`,
        default: false,
      },
    ]);

    if (shouldSet) {
      await this.setTheme(selectedTheme);
    } else {
      console.log(chalk.yellow('\n👍 Theme not changed. Run "farm theme set" to change themes.\n'));
    }
  }

  /**
   * Reset to default theme
   */
  async reset() {
    const spinner = ora('Resetting to default theme...').start();
    await new Promise(resolve => setTimeout(resolve, 300));
    await this.saveTheme(DEFAULT_THEME);
    spinner.succeed();

    const theme = getTheme(DEFAULT_THEME);
    console.log('\n');
    console.log(
      boxen(
        `${theme.emoji} Reset to ${theme.colors.primary.bold(theme.name)} (default theme)`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
    console.log('\n');
  }

  /**
   * Get current theme name for other commands to use
   */
  getCurrentTheme(): string {
    return this.currentTheme;
  }

  /**
   * Get theme colors for other commands
   */
  getColors(): CLITheme['colors'] {
    return getTheme(this.currentTheme).colors;
  }
}

export default ThemeCommands;
