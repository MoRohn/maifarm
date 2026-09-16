/**
 * GPT-OSS Launcher Service
 *
 * Manages the GPT-OSS local AI server lifecycle and agent execution.
 * Provides integration with MaiFarm's multi-agent orchestration system.
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import axios, { AxiosInstance } from 'axios';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { generateMiniGptOssResponse } from './gpt-oss-mini';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GptOssConfig {
  host: string;
  port: number;
  model: string;
  backend: 'vllm' | 'llama-cpp' | 'auto' | 'mock' | 'mini';
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  modelPath?: string;  // For llama-cpp backend
  gpuMemory?: number;  // GPU memory utilization (0.0-1.0)
}

export interface AgentLaunchParams {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  prompt: string;
  workspacePath: string;
  outputPath: string;
  config: GptOssConfig;
}

interface ServerStatus {
  running: boolean;
  healthy: boolean;
  model?: string;
  backend?: string;
  error?: string;
}

interface AgentSession {
  farmId: string;
  agentId: string;
  agentName: string;
  startTime: Date;
  lastActivity: Date;
  outputPath: string;
  status: 'initializing' | 'running' | 'completed' | 'failed';
}

// ============================================================================
// GPT-OSS Launcher Service
// ============================================================================

export class GptOssLauncher {
  private static instance: GptOssLauncher;

  private serverProcess: ChildProcess | null = null;
  private serverConfig: GptOssConfig | null = null;
  private httpClient: AxiosInstance | null = null;
  private agents: Map<string, AgentSession> = new Map();
  private serverStartupPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): GptOssLauncher {
    if (!this.instance) {
      this.instance = new GptOssLauncher();
    }
    return this.instance;
  }

  private resolveServerEndpoint(): { host: string; port: number; baseURL: string } {
    if (this.serverConfig) {
      const { host, port } = this.serverConfig;
      return {
        host,
        port,
        baseURL: `http://${host}:${port}`,
      };
    }

    const defaultPort = parseInt(process.env.GPT_OSS_PORT || '8000', 10);
    const rawHost = process.env.GPT_OSS_HOST || `http://localhost:${defaultPort}`;

    let host = 'localhost';
    let port = defaultPort;
    let protocol = 'http';

    try {
      const normalized = rawHost.startsWith('http') ? rawHost : `http://${rawHost}`;
      const url = new URL(normalized);
      host = url.hostname || host;
      protocol = url.protocol.replace(':', '') || protocol;
      if (url.port) {
        const parsedPort = parseInt(url.port, 10);
        if (!Number.isNaN(parsedPort)) {
          port = parsedPort;
        }
      }
    } catch {
      const [hostPart, portPart] = rawHost.split(':');
      host = hostPart || host;
      if (portPart) {
        const parsedPort = parseInt(portPart, 10);
        if (!Number.isNaN(parsedPort)) {
          port = parsedPort;
        }
      }
    }

    return {
      host,
      port,
      baseURL: `${protocol}://${host}:${port}`,
    };
  }

  private currentBackend(): string {
    if (this.serverConfig?.backend) {
      return this.serverConfig.backend;
    }

    if (process.env.GPT_OSS_BACKEND) {
      return process.env.GPT_OSS_BACKEND;
    }

    const allowEmbedded = (process.env.GPT_OSS_ALLOW_MOCK || '').toLowerCase() === 'true';
    return allowEmbedded ? 'mini' : 'auto';
  }

  private isMiniBackend(): boolean {
    const backend = this.currentBackend();
    const allowEmbedded = (process.env.GPT_OSS_ALLOW_MOCK || '').toLowerCase() === 'true';

    if (backend === 'mini') {
      return true;
    }

    return backend === 'auto' && allowEmbedded;
  }

  private isMockBackend(): boolean {
    return this.currentBackend() === 'mock';
  }

  private isEmbeddedBackend(): boolean {
    return this.isMiniBackend() || this.isMockBackend();
  }

  private ensureHttpClient(): AxiosInstance {
    if (this.isEmbeddedBackend()) {
      throw new Error('HTTP client is unavailable when using an embedded GPT-OSS backend');
    }

    if (!this.httpClient) {
      const endpoint = this.resolveServerEndpoint();
      this.httpClient = axios.create({
        baseURL: endpoint.baseURL,
        timeout: 120000,
      });
    }

    return this.httpClient;
  }

  // ============================================================================
  // Server Management
  // ============================================================================

  /**
   * Initialize and start the GPT-OSS server if not already running
   */
  async initializeServer(config?: Partial<GptOssConfig>): Promise<void> {
    // If already initializing, wait for that to complete
    if (this.serverStartupPromise) {
      logger.info(LogCategory.AI, 'GPT-OSS server initialization already in progress...');
      return this.serverStartupPromise;
    }

    // Create initialization promise
    this.serverStartupPromise = this._doInitializeServer(config);

    try {
      await this.serverStartupPromise;
    } finally {
      this.serverStartupPromise = null;
    }
  }

  private async _doInitializeServer(config?: Partial<GptOssConfig>): Promise<void> {
    // Default configuration
    const defaultConfig: GptOssConfig = {
      host: process.env.GPT_OSS_HOST?.replace(/^https?:\/\//, '').split(':')[0] || 'localhost',
      port: parseInt(process.env.GPT_OSS_PORT || '8000'),
      model: process.env.GPT_OSS_MODEL || 'openai/gpt-oss-20b',  // OpenAI's open-source model
      backend: (process.env.GPT_OSS_BACKEND as 'vllm' | 'llama-cpp' | 'auto' | 'mock' | 'mini') || 'auto',
      maxTokens: parseInt(process.env.GPT_OSS_MAX_TOKENS || '8192'),
      temperature: parseFloat(process.env.GPT_OSS_TEMPERATURE || '0.6'),
      contextWindow: parseInt(process.env.GPT_OSS_CONTEXT_WINDOW || '131072'),
      modelPath: process.env.GPT_OSS_MODEL_PATH,
      gpuMemory: parseFloat(process.env.GPT_OSS_GPU_MEMORY || '0.9'),
    };

    this.serverConfig = { ...defaultConfig, ...config };

    if (this.isEmbeddedBackend()) {
      this.serverConfig.backend = this.isMiniBackend() ? 'mini' : 'mock';
    }

    if (this.isEmbeddedBackend()) {
      logger.warn(LogCategory.AI,
        `Using embedded GPT-OSS backend (${this.serverConfig.backend}); skipping external server startup`);
      return;
    }

    // Setup HTTP client
    this.httpClient = axios.create({
      baseURL: `http://${this.serverConfig.host}:${this.serverConfig.port}`,
      timeout: 120000,
    });

    // Check if server is already running
    const status = await this.checkServerStatus();
    if (status.healthy) {
      logger.info(LogCategory.AI,
        `GPT-OSS server already running on port ${this.serverConfig.port} (${status.backend}, ${status.model})`);
      return;
    }

    // Start the server
    logger.info(LogCategory.AI,
      `Starting GPT-OSS server on port ${this.serverConfig.port}...`);
    logger.info(LogCategory.AI,
      `Backend: ${this.serverConfig.backend}, Model: ${this.serverConfig.model}`);

    await this._startServer();

    // Wait for server to be ready
    await this._waitForServerReady();

    logger.info(LogCategory.AI, 'GPT-OSS server is ready');
  }

  /**
   * Start the Python server process
   */
  private async _startServer(): Promise<void> {
    const serverScriptPath = join(__dirname, 'gpt-oss-server.py');

    // Verify script exists
    try {
      await fs.access(serverScriptPath);
    } catch {
      throw new Error(`GPT-OSS server script not found at: ${serverScriptPath}`);
    }

    // Setup environment
    const env: Record<string, string | undefined> = {
      ...process.env,
      GPT_OSS_HOST: this.serverConfig!.host,
      GPT_OSS_PORT: String(this.serverConfig!.port),
      GPT_OSS_MODEL: this.serverConfig!.model,
      GPT_OSS_BACKEND: this.serverConfig!.backend,
      GPT_OSS_MAX_TOKENS: String(this.serverConfig!.maxTokens),
      GPT_OSS_TEMPERATURE: String(this.serverConfig!.temperature),
      GPT_OSS_CONTEXT_WINDOW: String(this.serverConfig!.contextWindow),
      GPT_OSS_GPU_MEMORY: String(this.serverConfig!.gpuMemory || 0.9),
    };

    if (this.serverConfig!.modelPath) {
      env.GPT_OSS_MODEL_PATH = this.serverConfig!.modelPath;
    }

    // Spawn server process
    this.serverProcess = spawn('python3', [serverScriptPath], {
      env,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle server output
    this.serverProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(LogCategory.AI, `[GPT-OSS] ${output}`);
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !output.includes('WARNING')) {  // Filter out common warnings
        logger.warn(LogCategory.AI, `[GPT-OSS] ${output}`);
      }
    });

    this.serverProcess.on('exit', (code, signal) => {
      logger.warn(LogCategory.AI,
        `GPT-OSS server exited with code ${code}, signal ${signal}`);
      this.serverProcess = null;
    });

    this.serverProcess.on('error', (error) => {
      logger.error(LogCategory.AI, 'GPT-OSS server error:', error);
      this.serverProcess = null;
    });

    // Give server a moment to start
    await this._sleep(2000);
  }

  /**
   * Wait for server to respond to health checks
   */
  private async _waitForServerReady(maxAttempts: number = 30, delayMs: number = 1000): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.checkServerStatus();

      if (status.healthy) {
        logger.info(LogCategory.AI,
          `GPT-OSS server ready after ${attempt} attempt(s)`);
        return;
      }

      if (attempt < maxAttempts) {
        logger.debug(LogCategory.AI,
          `Waiting for GPT-OSS server... (attempt ${attempt}/${maxAttempts})`);
        await this._sleep(delayMs);
      }
    }

    throw new Error('GPT-OSS server failed to start within timeout period');
  }

  /**
   * Check server status and health
   */
  async checkServerStatus(): Promise<ServerStatus> {
    if (this.isEmbeddedBackend()) {
      return {
        running: true,
        healthy: true,
        backend: this.isMiniBackend() ? 'mini' : 'mock',
        model: this.serverConfig?.model || process.env.GPT_OSS_MODEL,
      };
    }

    try {
      const response = await this.ensureHttpClient().get('/health', { timeout: 5000 });

      return {
        running: true,
        healthy: response.status === 200,
        model: response.data?.model,
        backend: response.data?.backend,
      };
    } catch (error: any) {
      return {
        running: false,
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Public health check accessor used by services
   */
  async checkHealth(): Promise<ServerStatus> {
    return this.checkServerStatus();
  }

  /**
   * Stop the GPT-OSS server
   */
  async stopServer(): Promise<void> {
    if (this.isEmbeddedBackend()) {
      return;
    }

    if (this.serverProcess) {
      logger.info(LogCategory.AI, 'Stopping GPT-OSS server...');

      this.serverProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await this._sleep(2000);

      // Force kill if still running
      if (this.serverProcess && !this.serverProcess.killed) {
        this.serverProcess.kill('SIGKILL');
      }

      this.serverProcess = null;
      logger.info(LogCategory.AI, 'GPT-OSS server stopped');
    }
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  /**
   * Launch an agent using GPT-OSS
   */
  async launchAgent(params: AgentLaunchParams): Promise<void> {
    const agentKey = `${params.farmId}:${params.agentId}`;

    logger.info(LogCategory.AI,
      `Launching ${params.agentName} with GPT-OSS for farm ${params.farmId}`);

    // Ensure server is running
    await this.initializeServer(params.config);

    // Create output directory
    await fs.mkdir(dirname(params.outputPath), { recursive: true });

    // Register agent session
    const session: AgentSession = {
      farmId: params.farmId,
      agentId: params.agentId,
      agentName: params.agentName,
      startTime: new Date(),
      lastActivity: new Date(),
      outputPath: params.outputPath,
      status: 'initializing',
    };

    this.agents.set(agentKey, session);

    // Execute agent task
    try {
      session.status = 'running';
      await this._executeAgentTask(params, session);
      session.status = 'completed';

      logger.info(LogCategory.AI,
        `Agent ${params.agentName} completed successfully`);
    } catch (error) {
      session.status = 'failed';
      logger.error(LogCategory.AI,
        `Agent ${params.agentName} failed:`, error);
      throw error;
    }
  }

  /**
   * Execute agent task by calling GPT-OSS API
   */
  private async _executeAgentTask(params: AgentLaunchParams, session: AgentSession): Promise<void> {
    const messages = [
      {
        role: 'system',
        content: `You are ${params.agentName}, an AI agent working in the MaiFarm multi-agent system. Your workspace is at: ${params.workspacePath}`,
      },
      {
        role: 'user',
        content: params.prompt,
      },
    ];

    await this._appendOutput(session.outputPath,
      `[${new Date().toISOString()}] ${params.agentName} starting task...\n`);
    await this._appendOutput(session.outputPath,
      `Prompt: ${params.prompt.substring(0, 200)}${params.prompt.length > 200 ? '...' : ''}\n\n`);

    const backend = params.config.backend || this.currentBackend();
    const useMini = backend === 'mini' || this.isMiniBackend();
    const useMock = backend === 'mock' || this.isMockBackend();

    try {
      let result: string;

      if (useMini) {
        result = generateMiniGptOssResponse(messages as any, {
          maxTokens: params.config.maxTokens,
          temperature: params.config.temperature,
          agentName: params.agentName,
        });
      } else if (useMock) {
        result = this.generateMockResponse(messages);
      } else {
        const response = await this.ensureHttpClient().post('/v1/chat/completions', {
          model: params.config.model,
          messages,
          temperature: params.config.temperature,
          max_tokens: params.config.maxTokens,
          stream: false,
        });

        result = response.data?.choices?.[0]?.message?.content || '';
      }

      session.lastActivity = new Date();

      await this._appendOutput(session.outputPath,
        `\n[${new Date().toISOString()}] Response:\n${result}\n`);

      session.lastActivity = new Date();

    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      await this._appendOutput(session.outputPath,
        `\n[${new Date().toISOString()}] ERROR: ${errorMsg}\n`);
      throw error;
    }
  }

  /**
   * Stop a specific agent
   */
  async stopAgent(farmId: string, agentId: string): Promise<void> {
    const agentKey = `${farmId}:${agentId}`;
    const session = this.agents.get(agentKey);

    if (session) {
      logger.info(LogCategory.AI,
        `Stopping agent ${session.agentName} (${agentId})`);

      session.status = 'completed';
      this.agents.delete(agentKey);
    }
  }

  /**
   * Stop all agents for a farm
   */
  async stopFarmAgents(farmId: string): Promise<void> {
    const farmAgents = Array.from(this.agents.keys())
      .filter(key => key.startsWith(`${farmId}:`));

    for (const key of farmAgents) {
      const [, agentId] = key.split(':');
      await this.stopAgent(farmId, agentId);
    }

    logger.info(LogCategory.AI,
      `Stopped all agents for farm ${farmId}`);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private generateMockResponse(messages: Array<{ role: string; content: string }>): string {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const prompt = lastUserMessage?.content?.trim() || 'No prompt provided.';
    const summary = prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt;

    return [
      'GPT-OSS mock backend active — install vLLM or llama-cpp-python for production use.',
      `Prompt summary: ${summary}`,
      'This mock response enables orchestration smoke tests only.',
    ].join('\n');
  }

  /**
   * Get status of all agents
   */
  getAgentStatus(): any[] {
    return Array.from(this.agents.entries()).map(([key, session]) => ({
      key,
      farmId: session.farmId,
      agentId: session.agentId,
      agentName: session.agentName,
      status: session.status,
      startTime: session.startTime.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      runtime: Date.now() - session.startTime.getTime(),
    }));
  }

  /**
   * Shutdown everything
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.AI, 'Shutting down GPT-OSS launcher...');

    // Stop all agents
    for (const [key] of this.agents) {
      const [farmId, agentId] = key.split(':');
      await this.stopAgent(farmId, agentId);
    }

    // Stop server
    await this.stopServer();

    logger.info(LogCategory.AI, 'GPT-OSS launcher shutdown complete');
  }

  /**
   * Append content to output file
   */
  private async _appendOutput(outputPath: string, content: string): Promise<void> {
    try {
      await fs.appendFile(outputPath, content, 'utf-8');
    } catch (error) {
      logger.error(LogCategory.AI, `Failed to write to output file: ${error}`);
    }
  }

  /**
   * Sleep utility
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const gptOssLauncher = GptOssLauncher.getInstance();
