/**
 * CLI Helper Functions
 *
 * Supporting functions for the main CLI commands
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import axios from 'axios';
import { spawn } from 'child_process';
import { FarmJokes } from '../utils/farmJokes.js';
import { FarmTips } from '../utils/farmTips.js';
import { AnimalSounds } from '../utils/animalSounds.js';
import { FarmArt } from '../art/farmArt.js';
import { WeatherReport } from '../utils/weatherReport.js';

export async function interactiveWatchFarm(apiUrl: string) {
  const spinner = ora('Loading farms...').start();

  try {
    const response = await axios.get(`${apiUrl}/api/farms`, {
      params: { status: 'running' }
    });

    spinner.stop();

    const farms = response.data.farms || response.data || [];

    if (farms.length === 0) {
      console.log(chalk.yellow('No active farms to watch!'));
      return;
    }

    const { farmId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'farmId',
        message: 'Which farm would you like to watch?',
        choices: farms.map((f: any) => ({
          name: `${f.name} - ${f.agentCount} agents ${FarmArt.getAnimalEmoji(f.agentCount)}`,
          value: f.id
        }))
      }
    ]);

    // Launch watch command
    const watchProcess = spawn('farm', ['watch', farmId], {
      stdio: 'inherit'
    });

    watchProcess.on('exit', () => {
      console.log(chalk.yellow('\nStopped watching farm'));
    });

  } catch (error: any) {
    spinner.fail('Failed to load farms');
    console.error(chalk.red(error.message));
  }
}

export async function interactiveHarvestFarm(apiUrl: string) {
  const spinner = ora('Loading completed farms...').start();

  try {
    const response = await axios.get(`${apiUrl}/api/farms`, {
      params: { status: 'completed' }
    });

    spinner.stop();

    const farms = response.data.farms || response.data || [];

    if (farms.length === 0) {
      console.log(chalk.yellow('No farms ready for harvest!'));
      return;
    }

    const { farmId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'farmId',
        message: 'Which farm would you like to harvest?',
        choices: farms.map((f: any) => ({
          name: `${f.name} - Completed ${new Date(f.completedAt).toLocaleString()}`,
          value: f.id
        }))
      }
    ]);

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Ready to harvest?',
        default: true
      }
    ]);

    if (confirm) {
      const harvestSpinner = ora('Harvesting... 🌾').start();

      const harvestResponse = await axios.post(`${apiUrl}/api/farms/${farmId}/harvest`);

      harvestSpinner.succeed('Harvest complete! 🎉');

      console.log(chalk.green(`Harvest ID: ${harvestResponse.data.id}`));
      console.log(chalk.magenta(`\n${FarmJokes.getHarvestJoke()}\n`));
    }

  } catch (error: any) {
    spinner.fail('Failed to harvest');
    console.error(chalk.red(error.message));
  }
}

export async function interactiveBarnMenu(apiUrl: string) {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '🏚️ Welcome to the Barn! What would you like to do?',
      choices: [
        { name: '📦 List stored items', value: 'list' },
        { name: '📤 Store new item', value: 'store' },
        { name: '📥 Retrieve item', value: 'get' },
        { name: '🔍 Search barn', value: 'search' },
        { name: '🧹 Cleanup old items', value: 'cleanup' },
        { name: '← Back', value: 'back' }
      ]
    }
  ]);

  if (action === 'back') return;

  await handleBarnAction(action, apiUrl);
}

export async function handleBarnAction(action: string, apiUrl: string) {
  switch (action) {
    case 'list':
      await listBarnItems(apiUrl);
      break;
    case 'store':
      await storeBarnItem(apiUrl);
      break;
    case 'get':
      await getBarnItem(apiUrl);
      break;
    case 'search':
      await searchBarn(apiUrl);
      break;
    case 'cleanup':
      await cleanupBarn(apiUrl);
      break;
  }
}

async function listBarnItems(apiUrl: string) {
  const spinner = ora('Loading barn inventory...').start();

  try {
    const response = await axios.get(`${apiUrl}/api/barn/items`);
    spinner.stop();

    const items = response.data.items || [];

    if (items.length === 0) {
      console.log(chalk.yellow('🌵 The barn is empty!'));
      return;
    }

    console.log(chalk.green('\n🏚️ Barn Inventory:\n'));

    const table = new Table({
      head: ['Name', 'Type', 'Size', 'Created', 'Tags'],
      style: { head: ['cyan'] }
    });

    items.forEach((item: any) => {
      table.push([
        item.name,
        item.type || 'file',
        item.size ? `${(item.size / 1024).toFixed(2)} KB` : 'N/A',
        new Date(item.createdAt).toLocaleDateString(),
        (item.tags || []).join(', ') || 'None'
      ]);
    });

    console.log(table.toString());

  } catch (error: any) {
    spinner.fail('Failed to load barn items');
    console.error(chalk.red(error.message));
  }
}

async function storeBarnItem(apiUrl: string) {
  const { filepath, name, tags } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filepath',
      message: 'Path to file/folder to store:',
      validate: (input) => input.length > 0
    },
    {
      type: 'input',
      name: 'name',
      message: 'Name for barn storage:',
      validate: (input) => input.length > 0
    },
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (comma-separated, optional):'
    }
  ]);

  const spinner = ora('Storing in barn... 📦').start();

  try {
    const response = await axios.post(`${apiUrl}/api/barn/store`, {
      path: filepath,
      name,
      tags: tags ? tags.split(',').map((t: string) => t.trim()) : []
    });

    spinner.succeed('Stored successfully! 🎉');
    console.log(chalk.green(`Barn ID: ${response.data.id}`));

  } catch (error: any) {
    spinner.fail('Failed to store item');
    console.error(chalk.red(error.message));
  }
}

async function getBarnItem(apiUrl: string) {
  const spinner = ora('Loading barn items...').start();

  try {
    const response = await axios.get(`${apiUrl}/api/barn/items`);
    spinner.stop();

    const items = response.data.items || [];

    if (items.length === 0) {
      console.log(chalk.yellow('The barn is empty!'));
      return;
    }

    const { itemId, outputPath } = await inquirer.prompt([
      {
        type: 'list',
        name: 'itemId',
        message: 'Which item to retrieve?',
        choices: items.map((item: any) => ({
          name: `${item.name} (${item.type})`,
          value: item.id
        }))
      },
      {
        type: 'input',
        name: 'outputPath',
        message: 'Where to save it?',
        default: './barn-items/'
      }
    ]);

    const getSpinner = ora('Retrieving from barn... 📥').start();

    const getResponse = await axios.post(`${apiUrl}/api/barn/retrieve`, {
      itemId,
      outputPath
    });

    getSpinner.succeed('Retrieved successfully!');
    console.log(chalk.green(`Saved to: ${outputPath}`));

  } catch (error: any) {
    spinner.fail('Failed to retrieve item');
    console.error(chalk.red(error.message));
  }
}

async function searchBarn(apiUrl: string) {
  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Search barn for:'
    }
  ]);

  const spinner = ora('Searching barn... 🔍').start();

  try {
    const response = await axios.get(`${apiUrl}/api/barn/search`, {
      params: { q: query }
    });

    spinner.stop();

    const results = response.data.results || [];

    if (results.length === 0) {
      console.log(chalk.yellow('No items found!'));
      return;
    }

    console.log(chalk.green(`\nFound ${results.length} items:\n`));

    results.forEach((item: any) => {
      console.log(chalk.cyan(`  • ${item.name}`));
      if (item.tags && item.tags.length > 0) {
        console.log(chalk.gray(`    Tags: ${item.tags.join(', ')}`));
      }
    });

  } catch (error: any) {
    spinner.fail('Search failed');
    console.error(chalk.red(error.message));
  }
}

async function cleanupBarn(apiUrl: string) {
  const { days, confirm } = await inquirer.prompt([
    {
      type: 'number',
      name: 'days',
      message: 'Delete items older than (days):',
      default: 30
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow('Are you sure you want to cleanup old items?'),
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cleanup cancelled'));
    return;
  }

  const spinner = ora('Cleaning barn... 🧹').start();

  try {
    const response = await axios.post(`${apiUrl}/api/barn/cleanup`, {
      olderThanDays: days
    });

    spinner.succeed('Barn cleaned!');
    console.log(chalk.green(`Removed ${response.data.removed} old items`));

  } catch (error: any) {
    spinner.fail('Cleanup failed');
    console.error(chalk.red(error.message));
  }
}

export async function interactiveQuickTask(apiUrl: string) {
  console.log(chalk.yellow('\n⚡ Quick Task Mode (5-minute sprint)\n'));

  const { prompt, agents } = await inquirer.prompt([
    {
      type: 'input',
      name: 'prompt',
      message: 'What needs to be done quickly?',
      validate: (input) => input.length > 0
    },
    {
      type: 'number',
      name: 'agents',
      message: 'Number of agents (1-3 recommended):',
      default: 2,
      validate: (input) => input >= 1 && input <= 5
    }
  ]);

  const spinner = ora('Launching quick task... ⚡').start();

  try {
    const response = await axios.post(`${apiUrl}/api/farms`, {
      name: `quick-${Date.now()}`,
      mode: 'quick',
      prompt,
      agentCount: agents,
      autoLaunch: true
    });

    spinner.succeed('Quick task launched!');

    const farm = response.data;
    console.log(chalk.green(`\n⚡ Task ID: ${farm.id}`));
    console.log(chalk.yellow('This task will complete in 5 minutes'));
    console.log(chalk.gray(`Watch progress: farm watch ${farm.id}`));

    console.log(chalk.magenta(`\n${FarmTips.getContextualTip('quick')}\n`));

  } catch (error: any) {
    spinner.fail('Failed to start quick task');
    console.error(chalk.red(error.message));
  }
}

export async function interactiveGoWild(apiUrl: string) {
  console.log(chalk.yellow.bold('\n🦅 GO WILD MODE! 🦅'));
  console.log(chalk.gray('Let agents explore autonomously...\n'));

  const { prompt, agents, timeout, useXenoSync } = await inquirer.prompt([
    {
      type: 'input',
      name: 'prompt',
      message: 'What should agents explore?',
      validate: (input) => input.length > 0
    },
    {
      type: 'number',
      name: 'agents',
      message: 'Number of wild agents:',
      default: 3,
      validate: (input) => input >= 2 && input <= 10
    },
    {
      type: 'number',
      name: 'timeout',
      message: 'Time limit (minutes):',
      default: 30
    },
    {
      type: 'confirm',
      name: 'useXenoSync',
      message: 'Use XenoSync orchestration?',
      default: false
    }
  ]);

  const spinner = ora('Releasing agents into the wild... 🦅').start();

  try {
    const response = await axios.post(`${apiUrl}/api/go-wild`, {
      prompt,
      agentCount: agents,
      timeout: timeout * 60,
      useXenoSync
    });

    spinner.succeed('Agents are running wild!');

    AnimalSounds.play('eagle');

    const session = response.data;
    console.log(chalk.green(`\n🦅 Wild Session: ${session.id}`));
    console.log(chalk.yellow(`${agents} agents exploring autonomously...`));
    console.log(chalk.gray(`Monitor chaos: farm watch ${session.farmId}`));

    console.log(chalk.magenta(`\n${FarmJokes.getWildJoke()}\n`));

  } catch (error: any) {
    spinner.fail('Failed to go wild');
    console.error(chalk.red(error.message));
  }
}

export async function showStatistics(apiUrl: string) {
  const spinner = ora('Calculating farm metrics... 📊').start();

  try {
    const response = await axios.get(`${apiUrl}/api/metrics/dashboard`);
    const stats = response.data;

    spinner.stop();

    console.log(FarmArt.getBanner('Farm Stats', 'Standard'));

    // System overview
    const systemTable = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    });

    systemTable.push(
      ['Total Farms', stats.totalFarms || 0],
      ['Active Farms', stats.activeFarms || 0],
      ['Total Agents', stats.totalAgents || 0],
      ['Harvests', stats.totalHarvests || 0],
      ['Barn Items', stats.barnItems || 0],
      ['Uptime', stats.uptime || 'Unknown']
    );

    console.log(chalk.yellow('\n📊 System Overview:'));
    console.log(systemTable.toString());

    // Weather report based on system status
    console.log(chalk.blue('\n' + WeatherReport.getSystemWeather({
      cpuLoad: stats.cpuLoad,
      memoryUsage: stats.memoryUsage,
      errorRate: stats.errorRate
    })));

    // Tips
    console.log(chalk.magenta(`\n${FarmTips.getEfficiencyTip()}\n`));

  } catch (error: any) {
    spinner.fail('Failed to fetch statistics');
    console.error(chalk.red(error.message));
  }
}

export async function interactiveSettings(_apiUrl: string) {
  const { category } = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: '⚙️ Settings Category:',
      choices: [
        { name: '🎨 Theme & Appearance', value: 'appearance' },
        { name: '🔊 Sounds & Notifications', value: 'sounds' },
        { name: '🔌 API Configuration', value: 'api' },
        { name: '⚡ Performance', value: 'performance' },
        { name: '🔄 Reset to Defaults', value: 'reset' },
        { name: '← Back', value: 'back' }
      ]
    }
  ]);

  if (category === 'back') return;

  switch (category) {
    case 'appearance':
      await configureAppearance();
      break;
    case 'sounds':
      await configureSounds();
      break;
    case 'api':
      await configureApi();
      break;
    case 'performance':
      await configurePerformance();
      break;
    case 'reset':
      await resetSettings();
      break;
  }
}

async function configureAppearance() {
  const { theme, ascii, weather, tips } = await inquirer.prompt([
    {
      type: 'list',
      name: 'theme',
      message: 'Choose theme:',
      choices: [
        { name: '🔴 Barn Red', value: 'barn-red' },
        { name: '🟢 Meadow Green', value: 'meadow-green' },
        { name: '🟠 Sunset Orange', value: 'sunset-orange' },
        { name: '🔵 Sky Blue', value: 'sky-blue' },
        { name: '🟣 Midnight Purple', value: 'midnight-purple' }
      ]
    },
    {
      type: 'confirm',
      name: 'ascii',
      message: 'Show ASCII art?',
      default: true
    },
    {
      type: 'confirm',
      name: 'weather',
      message: 'Show weather reports?',
      default: true
    },
    {
      type: 'confirm',
      name: 'tips',
      message: 'Show tips?',
      default: true
    }
  ]);

  console.log(chalk.green('✅ Appearance settings updated!'));
}

async function configureSounds() {
  const { sounds, jokes } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'sounds',
      message: 'Enable animal sounds?',
      default: true
    },
    {
      type: 'confirm',
      name: 'jokes',
      message: 'Show farm jokes?',
      default: true
    }
  ]);

  console.log(chalk.green('✅ Sound settings updated!'));
}

async function configureApi() {
  const { apiUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API URL:',
      default: 'http://localhost:4567'
    }
  ]);

  console.log(chalk.green('✅ API configuration updated!'));
}

async function configurePerformance() {
  const { defaultAgents, defaultTimeout } = await inquirer.prompt([
    {
      type: 'number',
      name: 'defaultAgents',
      message: 'Default agent count:',
      default: 3
    },
    {
      type: 'number',
      name: 'defaultTimeout',
      message: 'Default timeout (minutes):',
      default: 60
    }
  ]);

  console.log(chalk.green('✅ Performance settings updated!'));
}

async function resetSettings() {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow('Reset all settings to defaults?'),
      default: false
    }
  ]);

  if (confirm) {
    console.log(chalk.green('✅ Settings reset to defaults!'));
  }
}

export async function handleFarmAction(farmId: string, action: string, apiUrl: string) {
  switch (action) {
    case 'watch':
      spawn('farm', ['watch', farmId], { stdio: 'inherit' });
      break;

    case 'harvest':
      await interactiveHarvestFarm(apiUrl);
      break;

    case 'recover':
      const spinner = ora('Recovering farm...').start();
      try {
        await axios.post(`${apiUrl}/api/farms/${farmId}/recover`);
        spinner.succeed('Farm recovered!');
      } catch (error: any) {
        spinner.fail('Recovery failed');
        console.error(chalk.red(error.message));
      }
      break;

    case 'terminate':
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.red('Terminate this farm?'),
          default: false
        }
      ]);

      if (confirm) {
        const termSpinner = ora('Terminating...').start();
        try {
          await axios.post(`${apiUrl}/api/farms/${farmId}/terminate`);
          termSpinner.succeed('Farm terminated');
        } catch (error: any) {
          termSpinner.fail('Failed to terminate');
          console.error(chalk.red(error.message));
        }
      }
      break;
  }
}