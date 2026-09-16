/**
 * Farm Commands - Core farming operations with tmux integration
 *
 * Opens separate tmux panes for each agent during farming sessions
 * for a true multi-agent terminal experience! 🚜
 */

import { spawn, exec, execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import axios from 'axios';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class FarmCommands {
  private apiUrl: string;
  private tmuxSessionPrefix = 'farm-';

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Launch farm with tmux panes for each agent
   */
  async launchFarmWithTmux(farmId: string, agentCount: number, prompt: string) {
    const sessionName = `${this.tmuxSessionPrefix}${farmId}`;
    const spinner = ora('Setting up tmux session for agents...').start();

    try {
      // Check if tmux is installed
      try {
        execSync('which tmux', { stdio: 'ignore' });
      } catch {
        spinner.fail('tmux not installed!');
        console.log(chalk.yellow('\n💡 Install tmux:'));
        console.log(chalk.gray('  macOS: brew install tmux'));
        console.log(chalk.gray('  Ubuntu: sudo apt-get install tmux'));
        return false;
      }

      // Kill existing session if it exists
      try {
        await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName} 2>/dev/null`);
      } catch {
        // Session doesn't exist, that's fine
      }

      spinner.text = 'Creating tmux session for farm...';

      // Create new tmux session with first agent
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-session -d -s ${sessionName} -n agents`
      );

      // Set up the first pane (Agent 0)
      await this.setupAgentPane(sessionName, 0, prompt);

      // Create additional panes for other agents
      for (let i = 1; i < agentCount; i++) {
        spinner.text = `Setting up Agent ${i + 1} of ${agentCount}...`;

        // Split the window for each additional agent
        const splitDirection = i % 2 === 1 ? '-h' : '-v'; // Alternate horizontal/vertical
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux split-window ${splitDirection} -t ${sessionName}:agents`
        );

        // Set up the agent in the new pane
        await this.setupAgentPane(sessionName, i, prompt);
      }

      // Arrange panes nicely
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux select-layout -t ${sessionName}:agents tiled`
      );

      spinner.succeed('Tmux session created with all agents!');

      // Provide instructions to attach
      console.log(chalk.green('\n✨ Farm agents are running in tmux!'));
      console.log(chalk.yellow('\nTo view all agents simultaneously:'));
      console.log(chalk.cyan(`  tmux attach-session -t ${sessionName}`));
      console.log(chalk.yellow('\nTmux controls:'));
      console.log(chalk.gray('  • Ctrl+B, then D     - Detach (keep running)'));
      console.log(chalk.gray('  • Ctrl+B, then [     - Scroll mode (Q to exit)'));
      console.log(chalk.gray('  • Ctrl+B, then arrow - Switch between panes'));
      console.log(chalk.gray('  • Ctrl+B, then z     - Zoom current pane'));
      console.log(chalk.gray('  • Ctrl+B, then %     - Split horizontally'));
      console.log(chalk.gray('  • Ctrl+B, then "     - Split vertically'));
      console.log(chalk.gray('  • Ctrl+B, then x     - Close current pane'));

      return true;

    } catch (error: any) {
      spinner.fail('Failed to create tmux session');
      console.error(chalk.red(error.message));
      return false;
    }
  }

  /**
   * Set up individual agent pane
   */
  private async setupAgentPane(sessionName: string, agentIndex: number, prompt: string) {
    const paneId = `${sessionName}:agents.${agentIndex}`;

    // Send a welcome message to the pane
    const agentName = this.getAgentName(agentIndex);
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux send-keys -t ${paneId} "echo '🤖 ${agentName} starting...'" Enter`
    );

    // Set pane title
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux select-pane -t ${paneId} -T "${agentName}"`
    );

    // Here we would normally launch the actual Claude CLI
    // For now, we'll simulate it
    const claudeCommand = `claude --dangerously-skip-permissions -p "${prompt.replace(/"/g, '\\"')}"`;

    // Send the command to the pane
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux send-keys -t ${paneId} "${claudeCommand}" Enter`
    );
  }

  /**
   * Open tmux dashboard for monitoring
   */
  async openTmuxDashboard(farmId: string) {
    const sessionName = `${this.tmuxSessionPrefix}${farmId}`;
    const dashboardSession = `dashboard-${farmId}`;

    console.log(chalk.yellow('\n📊 Opening farm dashboard in tmux...\n'));

    try {
      // Check if farm session exists
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep ${sessionName} || echo ""`
      );

      if (!stdout.trim()) {
        console.log(chalk.red('❌ Farm session not found!'));
        return;
      }

      // Kill existing dashboard if it exists
      try {
        await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${dashboardSession} 2>/dev/null`);
      } catch {
        // Dashboard doesn't exist, that's fine
      }

      // Create dashboard session
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-session -d -s ${dashboardSession} -n overview`
      );

      // Window 0: Farm overview
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux send-keys -t ${dashboardSession}:0 "watch -n 2 'curl -s ${this.apiUrl}/api/farms/${farmId} | jq .'" Enter`
      );

      // Window 1: Agent status grid
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-window -t ${dashboardSession} -n agents`
      );
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux send-keys -t ${dashboardSession}:1 "TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName}:agents -F '#{pane_index}: #{pane_title} [#{pane_width}x#{pane_height}]'" Enter`
      );

      // Window 2: Live metrics
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-window -t ${dashboardSession} -n metrics`
      );
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux send-keys -t ${dashboardSession}:2 "watch -n 1 'curl -s ${this.apiUrl}/api/metrics/terminals/${farmId} | jq .'" Enter`
      );

      // Window 3: Terminal output tail
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-window -t ${dashboardSession} -n logs`
      );
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux send-keys -t ${dashboardSession}:3 "tail -f /var/maibarn/terminals/${farmId}/*.log 2>/dev/null || echo 'Waiting for logs...'" Enter`
      );

      console.log(chalk.green('✅ Dashboard created successfully!'));
      console.log(chalk.yellow('\nAttach to dashboard:'));
      console.log(chalk.cyan(`  tmux attach-session -t ${dashboardSession}`));
      console.log(chalk.yellow('\nDashboard windows:'));
      console.log(chalk.gray('  • Window 0: Farm overview (Ctrl+B, 0)'));
      console.log(chalk.gray('  • Window 1: Agent status (Ctrl+B, 1)'));
      console.log(chalk.gray('  • Window 2: Live metrics (Ctrl+B, 2)'));
      console.log(chalk.gray('  • Window 3: Terminal logs (Ctrl+B, 3)'));

    } catch (error: any) {
      console.error(chalk.red('Failed to create dashboard:'), error.message);
    }
  }

  /**
   * Attach to existing farm tmux session
   */
  async attachToFarm(farmId: string, agentId?: number) {
    const sessionName = `${this.tmuxSessionPrefix}${farmId}`;

    try {
      // Check if session exists
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep ${sessionName} || echo ""`
      );

      if (!stdout.trim()) {
        console.log(chalk.red('❌ Farm session not found!'));
        console.log(chalk.yellow('The farm might not be running or tmux session was terminated.'));
        return;
      }

      if (agentId !== undefined) {
        // Attach to specific agent pane
        console.log(chalk.green(`\n🔗 Attaching to Agent ${agentId}...\n`));

        // Focus on specific pane and zoom it
        const attachCmd = spawn('tmux', [
          'attach-session',
          '-t', `${sessionName}:agents.${agentId}`
        ], {
          stdio: 'inherit',
          env: { ...process.env, TMUX_TMPDIR: '/tmp' }
        });

        attachCmd.on('exit', () => {
          console.log(chalk.yellow('\n👋 Detached from agent session'));
        });
      } else {
        // Attach to full session
        console.log(chalk.green(`\n🔗 Attaching to farm session...\n`));

        const attachCmd = spawn('tmux', [
          'attach-session',
          '-t', sessionName
        ], {
          stdio: 'inherit',
          env: { ...process.env, TMUX_TMPDIR: '/tmp' }
        });

        attachCmd.on('exit', () => {
          console.log(chalk.yellow('\n👋 Detached from farm session'));
        });
      }

    } catch (error: any) {
      console.error(chalk.red('Failed to attach to session:'), error.message);
    }
  }

  /**
   * List all active tmux farm sessions
   */
  async listTmuxSessions() {
    const spinner = ora('Checking active farm sessions...').start();

    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "^${this.tmuxSessionPrefix}" || echo ""`
      );

      spinner.stop();

      if (!stdout.trim()) {
        console.log(chalk.yellow('🌵 No active tmux farm sessions found.'));
        return;
      }

      const sessions = stdout.trim().split('\n');
      console.log(chalk.green(`\n🚜 Active Farm Sessions (${sessions.length}):\n`));

      const table = new Table({
        head: ['Session Name', 'Windows', 'Created', 'Attached'],
        style: { head: ['cyan'] }
      });

      for (const session of sessions) {
        const parts = session.split(':');
        const sessionName = parts[0];
        const sessionInfo = parts.slice(1).join(':').trim();

        // Extract info from session listing
        const windowMatch = sessionInfo.match(/(\d+) windows/);
        const windows = windowMatch ? windowMatch[1] : '0';
        const attached = sessionInfo.includes('attached') ? '✅' : '❌';

        // Get creation time
        const { stdout: created } = await execAsync(
          `TMUX_TMPDIR=/tmp tmux list-sessions -F '#{session_name}: #{session_created}' | grep ${sessionName} | cut -d: -f2`
        ).catch(() => ({ stdout: 'Unknown' }));

        table.push([
          sessionName,
          windows,
          new Date(parseInt(created.trim()) * 1000).toLocaleString(),
          attached
        ]);
      }

      console.log(table.toString());

      console.log(chalk.yellow('\nTmux commands:'));
      console.log(chalk.gray('  • Attach: tmux attach -t <session-name>'));
      console.log(chalk.gray('  • List panes: tmux list-panes -t <session-name>:agents'));
      console.log(chalk.gray('  • Kill session: tmux kill-session -t <session-name>'));

    } catch (error: any) {
      spinner.fail('Failed to list tmux sessions');
      console.error(chalk.red(error.message));
    }
  }

  /**
   * Generate fun agent names
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
      'Patches the Horse 🐴',
      'Bella the Bunny 🐰',
      'Oscar the Ox 🐂'
    ];

    return names[index % names.length] || `Agent ${index + 1} 🤖`;
  }

  /**
   * Create split-screen tmux layout for multiple farms
   */
  async createMultiFarmView(farmIds: string[]) {
    const sessionName = `multifarm-${Date.now()}`;
    const spinner = ora('Creating multi-farm view...').start();

    try {
      // Create new session
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux new-session -d -s ${sessionName} -n farms`
      );

      // Create panes for each farm
      for (let i = 0; i < farmIds.length; i++) {
        if (i > 0) {
          await execAsync(
            `TMUX_TMPDIR=/tmp tmux split-window -t ${sessionName}:farms`
          );
        }

        // Monitor each farm in its pane
        const paneId = `${sessionName}:farms.${i}`;
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux send-keys -t ${paneId} "watch -n 2 'echo \"=== Farm ${farmIds[i]} ===\"; curl -s ${this.apiUrl}/api/farms/${farmIds[i]} | jq .status,.agentCount,.mode'" Enter`
        );
      }

      // Arrange panes
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux select-layout -t ${sessionName}:farms even-vertical`
      );

      spinner.succeed('Multi-farm view created!');

      console.log(chalk.green('\n👀 Monitoring multiple farms!'));
      console.log(chalk.cyan(`  tmux attach -t ${sessionName}`));

    } catch (error: any) {
      spinner.fail('Failed to create multi-farm view');
      console.error(chalk.red(error.message));
    }
  }
}

export default FarmCommands;