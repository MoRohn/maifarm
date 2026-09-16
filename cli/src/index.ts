#!/usr/bin/env node

/**
 * MaiFarm CLI - The Fun, Farm-Themed Command Line Interface
 *
 * "Where Code Grows and Harvests Flow!" 🌾
 *
 * A delightful developer experience that brings the full power of MaiFarm
 * to your terminal with farm-themed commands, witty responses, and
 * agricultural automation for your AI agent orchestration needs.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import Table from 'cli-table3';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import blessed from 'blessed';

// Import our farm-themed utilities
import { FarmArt } from './art/farmArt.js';
import { FarmJokes } from './utils/farmJokes.js';
import { AnimalSounds } from './utils/animalSounds.js';
import { WeatherReport } from './utils/weatherReport.js';
import { FarmTips } from './utils/farmTips.js';
import { EasterEggs } from './utils/easterEggs.js';
import {
  interactiveWatchFarm,
  interactiveHarvestFarm,
  interactiveBarnMenu,
  interactiveQuickTask,
  interactiveGoWild,
  showStatistics,
  interactiveSettings,
  handleBarnAction,
  handleFarmAction
} from './helpers/cliHelpers.js';
import { IncubateCommands } from './commands/incubateCommands.js';
import { AIEngineCommands } from './commands/aiEngineCommands.js';
import { ThemeCommands } from './commands/themeCommands.js';

// Configuration
const CONFIG_FILE = join(homedir(), '.maifarm', 'config.json');
const DEFAULT_API_URL = process.env.MAIFARM_API_URL || 'http://localhost:4567';
const VERSION = '1.0.0';

// Initialize the main program
const program = new Command();
let socket: Socket | null = null;
let config: any = {};

// Create axios instance with auth bypass for CLI
const api = axios.create({
  headers: {
    'x-bypass-auth': 'cli-access'
  }
});

// Load configuration
function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.log(chalk.yellow('🌽 Config looking a bit moldy, using fresh defaults!'));
    }
  }

  config = {
    apiUrl: DEFAULT_API_URL,
    theme: 'barn-red',
    animalSounds: true,
    weatherReports: true,
    tips: true,
    ascii: true,
    ...config
  };
}

// Display welcome banner
async function showWelcome() {
  console.clear();

  if (config.ascii) {
    const banner = figlet.textSync('MaiFarm CLI', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 80,
      whitespaceBreak: true
    });

    console.log(chalk.green(banner));
  }

  console.log(
    boxen(
      chalk.yellow.bold('🚜 Welcome to MaiFarm CLI! 🌾\n') +
      chalk.white('"Where Code Grows and Harvests Flow!"\n\n') +
      chalk.gray(`v${VERSION} | Connected to: ${config.apiUrl}\n`) +
      chalk.cyan('Type "farm help" for commands or "farm" for interactive mode'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'yellow',
        float: 'center'
      }
    )
  );

  // Quick Commands Reference
  console.log('\n' + chalk.bold.cyan('⚡ Quick Commands:'));
  console.log(chalk.gray('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.gray('  │ ') + chalk.green('farm create "My Farm"    ') + chalk.gray('   │ Create multi-agent farm     │'));
  console.log(chalk.gray('  │ ') + chalk.yellow('farm quick "Fix bug"     ') + chalk.gray('   │ 5-minute focused task      │'));
  console.log(chalk.gray('  │ ') + chalk.magenta('farm wild "Explore"      ') + chalk.gray('   │ Autonomous exploration     │'));
  console.log(chalk.gray('  ├─────────────────────────────────────────────────────────┤'));
  console.log(chalk.gray('  │ ') + chalk.blue('farm start / stop / restart') + chalk.gray('  │ Process management         │'));
  console.log(chalk.gray('  │ ') + chalk.blue('farm status                ') + chalk.gray('  │ Check farm processes       │'));
  console.log(chalk.gray('  │ ') + chalk.cyan('farm                       ') + chalk.gray('  │ Open dashboard UI          │'));
  console.log(chalk.gray('  └─────────────────────────────────────────────────────────┘'));

  if (config.weatherReports) {
    console.log(chalk.blue('\n' + WeatherReport.getTodaysForecast()));
  }

  if (config.tips) {
    console.log(chalk.magenta(`\n💡 Farm Tip: ${FarmTips.getRandomTip()}\n`));
  }
}

// Connect to WebSocket for real-time updates
function connectWebSocket(): Promise<void> {
  return new Promise((resolve) => {
    socket = io(config.apiUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      if (program.opts().verbose) {
        console.log(chalk.green('🔌 Connected to the barn network!'));
      }
      resolve();
    });

    socket.on('disconnect', () => {
      if (program.opts().verbose) {
        console.log(chalk.yellow('🔌 Lost connection to the barn...'));
      }
    });
  });
}

// Main CLI setup
program
  .name('farm')
  .description('MaiFarm CLI - Your Agricultural AI Orchestration Command Center')
  .version(VERSION)
  .option('-v, --verbose', 'Show detailed farm operations')
  .option('-q, --quiet', 'Minimal output (no jokes or ASCII art)')
  .option('--no-color', 'Disable colors (for boring terminals)')
  .option('--api <url>', 'API endpoint URL', DEFAULT_API_URL)
  .hook('preAction', async (thisCommand) => {
    loadConfig();
    if (thisCommand.opts().quiet) {
      config.animalSounds = false;
      config.weatherReports = false;
      config.tips = false;
      config.ascii = false;
    }
    if (thisCommand.opts().api) {
      config.apiUrl = thisCommand.opts().api;
    }
  });

// Farm creation command
program
  .command('create <name>')
  .alias('plant')
  .description('Plant a new farm with AI agents 🌱')
  .option('-a, --agents <count>', 'Number of farm hands (agents)', '2')
  .option('-m, --mode <mode>', 'Farm mode: standard|quick|wild', 'standard')
  .option('-p, --prompt <prompt>', 'What should your agents work on?')
  .option('-t, --timeout <minutes>', 'Harvest timeout in minutes', '60')
  .option('--no-launch', 'Create but don\'t launch the farm')
  .action(async (name, options) => {
    const spinner = ora({
      text: 'Preparing the fields... 🚜',
      spinner: 'dots12',
      color: 'green'
    }).start();

    try {
      // Play a rooster sound if enabled
      if (config.animalSounds) {
        AnimalSounds.play('rooster');
      }

      spinner.text = 'Plowing the digital soil... 🌾';

      const response = await api.post(`${config.apiUrl}/api/farms`, {
        name,
        agentCount: parseInt(options.agents),
        mode: options.mode,
        prompt: options.prompt,
        timeout: parseInt(options.timeout) * 60,
        autoLaunch: !options.noLaunch
      });

      spinner.succeed(chalk.green(`Farm "${name}" planted successfully! 🎉`));

      // API returns { success: true, data: farm } or just farm
      const farm = response.data.data || response.data.farm || response.data;

      // Display farm details in a nice table
      const table = new Table({
        head: ['Field', 'Value'],
        style: {
          head: ['green'],
          border: ['yellow']
        }
      });

      // Calculate agent count from agents array if available
      const agentCount = farm.agentCount || (Array.isArray(farm.agents) ? farm.agents.length : parseInt(options.agents));
      const mode = farm.mode || options.mode;

      table.push(
        ['Farm ID', chalk.cyan(farm.id)],
        ['Name', farm.name],
        ['Status', chalk.green(farm.status)],
        ['Agents', `${agentCount} ${FarmArt.getAnimalEmoji(agentCount)}`],
        ['Mode', mode],
        ['Timeout', `${options.timeout} minutes`]
      );

      console.log('\n' + table.toString());

      if (!options.noLaunch) {
        console.log(chalk.yellow('\n🌻 Your agents are getting to work!'));
        console.log(chalk.gray(`Run "farm watch ${farm.id}" to see live progress`));
      }

      // Share a farm joke
      if (!options.quiet) {
        console.log(chalk.magenta(`\n${FarmJokes.getRandomJoke()}\n`));
      }

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to plant the farm 😢'));
      console.error(chalk.red(error.response?.data?.message || error.message));

      if (config.tips) {
        console.log(chalk.yellow('\n💡 Tip: Make sure the API server is running with "npm run dev"'));
      }
    }
  });

// List farms command
program
  .command('list')
  .alias('ls')
  .description('List all your farms 🌻')
  .option('-s, --status <status>', 'Filter by status (idle|running|completed|failed)')
  .option('-l, --limit <count>', 'Number of farms to show', '10')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Checking the fields... 🔍').start();

    try {
      const response = await api.get(`${config.apiUrl}/api/farms`, {
        params: {
          status: options.status,
          limit: options.limit
        }
      });

      spinner.stop();

      // API returns { success: true, data: [...] }
      const farms = response.data.data || response.data.farms || response.data;

      if (options.json) {
        console.log(JSON.stringify(farms, null, 2));
        return;
      }

      if (farms.length === 0) {
        console.log(chalk.yellow('🌵 No farms found! The fields are empty.'));
        console.log(chalk.gray('Create one with "farm create <name>"'));
        return;
      }

      console.log(chalk.green.bold(`\n🚜 Your Farm Portfolio (${farms.length} farms)\n`));

      const table = new Table({
        head: ['Name', 'Status', 'Agents', 'Mode', 'Created', 'ID'],
        style: {
          head: ['cyan'],
          border: ['gray']
        },
        colWidths: [20, 12, 10, 10, 20, 38]
      });

      farms.forEach((farm: any) => {
        const statusColor = farm.status === 'idle' ? 'gray' :
                           farm.status === 'running' ? 'green' :
                           farm.status === 'completed' ? 'blue' :
                           farm.status === 'failed' ? 'red' :
                           farm.status === 'launching' ? 'yellow' : 'white';

        const coloredStatus = statusColor === 'gray' ? chalk.gray(farm.status) :
                             statusColor === 'green' ? chalk.green(farm.status) :
                             statusColor === 'blue' ? chalk.blue(farm.status) :
                             statusColor === 'red' ? chalk.red(farm.status) :
                             statusColor === 'yellow' ? chalk.yellow(farm.status) :
                             chalk.white(farm.status);

        table.push([
          farm.name,
          coloredStatus,
          `${farm.agentCount || 0} ${FarmArt.getAnimalEmoji(farm.agentCount || 0)}`,
          farm.mode || 'standard',
          new Date(farm.createdAt).toLocaleString(),
          chalk.gray(farm.id.substring(0, 36))
        ]);
      });

      console.log(table.toString());

    } catch (error: any) {
      spinner.fail('Failed to survey the farms');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// Health check command
program
  .command('health')
  .alias('status')
  .description('Check MaiFarm system health 🏥')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Checking farm system health... 🏥').start();

    try {
      const response = await api.get(`${config.apiUrl}/api/health`);
      const health = response.data;

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      console.log(chalk.green.bold('\n🏥 Farm System Health Report\n'));

      // Overall status
      const statusIcon = health.status === 'healthy' ? '✅' :
                        health.status === 'degraded' ? '⚠️' : '❌';
      const statusColor = health.status === 'healthy' ? chalk.green :
                         health.status === 'degraded' ? chalk.yellow : chalk.red;

      console.log(`${statusIcon} Overall Status: ${statusColor(health.status.toUpperCase())}`);
      console.log(chalk.gray(`Version: ${health.version}`));
      console.log(chalk.gray(`Uptime: ${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`));
      console.log('');

      // Components
      console.log(chalk.cyan.bold('📦 Components:\n'));

      health.components.forEach((component: any) => {
        const icon = component.status === 'healthy' ? '✅' :
                    component.status === 'degraded' ? '⚠️' : '❌';
        const color = component.status === 'healthy' ? chalk.green :
                     component.status === 'degraded' ? chalk.yellow : chalk.red;

        console.log(`${icon} ${chalk.bold(component.name)}: ${color(component.status)}`);
        console.log(`   ${chalk.gray(component.message)}`);

        if (component.latency !== undefined) {
          console.log(`   ${chalk.gray(`Response time: ${component.latency}ms`)}`);
        }
      });

      console.log('');

      // Metrics
      if (health.metrics) {
        console.log(chalk.cyan.bold('📊 Metrics:\n'));

        if (health.metrics.memory) {
          const memPercent = health.metrics.memory.percentage;
          const memColor = memPercent < 80 ? chalk.green : memPercent < 90 ? chalk.yellow : chalk.red;
          console.log(`💾 Memory: ${memColor(memPercent + '%')} (${Math.floor(health.metrics.memory.used / 1024 / 1024)}MB / ${Math.floor(health.metrics.memory.total / 1024 / 1024)}MB)`);
        }

        if (health.metrics.cpu) {
          const cpuUsage = health.metrics.cpu.usage.toFixed(1);
          const cpuColor = parseFloat(cpuUsage) < 80 ? chalk.green : parseFloat(cpuUsage) < 90 ? chalk.yellow : chalk.red;
          console.log(`⚡ CPU: ${cpuColor(cpuUsage + '%')}`);
        }

        if (health.metrics.connections) {
          console.log(`🔌 WebSocket Connections: ${chalk.cyan(health.metrics.connections.websocket)}`);
          console.log(`🗄️  Database Connections: ${chalk.cyan(health.metrics.connections.database)}`);
        }
      }

      console.log('');

      // Health advice
      if (health.status === 'healthy') {
        console.log(chalk.green('✨ All systems operational! Ready to farm! 🚜'));
      } else if (health.status === 'degraded') {
        console.log(chalk.yellow('⚠️  System is degraded but operational. Some features may be limited.'));
      } else {
        console.log(chalk.red('❌ System has critical issues. Please check component statuses above.'));
      }

    } catch (error: any) {
      spinner.fail('Failed to check system health');
      console.error(chalk.red('✗ Could not connect to MaiFarm backend'));
      console.error(chalk.gray(`  Ensure the server is running: npm run dev`));
      console.error(chalk.gray(`  API URL: ${config.apiUrl}`));

      if (options.verbose) {
        console.error(chalk.gray(`\n  Error: ${error.message}`));
      }
    }
  });

// Watch farm terminal output
program
  .command('watch <farmId>')
  .alias('monitor')
  .description('Watch your agents work in real-time 👀')
  .option('-a, --agent <agentId>', 'Watch specific agent')
  .option('--raw', 'Show raw terminal output')
  .action(async (farmId, options) => {
    console.log(chalk.yellow('🔭 Setting up the observation tower...\n'));

    await connectWebSocket();

    // Create a blessed screen for terminal UI
    const screen = blessed.screen({
      smartCSR: true,
      title: `MaiFarm - Watching ${farmId}`
    });

    // Create a box for terminal output
    const outputBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-3',
      content: '',
      tags: true,
      border: {
        type: 'line',
        fg: 'yellow' as any
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'yellow'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      label: ` 🚜 Farm Terminal - ${farmId.substring(0, 8)} `
    });

    // Create status bar
    const statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}Press Q to quit | Scroll with arrows | Space to pause{/center}',
      tags: true,
      style: {
        fg: 'black',
        bg: 'green'
      }
    });

    screen.append(outputBox);
    screen.append(statusBar);

    // Handle terminal output
    socket!.emit('terminal:join', { farmId, agentId: options.agent });

    socket!.on('terminal:output', (data: any) => {
      if (data.farmId === farmId) {
        const timestamp = new Date().toLocaleTimeString();
        const agentName = data.agentName || `Agent ${data.agentId}`;
        const prefix = options.raw ? '' : `[${timestamp}] ${agentName}: `;

        outputBox.pushLine(prefix + data.content);
        outputBox.setScrollPerc(100);
        screen.render();
      }
    });

    // Handle farm status updates
    socket!.on('farm:status', (data: any) => {
      if (data.farmId === farmId) {
        statusBar.setContent(
          `{center}Farm Status: ${data.status} | Agents: ${data.activeAgents || 0} | Press Q to quit{/center}`
        );
        screen.render();
      }
    });

    // Quit on Q key
    screen.key(['q', 'C-c'], () => {
      socket!.emit('terminal:leave', { farmId });
      socket!.disconnect();
      return process.exit(0);
    });

    screen.render();
  });

// Harvest command
program
  .command('harvest <farmId>')
  .alias('reap')
  .description('Harvest the fruits of your agents\' labor 🌾')
  .option('-o, --output <path>', 'Where to save the harvest')
  .option('--preview', 'Preview harvest without collecting')
  .action(async (farmId, options) => {
    const spinner = ora({
      text: 'Gathering the harvest... 🧺',
      spinner: 'dots12'
    }).start();

    try {
      if (config.animalSounds) {
        AnimalSounds.play('cow');
      }

      if (options.preview) {
        spinner.text = 'Previewing the crops...';
        const response = await api.get(`${config.apiUrl}/api/harvests/${farmId}/preview`);
        spinner.succeed('Harvest preview ready!');

        console.log(chalk.green('\n🌾 Harvest Preview:\n'));
        console.log(response.data);
        return;
      }

      spinner.text = 'Reaping the digital crops... 🌾';

      const response = await api.post(`${config.apiUrl}/api/farms/${farmId}/harvest`);
      const harvest = response.data;

      spinner.succeed(chalk.green('Harvest complete! 🎉'));

      const table = new Table({
        head: ['Metric', 'Value'],
        style: { head: ['yellow'] }
      });

      table.push(
        ['Harvest ID', harvest.id],
        ['Files Collected', harvest.fileCount || 0],
        ['Total Size', `${(harvest.totalBytes / 1024 / 1024).toFixed(2)} MB`],
        ['Status', chalk.green(harvest.status)]
      );

      console.log('\n' + table.toString());

      if (options.output) {
        console.log(chalk.yellow(`\n📦 Harvest saved to: ${options.output}`));
      }

      console.log(chalk.magenta(`\n${FarmJokes.getHarvestJoke()}\n`));

    } catch (error: any) {
      spinner.fail('Failed to harvest the farm');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive farm management mode 🎮')
  .action(async () => {
    await showWelcome();

    let running = true;

    while (running) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do on the farm today?',
          choices: [
            { name: '🌱 Plant a new farm', value: 'create' },
            { name: '🌻 List all farms', value: 'list' },
            { name: '👀 Watch a farm', value: 'watch' },
            { name: '🌾 Harvest a farm', value: 'harvest' },
            { name: '🏚️ Visit the barn', value: 'barn' },
            { name: '🎯 Quick task', value: 'quick' },
            { name: '🦅 Go Wild mode', value: 'wild' },
            { name: '📊 View statistics', value: 'stats' },
            { name: '🎨 Themes', value: 'themes' },
            { name: '⚙️  Settings', value: 'settings' },
            { name: '👋 Exit', value: 'exit' }
          ]
        }
      ]);

      switch (action) {
        case 'create':
          await interactiveCreateFarm();
          break;
        case 'list':
          await interactiveListFarms();
          break;
        case 'watch':
          await interactiveWatchFarm(config.apiUrl);
          break;
        case 'harvest':
          await interactiveHarvestFarm(config.apiUrl);
          break;
        case 'barn':
          await interactiveBarnMenu(config.apiUrl);
          break;
        case 'quick':
          await interactiveQuickTask(config.apiUrl);
          break;
        case 'wild':
          await interactiveGoWild(config.apiUrl);
          break;
        case 'stats':
          await showStatistics(config.apiUrl);
          break;
        case 'themes':
          const themeCmd = new ThemeCommands();
          await themeCmd.initialize();
          await themeCmd.demo();
          break;
        case 'settings':
          await interactiveSettings(config.apiUrl);
          break;
        case 'exit':
          running = false;
          console.log(chalk.green('\n🌅 Thanks for farming with us! Y\'all come back now!\n'));
          if (config.animalSounds) {
            AnimalSounds.play('rooster');
          }
          break;
      }
    }

    process.exit(0);
  });

// Quick task command
program
  .command('quick <prompt>')
  .alias('qt')
  .description('Run a quick 5-minute task 🏃')
  .option('-a, --agents <count>', 'Number of agents', '2')
  .action(async (prompt, options) => {
    const spinner = ora('Dispatching quick workers... ⚡').start();

    try {
      const response = await api.post(`${config.apiUrl}/api/farms`, {
        name: `quick-${Date.now()}`,
        mode: 'quick',
        prompt,
        agentCount: parseInt(options.agents),
        timeout: 300000, // 5 minutes in milliseconds
        autoLaunch: true
      });

      spinner.succeed('Quick task started!');

      const farm = response.data;
      console.log(chalk.green(`\n⚡ Quick task farm: ${farm.id}`));
      console.log(chalk.yellow('This task will auto-harvest in 5 minutes'));
      console.log(chalk.gray(`Watch progress: farm watch ${farm.id}`));

    } catch (error: any) {
      spinner.fail('Failed to start quick task');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// Go Wild mode
program
  .command('wild <prompt>')
  .alias('gw')
  .description('Let agents run wild and free! 🦅')
  .option('-a, --agents <count>', 'Number of wild agents', '3')
  .option('-t, --timeout <minutes>', 'Time limit', '30')
  .option('--xenosync', 'Use XenoSync orchestration')
  .action(async (prompt, options) => {
    console.log(chalk.yellow.bold('\n🦅 GOING WILD! 🦅\n'));

    if (config.animalSounds) {
      AnimalSounds.play('eagle');
    }

    const spinner = ora('Releasing the agents into the wild... 🏃').start();

    try {
      const response = await api.post(`${config.apiUrl}/api/go-wild`, {
        prompt,
        agentCount: parseInt(options.agents),
        timeout: parseInt(options.timeout) * 60,
        useXenoSync: options.xenosync
      });

      spinner.succeed('Agents are running wild!');

      const session = response.data;
      console.log(chalk.green(`\n🦅 Wild session: ${session.id}`));
      console.log(chalk.yellow(`${options.agents} agents are autonomously exploring...`));
      console.log(chalk.gray(`Watch the chaos: farm watch ${session.farmId}`));

      console.log(chalk.magenta(`\n${FarmJokes.getWildJoke()}\n`));

    } catch (error: any) {
      spinner.fail('Failed to go wild');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// Barn commands
program
  .command('barn')
  .description('Visit the barn for shared resources 🏚️')
  .action(async () => {
    const { barnAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'barnAction',
        message: 'Welcome to the barn! What brings you here?',
        choices: [
          { name: '📦 List stored items', value: 'list' },
          { name: '📤 Store something new', value: 'store' },
          { name: '📥 Retrieve an item', value: 'get' },
          { name: '🔍 Search the barn', value: 'search' },
          { name: '🧹 Clean up old items', value: 'cleanup' }
        ]
      }
    ]);

    await handleBarnAction(barnAction, config.apiUrl);
  });

// Stats command
program
  .command('stats')
  .alias('dashboard')
  .description('View farm statistics and metrics 📊')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Calculating farm metrics... 📊').start();

    try {
      const response = await api.get(`${config.apiUrl}/api/metrics/dashboard`);
      const stats = response.data;

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(boxen(
        chalk.green.bold('🌾 MaiFarm Statistics Dashboard 🌾'),
        { padding: 1, borderColor: 'green', borderStyle: 'double' }
      ));

      // Display stats in tables
      const systemTable = new Table({
        head: ['Metric', 'Value'],
        style: { head: ['cyan'] }
      });

      systemTable.push(
        ['Total Farms', stats.totalFarms || 0],
        ['Active Farms', stats.activeFarms || 0],
        ['Total Agents', stats.totalAgents || 0],
        ['Harvests Collected', stats.totalHarvests || 0],
        ['Barn Items', stats.barnItems || 0],
        ['System Uptime', stats.uptime || 'Unknown']
      );

      console.log('\n' + chalk.yellow('System Overview:'));
      console.log(systemTable.toString());

    } catch (error: any) {
      spinner.fail('Failed to fetch statistics');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// ============================================
// Incubation Commands
// ============================================

const incubate = program
  .command('incubate')
  .description('Farm incubation and evolution system 🌱')
  .action(() => {
    console.log(chalk.yellow('\n🌱 MaiFarm Incubation System\n'));
    console.log(chalk.green('Evolve your farms through AI-powered enhancement!\n'));
    console.log(chalk.cyan('Available commands:'));
    console.log(chalk.gray('  • incubate <farm-id>           - Start incubation'));
    console.log(chalk.gray('  • incubate status <session-id> - Check status'));
    console.log(chalk.gray('  • incubate watch <session-id>  - Watch progress'));
    console.log(chalk.gray('  • incubate pause <session-id>  - Pause incubation'));
    console.log(chalk.gray('  • incubate resume <session-id> - Resume incubation'));
    console.log(chalk.gray('  • incubate stop <session-id>   - Stop incubation'));
    console.log(chalk.gray('  • incubate lineage <farm-id>   - View ancestry'));
    console.log(chalk.gray('  • incubate list                - List sessions\n'));
    console.log(chalk.magenta('💡 Tip: Use --help on any command for more details\n'));
  });

// Start incubation
incubate
  .command('start <farmId>')
  .description('Start incubation for a completed farm 🌱')
  .option('-c, --context <text>', 'User guidance for incubation')
  .option('-p, --prompt-file <file>', 'Custom incubation prompt file')
  .option('--no-wait', 'Don\'t wait for completion, return immediately')
  .action(async (farmId, options) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.startIncubation(farmId, options);
  });

// Check status
incubate
  .command('status <sessionId>')
  .description('Get current incubation progress 📊')
  .action(async (sessionId) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.checkStatus(sessionId);
  });

// Watch progress
incubate
  .command('watch <sessionId>')
  .description('Watch incubation progress in real-time 👀')
  .action(async (sessionId) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.watchIncubation(sessionId);
  });

// Pause incubation
incubate
  .command('pause <sessionId>')
  .description('Pause a running incubation ⏸')
  .action(async (sessionId) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.pauseIncubation(sessionId);
  });

// Resume incubation
incubate
  .command('resume <sessionId>')
  .description('Resume a paused incubation ▶')
  .action(async (sessionId) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.resumeIncubation(sessionId);
  });

// Stop incubation
incubate
  .command('stop <sessionId>')
  .description('Stop a running incubation ⏹')
  .option('-r, --reason <text>', 'Reason for stopping')
  .action(async (sessionId, options) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.stopIncubation(sessionId, options);
  });

// View lineage
incubate
  .command('lineage <farmId>')
  .description('Show incubation lineage/ancestry for a farm 🌳')
  .action(async (farmId) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.viewLineage(farmId);
  });

// List sessions
incubate
  .command('list')
  .description('List all incubation sessions 📋')
  .option('-f, --farm <farmId>', 'Filter by farm ID')
  .option('-s, --status <status>', 'Filter by status (pending, incubating, completed, failed)')
  .option('-l, --limit <number>', 'Limit results (default: 20)')
  .action(async (options) => {
    const incubateCmd = new IncubateCommands(config.apiUrl);
    await incubateCmd.listSessions({
      farmId: options.farm,
      status: options.status,
      limit: options.limit ? parseInt(options.limit) : undefined
    });
  });

// ============================================
// Theme Commands
// ============================================

const theme = program
  .command('theme')
  .description('Customize CLI visual themes 🎨')
  .action(async () => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.listThemes();
  });

// List all themes
theme
  .command('list')
  .description('Show all available themes 🌈')
  .action(async () => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.listThemes();
  });

// Set active theme
theme
  .command('set <name>')
  .description('Set the active CLI theme 🎨')
  .action(async (name) => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.setTheme(name);
  });

// Preview theme
theme
  .command('preview <name>')
  .description('Preview a theme without setting it 👀')
  .action(async (name) => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.previewTheme(name);
  });

// Show current theme
theme
  .command('current')
  .description('Show current active theme ℹ️')
  .action(async () => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.showCurrent();
  });

// Interactive theme demo
theme
  .command('demo')
  .description('Interactive theme demo with all features 🎭')
  .action(async () => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.demo();
  });

// Reset to default theme
theme
  .command('reset')
  .description('Reset to default theme 🔄')
  .action(async () => {
    const themeCmd = new ThemeCommands();
    await themeCmd.initialize();
    await themeCmd.reset();
  });

// Help enhancement
program
  .command('tips')
  .description('Get farming tips and tricks 💡')
  .action(() => {
    console.log(chalk.green.bold('\n🌾 MaiFarm Pro Tips 🌾\n'));

    const tips = [
      '🚜 Use "farm quick" for tasks under 5 minutes',
      '🦅 Go Wild mode lets agents work autonomously for complex tasks',
      '🏚️ The barn stores shared resources between farms',
      '👀 Watch multiple agents with "farm watch <id>"',
      '⚡ Add --fast-launch to skip startup delays',
      '🔄 Farms auto-recover from failures',
      '📊 Check "farm stats" for system health',
      '🎮 Try "farm interactive" for guided mode',
      '🎨 Customize CLI themes with "farm theme" commands',
      '🌈 Preview themes before applying with "farm theme preview"',
      '🔌 WebSocket provides real-time updates'
    ];

    tips.forEach(tip => console.log(chalk.yellow(tip)));

    console.log(chalk.magenta(`\n${FarmJokes.getRandomJoke()}\n`));
  });

// Interactive helper functions
async function interactiveCreateFarm() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What shall we name this farm? 🌱',
      default: `farm-${Date.now()}`
    },
    {
      type: 'number',
      name: 'agents',
      message: 'How many agents should work the fields? 👨‍🌾',
      default: 2
    },
    {
      type: 'list',
      name: 'mode',
      message: 'Choose your farming style:',
      choices: [
        { name: '🌾 Standard (Normal farm)', value: 'standard' },
        { name: '⚡ Quick (5-minute sprint)', value: 'quick' },
        { name: '🦅 Wild (Autonomous agents)', value: 'wild' }
      ]
    },
    {
      type: 'editor',
      name: 'prompt',
      message: 'What should your agents work on? (Opens editor)'
    }
  ]);

  const spinner = ora('Planting your farm... 🌱').start();

  try {
    const response = await api.post(`${config.apiUrl}/api/farms`, {
      ...answers,
      autoLaunch: true
    });

    spinner.succeed(`Farm "${answers.name}" created successfully!`);
    console.log(chalk.green(`Farm ID: ${response.data.id}`));

  } catch (error: any) {
    spinner.fail('Failed to create farm');
    console.error(chalk.red(error.response?.data?.message || error.message));
  }
}

async function interactiveListFarms() {
  const spinner = ora('Loading farms...').start();

  try {
    const response = await api.get(`${config.apiUrl}/api/farms`);
    spinner.stop();

    const farms = response.data.farms || response.data;

    if (farms.length === 0) {
      console.log(chalk.yellow('No farms found!'));
      return;
    }

    const choices = farms.map((farm: any) => ({
      name: `${farm.name} (${farm.status}) - ${farm.agentCount} agents`,
      value: farm.id
    }));

    const { farmId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'farmId',
        message: 'Select a farm to view details:',
        choices: [...choices, { name: '← Back', value: null }]
      }
    ]);

    if (farmId) {
      await showFarmDetails(farmId);
    }

  } catch (error: any) {
    spinner.fail('Failed to load farms');
    console.error(chalk.red(error.response?.data?.message || error.message));
  }
}

async function showFarmDetails(farmId: string) {
  const spinner = ora('Loading farm details...').start();

  try {
    const response = await api.get(`${config.apiUrl}/api/farms/${farmId}`);
    const farm = response.data;

    spinner.stop();

    const table = new Table({
      head: ['Property', 'Value'],
      style: { head: ['green'] }
    });

    table.push(
      ['ID', farm.id],
      ['Name', farm.name],
      ['Status', farm.status],
      ['Agents', farm.agentCount],
      ['Mode', farm.mode],
      ['Created', new Date(farm.createdAt).toLocaleString()]
    );

    console.log('\n' + table.toString());

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '👀 Watch terminal', value: 'watch' },
          { name: '🌾 Harvest', value: 'harvest' },
          { name: '♻️ Recover', value: 'recover' },
          { name: '❌ Terminate', value: 'terminate' },
          { name: '← Back', value: null }
        ]
      }
    ]);

    if (action) {
      await handleFarmAction(farmId, action, config.apiUrl);
    }

  } catch (error: any) {
    spinner.fail('Failed to load farm details');
    console.error(chalk.red(error.response?.data?.message || error.message));
  }
}

// ============================================
// AI Engine Management Commands
// ============================================

const engines = program
  .command('engines')
  .description('Manage AI engine models, versions, and costs 🧠')
  .action(() => {
    console.log(chalk.yellow('\n🧠 AI Engine Management System\n'));
    console.log(chalk.green('Manage your AI provider models and track costs!\n'));
    console.log(chalk.cyan('Available commands:'));
    console.log(chalk.gray('  • engines status             - Show AI engine status'));
    console.log(chalk.gray('  • engines models <provider>  - List available models'));
    console.log(chalk.gray('  • engines change <provider>  - Change active model'));
    console.log(chalk.gray('  • engines upgrade <provider> - Upgrade to latest version'));
    console.log(chalk.gray('  • engines costs [provider]   - View cost metrics\n'));
    console.log(chalk.magenta('💡 Tip: Use --help on any command for more details\n'));
  });

// Engine status
engines
  .command('status')
  .description('Show status of all AI engines 📊')
  .action(async () => {
    const engineCmd = new AIEngineCommands(config.apiUrl);
    await engineCmd.showEngineStatus();
  });

// List models
engines
  .command('models [provider]')
  .description('List available models for a provider 📋')
  .action(async (provider) => {
    const engineCmd = new AIEngineCommands(config.apiUrl);
    await engineCmd.listModels(provider);
  });

// Change model
engines
  .command('change [provider] [modelId]')
  .description('Change the active model for a provider 🔄')
  .action(async (provider, modelId) => {
    const engineCmd = new AIEngineCommands(config.apiUrl);
    await engineCmd.changeModel(provider, modelId);
  });

// Upgrade engine
engines
  .command('upgrade [provider]')
  .description('Upgrade engine to latest version 🚀')
  .option('-f, --force', 'Force upgrade even if up to date')
  .option('--skip-backup', 'Skip configuration backup')
  .action(async (provider, options) => {
    const engineCmd = new AIEngineCommands(config.apiUrl);
    await engineCmd.upgradeEngine(provider, {
      force: options.force,
      skipBackup: options.skipBackup
    });
  });

// View costs
engines
  .command('costs [provider]')
  .description('View cost metrics and usage 💰')
  .option('-d, --days <number>', 'Number of days to look back (default: 30)', '30')
  .action(async (provider, options) => {
    const engineCmd = new AIEngineCommands(config.apiUrl);
    await engineCmd.viewCosts(provider, {
      days: parseInt(options.days)
    });
  });

// Add more helper functions...

// ============================================
// Easter Eggs - Hidden Commands 🤫
// ============================================

// Hidden "fart" command - for when users mistype "farm"
program
  .command('fart', { hidden: true })
  .description('🤫')
  .action(async () => {
    await EasterEggs.fart();
    process.exit(0);
  });

// Konami code Easter egg
program
  .command('konami', { hidden: true })
  .description('🤫')
  .action(async () => {
    await EasterEggs.konami();
    process.exit(0);
  });

// Show all secrets
program
  .command('secrets', { hidden: true })
  .description('🤫')
  .action(() => {
    EasterEggs.showSecrets();
    process.exit(0);
  });

// Main execution
if (process.argv.length === 2) {
  // No arguments, show welcome and go interactive
  showWelcome().then(() => {
    program.parse([...process.argv, 'interactive']);
  });
} else {
  // Parse command line arguments
  program.parse(process.argv);
}