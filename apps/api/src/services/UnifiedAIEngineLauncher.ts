/**
 * Unified AI Engine Launcher
 *
 * Central orchestrator for all AI engines (Claude, OpenAI, GPT-OSS, Llama)
 * Provides consistent interface for launching agents across different providers
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promises as fs, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { gptOssLauncher, GptOssConfig } from '../engines/gpt-oss-launcher';
import { enhancedTerminalService } from './EnhancedRealTimeTerminalService';
import { quote as shelxQuote } from 'shlex';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AgentLaunchConfig {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  prompt: string;
  sessionName: string;
  workspacePath: string;
  provider?: AIProvider;
  timeout?: number; // in seconds
}

interface AgentProcess {
  process: ChildProcess;
  provider: AIProvider;
  config: AgentLaunchConfig;
  startTime: Date;
  status: 'launching' | 'running' | 'failed' | 'completed';
  outputPath: string;
}

// ============================================================================
// Unified AI Engine Launcher
// ============================================================================

export class UnifiedAIEngineLauncher {
  private static instance: UnifiedAIEngineLauncher;
  private agents: Map<string, AgentProcess> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  static getInstance(): UnifiedAIEngineLauncher {
    if (!this.instance) {
      this.instance = new UnifiedAIEngineLauncher();
    }
    return this.instance;
  }

  /**
   * Initialize AI providers on startup
   */
  private async initializeProviders(): Promise<void> {
    try {
      // Refresh API keys from database
      await aiProviderManager.refreshApiKeys();

      // Set GPT-OSS as default if no provider is set
      const defaultProvider = aiProviderManager.getDefaultProvider();
      if (!defaultProvider || !aiProviderManager.isProviderEnabled(defaultProvider)) {
        logger.info(LogCategory.AI, 'Setting GPT-OSS as default provider');
        aiProviderManager.setDefaultProvider(AIProvider.GPT_OSS);
      }

      // Initialize GPT-OSS server if it's enabled
      if (aiProviderManager.isProviderEnabled(AIProvider.GPT_OSS)) {
        await gptOssLauncher.initializeServer();
      }

      logger.info(LogCategory.AI, `AI providers initialized. Default: ${aiProviderManager.getDefaultProvider()}`);
    } catch (error) {
      logger.error(LogCategory.AI, 'Failed to initialize AI providers:', error);
    }
  }

  /**
   * Launch an AI agent with automatic provider selection
   */
  async launchAgent(config: AgentLaunchConfig): Promise<void> {
    const agentKey = `${config.farmId}:${config.agentId}`;

    // Determine provider
    const provider = config.provider || aiProviderManager.getDefaultProvider();

    // Validate provider is enabled
    if (!aiProviderManager.isProviderEnabled(provider)) {
      throw new Error(`AI provider ${provider} is not enabled or configured`);
    }

    logger.info(LogCategory.AI,
      `Launching ${config.agentName} with ${provider.toUpperCase()} for farm ${config.farmId}`);

    // Setup output path
    const outputPath = join(
      pathConfig.getTerminalLogsPath(),
      config.farmId,
      `agent-${config.agentIndex}.log`
    );

    // Create output directory
    await fs.mkdir(dirname(outputPath), { recursive: true });

    // Initialize terminal streaming
    await enhancedTerminalService.startStreaming({
      farmId: config.farmId,
      agentId: config.agentId,
      agentIndex: config.agentIndex,
      agentName: config.agentName,
      sessionName: config.sessionName,
      aiProvider: provider,
      outputPath,
      workspacePath: config.workspacePath
    });

    try {
      let process: ChildProcess;

      // Launch based on provider
      switch (provider) {
        case AIProvider.CLAUDE:
          process = await this.launchClaudeAgent(config, outputPath);
          break;

        case AIProvider.OPENAI:
          process = await this.launchOpenAIAgent(config, outputPath);
          break;

        case AIProvider.GPT_OSS:
          await this.launchGptOssAgent(config, outputPath);
          // GPT-OSS uses separate process management
          return;

        case AIProvider.LLAMA:
          process = await this.launchLlamaAgent(config, outputPath);
          break;

        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }

      // Store agent process
      this.agents.set(agentKey, {
        process,
        provider,
        config,
        startTime: new Date(),
        status: 'launching',
        outputPath
      });

      // Monitor process
      this.monitorAgent(agentKey, process);

    } catch (error) {
      logger.error(LogCategory.AI,
        `Failed to launch ${config.agentName}:`, error);

      // Stop terminal streaming on error
      await enhancedTerminalService.stopStreaming(config.farmId, config.agentId);

      throw error;
    }
  }

  /**
   * Launch Claude agent using Claude CLI
   */
  private async launchClaudeAgent(config: AgentLaunchConfig, outputPath: string): Promise<ChildProcess> {
    const providerConfig = aiProviderManager.getProvider(AIProvider.CLAUDE);

    // Ensure API key is set
    if (!providerConfig.apiKey) {
      throw new Error('Claude API key not configured');
    }

    // Setup environment
    const env = {
      ...process.env,
      ANTHROPIC_API_KEY: providerConfig.apiKey,
      CLAUDE_API_KEY: providerConfig.apiKey,
      CLAUDE_MODEL: providerConfig.model,
      AGENT_ID: config.agentId,
      AGENT_NAME: config.agentName,
      FARM_ID: config.farmId
    };

    // Create tmux pane for agent
    const paneRef = `${config.sessionName}:0.${config.agentIndex}`;
    const createPaneCmd = config.agentIndex === 0
      ? `TMUX_TMPDIR=/tmp tmux new-window -t ${config.sessionName} -n agents`
      : `TMUX_TMPDIR=/tmp tmux split-window -t ${config.sessionName}:agents -h`;

    try {
      await this.execAsync(createPaneCmd);
    } catch (error) {
      logger.warn(LogCategory.AI, `Failed to create tmux pane: ${error}`);
    }

    // Launch Claude CLI in tmux
    const claudeCommand = `claude --dangerously-skip-permissions -p ${shelxQuote(config.prompt)}`;
    const tmuxSendCmd = `TMUX_TMPDIR=/tmp tmux send-keys -t ${paneRef} "${claudeCommand}" Enter`;

    await this.execAsync(tmuxSendCmd);

    // Create a monitoring process
    const monitorProcess = spawn('bash', ['-c', `
      while true; do
        TMUX_TMPDIR=/tmp tmux capture-pane -t ${paneRef} -p >> ${outputPath} 2>/dev/null
        sleep 1
      done
    `], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    return monitorProcess;
  }

  /**
   * Launch OpenAI agent
   */
  private async launchOpenAIAgent(config: AgentLaunchConfig, outputPath: string): Promise<ChildProcess> {
    const providerConfig = aiProviderManager.getProvider(AIProvider.OPENAI);

    if (!providerConfig.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create Python script for OpenAI agent
    const scriptPath = join(pathConfig.getTempPath(config.farmId), `openai-agent-${config.agentId}.py`);

    const script = `#!/usr/bin/env python3
import os
import sys
import openai
from datetime import datetime

# Configure OpenAI
openai.api_key = "${providerConfig.apiKey}"

def log(message):
    timestamp = datetime.now().strftime("%H:%M:%S")
    output = f"[{timestamp}] {message}"
    print(output)
    with open("${outputPath}", "a") as f:
        f.write(output + "\\n")

def main():
    log("${config.agentName} starting with OpenAI ${providerConfig.model}")

    prompt = """${config.prompt}"""
    log(f"Received prompt: {prompt[:200]}...")

    try:
        response = openai.ChatCompletion.create(
            model="${providerConfig.model}",
            messages=[
                {"role": "system", "content": "You are an expert AI assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=${providerConfig.temperature},
            max_tokens=${providerConfig.maxTokens}
        )

        result = response.choices[0].message.content
        log("Response received:")
        log(result)

        # Process and execute if needed
        if "create" in prompt.lower() or "write" in prompt.lower():
            # Extract and create files from response
            import re
            code_blocks = re.findall(r'\`\`\`[\\w]*\\n([\\s\\S]*?)\\n\`\`\`', result)
            for i, code in enumerate(code_blocks):
                filename = f"output_{i}.txt"
                with open(filename, 'w') as f:
                    f.write(code)
                log(f"Created file: {filename}")

        log("Task completed successfully")

    except Exception as e:
        log(f"Error: {e}")
        sys.exit(1)

    # Keep running for monitoring
    import time
    while True:
        time.sleep(10)
        log("Agent idle, waiting...")

if __name__ == "__main__":
    main()
`;

    await fs.writeFile(scriptPath, script);
    await fs.chmod(scriptPath, 0o755);

    // Launch Python script
    const childProcess = spawn('python3', [scriptPath], {
      cwd: config.workspacePath,
      env: {
        ...globalThis.process.env,
        OPENAI_API_KEY: providerConfig.apiKey,
        AGENT_ID: config.agentId,
        AGENT_NAME: config.agentName
      },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Redirect output
    const outputStream = createWriteStream(outputPath, { flags: 'w' });
    childProcess.stdout?.pipe(outputStream);
    childProcess.stderr?.pipe(outputStream);

    return childProcess;
  }

  /**
   * Launch GPT-OSS agent
   */
  private async launchGptOssAgent(config: AgentLaunchConfig, outputPath: string): Promise<void> {
    const providerConfig = aiProviderManager.getProvider(AIProvider.GPT_OSS);

    const gptOssConfig: GptOssConfig = {
      host: providerConfig.apiEndpoint.replace(/^https?:\/\//, '').split(':')[0].replace('/v1', ''),
      port: parseInt(providerConfig.apiEndpoint.split(':')[2]?.split('/')[0] || '8000'),
      model: providerConfig.model,
      backend: (process.env.GPT_OSS_BACKEND as 'vllm' | 'llama-cpp' | 'auto' | 'mock' | 'mini') || 'auto',
      maxTokens: providerConfig.maxTokens || 8192,
      temperature: providerConfig.temperature || 0.6,
      contextWindow: providerConfig.contextWindow || 131072,
      modelPath: process.env.GPT_OSS_MODEL_PATH,
      gpuMemory: parseFloat(process.env.GPT_OSS_GPU_MEMORY || '0.9'),
    };

    await gptOssLauncher.launchAgent({
      farmId: config.farmId,
      agentId: config.agentId,
      agentIndex: config.agentIndex,
      agentName: config.agentName,
      prompt: config.prompt,
      workspacePath: config.workspacePath,
      outputPath,
      config: gptOssConfig,
    });

    // Store in agents map with placeholder process for monitoring
    const placeholderProcess = spawn('sleep', ['infinity'], { stdio: 'ignore' });

    this.agents.set(`${config.farmId}:${config.agentId}`, {
      process: placeholderProcess,
      provider: AIProvider.GPT_OSS,
      config,
      startTime: new Date(),
      status: 'running',
      outputPath,
    });
  }

  /**
   * Launch Llama agent
   */
  private async launchLlamaAgent(config: AgentLaunchConfig, outputPath: string): Promise<ChildProcess> {
    const providerConfig = aiProviderManager.getProvider(AIProvider.LLAMA);

    // Create Python script for Llama agent using Ollama
    const scriptPath = join(pathConfig.getTempPath(config.farmId), `llama-agent-${config.agentId}.py`);

    const script = `#!/usr/bin/env python3
import os
import sys
import requests
from datetime import datetime

# Ollama API endpoint
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "${providerConfig.model}"

def log(message):
    timestamp = datetime.now().strftime("%H:%M:%S")
    output = f"[{timestamp}] {message}"
    print(output)
    with open("${outputPath}", "a") as f:
        f.write(output + "\\n")

def main():
    log(f"${config.agentName} starting with Llama {MODEL}")

    prompt = """${config.prompt}"""
    log(f"Received prompt: {prompt[:200]}...")

    try:
        response = requests.post(OLLAMA_URL, json={
            "model": MODEL,
            "prompt": prompt,
            "temperature": ${providerConfig.temperature},
            "stream": False
        }, timeout=120)

        result = response.json().get("response", "")
        log("Response received:")
        log(result)

        # Process and execute if needed
        if "create" in prompt.lower() or "write" in prompt.lower():
            # Extract and create files
            import re
            code_blocks = re.findall(r'\`\`\`[\\w]*\\n([\\s\\S]*?)\\n\`\`\`', result)
            for i, code in enumerate(code_blocks):
                filename = f"output_{i}.txt"
                with open(filename, 'w') as f:
                    f.write(code)
                log(f"Created file: {filename}")

        log("Task completed successfully")

    except Exception as e:
        log(f"Error: {e}")
        sys.exit(1)

    # Keep running
    import time
    while True:
        time.sleep(10)
        log("Agent idle...")

if __name__ == "__main__":
    main()
`;

    await fs.writeFile(scriptPath, script);
    await fs.chmod(scriptPath, 0o755);

    // Ensure Ollama is running with Llama model
    try {
      await this.execAsync(`ollama pull ${providerConfig.model}`);
    } catch (error) {
      logger.warn(LogCategory.AI, `Failed to pull Llama model: ${error}`);
    }

    // Launch Python script
    const childProcess = spawn('python3', [scriptPath], {
      cwd: config.workspacePath,
      env: {
        ...globalThis.process.env,
        AGENT_ID: config.agentId,
        AGENT_NAME: config.agentName
      },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Redirect output
    const llamaOutputStream = createWriteStream(outputPath, { flags: 'w' });
    childProcess.stdout?.pipe(llamaOutputStream);
    childProcess.stderr?.pipe(llamaOutputStream);

    return childProcess;
  }

  /**
   * Monitor agent process
   */
  private monitorAgent(agentKey: string, agentProcess: ChildProcess): void {
    const agent = this.agents.get(agentKey);
    if (!agent) return;

    // Update status to running
    agent.status = 'running';

    // Handle process exit
    agentProcess.on('exit', (code, signal) => {
      logger.info(LogCategory.AI,
        `Agent ${agent.config.agentName} exited with code ${code}, signal ${signal}`);

      agent.status = code === 0 ? 'completed' : 'failed';

      // Stop terminal streaming
      enhancedTerminalService.stopStreaming(
        agent.config.farmId,
        agent.config.agentId
      );
    });

    // Handle errors
    agentProcess.on('error', (error) => {
      logger.error(LogCategory.AI,
        `Agent ${agent.config.agentName} error:`, error);

      agent.status = 'failed';
    });
  }

  /**
   * Stop an agent
   */
  async stopAgent(farmId: string, agentId: string): Promise<void> {
    const agentKey = `${farmId}:${agentId}`;
    const agent = this.agents.get(agentKey);

    if (!agent) return;

    // Stop based on provider
    if (agent.provider === AIProvider.GPT_OSS) {
      await gptOssLauncher.stopAgent(farmId, agentId);
      if (agent.process) {
        agent.process.kill('SIGTERM');
      }
    } else if (agent.process) {
      agent.process.kill('SIGTERM');
    }

    // Stop terminal streaming
    await enhancedTerminalService.stopStreaming(farmId, agentId);

    // Remove from map
    this.agents.delete(agentKey);

    logger.info(LogCategory.AI,
      `Stopped agent ${agentId} for farm ${farmId}`);
  }

  /**
   * Stop all agents for a farm
   */
  async stopFarmAgents(farmId: string): Promise<void> {
    const farmAgents = Array.from(this.agents.entries())
      .filter(([key]) => key.startsWith(`${farmId}:`));

    for (const [key, agent] of farmAgents) {
      const [, agentId] = key.split(':');
      await this.stopAgent(farmId, agentId);
    }

    // Stop terminal streaming for farm
    await enhancedTerminalService.stopFarmStreaming(farmId);

    logger.info(LogCategory.AI,
      `Stopped all agents for farm ${farmId}`);
  }

  /**
   * Get status of all agents
   */
  async getStatus(): Promise<any> {
    const agentStatuses = Array.from(this.agents.entries()).map(([key, agent]) => ({
      key,
      farmId: agent.config.farmId,
      agentId: agent.config.agentId,
      agentName: agent.config.agentName,
      provider: agent.provider,
      status: agent.status,
      startTime: agent.startTime.toISOString(),
      runtime: Date.now() - agent.startTime.getTime()
    }));

    const providerCounts = agentStatuses.reduce((acc, agent) => {
      acc[agent.provider] = (acc[agent.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAgents: this.agents.size,
      activeAgents: agentStatuses.filter(a => a.status === 'running').length,
      providers: providerCounts,
      defaultProvider: aiProviderManager.getDefaultProvider(),
      enabledProviders: Object.values(AIProvider).filter(p =>
        aiProviderManager.isProviderEnabled(p)
      ),
      agents: agentStatuses,
      gptOssStatus: await gptOssLauncher.checkServerStatus(),
      gptOssAgents: gptOssLauncher.getAgentStatus(),
      terminalStats: enhancedTerminalService.getStreamStats('global')
    };
  }

  /**
   * Get available AI providers with their status
   */
  getAvailableProviders(): any[] {
    return aiProviderManager.getAllProviders().map(config => ({
      provider: config.provider,
      enabled: config.enabled,
      configured: !!config.apiKey || config.isLocal,
      model: config.model,
      contextWindow: config.contextWindow,
      maxTokens: config.maxTokens,
      isDefault: config.provider === aiProviderManager.getDefaultProvider(),
      isLocal: config.isLocal
    }));
  }

  /**
   * Switch default AI provider
   */
  async switchProvider(provider: AIProvider): Promise<void> {
    if (!aiProviderManager.isProviderEnabled(provider)) {
      throw new Error(`Provider ${provider} is not enabled or configured`);
    }

    aiProviderManager.setDefaultProvider(provider);

    // Initialize GPT-OSS if switching to it
    if (provider === AIProvider.GPT_OSS) {
      await gptOssLauncher.initializeServer();
    }

    logger.info(LogCategory.AI,
      `Switched default AI provider to ${provider}`);
  }

  /**
   * Helper: Execute command asynchronously
   */
  private execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Shutdown all agents and services
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.AI, 'Shutting down AI engine launcher...');

    // Stop all agents
    for (const [key] of this.agents) {
      const [farmId, agentId] = key.split(':');
      await this.stopAgent(farmId, agentId);
    }

    // Shutdown GPT-OSS server
    await gptOssLauncher.shutdown();

    logger.info(LogCategory.AI, 'AI engine launcher shutdown complete');
  }
}

// Export singleton instance
export const unifiedAIEngineLauncher = UnifiedAIEngineLauncher.getInstance();
