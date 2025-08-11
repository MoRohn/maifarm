import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { getActiveProvider, isProviderAvailable } from '../config/aiProviders';
import { ollamaService } from './ollamaService';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';

interface QwenCodeAgentConfig {
  id: string;
  farmId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'stopped';
  paneId?: string;
  startTime: Date;
  currentTask?: string;
  lastActivity?: Date;
}

interface QwenCodeFarmConfig {
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
  provider: 'qwen';
}

export class QwenCodeManager extends EventEmitter {
  private farms: Map<string, QwenCodeFarmConfig> = new Map();
  private agents: Map<string, QwenCodeAgentConfig> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private coordinationPath: string = '/tmp/claude_coordination'; // Keep same coordination path for compatibility
  private qwenExecutable: string = 'qwen-code'; // Will be installed via npm or use proxy
  private useLocalOllama: boolean = false;
  private localModelName: string | undefined;
  private useLLMProxy: boolean = false;
  private llmProxyUrl: string = 'http://localhost:8001';

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    // Ensure coordination directory exists
    try {
      await fs.mkdir(this.coordinationPath, { recursive: true });
      await fs.mkdir(`${this.coordinationPath}/work_claims`, { recursive: true });
      await fs.mkdir(`${this.coordinationPath}/qwen_sessions`, { recursive: true });
    } catch (error) {
      console.error('Failed to create coordination directory:', error);
    }

    // Check if LLM proxy is configured
    this.useLLMProxy = process.env.USE_LLM_PROXY === 'true';
    if (process.env.LLM_PROXY_URL) {
      this.llmProxyUrl = process.env.LLM_PROXY_URL;
    }

    if (this.useLLMProxy) {
      console.log(`Using LLM Proxy for Qwen3-Coder at ${this.llmProxyUrl}`);
      // Check if proxy is running
      await this.checkLLMProxyHealth();
    } else {
      // Check for local Ollama Qwen model first
      const localQwen = await this.checkLocalQwenModel();
      if (localQwen.available) {
        this.useLocalOllama = true;
        this.localModelName = localQwen.modelName;
        console.log(`Using local Qwen model via Ollama: ${this.localModelName}`);
      } else if (!isProviderAvailable('qwen')) {
        console.warn('Neither local Qwen model nor Qwen API is configured. Please install a local model or set QWEN_API_KEY.');
      }
    }
  }

  /**
   * Check if LLM proxy is running and healthy
   */
  private async checkLLMProxyHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.llmProxyUrl}/providers`);
      if (response.ok) {
        const data = await response.json();
        console.log('LLM Proxy available with providers:', data.providers);
        return true;
      }
    } catch (error) {
      console.error('LLM Proxy not reachable:', error);
    }
    return false;
  }

  /**
   * Check for local Qwen model via Ollama
   */
  async checkLocalQwenModel(): Promise<{ available: boolean; modelName?: string }> {
    try {
      const qwenInfo = await ollamaService.checkQwenModel();
      if (qwenInfo.available && qwenInfo.model) {
        return {
          available: true,
          modelName: qwenInfo.model.name
        };
      }
    } catch (error) {
      console.error('Error checking local Qwen model:', error);
    }
    return { available: false };
  }

  /**
   * Check if Qwen CLI is installed
   */
  async checkQwenInstallation(): Promise<boolean> {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const proc = spawn(this.qwenExecutable, ['--version'], {
          stdio: 'pipe'
        });

        proc.on('close', (code) => {
          resolve(code === 0);
        });

        proc.on('error', () => {
          resolve(false);
        });
      });

      return result;
    } catch (error) {
      console.error('Error checking Qwen installation:', error);
      return false;
    }
  }

  /**
   * Create a new Qwen Code agent farm
   */
  async createFarm(config: {
    name: string;
    description: string;
    agents: number;
    prompt: string;
    steps?: string[];
    collaborative?: boolean;
    projectPath?: string;
    useLocalModel?: boolean;
  }): Promise<QwenCodeFarmConfig> {
    // Check if we can use local model or API
    const canUseLocal = this.useLocalOllama && this.localModelName;
    const canUseAPI = isProviderAvailable('qwen');
    
    // Prefer local if requested and available
    const useLocal = config.useLocalModel !== false && canUseLocal;
    
    if (!useLocal && !canUseAPI) {
      throw new Error('No Qwen provider available. Please install a local Qwen model via Ollama or configure the Qwen API.');
    }

    const farmId = uuidv4();
    const sessionName = `qwen_farm_${farmId.substring(0, 8)}`;
    
    const farm: QwenCodeFarmConfig = {
      id: farmId,
      name: config.name,
      description: config.description,
      agents: config.agents,
      prompt: config.prompt,
      steps: config.steps,
      collaborative: config.collaborative || false,
      sessionName,
      projectPath: pathConfig.getFarmWorkspacePath(farmId, false),
      status: 'creating',
      provider: 'qwen'
    };

    this.farms.set(farmId, farm);

    try {
      // Create prompt file for Qwen integration
      const promptFile = await this.createPromptFile(farm);

      // Use the orchestrator.py script with a proxy for Qwen provider
      const args = [
        path.join(process.cwd(), 'orchestrator.py'),
        '-n', farm.agents.toString(),
        '--prompt-file', promptFile,
        '-s', sessionName,
        '--no-kill-on-exit',
        '--provider', 'qwen' // Custom flag to indicate Qwen usage
      ];

      if (farm.collaborative) {
        args.push('--collaborative');
      }

      if (farm.steps && farm.steps.length > 0) {
        args.push('--steps', ...farm.steps);
      }

      // Launch the farm with Qwen configuration
      await this.launchFarmWithQwen(farm, args);

      farm.status = 'running';
      this.emit('farm:created', farm);
      return farm;

    } catch (error) {
      farm.status = 'error';
      this.emit('farm:error', { farm, error });
      throw error;
    }
  }

  /**
   * Create prompt file for Qwen agents
   */
  private async createPromptFile(farm: QwenCodeFarmConfig): Promise<string> {
    const promptDir = `${this.coordinationPath}/qwen_sessions/${farm.sessionName}`;
    await fs.mkdir(promptDir, { recursive: true });

    const promptFile = path.join(promptDir, 'prompt.txt');
    
    // Add Qwen3-Coder 480B specific instructions to leverage its capabilities
    const qwenPrompt = `[Using Qwen3-Coder 480B with ${farm.agents} agents]

