/**
 * Incubation Commands - Farm evolution and lineage tracking
 *
 * Provides CLI interface for the incubation system:
 * - Start manual incubation
 * - Monitor incubation progress
 * - Control incubation (pause/resume/stop)
 * - View farm lineage
 */

import { spawn, execSync } from 'child_process';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import inquirer from 'inquirer';
import boxen from 'boxen';

interface IncubationSession {
  id: string;
  farmId: string;
  harvestId: string;
  status: string;
  currentStage: number;
  totalStages: number;
  controlState: string;
  progress?: number;
  userContext?: string;
  createdAt: string;
  updatedAt: string;
}

interface Farm {
  id: string;
  name: string;
  status: string;
  agentCount?: number;
  parentFarmId?: string;
  incubationVersion?: number;
  incubationLineage?: string[];
  createdAt: string;
}

export class IncubateCommands {
  private apiUrl: string;
  private socket: Socket | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Start incubation for a farm
   */
  async startIncubation(
    farmId: string,
    options: {
      context?: string;
      promptFile?: string;
      noWait?: boolean;
    }
  ) {
    const spinner = ora('Starting incubation... 🌱').start();

    try {
      // Get farm info first
      const farmResponse = await axios.get(`${this.apiUrl}/api/farms/${farmId}`);
      const farm = farmResponse.data.data || farmResponse.data;

      spinner.text = 'Checking farm eligibility...';

      // Get latest harvest
      const harvestResponse = await axios.get(`${this.apiUrl}/api/farms/${farmId}/harvests`);
      const harvests = harvestResponse.data.data || harvestResponse.data;

      if (!harvests || harvests.length === 0) {
        spinner.fail('No harvests found for this farm');
        console.log(chalk.yellow('\n💡 Tip: Complete and harvest the farm first before incubating'));
        return;
      }

      const latestHarvest = harvests[0];

      spinner.text = 'Preparing incubation prompt...';

      // Read custom prompt if file provided
      let userContext = options.context;
      if (options.promptFile) {
        try {
          const fs = await import('fs');
          userContext = fs.readFileSync(options.promptFile, 'utf-8');
        } catch (error: any) {
          spinner.fail(`Failed to read prompt file: ${options.promptFile}`);
          console.error(chalk.red(error.message));
          return;
        }
      }

      spinner.text = 'Launching incubation agent... 🚀';

      // Start incubation
      const response = await axios.post(`${this.apiUrl}/api/incubations/start`, {
        farmId,
        harvestId: latestHarvest.id,
        userContext,
      });

      const session = response.data.data || response.data;

      spinner.succeed(chalk.green('Incubation started! 🎉'));

      // Display session details
      const table = new Table({
        head: ['Field', 'Value'],
        style: {
          head: ['green'],
          border: ['yellow']
        }
      });

      table.push(
        ['Session ID', chalk.cyan(session.id)],
        ['Farm', `${farm.name} (${farmId.substring(0, 8)})`],
        ['Version', `v${farm.incubationVersion || 1}.0 → v${(farm.incubationVersion || 1) + 1}.0`],
        ['Status', chalk.green(session.status)],
        ['Stages', `${session.currentStage}/${session.totalStages}`],
        ['Control', chalk.yellow(session.controlState)]
      );

      console.log('\n' + table.toString());

      if (userContext) {
        console.log(chalk.magenta('\n📝 User Context:'));
        console.log(chalk.gray(userContext.substring(0, 200) + (userContext.length > 200 ? '...' : '')));
      }

      console.log(chalk.yellow('\n🌱 Incubation Stages:'));
      console.log(chalk.gray('  1. Contextual Grounding (20%)'));
      console.log(chalk.gray('  2. Gap & Potential Scan (40%)'));
      console.log(chalk.gray('  3. Evolutionary Leap (60%)'));
      console.log(chalk.gray('  4. Validation Simulation (80%)'));
      console.log(chalk.gray('  5. Deliverable Format (100%)'));

      console.log(chalk.cyan(`\n💡 Watch progress: farm incubate watch ${session.id}`));
      console.log(chalk.gray(`   Check status: farm incubate status ${session.id}`));

      // Auto-watch if not disabled
      if (!options.noWait) {
        console.log('\n');
        await this.watchIncubation(session.id);
      }

    } catch (error: any) {
      spinner.fail(chalk.red('Failed to start incubation'));

      if (error.response?.status === 404) {
        console.error(chalk.red('Farm not found or not eligible for incubation'));
      } else if (error.response?.status === 400) {
        console.error(chalk.red(error.response.data.message || 'Bad request'));
      } else {
        console.error(chalk.red(error.response?.data?.message || error.message));
      }

      console.log(chalk.yellow('\n💡 Tips:'));
      console.log(chalk.gray('  • Ensure the farm is completed and harvested'));
      console.log(chalk.gray('  • Check farm status with: farm list'));
    }
  }

