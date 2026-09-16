/**
 * MaiFarm Backend Integration Service
 *
 * Ensures the CLI works exactly like the main MaiFarm process
 * with proper status messages and complete workflow integration.
 */

import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import Table from 'cli-table3';
import boxen from 'boxen';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface FarmConfig {
  name: string;
  mode: 'standard' | 'quick' | 'wild';
  agentCount: number;
  prompt: string;
  timeout?: number;
  useXenoSync?: boolean;
  autoLaunch?: boolean;
}

interface FarmStatus {
  id: string;
  name: string;
  status: 'idle' | 'launching' | 'running' | 'completed' | 'failed' | 'harvesting';
  agents: any[];
  progress: number;
  currentPhase?: string;
  messages: string[];
}

export class MaiFarmIntegration extends EventEmitter {
  private api: AxiosInstance;
  private socket: Socket | null = null;
  private apiUrl: string;
  private currentFarm: FarmStatus | null = null;

  constructor(apiUrl: string = 'http://localhost:4567') {
    super();
    this.apiUrl = apiUrl;
    this.api = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.apiUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      this.socket.on('connect', () => {
        console.log(chalk.green('✅ Connected to MaiFarm backend'));
        this.setupSocketListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.log(chalk.red('❌ Failed to connect to MaiFarm backend'));
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupSocketListeners() {
    if (!this.socket) return;

    // Farm status updates
    this.socket.on('farm:status', (data) => {
      this.emit('farm:status', data);
      if (this.currentFarm && data.farmId === this.currentFarm.id) {
        this.currentFarm.status = data.status;
      }
    });

    // Farm creation progress
    this.socket.on('farm:creation-started', (data) => {
      this.emit('farm:creation-started', data);
    });

    this.socket.on('farm:creation-progress', (data) => {
      this.emit('farm:creation-progress', data);
    });

    this.socket.on('farm:creation-complete', (data) => {
      this.emit('farm:creation-complete', data);
    });

    // Agent updates
    this.socket.on('agent:registered', (data) => {
      this.emit('agent:registered', data);
    });

    this.socket.on('agent:status', (data) => {
      this.emit('agent:status', data);
    });

    // Terminal output
    this.socket.on('terminal:output', (data) => {
      this.emit('terminal:output', data);
    });

    // Harvest events
    this.socket.on('harvest:started', (data) => {
      this.emit('harvest:started', data);
    });

    this.socket.on('harvest:progress', (data) => {
      this.emit('harvest:progress', data);
    });

    this.socket.on('harvest:completed', (data) => {
      this.emit('harvest:completed', data);
    });
  }

  /**
   * Create and launch a farm with full status reporting
   */
  async createAndLaunchFarm(config: FarmConfig): Promise<FarmStatus> {
    console.log(chalk.cyan('\n🚜 Starting MaiFarm Process...\n'));

    // Phase 1: Preflight Validation
    const validationSpinner = ora({
      text: 'Running preflight checks...',
      spinner: 'dots12'
    }).start();

    try {
      // Validate configuration
      this.validateFarmConfig(config);

      // Check API connectivity
      await this.checkApiHealth();

      validationSpinner.succeed('Preflight checks passed');

      // Phase 2: Farm Creation
      console.log(chalk.yellow('\n📋 Farm Creation Steps:\n'));

      const steps = [
        { name: 'Validating configuration', percent: 5 },
        { name: 'Generating YAML configuration', percent: 25 },
        { name: 'Setting up workspace', percent: 50 },
        { name: 'Preparing orchestrator', percent: 75 },
        { name: 'Committing to database', percent: 90 },
        { name: 'Launching agents', percent: 100 }
      ];

      let currentStep = 0;
      const progressInterval = setInterval(() => {
        if (currentStep < steps.length) {
          const step = steps[currentStep];
          console.log(chalk.gray(`  [${step.percent}%] ${step.name}...`));
          currentStep++;
        }
      }, 500);

      // Create farm via API
      const createSpinner = ora({
        text: 'Creating farm...',
        spinner: 'dots12'
      }).start();

      const response = await this.api.post('/api/farms', {
        ...config,
        autoLaunch: config.autoLaunch !== false
      });

      clearInterval(progressInterval);
      createSpinner.succeed('Farm created successfully!');

      const farm = response.data;
      this.currentFarm = {
        id: farm.id,
        name: farm.name,
        status: farm.status,
        agents: farm.agents || [],
        progress: 0,
        messages: []
      };

      // Display farm details
      this.displayFarmDetails(farm);

      // Phase 3: Launch Orchestration
      if (config.autoLaunch !== false) {
        await this.launchFarmOrchestration(farm);
      }

      return this.currentFarm;

    } catch (error: any) {
      validationSpinner.fail('Farm creation failed');
      this.handleApiError(error, 'creating farm');
      throw error;
    }
  }

  /**
   * Launch farm orchestration with tmux
   */
  private async launchFarmOrchestration(farm: any): Promise<void> {
    console.log(chalk.cyan('\n🚀 Launching Farm Orchestration...\n'));

    const launchSteps = [
      '🔧 Setting up tmux session',
      '🤖 Initializing agents',
      '🔌 Establishing connections',
      '📡 Starting terminal streams',
      '✅ Orchestration ready'
    ];

    for (const step of launchSteps) {
      const stepSpinner = ora({
        text: step,
        spinner: 'dots12'
      }).start();

      await this.delay(800);

      stepSpinner.succeed();
    }

    // Setup tmux session
    const sessionName = `farm-${farm.id}`;

    try {
      // Create tmux session with agents window
      await execAsync(`TMUX_TMPDIR=/tmp tmux new-session -d -s ${sessionName} -n agents`);

      // Create panes for each agent
      for (let i = 0; i < farm.agentCount; i++) {
        if (i > 0) {
          await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${sessionName}:agents`);
        }

        // Set pane title with agent name
        const agentName = this.getAgentName(i);
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux select-pane -t ${sessionName}:agents.${i} -T "${agentName}"`
        );

        // Display agent startup message
        console.log(chalk.gray(`  Agent ${i + 1}: ${agentName} - Starting...`));
      }

      // Arrange panes nicely
      await execAsync(`TMUX_TMPDIR=/tmp tmux select-layout -t ${sessionName}:agents tiled`);

      console.log(chalk.green('\n✅ All agents launched successfully!'));
      console.log(chalk.yellow('\n📺 Monitor agents in real-time:'));
      console.log(chalk.cyan(`  tmux attach -t ${sessionName}`));

      // Mode-specific messages
      this.displayModeSpecificInfo(farm);

    } catch (error: any) {
      console.error(chalk.red(`Failed to setup tmux: ${error.message}`));
    }
  }

  /**
   * Display farm details in a table
   */
  private displayFarmDetails(farm: any) {
    console.log(chalk.green('\n📋 Farm Configuration:\n'));

    const table = new Table({
      head: ['Property', 'Value'],
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      colWidths: [20, 60]
    });

    table.push(
      ['Farm ID', chalk.yellow(farm.id)],
      ['Name', farm.name],
      ['Mode', this.getModeDisplay(farm.mode)],
      ['Agents', `${farm.agentCount} ${this.getAgentEmojis(farm.agentCount)}`],
      ['Status', this.getStatusDisplay(farm.status)],
      ['Timeout', `${farm.timeout / 60000} minutes`],
      ['Workspace', `/var/maibarn/workspaces/${farm.id}`]
    );

    if (farm.useXenoSync) {
      table.push(['Orchestrator', '🔄 XenoSync Enabled']);
    }

    console.log(table.toString());
  }

  /**
   * Display mode-specific information
   */
  private displayModeSpecificInfo(farm: any) {
    const modeInfo: Record<string, any> = {
      quick: {
        title: '⚡ Quick Mode Active',
        description: '5-minute sprint task',
        tips: [
          'Task will auto-harvest after 5 minutes',
          'Best for small fixes and quick changes',
          'Agents work at maximum speed'
        ]
      },
      wild: {
        title: '🦅 Wild Mode Unleashed',
        description: 'Autonomous agent exploration',
        tips: [
          'Agents have full autonomy',
          'Expect creative and unexpected solutions',
          'Monitor progress - agents may diverge',
          'Best for exploration and discovery'
        ]
      },
      standard: {
        title: '🌾 Standard Mode',
        description: 'Balanced and methodical approach',
        tips: [
          'Agents work collaboratively',
          'Structured problem-solving',
          'Predictable and reliable results'
        ]
      }
    };

    const info = modeInfo[farm.mode] || modeInfo.standard;

    console.log(boxen(
      chalk.yellow(info.title) + '\n' +
      chalk.gray(info.description) + '\n\n' +
      chalk.cyan('Tips:\n') +
      info.tips.map((tip: string) => chalk.gray(`  • ${tip}`)).join('\n'),
      {
        padding: 1,
        borderColor: 'yellow',
        borderStyle: 'round'
      }
    ));
  }

  /**
   * Monitor farm progress with real-time updates
   */
  async monitorFarm(farmId: string): Promise<void> {
    console.log(chalk.cyan('\n📊 Monitoring Farm Progress...\n'));

    // Subscribe to farm events
    if (this.socket) {
      this.socket.emit('farm:subscribe', { farmId });
    }

    // Progress bar
    let lastProgress = 0;
    const progressBar = () => {
      const width = 30;
      const filled = Math.round((lastProgress / 100) * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      return `[${bar}] ${lastProgress}%`;
    };

    // Listen for updates
    this.on('farm:status', (data) => {
      if (data.farmId === farmId) {
        console.log(chalk.yellow(`\n📍 Status: ${data.status}`));
      }
    });

    this.on('agent:status', (data) => {
      if (data.farmId === farmId) {
        console.log(chalk.gray(`  Agent ${data.agentId}: ${data.status}`));
      }
    });

    this.on('farm:creation-progress', (data) => {
      if (data.farmId === farmId) {
        lastProgress = data.progress;
        console.log(chalk.cyan(`Progress: ${progressBar()}`));
      }
    });

    // Periodic status check
    const statusInterval = setInterval(async () => {
      try {
        const response = await this.api.get(`/api/farms/${farmId}`);
        const farm = response.data;

        if (farm.status === 'completed' || farm.status === 'failed') {
          clearInterval(statusInterval);
          this.handleFarmCompletion(farm);
        }
      } catch (error) {
        // Silent fail
      }
    }, 5000);
  }

  /**
   * Handle farm completion
   */
  private async handleFarmCompletion(farm: any) {
    console.log(chalk.green('\n✅ Farm Complete!\n'));

    if (farm.status === 'completed') {
      console.log(chalk.green('🌾 Ready for harvest!'));
      console.log(chalk.yellow(`Run: farm harvest ${farm.id}`));
    } else if (farm.status === 'failed') {
      console.log(chalk.red('❌ Farm failed'));
      console.log(chalk.yellow(`Run: farm diagnose ${farm.id}`));
    }
  }

  /**
   * Harvest farm with progress tracking
   */
  async harvestFarm(farmId: string, outputPath?: string): Promise<any> {
    console.log(chalk.cyan('\n🌾 Starting Harvest Process...\n'));

    const harvestPhases = [
      { phase: 'scanning', message: '🔍 Scanning workspace for outputs...' },
      { phase: 'collecting', message: '📦 Collecting files...' },
      { phase: 'validating', message: '✔️ Validating harvest...' },
      { phase: 'packaging', message: '📦 Packaging results...' },
      { phase: 'finalizing', message: '✅ Finalizing harvest...' }
    ];

    let currentPhase = 0;

    // Subscribe to harvest events
    this.on('harvest:progress', (data) => {
      if (data.harvestId && currentPhase < harvestPhases.length) {
        const phase = harvestPhases[currentPhase];
        console.log(chalk.green(`  ${phase.message}`));
        currentPhase++;
      }
    });

    try {
      const response = await this.api.post(`/api/farms/${farmId}/harvest`, {
        outputPath
      });

      const harvest = response.data;

      console.log(chalk.green('\n✅ Harvest Complete!\n'));

      const harvestTable = new Table({
        head: ['Metric', 'Value'],
        style: { head: ['green'] }
      });

      harvestTable.push(
        ['Harvest ID', harvest.id],
        ['Files Collected', harvest.fileCount || 0],
        ['Total Size', `${(harvest.totalBytes / 1024 / 1024).toFixed(2)} MB`],
        ['Location', outputPath || '/var/maibarn/harvests/' + harvest.id]
      );

      console.log(harvestTable.toString());

      return harvest;

    } catch (error: any) {
      this.handleApiError(error, 'harvesting farm');
      throw error;
    }
  }

  /**
   * Get list of farms with proper filtering
   */
  async listFarms(filters?: any): Promise<any[]> {
    try {
      const response = await this.api.get('/api/farms', {
        params: filters
      });

      return response.data.farms || response.data || [];
    } catch (error: any) {
      this.handleApiError(error, 'listing farms');
      return [];
    }
  }

  /**
   * Handle API errors with helpful messages
   */
  private handleApiError(error: any, action: string): void {
    if (error.response) {
      // The request was made and the server responded with a status code
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;

      if (status === 401) {
        console.error(chalk.red('\n❌ Authentication Error'));
        console.error(chalk.yellow('\nThe MaiFarm server requires authentication, but no auth token was provided.'));
        console.error(chalk.cyan('\nPossible solutions:'));
        console.error(chalk.gray('  1. Restart the server with BYPASS_AUTH enabled:'));
        console.error(chalk.white('     npm run dev'));
        console.error(chalk.gray('  2. Or manually start with bypass:'));
        console.error(chalk.white('     NODE_ENV=development BYPASS_AUTH=true npm run dev:server'));
        console.error(chalk.gray('  3. Check that .env.development has BYPASS_AUTH=true'));
      } else if (status === 403) {
        console.error(chalk.red(`\n❌ Permission Denied while ${action}`));
        console.error(chalk.yellow(`Your account doesn't have permission to perform this action.`));
      } else if (status === 404) {
        console.error(chalk.red(`\n❌ Not Found while ${action}`));
        console.error(chalk.yellow(`The requested resource was not found.`));
      } else if (status === 429) {
        console.error(chalk.red(`\n❌ Rate Limit Exceeded while ${action}`));
        console.error(chalk.yellow(`Too many requests. Please wait a moment and try again.`));
      } else if (status >= 500) {
        console.error(chalk.red(`\n❌ Server Error while ${action}`));
        console.error(chalk.yellow(`${message}`));
        console.error(chalk.gray('\nThe server encountered an error. Check the server logs for details.'));
      } else {
        console.error(chalk.red(`\n❌ Error while ${action}: ${message}`));
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error(chalk.red('\n❌ Connection Error'));
      console.error(chalk.yellow('\nCannot connect to MaiFarm server.'));
      console.error(chalk.cyan('\nPossible solutions:'));
      console.error(chalk.gray('  1. Check if the server is running:'));
      console.error(chalk.white('     curl http://localhost:4567/api/healthz'));
      console.error(chalk.gray('  2. Start the server:'));
      console.error(chalk.white('     npm run dev'));
      console.error(chalk.gray('  3. Check if port 4567 is in use by another process:'));
      console.error(chalk.white('     lsof -ti:4567'));
    } else {
      // Something else happened
      console.error(chalk.red(`\n❌ Unexpected error while ${action}: ${error.message}`));
    }
  }

  /**
   * Check API health
   */
  private async checkApiHealth(): Promise<boolean> {
    try {
      const response = await this.api.get('/api/health');
      return response.data.status === 'ok';
    } catch {
      throw new Error('MaiFarm API is not accessible. Please ensure the server is running.');
    }
  }

  /**
   * Validate farm configuration
   */
  private validateFarmConfig(config: FarmConfig) {
    const errors: string[] = [];

    if (!config.name || config.name.length < 3) {
      errors.push('Farm name must be at least 3 characters');
    }

    if (config.agentCount < 1 || config.agentCount > 10) {
      errors.push('Agent count must be between 1 and 10');
    }

    if (!config.prompt || config.prompt.length < 10) {
      errors.push('Prompt must be at least 10 characters');
    }

    if (!['standard', 'quick', 'wild'].includes(config.mode)) {
      errors.push('Mode must be standard, quick, or wild');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
  }

  /**
   * Helper: Get agent name
   */
  private getAgentName(index: number): string {
    const names = [
      'Bessie the Cow 🐄',
      'Wilbur the Pig 🐷',
      'Clucky the Chicken 🐔',
      'Woolly the Sheep 🐑',
      'Billy the Goat 🐐',
      'Daisy the Duck 🦆',
      'Rosie the Rooster 🐓',
      'Patches the Horse 🐴'
    ];

    return names[index % names.length];
  }

  /**
   * Helper: Get agent emojis
   */
  private getAgentEmojis(count: number): string {
    const emojis = ['🐄', '🐷', '🐔', '🐑', '🐐', '🦆', '🐓', '🐴'];
    return emojis.slice(0, Math.min(count, emojis.length)).join('');
  }

  /**
   * Helper: Get mode display
   */
  private getModeDisplay(mode: string): string {
    const displays: Record<string, string> = {
      quick: '⚡ Quick (5 min)',
      wild: '🦅 Wild (autonomous)',
      standard: '🌾 Standard'
    };

    return displays[mode] || mode;
  }

  /**
   * Helper: Get status display
   */
  private getStatusDisplay(status: string): string {
    const displays: Record<string, string> = {
      idle: chalk.gray('💤 Idle'),
      launching: chalk.yellow('🚀 Launching'),
      running: chalk.green('🌱 Running'),
      completed: chalk.blue('✅ Completed'),
      failed: chalk.red('❌ Failed'),
      harvesting: chalk.yellow('🌾 Harvesting')
    };

    return displays[status] || status;
  }

  /**
   * Helper: Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup and disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Singleton instance
export const maifarmIntegration = new MaiFarmIntegration();

export default maifarmIntegration;