${farm.prompt}

System Context:
- Model: Qwen3-Coder 480B (Mixture of Experts with 35B active parameters)
- Context Window: Up to 256K tokens (can extend to 1M tokens)
- Capabilities: Enhanced code generation, multi-language support, chain-of-thought reasoning
- Architecture: MoE optimized for coding tasks with specialized experts

Instructions for optimal performance:
1. Use chain-of-thought reasoning for complex problems
2. Leverage the large context window for comprehensive code analysis
3. Apply structured problem decomposition when handling multi-file tasks
4. Utilize the model's strengths in:
   - Code generation and refactoring
   - Bug detection and fixing
   - API design and implementation
   - Test case generation
   - Documentation writing

${farm.collaborative ? `
Collaborative Mode: Agents should coordinate through the shared workspace at ${this.coordinationPath}
- Check work_claims directory for task assignments
- Update progress in active_agents.json
- Share results in the harvests directory
` : ''}

${farm.steps && farm.steps.length > 0 ? `
Task Steps:
${farm.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
` : ''}

Please proceed with the task using your advanced capabilities.`;

    await fs.writeFile(promptFile, qwenPrompt, 'utf-8');
    return promptFile;
  }

  /**
   * Launch farm using Qwen through the proxy
   */
  private async launchFarmWithQwen(farm: QwenCodeFarmConfig, args: string[]): Promise<void> {
    // Ensure workspace exists
    await fileManager.ensureDirectory(farm.projectPath);
    
    return new Promise((resolve, reject) => {
      // Set environment variables for Qwen usage
      
      const env = {
        ...process.env,
        AI_PROVIDER: 'qwen',
        QWEN_FARM_ID: farm.id,
        MAIFARM_WORKSPACE: farm.projectPath,
        MAIBARN_ROOT: pathConfig.getPath('MAIBARN_ROOT')
      };

      const proc = spawn('python3', args, {
        cwd: farm.projectPath,
        env,
        detached: true,
        stdio: 'ignore'
      });

      proc.on('error', (error) => {
        console.error(`Failed to launch Qwen farm ${farm.id}:`, error);
        reject(error);
      });

      proc.unref();
      this.processes.set(farm.id, proc);

      // Initialize agents
      for (let i = 0; i < farm.agents; i++) {
        const agentId = `${farm.id}_agent_${i}`;
        const agent: QwenCodeAgentConfig = {
          id: agentId,
          farmId: farm.id,
          status: 'starting',
          startTime: new Date()
        };
        this.agents.set(agentId, agent);
      }

      resolve();
    });
  }

  /**
   * Stop a Qwen farm
   */
  async stopFarm(farmId: string): Promise<void> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      throw new Error(`Farm ${farmId} not found`);
    }

    // Kill the process
    const proc = this.processes.get(farmId);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(farmId);
    }

    // Update status
    farm.status = 'stopped';
    
    // Clean up agents
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.farmId === farmId) {
        agent.status = 'stopped';
      }
    }

    this.emit('farm:stopped', farm);
  }

  /**
   * Get farm status
   */
  getFarmStatus(farmId: string): QwenCodeFarmConfig | undefined {
    return this.farms.get(farmId);
  }

  /**
   * Get all farms
   */
  getAllFarms(): QwenCodeFarmConfig[] {
    return Array.from(this.farms.values());
  }

  /**
   * Get agents for a farm
   */
  getFarmAgents(farmId: string): QwenCodeAgentConfig[] {
    return Array.from(this.agents.values()).filter(agent => agent.farmId === farmId);
  }
}

// Export singleton instance
export const qwenCodeManager = new QwenCodeManager();