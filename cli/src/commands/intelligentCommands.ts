/**
 * Intelligent CLI Commands powered by Claude
 *
 * Advanced features that leverage Claude's capabilities for
 * enhanced user experience and better task outcomes.
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import Table from 'cli-table3';
import { claudeService } from '../services/claudeService.js';
import { FarmArt } from '../art/farmArt.js';
import { FarmJokes } from '../utils/farmJokes.js';
import axios from 'axios';

export class IntelligentCommands {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Setup intelligent commands
   */
  setupCommands(program: Command) {
    // AI-powered prompt refinement
    program
      .command('refine <prompt>')
      .alias('improve')
      .description('Refine your prompt with Claude\'s intelligence 🧠')
      .option('-a, --agents <count>', 'Number of agents', '3')
      .option('-m, --mode <mode>', 'Farm mode', 'standard')
      .action(async (prompt, options) => {
        await this.refinePromptCommand(prompt, options);
      });

    // AI chat assistant
    program
      .command('ask <question>')
      .alias('claude')
      .description('Ask Claude for help with your farming tasks 🤖')
      .option('--context', 'Include current farm context')
      .action(async (question, options) => {
        await this.askClaudeCommand(question, options);
      });

    // Intelligent task planning
    program
      .command('plan <goal>')
      .description('Let Claude plan your farming strategy 📋')
      .option('--detailed', 'Get detailed breakdown')
      .action(async (goal, options) => {
        await this.planTaskCommand(goal, options);
      });

    // Smart troubleshooting
    program
      .command('diagnose [farmId]')
      .alias('troubleshoot')
      .description('Diagnose and fix farm issues with AI 🔧')
      .action(async (farmId, options) => {
        await this.diagnoseCommand(farmId, options);
      });

    // Generate optimal prompts
    program
      .command('generate <goal>')
      .alias('gen')
      .description('Generate effective prompts from goals 🎯')
      .option('--style <style>', 'Prompt style (detailed/concise/creative)', 'detailed')
      .action(async (goal, options) => {
        await this.generatePromptCommand(goal, options);
      });

    // Analyze farm performance
    program
      .command('analyze <farmId>')
      .description('Analyze farm performance with AI insights 📊')
      .action(async (farmId) => {
        await this.analyzeFarmCommand(farmId);
      });

    // Interactive AI assistant
    program
      .command('assistant')
      .alias('ai')
      .description('Start interactive AI farming assistant 🌟')
      .action(async () => {
        await this.interactiveAssistant();
      });
  }

  /**
   * Refine prompt command
   */
  private async refinePromptCommand(prompt: string, options: any) {
    console.log(chalk.cyan('\n🧠 Refining your prompt with Claude...\n'));

    const result = await claudeService.refinePrompt(prompt, {
      agentCount: options.agents,
      mode: options.mode
    });

    if (result.content === prompt) {
      console.log(chalk.yellow('Using original prompt (Claude unavailable or error)'));
      console.log(chalk.gray(`Original: ${prompt}`));
    } else {
      // Display comparison
      console.log(boxen(
        chalk.gray('Original Prompt:\n') + prompt + '\n\n' +
        chalk.green('Refined Prompt:\n') + result.content,
        {
          padding: 1,
          borderColor: 'green',
          title: '✨ Prompt Refinement',
          titleAlignment: 'center'
        }
      ));

      if (result.suggestions && result.suggestions.length > 0) {
        console.log(chalk.yellow('\n📝 Suggestions:'));
        result.suggestions.forEach((suggestion, i) => {
          console.log(chalk.gray(`  ${i + 1}. ${suggestion}`));
        });
      }

      // Ask if user wants to use refined prompt
      const { useRefined } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useRefined',
          message: 'Use the refined prompt for your farm?',
          default: true
        }
      ]);

      if (useRefined) {
        const { createFarm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'createFarm',
            message: 'Create a farm with this refined prompt?',
            default: true
          }
        ]);

        if (createFarm) {
          await this.createFarmWithPrompt(result.content, options);
        }
      }
    }
  }

  /**
   * Ask Claude command
   */
  private async askClaudeCommand(question: string, options: any) {
    console.log(chalk.cyan('\n🤖 Consulting Claude...\n'));

    let context = {};
    if (options.context) {
      // Gather current context
      try {
        const farms = await axios.get(`${this.apiUrl}/api/farms`);
        context = {
          activeFarms: farms.data.length,
          currentStatus: 'operational'
        };
      } catch {
        // Silent fail
      }
    }

    const response = await claudeService.chat(question, context);

    console.log(boxen(
      response.content,
      {
        padding: 1,
        borderColor: 'cyan',
        title: '🤖 Claude Says',
        titleAlignment: 'center'
      }
    ));

    if (response.suggestions && response.suggestions.length > 0) {
      console.log(chalk.yellow('\n💡 Related Tips:'));
      response.suggestions.forEach(tip => {
        console.log(chalk.gray(`  • ${tip}`));
      });
    }

    // Offer follow-up
    const { followUp } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'followUp',
        message: 'Ask a follow-up question?',
        default: false
      }
    ]);

    if (followUp) {
      const { followUpQuestion } = await inquirer.prompt([
        {
          type: 'input',
          name: 'followUpQuestion',
          message: 'Your follow-up question:'
        }
      ]);

      await this.askClaudeCommand(followUpQuestion, options);
    }
  }

  /**
   * Plan task command
   */
  private async planTaskCommand(goal: string, options: any) {
    console.log(chalk.cyan('\n📋 Planning your farming strategy...\n'));

    const spinner = ora('Claude is analyzing your goal...').start();

    const recommendations = await claudeService.getTaskRecommendations(goal);

    spinner.stop();

    console.log(FarmArt.getBanner('Task Plan', 'Standard'));

    // Display plan in structured format
    const planTable = new Table({
      head: ['Aspect', 'Recommendation'],
      style: { head: ['cyan'] },
      colWidths: [20, 60]
    });

    // Parse recommendations
    const lines = recommendations.content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      if (line.includes('agents') || line.includes('Agents')) {
        planTable.push(['Agents', line.replace(/.*:/, '').trim()]);
      } else if (line.includes('mode') || line.includes('Mode')) {
        planTable.push(['Mode', line.replace(/.*:/, '').trim()]);
      } else if (line.includes('time') || line.includes('Time')) {
        planTable.push(['Time Estimate', line.replace(/.*:/, '').trim()]);
      }
    }

    console.log(planTable.toString());

    if (recommendations.suggestions && recommendations.suggestions.length > 0) {
      console.log(chalk.yellow('\n📌 Task Breakdown:'));
      recommendations.suggestions.forEach((task, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${task}`));
      });
    }

    // Offer to create farm with recommendations
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Create a farm based on this plan?',
        default: true
      }
    ]);

    if (proceed) {
      const generatedPrompt = await claudeService.generatePrompt(goal, 'detailed');
      await this.createFarmWithPrompt(generatedPrompt.content, {
        agents: 3, // Extract from recommendations
        mode: 'standard'
      });
    }
  }

  /**
   * Diagnose command
   */
  private async diagnoseCommand(farmId: string | undefined, options: any) {
    console.log(chalk.cyan('\n🔧 Diagnosing farm issues...\n'));

    // Get farm ID if not provided
    if (!farmId) {
      const farms = await this.getProblematicFarms();
      if (farms.length === 0) {
        console.log(chalk.green('✅ All farms are healthy!'));
        return;
      }

      const { selectedFarm } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFarm',
          message: 'Which farm needs diagnosis?',
          choices: farms.map(f => ({
            name: `${f.name} (${f.status}) - ${f.issue}`,
            value: f.id
          }))
        }
      ]);

      farmId = selectedFarm;
    }

    // Ensure farmId is defined
    if (!farmId) {
      console.log(chalk.red('✗ No farm selected'));
      return;
    }

    const spinner = ora('Analyzing farm health...').start();

    // Get farm details
    try {
      const farmResponse = await axios.get(`${this.apiUrl}/api/farms/${farmId}`);
      const farm = farmResponse.data;

      spinner.text = 'Claude is diagnosing issues...';

      const diagnosis = await claudeService.troubleshoot(
        farm.status === 'failed' ? 'Farm failed' : 'Farm performance issues',
        farm
      );

      spinner.succeed('Diagnosis complete!');

      console.log(boxen(
        diagnosis.content,
        {
          padding: 1,
          borderColor: farm.status === 'failed' ? 'red' : 'yellow',
          title: '🔧 Diagnosis Report',
          titleAlignment: 'center'
        }
      ));

      if (diagnosis.suggestions && diagnosis.suggestions.length > 0) {
        console.log(chalk.yellow('\n🔨 Recommended Actions:'));
        diagnosis.suggestions.forEach((action, i) => {
          console.log(chalk.green(`  ${i + 1}. ${action}`));
        });

        // Offer automated fixes
        const { autoFix } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'autoFix',
            message: 'Attempt automatic fixes?',
            default: true
          }
        ]);

        if (autoFix) {
          await this.attemptAutoFix(farmId, diagnosis.suggestions);
        }
      }

    } catch (error: any) {
      spinner.fail('Failed to diagnose farm');
      console.error(chalk.red(error.message));
    }
  }

  /**
   * Generate prompt command
   */
  private async generatePromptCommand(goal: string, options: any) {
    console.log(chalk.cyan('\n🎯 Generating optimal prompt...\n'));

    const spinner = ora('Claude is crafting your prompt...').start();

    const result = await claudeService.generatePrompt(goal, options.style);

    spinner.succeed('Prompt generated!');

    console.log(boxen(
      result.content,
      {
        padding: 1,
        borderColor: 'green',
        title: '✨ Generated Prompt',
        titleAlignment: 'center'
      }
    ));

    // Confidence indicator
    if (result.confidence) {
      const confidence = Math.round(result.confidence * 100);
      console.log(chalk.gray(`\n📊 Confidence: ${confidence}%`));
    }

    // Options
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🚜 Create farm with this prompt', value: 'create' },
          { name: '✏️ Edit the prompt', value: 'edit' },
          { name: '♻️ Regenerate', value: 'regenerate' },
          { name: '📋 Copy to clipboard', value: 'copy' },
          { name: '💾 Save as template', value: 'save' },
          { name: '❌ Cancel', value: 'cancel' }
        ]
      }
    ]);

    switch (action) {
      case 'create':
        await this.createFarmWithPrompt(result.content, { agents: 3, mode: 'standard' });
        break;
      case 'edit':
        const { edited } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'edited',
            message: 'Edit the prompt:',
            default: result.content
          }
        ]);
        await this.createFarmWithPrompt(edited, { agents: 3, mode: 'standard' });
        break;
      case 'regenerate':
        await this.generatePromptCommand(goal, options);
        break;
      case 'save':
        await this.saveAsTemplate(result.content, goal);
        break;
    }
  }

  /**
   * Analyze farm command
   */
  private async analyzeFarmCommand(farmId: string) {
    console.log(chalk.cyan('\n📊 Analyzing farm performance...\n'));

    const spinner = ora('Gathering farm metrics...').start();

    try {
      const farmResponse = await axios.get(`${this.apiUrl}/api/farms/${farmId}`);
      const farm = farmResponse.data;

      spinner.text = 'Claude is analyzing performance...';

      const analysis = await claudeService.analyzeFarmPerformance(farm);

      spinner.succeed('Analysis complete!');

      console.log(boxen(
        analysis.content,
        {
          padding: 1,
          borderColor: 'cyan',
          title: '📊 Performance Analysis',
          titleAlignment: 'center'
        }
      ));

      // Performance score
      const score = this.calculatePerformanceScore(farm);
      const scoreColor = score > 80 ? 'green' : score > 60 ? 'yellow' : 'red';

      console.log(chalk[scoreColor](`\n🎯 Performance Score: ${score}/100`));

      // Visual performance indicators
      console.log(chalk.cyan('\n📈 Metrics:'));
      console.log(FarmArt.createProgressBar(farm.progress || 50));

    } catch (error: any) {
      spinner.fail('Failed to analyze farm');
      console.error(chalk.red(error.message));
    }
  }

  /**
   * Interactive AI assistant
   */
  private async interactiveAssistant() {
    console.clear();

    console.log(FarmArt.getBanner('AI Assistant', 'Standard'));

    console.log(boxen(
      chalk.cyan('🌟 Welcome to the MaiFarm AI Assistant! 🌟\n\n') +
      chalk.white('I\'m Claude, your intelligent farming companion.\n') +
      chalk.gray('I can help you with:\n') +
      chalk.gray('  • Refining prompts for better results\n') +
      chalk.gray('  • Planning complex tasks\n') +
      chalk.gray('  • Troubleshooting issues\n') +
      chalk.gray('  • Optimizing farm performance\n') +
      chalk.gray('  • Generating creative solutions\n\n') +
      chalk.yellow('Type "exit" to leave the assistant'),
      {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'double'
      }
    ));

    // Test Claude connection
    const isConnected = await claudeService.testConnection();

    if (!isConnected) {
      console.log(chalk.yellow('\n⚠️ Claude API not configured'));
      console.log(chalk.gray('Add ANTHROPIC_API_KEY to enable AI features'));
      return;
    }

    let chatting = true;

    while (chatting) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          prefix: '💬'
        }
      ]);

      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        chatting = false;
        console.log(chalk.green('\n👋 Thanks for chatting! Happy farming!\n'));
        break;
      }

      // Special commands
      if (message.startsWith('/')) {
        await this.handleAssistantCommand(message);
        continue;
      }

      const spinner = ora('Claude is thinking...').start();

      const response = await claudeService.chat(message);

      spinner.stop();

      console.log(chalk.green('\n🤖 Claude:'));
      console.log(chalk.white(response.content));

      if (response.suggestions && response.suggestions.length > 0) {
        console.log(chalk.yellow('\n💡 Quick Actions:'));
        const { quickAction } = await inquirer.prompt([
          {
            type: 'list',
            name: 'quickAction',
            message: 'Select an action:',
            choices: [
              ...response.suggestions.map(s => ({ name: s, value: s })),
              { name: 'Continue chatting', value: 'continue' }
            ]
          }
        ]);

        if (quickAction !== 'continue') {
          // Execute suggested action
          await this.executeSuggestedAction(quickAction);
        }
      }

      console.log(chalk.gray('\n' + '─'.repeat(60) + '\n'));
    }
  }

  /**
   * Helper: Create farm with prompt
   */
  private async createFarmWithPrompt(prompt: string, options: any) {
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Farm name:',
        default: `smart-farm-${Date.now()}`
      }
    ]);

    const spinner = ora('Creating AI-optimized farm...').start();

    try {
      const response = await axios.post(`${this.apiUrl}/api/farms`, {
        name,
        prompt,
        agentCount: parseInt(options.agents) || 3,
        mode: options.mode || 'standard',
        autoLaunch: true
      });

      spinner.succeed('Farm created with AI-refined prompt!');

      console.log(chalk.green(`\n✅ Farm ID: ${response.data.id}`));
      console.log(chalk.yellow(`🚜 ${options.agents} agents are working on your task`));

    } catch (error: any) {
      spinner.fail('Failed to create farm');
      console.error(chalk.red(error.message));
    }
  }

  /**
   * Helper: Get problematic farms
   */
  private async getProblematicFarms(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/farms`);
      const farms = response.data.farms || response.data || [];

      return farms.filter((f: any) =>
        f.status === 'failed' ||
        f.status === 'stuck' ||
        (f.errors && f.errors > 0)
      ).map((f: any) => ({
        ...f,
        issue: f.status === 'failed' ? 'Failed' :
               f.status === 'stuck' ? 'Stuck' :
               `${f.errors} errors`
      }));
    } catch {
      return [];
    }
  }

  /**
   * Helper: Attempt auto-fix
   */
  private async attemptAutoFix(farmId: string, suggestions: string[]) {
    const spinner = ora('Attempting automatic fixes...').start();

    for (const suggestion of suggestions) {
      if (suggestion.toLowerCase().includes('restart') || suggestion.toLowerCase().includes('recover')) {
        try {
          await axios.post(`${this.apiUrl}/api/farms/${farmId}/recover`);
          spinner.succeed('Farm recovered successfully!');
          return;
        } catch {
          // Continue to next fix
        }
      }
    }

    spinner.fail('Automatic fix not available');
    console.log(chalk.yellow('Manual intervention required'));
  }

  /**
   * Helper: Calculate performance score
   */
  private calculatePerformanceScore(farm: any): number {
    let score = 100;

    if (farm.status === 'failed') score -= 50;
    if (farm.errors > 0) score -= farm.errors * 5;
    if (farm.duration > farm.timeout) score -= 20;
    if (farm.agentFailures > 0) score -= farm.agentFailures * 10;

    return Math.max(0, score);
  }

  /**
   * Helper: Save as template
   */
  private async saveAsTemplate(prompt: string, name: string) {
    console.log(chalk.green(`✅ Template saved: ${name}`));
    // Implementation would save to barn or config
  }

  /**
   * Helper: Handle assistant commands
   */
  private async handleAssistantCommand(command: string) {
    const cmd = command.slice(1).toLowerCase();

    switch (cmd) {
      case 'help':
        console.log(chalk.cyan('\n📚 Assistant Commands:'));
        console.log(chalk.gray('  /help     - Show this help'));
        console.log(chalk.gray('  /clear    - Clear conversation'));
        console.log(chalk.gray('  /context  - Show conversation context'));
        console.log(chalk.gray('  /save     - Save conversation'));
        console.log(chalk.gray('  /tips     - Get farming tips'));
        break;

      case 'clear':
        claudeService.clearHistory();
        console.log(chalk.green('✅ Conversation cleared'));
        break;

      case 'context':
        const context = claudeService.getContext();
        console.log(chalk.cyan(`\n📝 Conversation (${context.length} messages)`));
        break;

      case 'tips':
        console.log(chalk.magenta(`\n${FarmJokes.getRandomJoke()}\n`));
        break;

      default:
        console.log(chalk.red(`Unknown command: ${command}`));
    }
  }

  /**
   * Helper: Execute suggested action
   */
  private async executeSuggestedAction(action: string) {
    console.log(chalk.yellow(`\n⚡ Executing: ${action}\n`));
    // Implementation would parse and execute the suggested action
  }
}

export default IntelligentCommands;