  /**
   * Check incubation status
   */
  async checkStatus(sessionId: string) {
    const spinner = ora('Checking incubation status...').start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/incubations/${sessionId}`);
      const session: IncubationSession = response.data.data || response.data;

      spinner.stop();

      // Display status box
      console.log(boxen(
        chalk.green.bold('🌱 Incubation Status\n') +
        chalk.gray('━'.repeat(42)),
        { padding: 1, borderColor: 'green', borderStyle: 'round' }
      ));

      const table = new Table({
        head: ['Field', 'Value'],
        style: { head: ['cyan'] },
        colWidths: [20, 40]
      });

      const statusColor = session.status === 'completed' ? 'green' :
                         session.status === 'incubating' ? 'yellow' :
                         session.status === 'failed' ? 'red' :
                         session.status === 'paused' ? 'magenta' : 'gray';

      const coloredStatus = chalk[statusColor as 'green' | 'yellow' | 'red' | 'magenta' | 'gray'](session.status.toUpperCase());

      const progress = session.progress || (session.currentStage / session.totalStages) * 100;

      table.push(
        ['Session ID', session.id.substring(0, 16) + '...'],
        ['Farm ID', session.farmId.substring(0, 16) + '...'],
        ['Status', coloredStatus],
        ['Progress', this.formatProgressBar(progress)],
        ['Current Stage', `${session.currentStage}/${session.totalStages}`],
        ['Control State', session.controlState === 'running' ? chalk.green(session.controlState) : chalk.yellow(session.controlState)],
        ['Started', new Date(session.createdAt).toLocaleString()],
        ['Duration', this.formatDuration(session.createdAt)]
      );

      console.log('\n' + table.toString());

      // Show stage details
      console.log(chalk.cyan('\n📊 Stage Progress:'));
      const stages = [
        'Contextual Grounding',
        'Gap & Potential Scan',
        'Evolutionary Leap',
        'Validation Simulation',
        'Deliverable Format'
      ];

      stages.forEach((stageName, index) => {
        const stageNum = index + 1;
        const icon = stageNum < session.currentStage ? '✓' :
                    stageNum === session.currentStage ? '⟳' : '○';
        const color = stageNum < session.currentStage ? chalk.green :
                     stageNum === session.currentStage ? chalk.yellow : chalk.gray;
        const percentage = stageNum < session.currentStage ? '100%' :
                          stageNum === session.currentStage ? `${progress.toFixed(0)}%` : '0%';

        console.log(color(`  ${icon} ${stageNum}. ${stageName.padEnd(25)} (${percentage})`));
      });

      // Control hints
      if (session.status === 'incubating') {
        console.log(chalk.yellow('\n🎮 Controls:'));
        if (session.controlState === 'running') {
          console.log(chalk.gray(`  • Pause: farm incubate pause ${session.id}`));
          console.log(chalk.gray(`  • Stop:  farm incubate stop ${session.id}`));
        } else if (session.controlState === 'paused') {
          console.log(chalk.gray(`  • Resume: farm incubate resume ${session.id}`));
          console.log(chalk.gray(`  • Stop:   farm incubate stop ${session.id}`));
        }
        console.log(chalk.gray(`  • Watch:  farm incubate watch ${session.id}`));
      }

    } catch (error: any) {
      spinner.fail('Failed to fetch incubation status');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Watch incubation progress in real-time
   */
  async watchIncubation(sessionId: string) {
    console.log(chalk.blue('🔭 Watching incubation progress...'));
    console.log(chalk.gray('Press Ctrl+C to stop watching (incubation continues)\n'));

    // Connect to WebSocket
    this.socket = io(this.apiUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    let lastProgress = 0;

    this.socket.on('connect', () => {
      console.log(chalk.green('🔌 Connected to live updates\n'));

      // Subscribe to incubation events
      this.socket!.emit('incubation:subscribe', { sessionId });
    });

    this.socket.on('incubation:stage-progress', (data: any) => {
      if (data.sessionId === sessionId) {
        const progress = data.progress || 0;
        const stageName = data.stageName || `Stage ${data.stage}`;

        // Only update if progress changed
        if (progress !== lastProgress) {
          lastProgress = progress;

          // Clear previous line
          process.stdout.write('\r' + ' '.repeat(80) + '\r');

          // Display progress
          const progressBar = this.formatProgressBar(progress);
          const message = data.message || 'Processing...';

          console.log(
            chalk.yellow(`[${new Date().toLocaleTimeString()}]`) +
            ` ${progressBar} ${chalk.cyan(stageName)} - ${chalk.gray(message)}`
          );
        }
      }
    });

    this.socket.on('incubation:completed', (data: any) => {
      if (data.sessionId === sessionId) {
        console.log(chalk.green('\n✓ Incubation completed successfully! 🎉'));
        console.log(chalk.cyan(`\nView lineage: farm incubate lineage ${data.farmId}`));
        this.socket!.disconnect();
        process.exit(0);
      }
    });

    this.socket.on('incubation:failed', (data: any) => {
      if (data.sessionId === sessionId) {
        console.log(chalk.red('\n✗ Incubation failed'));
        console.log(chalk.gray(`Reason: ${data.reason}`));
        this.socket!.disconnect();
        process.exit(1);
      }
    });

    this.socket.on('incubation:paused', (data: any) => {
      if (data.sessionId === sessionId) {
        console.log(chalk.magenta('\n⏸  Incubation paused'));
        console.log(chalk.gray(`Resume with: farm incubate resume ${sessionId}`));
      }
    });

    this.socket.on('incubation:resumed', (data: any) => {
      if (data.sessionId === sessionId) {
        console.log(chalk.green('\n▶  Incubation resumed'));
      }
    });

    this.socket.on('disconnect', () => {
      console.log(chalk.yellow('\n🔌 Lost connection to server'));
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n👋 Stopped watching (incubation continues in background)'));
      console.log(chalk.gray(`Check status: farm incubate status ${sessionId}`));
      this.socket!.disconnect();
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Pause incubation
   */
  async pauseIncubation(sessionId: string) {
    const spinner = ora('Pausing incubation...').start();

    try {
      await axios.post(`${this.apiUrl}/api/incubations/${sessionId}/pause`);
      spinner.succeed(chalk.magenta('⏸  Incubation paused'));

      console.log(chalk.gray(`\nResume with: farm incubate resume ${sessionId}`));

    } catch (error: any) {
      spinner.fail('Failed to pause incubation');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Resume incubation
   */
  async resumeIncubation(sessionId: string) {
    const spinner = ora('Resuming incubation...').start();

    try {
      await axios.post(`${this.apiUrl}/api/incubations/${sessionId}/resume`);
      spinner.succeed(chalk.green('▶  Incubation resumed'));

      console.log(chalk.gray(`\nWatch progress: farm incubate watch ${sessionId}`));

    } catch (error: any) {
      spinner.fail('Failed to resume incubation');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Stop incubation
   */
  async stopIncubation(sessionId: string, options: { reason?: string }) {
    // Confirm before stopping
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure you want to stop this incubation? This cannot be undone.',
        default: false
      }
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    const spinner = ora('Stopping incubation...').start();

    try {
      await axios.post(`${this.apiUrl}/api/incubations/${sessionId}/stop`, {
        reason: options.reason
      });

      spinner.succeed(chalk.red('⏹  Incubation stopped'));

      if (options.reason) {
        console.log(chalk.gray(`Reason: ${options.reason}`));
      }

    } catch (error: any) {
      spinner.fail('Failed to stop incubation');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * View farm lineage
   */
  async viewLineage(farmId: string) {
    const spinner = ora('Loading farm lineage...').start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/farms/${farmId}/lineage`);
      const lineage = response.data.data || response.data;

