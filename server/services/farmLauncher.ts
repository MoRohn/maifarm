import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { Farm } from '../types/farm';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';

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
    // Use centralized path configuration for coordination directory
    this.coordDir = pathConfig.getPath('COORDINATION_DIR');
  }

  async launchFarm(options: LaunchOptions): Promise<{ success: boolean; message: string }> {
    try {
      // Ensure coordination directory exists using fileManager
      await fileManager.ensureDirectory(this.coordDir);

      // Create a YAML file for the farm configuration in the isolated coordination directory
      const configFile = pathConfig.getFarmCoordinationPath(options.farmId);
      const yamlConfig = {
        name: `Farm ${options.farmId}`,
        initial_prompt: options.prompt,
        context_files: options.contextFiles || [],
      };

      // Use fileManager to write the config file with validation
      await fileManager.writeFile(configFile, yaml.dump(yamlConfig));

      // Build the command
      const scriptPath = path.join(process.cwd(), 'orchestrator.py');
      // Use consistent session naming: farm_<first-8-chars-of-id> or quick_<task-id> for quick tasks
      let sessionName: string;
      if (options.farmId.startsWith('quick-task-')) {
        const taskId = options.farmId.replace('quick-task-', '').substring(0, 8);
        sessionName = `quick_${taskId}`;
      } else {
        sessionName = `farm_${options.farmId.substring(0, 8)}`;
      }
      const args = [
        scriptPath,
        '-n', options.numberOfAgents.toString(),
        '--prompt-file', configFile,
        '--session', sessionName
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
      console.log(`[FarmLauncher] Using tmux session name: ${sessionName}`);
      if (options.contextFiles?.length) {
        console.log(`[FarmLauncher] Included ${options.contextFiles.length} context files`);
      }

      return {
        success: true,
        message: `Farm ${options.farmId} launched successfully with ${options.numberOfAgents} agents`,
        sessionName
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
      // Kill the tmux session - use same naming convention
      let sessionName: string;
      if (farmId.startsWith('quick-task-')) {
        const taskId = farmId.replace('quick-task-', '').substring(0, 8);
        sessionName = `quick_${taskId}`;
      } else {
        sessionName = `farm_${farmId.substring(0, 8)}`;
      }
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
      let sessionName: string;
      if (farmId.startsWith('quick-task-')) {
        const taskId = farmId.replace('quick-task-', '').substring(0, 8);
        sessionName = `quick_${taskId}`;
      } else {
        sessionName = `farm_${farmId.substring(0, 8)}`;
      }
      
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