import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';

interface ClaudeCodeAgentConfig {
  id: string;
  farmId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'stopped';
  paneId?: string;
  startTime: Date;
  currentTask?: string;
  lastActivity?: Date;
}

interface ClaudeCodeFarmConfig {
  id: string;
  name: string;
  description: string;
  agents: number;
  prompt: string;
  steps?: string[];
  collaborative?: boolean;
  sessionName?: string;
  projectPath: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
}

export class ClaudeCodeManager extends EventEmitter {
  private farms: Map<string, ClaudeCodeFarmConfig> = new Map();
  private agents: Map<string, ClaudeCodeAgentConfig> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private coordinationPath: string = '/tmp/claude_coordination';

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    // Ensure coordination directory exists
    try {
      await fs.mkdir(this.coordinationPath, { recursive: true });
      await fs.mkdir(`${this.coordinationPath}/work_claims`, { recursive: true });
    } catch (error) {
      console.error('Failed to create coordination directory:', error);
    }
  }

  /**
   * Create a new Claude Code agent farm
   */
  async createFarm(config: {
    name: string;
    description: string;
    agents: number;
    prompt: string;
    steps?: string[];
    collaborative?: boolean;
    projectPath?: string;
    attachmentPaths?: string[];
  }): Promise<ClaudeCodeFarmConfig> {
    const farmId = uuidv4();
    const sessionName = `farm_${farmId.substring(0, 8)}`;
    
    const farm: ClaudeCodeFarmConfig = {
      id: farmId,
      name: config.name,
      description: config.description,
      agents: config.agents,
      prompt: config.prompt,
      steps: config.steps,
      collaborative: config.collaborative || false,
      sessionName,
      projectPath: pathConfig.getFarmWorkspacePath(farmId, false),
      status: 'creating'
    };

    this.farms.set(farmId, farm);

    try {
      // Create prompt file for orchestrator.py
      const promptFile = await this.createPromptFile(farm, config.attachmentPaths);

      // Build command arguments
      const args = [
        path.join(process.cwd(), 'orchestrator.py'),
        '-n', farm.agents.toString(),
        '--prompt-file', promptFile,
        '-s', sessionName,
        '--no-kill-on-exit' // Keep session alive for monitoring
      ];

      if (farm.collaborative) {
        args.push('--collaborative');
      }

      if (farm.steps && farm.steps.length > 0) {
        args.push('--steps', ...farm.steps);
      }

      // Ensure workspace exists
      await fileManager.ensureDirectory(farm.projectPath);
      
      // Spawn the orchestrator.py process with maibarn environment
      const pythonProcess = spawn('python3', args, {
        cwd: farm.projectPath,
        env: { 
          ...process.env,
          MAIFARM_WORKSPACE: farm.projectPath,
          MAIBARN_ROOT: pathConfig.getPath('MAIBARN_ROOT')
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.processes.set(farmId, pythonProcess);

      // Handle process output
      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Farm ${farmId}] ${output}`);
        this.parseAgentStatus(farmId, output);
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`[Farm ${farmId}] Error: ${data.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[Farm ${farmId}] Process exited with code ${code}`);
        farm.status = code === 0 ? 'stopped' : 'error';
        this.emit('farm:stopped', { farmId, exitCode: code });
      });

      // Wait for agents to initialize
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      farm.status = 'running';
      this.emit('farm:created', farm);

      return farm;
    } catch (error) {
      farm.status = 'error';
      throw error;
    }
  }

  /**
   * Create a prompt file for orchestrator.py
   */
  private async createPromptFile(farm: ClaudeCodeFarmConfig, attachmentPaths?: string[]): Promise<string> {
    // If there are attachments, include their information in the prompt
    let enhancedPrompt = farm.prompt;
    if (attachmentPaths && attachmentPaths.length > 0) {
      const attachmentInfo = attachmentPaths.map(path => 
        `- ${path.split('/').pop()}: ${path}`
      ).join('\n');
      
      enhancedPrompt = `${farm.prompt}

## Attached Files
The following files have been provided as context:
${attachmentInfo}

Please analyze these files and incorporate their content into your work.`;
    }
    
    const promptData = {
      name: farm.name,
      initial_prompt: enhancedPrompt,
      steps: farm.steps || [],
      attachments: attachmentPaths || []
    };

    const promptFile = path.join(this.coordinationPath, `prompt_${farm.id}.yaml`);
    await fs.writeFile(promptFile, JSON.stringify(promptData, null, 2));
    
    return promptFile;
  }

  /**
   * Parse agent status from orchestrator output
   */
  private parseAgentStatus(farmId: string, output: string) {
    // Parse agent status updates from output
    const agentStatusRegex = /\[[\+\*]\] Agent (\d+) ([\w\s]+)/g;
    let match;

    while ((match = agentStatusRegex.exec(output)) !== null) {
      const agentIndex = parseInt(match[1]);
      const statusText = match[2].toLowerCase();
      
      const agentId = `${farmId}_agent_${agentIndex}`;
      
      let status: ClaudeCodeAgentConfig['status'] = 'idle';
      if (statusText.includes('launched')) status = 'ready';
      else if (statusText.includes('working')) status = 'working';
      else if (statusText.includes('error')) status = 'error';
      else if (statusText.includes('ready')) status = 'ready';

      const agent: ClaudeCodeAgentConfig = {
        id: agentId,
        farmId,
        status,
        startTime: new Date(),
        lastActivity: new Date()
      };

      this.agents.set(agentId, agent);
      this.emit('agent:status', agent);
    }
  }

  /**
   * Get farm status and agent information
   */
  async getFarmStatus(farmId: string): Promise<{
    farm: ClaudeCodeFarmConfig | undefined;
    agents: ClaudeCodeAgentConfig[];
    tmuxInfo?: any;
  }> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      return { farm: undefined, agents: [] };
    }

    const farmAgents = Array.from(this.agents.values())
      .filter(agent => agent.farmId === farmId);

    // Get tmux session info if available
    let tmuxInfo;
    if (farm.sessionName) {
      tmuxInfo = await this.getTmuxSessionInfo(farm.sessionName);
    }

    return { farm, agents: farmAgents, tmuxInfo };
  }

  /**
   * Get tmux session information
   */
  private async getTmuxSessionInfo(sessionName: string): Promise<any> {
    try {
      const listPanesCmd = `tmux list-panes -t ${sessionName} -F '#{pane_index}:#{pane_current_command}'`;
      const result = await this.execCommand(listPanesCmd);
      
      const panes = result.split('\n').filter(line => line.trim())
        .map(line => {
          const [index, command] = line.split(':');
          return { index: parseInt(index), command };
        });

      return { sessionName, panes, active: true };
    } catch (error) {
      return { sessionName, active: false };
    }
  }

  /**
   * Execute a shell command
   */
  private execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Send a command to a specific agent
   */
  async sendCommandToAgent(farmId: string, agentIndex: number, command: string) {
    const farm = this.farms.get(farmId);
    if (!farm || !farm.sessionName) {
      throw new Error('Farm not found or not running');
    }

    const tmuxCommand = `tmux send-keys -t ${farm.sessionName}:agents.${agentIndex} '${command}' C-m`;
    await this.execCommand(tmuxCommand);

    // Update agent status
    const agentId = `${farmId}_agent_${agentIndex}`;
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTask = command;
      agent.status = 'working';
      agent.lastActivity = new Date();
      this.emit('agent:command', { agentId, command });
    }
  }

  /**
   * Stop a farm and clean up resources
   */
  async stopFarm(farmId: string) {
    const farm = this.farms.get(farmId);
    if (!farm) {
      throw new Error('Farm not found');
    }

    // Kill the Python process
    const process = this.processes.get(farmId);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(farmId);
    }

    // Kill the tmux session
    if (farm.sessionName) {
      try {
        await this.execCommand(`tmux kill-session -t ${farm.sessionName}`);
      } catch (error) {
        console.error('Failed to kill tmux session:', error);
      }
    }

    // Clean up prompt file
    try {
      const promptFile = path.join(this.coordinationPath, `prompt_${farmId}.yaml`);
      await fs.unlink(promptFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    farm.status = 'stopped';
    this.emit('farm:stopped', { farmId });
  }

  /**
   * Get all farms
   */
  getAllFarms(): ClaudeCodeFarmConfig[] {
    return Array.from(this.farms.values());
  }

  /**
   * Get coordination status
   */
  async getCoordinationStatus(): Promise<{
    activeAgents: any[];
    workClaims: any[];
    completedWork: string[];
  }> {
    try {
      // Read active agents
      const activeAgentsFile = path.join(this.coordinationPath, 'active_agents.json');
      const activeAgents = await fs.readFile(activeAgentsFile, 'utf-8')
        .then(data => JSON.parse(data))
        .catch(() => ({}));

      // Read work claims
      const workClaimsDir = path.join(this.coordinationPath, 'work_claims');
      const claimFiles = await fs.readdir(workClaimsDir).catch(() => []);
      const workClaims = await Promise.all(
        claimFiles
          .filter(f => f.endsWith('.lock'))
          .map(async (file) => {
            const content = await fs.readFile(path.join(workClaimsDir, file), 'utf-8');
            return JSON.parse(content);
          })
      );

      // Read completed work
      const completedWorkFile = path.join(this.coordinationPath, 'completed_work.log');
      const completedWork = await fs.readFile(completedWorkFile, 'utf-8')
        .then(data => data.split('\n').filter(line => line.trim()))
        .catch(() => []);

      return { activeAgents: Object.values(activeAgents), workClaims, completedWork };
    } catch (error) {
      console.error('Failed to get coordination status:', error);
      return { activeAgents: [], workClaims: [], completedWork: [] };
    }
  }

  /**
   * Attach to an existing tmux session for monitoring
   */
  async attachToSession(sessionName: string): Promise<string> {
    // This would typically open in the user's terminal
    // For the web interface, we might capture the output instead
    const command = `tmux attach-session -t ${sessionName}`;
    return command; // Return the command for the user to run
  }
}

// Singleton instance
export const claudeCodeManager = new ClaudeCodeManager();