      spinner.stop();

      console.log(boxen(
        chalk.green.bold('🌳 Incubation Lineage\n') +
        chalk.gray('━'.repeat(42)),
        { padding: 1, borderColor: 'green', borderStyle: 'double' }
      ));

      if (!lineage.ancestors || lineage.ancestors.length === 0) {
        console.log(chalk.yellow('\n🌱 This is a first-generation farm (no ancestry)'));
        console.log(chalk.gray(`Farm ID: ${farmId}`));
        return;
      }

      console.log('');

      // Display lineage tree
      const allFarms = [...lineage.ancestors, lineage.current];

      allFarms.forEach((farm: Farm, index: number) => {
        const isCurrent = index === allFarms.length - 1;
        const version = farm.incubationVersion || 1;
        const prefix = index === 0 ? '' : '   ↓  ';
        const icon = isCurrent ? '← Current' : '';

        console.log(
          chalk.cyan(`v${version}.0`) +
          '  ' +
          chalk.green(farm.id.substring(0, 12) + '...') +
          '  ' +
          chalk.yellow(`"${farm.name}"`) +
          '  ' +
          (isCurrent ? chalk.green.bold(icon) : '')
        );

        if (!isCurrent) {
          console.log(chalk.gray(`       ↓  (Created: ${new Date(farm.createdAt).toLocaleString()})`));
        } else {
          console.log(chalk.gray(`       (Created: ${new Date(farm.createdAt).toLocaleString()})`));
        }
      });

