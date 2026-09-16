/**
 * Interactive Mode Helper Functions
 *
 * "Making farming conversational!" 💬
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import axios from 'axios';
import { FarmJokes } from '../utils/farmJokes.js';
import { FarmTips } from '../utils/farmTips.js';
import { AnimalSounds } from '../utils/animalSounds.js';
import { FarmArt } from '../art/farmArt.js';

export class InteractiveHelpers {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Interactive farm creation wizard
   */
  async createFarmWizard() {
    console.log(chalk.green.bold('\n🌱 Farm Creation Wizard 🌱\n'));

    // Step 1: Basic Information
    const { name, description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'What shall we name this farm? 🏷️',
        default: `harvest-${Date.now()}`,
        validate: (input) => {
          if (input.length < 3) return 'Name must be at least 3 characters';
          if (input.length > 50) return 'Name must be less than 50 characters';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Describe your farming goals (optional): 📝',
        default: ''
      }
    ]);

    // Step 2: Choose Mode with descriptions
    console.log(chalk.yellow('\n📋 Farming Modes:\n'));
    console.log(chalk.gray('  Standard: Balanced approach, good for most tasks'));
    console.log(chalk.gray('  Quick: 5-minute sprint, perfect for small fixes'));
    console.log(chalk.gray('  Wild: Autonomous agents, best for exploration\n'));

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Select your farming style: 🎯',
        choices: [
          { name: '🌾 Standard Mode', value: 'standard' },
          { name: '⚡ Quick Mode (5 min)', value: 'quick' },
          { name: '🦅 Wild Mode (autonomous)', value: 'wild' }
        ],
        default: 'standard'
      }
    ]);

    // Step 3: Agent Configuration
    const { agentCount, agentPersonalities } = await inquirer.prompt([
      {
        type: 'number',
        name: 'agentCount',
        message: 'How many agents should work the fields? 👥',
        default: mode === 'quick' ? 2 : 3,
        validate: (input) => {
          if (input < 1) return 'Need at least 1 agent';
          if (input > 10) return 'Maximum 10 agents (system limitation)';
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'agentPersonalities',
        message: 'Give agents unique personalities? 🎭',
        default: true
      }
    ]);

    // Step 4: Task Definition
    console.log(chalk.cyan('\n📋 Define Your Task:\n'));
    const { promptType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'promptType',
        message: 'How would you like to specify the task?',
        choices: [
          { name: '✍️  Type a prompt', value: 'type' },
          { name: '📝 Open editor for detailed prompt', value: 'editor' },
          { name: '📁 Load from template', value: 'template' },
          { name: '🎲 Use example prompt', value: 'example' }
        ]
      }
    ]);

    let prompt = '';
    switch (promptType) {
      case 'type':
        const { typedPrompt } = await inquirer.prompt([
          {
            type: 'input',
            name: 'typedPrompt',
            message: 'What should the agents work on? 🎯'
          }
        ]);
        prompt = typedPrompt;
        break;

      case 'editor':
        const { editorPrompt } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'editorPrompt',
            message: 'Write your detailed prompt (opens editor):'
          }
        ]);
        prompt = editorPrompt;
        break;

      case 'template':
        prompt = await this.selectTemplate();
        break;

      case 'example':
        prompt = await this.selectExample();
        break;
    }

    // Step 5: Advanced Options
    const { showAdvanced } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showAdvanced',
        message: 'Configure advanced options? ⚙️',
        default: false
      }
    ]);

    let advancedOptions: any = {};
    if (showAdvanced) {
      advancedOptions = await inquirer.prompt([
        {
          type: 'number',
          name: 'timeout',
          message: 'Timeout in minutes: ⏰',
          default: mode === 'quick' ? 5 : 60
        },
        {
          type: 'confirm',
          name: 'useXenoSync',
          message: 'Use XenoSync orchestration? 🔄',
          default: false,
          when: () => mode === 'wild'
        },
        {
          type: 'confirm',
          name: 'autoHarvest',
          message: 'Auto-harvest when complete? 🧺',
          default: true
        },
        {
          type: 'confirm',
          name: 'notifications',
          message: 'Enable desktop notifications? 🔔',
          default: false
        }
      ]);
    }

    // Step 6: Confirmation
    console.log(chalk.green('\n📋 Farm Configuration Summary:\n'));
    const summaryTable = new Table({
      style: { head: ['cyan'] }
    });

    summaryTable.push(
      ['Name', name],
      ['Mode', mode],
      ['Agents', agentCount],
      ['Timeout', `${advancedOptions.timeout || (mode === 'quick' ? 5 : 60)} minutes`],
      ['Task', prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')]
    );

    console.log(summaryTable.toString());

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Ready to plant this farm? 🌱',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('🚫 Farm creation cancelled'));
      return null;
    }

    // Create the farm
    const spinner = ora('Planting your farm... 🌱').start();

    try {
      const response = await axios.post(`${this.apiUrl}/api/farms`, {
        name,
        description,
        mode,
        agentCount,
        prompt,
        ...advancedOptions,
        autoLaunch: true
      });

      spinner.succeed(chalk.green('Farm planted successfully! 🎉'));

      AnimalSounds.play('rooster');
      console.log(chalk.magenta(`\n${FarmJokes.getSuccessMessage()}\n`));

      return response.data;

    } catch (error: any) {
      spinner.fail('Failed to plant farm');
      console.error(chalk.red(error.response?.data?.message || error.message));
      console.log(chalk.yellow(`\n${FarmJokes.getErrorJoke()}\n`));
      return null;
    }
  }

  /**
   * Select from prompt templates
   */
  private async selectTemplate(): Promise<string> {
    const templates = [
      {
        name: '🐛 Bug Fix Template',
        value: 'Find and fix the bug causing [DESCRIBE ISSUE]. Review the codebase, identify the root cause, and implement a fix with tests.'
      },
      {
        name: '✨ Feature Implementation',
        value: 'Implement a new feature that [DESCRIBE FEATURE]. Include proper error handling, tests, and documentation.'
      },
      {
        name: '♻️  Refactoring Template',
        value: 'Refactor [COMPONENT/MODULE] to improve [performance/readability/maintainability]. Ensure all tests still pass.'
      },
      {
        name: '📚 Documentation Template',
        value: 'Create comprehensive documentation for [PROJECT/FEATURE] including API docs, usage examples, and troubleshooting guide.'
      },
      {
        name: '🧪 Test Suite Template',
        value: 'Write comprehensive tests for [MODULE/FEATURE] including unit tests, integration tests, and edge cases.'
      }
    ];

    const { template } = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Choose a template:',
        choices: templates
      }
    ]);

    // Allow customization
    const { customized } = await inquirer.prompt([
      {
        type: 'editor',
        name: 'customized',
        message: 'Customize the template:',
        default: template
      }
    ]);

    return customized;
  }

  /**
   * Select example prompts
   */
  private async selectExample(): Promise<string> {
    const examples = [
      'Create a REST API with CRUD operations for a todo list application',
      'Build a React component for user authentication with JWT',
      'Implement a caching layer using Redis for improved performance',
      'Create a CI/CD pipeline with GitHub Actions',
      'Write a web scraper for extracting product information',
      'Build a real-time chat application using WebSockets',
      'Implement data validation and error handling for a form',
      'Create a responsive landing page with modern CSS',
      'Build a CLI tool for file management operations',
      'Implement user role-based access control system'
    ];

    const { example } = await inquirer.prompt([
      {
        type: 'list',
        name: 'example',
        message: 'Choose an example:',
        choices: examples.map(e => ({
          name: e,
          value: e
        }))
      }
    ]);

    return example;
  }

  /**
   * Interactive harvest wizard
   */
  async harvestWizard(farmId?: string) {
    console.log(chalk.green.bold('\n🌾 Harvest Wizard 🌾\n'));

    // Get farm ID if not provided
    if (!farmId) {
      const farms = await this.getActiveFarms();
      if (farms.length === 0) {
        console.log(chalk.yellow('No active farms to harvest!'));
        return null;
      }

      const { selectedFarm } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFarm',
          message: 'Which farm would you like to harvest?',
          choices: farms.map(f => ({
            name: `${f.name} (${f.status}) - ${f.agentCount} agents`,
            value: f.id
          }))
        }
      ]);

      farmId = selectedFarm;
    }

    // Ensure farmId is defined
    if (!farmId) {
      console.log(chalk.red('✗ No farm selected'));
      return null;
    }

    // Harvest options
    const { action, outputPath, preview } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🧺 Harvest now', value: 'harvest' },
          { name: '👀 Preview harvest', value: 'preview' },
          { name: '📊 Check harvest status', value: 'status' },
          { name: '🗑️  Discard harvest', value: 'discard' }
        ]
      },
      {
        type: 'input',
        name: 'outputPath',
        message: 'Where should we store the harvest?',
        default: `./harvests/farm-${Date.now()}`,
        when: (answers) => answers.action === 'harvest'
      },
      {
        type: 'confirm',
        name: 'preview',
        message: 'Preview files before harvesting?',
        default: true,
        when: (answers) => answers.action === 'harvest'
      }
    ]);

    switch (action) {
      case 'preview':
        await this.previewHarvest(farmId);
        break;

      case 'harvest':
        if (preview) {
          await this.previewHarvest(farmId);
        }
        await this.executeHarvest(farmId, outputPath);
        break;

      case 'status':
        await this.checkHarvestStatus(farmId);
        break;

      case 'discard':
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: chalk.red('Are you sure you want to discard this harvest?'),
            default: false
          }
        ]);

        if (confirm) {
          console.log(chalk.yellow('Harvest discarded'));
        }
        break;
    }

    return farmId;
  }

  /**
   * Get list of active farms
   */
  private async getActiveFarms(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/farms`, {
        params: { status: 'running' }
      });
      return response.data.farms || response.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Preview harvest contents
   */
  private async previewHarvest(farmId: string) {
    const spinner = ora('Loading harvest preview...').start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/harvests/${farmId}/preview`);
      spinner.stop();

      const preview = response.data;
      console.log(chalk.green('\n🌾 Harvest Preview:\n'));
      console.log(preview);

    } catch (error: any) {
      spinner.fail('Failed to preview harvest');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Execute harvest
   */
  private async executeHarvest(farmId: string, outputPath: string) {
    const spinner = ora('Harvesting crops... 🧺').start();

    try {
      const response = await axios.post(`${this.apiUrl}/api/farms/${farmId}/harvest`, {
        outputPath
      });

      spinner.succeed('Harvest complete! 🎉');

      const harvest = response.data;
      console.log(chalk.green(`\nHarvest ID: ${harvest.id}`));
      console.log(chalk.green(`Files: ${harvest.fileCount}`));
      console.log(chalk.green(`Size: ${(harvest.totalBytes / 1024 / 1024).toFixed(2)} MB`));

      AnimalSounds.play('chicken');
      console.log(chalk.magenta(`\n${FarmJokes.getHarvestJoke()}\n`));

    } catch (error: any) {
      spinner.fail('Failed to harvest');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Check harvest status
   */
  private async checkHarvestStatus(farmId: string) {
    const spinner = ora('Checking harvest status...').start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/farms/${farmId}/harvest-status`);
      spinner.stop();

      const status = response.data;
      console.log(chalk.green('\n📊 Harvest Status:\n'));
      console.log(status);

    } catch (error: any) {
      spinner.fail('Failed to check status');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }
}

export default InteractiveHelpers;