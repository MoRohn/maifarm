import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { Farm } from '../types/farm';

interface LaunchOptions {
  farmId: string;
  numberOfAgents: number;
  prompt: string;
  contextFiles?: string[];
  collaborative?: boolean;
  bundleSteps?: number;
}

export class FarmLauncher {
  private scriptsDir: string;
  private coordDir: string;

  constructor() {
    this.scriptsDir = path.join(process.cwd(), 'scripts');
    this.coordDir = '/tmp/claude_coordination';
  }

  async launchFarm(options: LaunchOptions): Promise<{ success: boolean; message: string }> {
    try {
      // Ensure coordination directory exists
      await fs.mkdir(this.coordDir, { recursive: true });

      // Create a temporary YAML file for the farm configuration
      const configFile = path.join(this.coordDir, `farm_${options.farmId}.yaml`);
      const yamlConfig = {
        name: `Farm ${options.farmId}`,
        initial_prompt: options.prompt,
        context_files: options.contextFiles || [],
      };

      await fs.writeFile(configFile, yaml.dump(yamlConfig));

      // Build the command
      const scriptPath = path.join(process.cwd(), 'multi_claude.py');
      const args = [
        scriptPath,
        '-n', options.numberOfAgents.toString(),
        '--prompt-file', configFile,
        '--session', `farm_${options.farmId}`
      ];

      // Add collaboration flag if needed
      if (options.collaborative) {
        args.push('--collaborative');
      }

      // Add bundle steps if specified
      if (options.bundleSteps) {
        args.push('--bundle-steps', options.bundleSteps.toString());
      }

      // Spawn the process
      const pythonProcess = spawn('python3', args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env }
      });

      // Allow the process to continue running independently
      pythonProcess.unref();

      // Log the launch
      console.log(`[FarmLauncher] Launched farm ${options.farmId} with ${options.numberOfAgents} agents`);
      if (options.contextFiles?.length) {
        console.log(`[FarmLauncher] Included ${options.contextFiles.length} context files`);
      }

      return {
        success: true,
        message: `Farm ${options.farmId} launched successfully with ${options.numberOfAgents} agents`
      };
    } catch (error) {
      console.error('[FarmLauncher] Error launching farm:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to launch farm'
      };
    }
  }

  async stopFarm(farmId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Kill the tmux session
      const sessionName = `farm_${farmId}`;
      const killCommand = spawn('tmux', ['kill-session', '-t', sessionName]);
      
      return new Promise((resolve) => {
        killCommand.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              message: `Farm ${farmId} stopped successfully`
            });
          } else {
            resolve({
              success: false,
              message: `Failed to stop farm ${farmId}`
            });
          }
        });
      });
    } catch (error) {
      console.error('[FarmLauncher] Error stopping farm:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to stop farm'
      };
    }
  }

  async getFarmStatus(farmId: string): Promise<{ active: boolean; agents: number }> {
    try {
      const sessionName = `farm_${farmId}`;
      
      // Check if tmux session exists
      const checkCommand = spawn('tmux', ['has-session', '-t', sessionName]);
      
      return new Promise((resolve) => {
        checkCommand.on('close', (code) => {
          if (code === 0) {
            // Session exists, count panes
            const countCommand = spawn('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_id}']);
            let output = '';
            
            countCommand.stdout.on('data', (data) => {
              output += data.toString();
            });
            
            countCommand.on('close', () => {
              const paneCount = output.split('\n').filter(line => line.trim()).length;
              resolve({ active: true, agents: paneCount });
            });
          } else {
            resolve({ active: false, agents: 0 });
          }
        });
      });
    } catch (error) {
      console.error('[FarmLauncher] Error checking farm status:', error);
      return { active: false, agents: 0 };
    }
  }
}

export const farmLauncher = new FarmLauncher();