      console.log(chalk.cyan(`\nTotal Generations: ${allFarms.length}`));

      // Show descendants if any
      if (lineage.descendants && lineage.descendants.length > 0) {
        console.log(chalk.magenta(`\n🌱 Descendants: ${lineage.descendants.length}`));
        lineage.descendants.forEach((desc: Farm) => {
          console.log(chalk.gray(`  • v${desc.incubationVersion || 1}.0 - ${desc.name} (${desc.id.substring(0, 12)}...)`));
        });
      }

      console.log(chalk.gray(`\nView farm: farm show ${farmId}`));

    } catch (error: any) {
      spinner.fail('Failed to load lineage');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * List incubation sessions
   */
  async listSessions(options: {
    farmId?: string;
    status?: string;
    limit?: number;
  }) {
    const spinner = ora('Loading incubation sessions...').start();

    try {
      let url = `${this.apiUrl}/api/incubations`;

      if (options.farmId) {
        url = `${this.apiUrl}/api/farms/${options.farmId}/incubations`;
      }

      const response = await axios.get(url, {
        params: {
          status: options.status,
          limit: options.limit || 20
        }
      });

      const sessions = response.data.data || response.data;

      spinner.stop();

      if (!sessions || sessions.length === 0) {
        console.log(chalk.yellow('🌵 No incubation sessions found'));
        return;
      }

      console.log(chalk.green.bold(`\n🌱 Incubation Sessions (${sessions.length})\n`));

      const table = new Table({
        head: ['Session ID', 'Farm ID', 'Status', 'Progress', 'Started'],
        style: { head: ['cyan'] },
        colWidths: [20, 20, 15, 12, 20]
      });

      sessions.forEach((session: IncubationSession) => {
        const statusColor = session.status === 'completed' ? chalk.green :
                           session.status === 'incubating' ? chalk.yellow :
                           session.status === 'failed' ? chalk.red :
                           session.status === 'paused' ? chalk.magenta : chalk.gray;

        const progress = session.progress || (session.currentStage / session.totalStages) * 100;

        table.push([
          session.id.substring(0, 18) + '...',
          session.farmId.substring(0, 18) + '...',
          statusColor(session.status),
          `${progress.toFixed(0)}%`,
          this.formatTimeAgo(session.createdAt)
        ]);
      });

      console.log(table.toString());

      console.log(chalk.gray(`\nTotal: ${sessions.length} sessions`));
      console.log(chalk.cyan(`\nView details: farm incubate status <session-id>`));

    } catch (error: any) {
      spinner.fail('Failed to load sessions');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  }

  /**
   * Format progress bar
   */
  private formatProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentage = progress.toFixed(0).padStart(3, ' ');

    return `[${chalk.green(bar)}] ${percentage}%`;
  }

  /**
   * Format duration
   */
  private formatDuration(startTime: string): string {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diff = now - start;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format time ago
   */
  private formatTimeAgo(timestamp: string): string {
    const time = new Date(timestamp).getTime();
    const now = Date.now();
    const diff = now - time;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }
}

export default IncubateCommands;
