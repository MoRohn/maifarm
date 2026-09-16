import { ChildProcess, spawn } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { logger, LogCategory } from '../utils/logger';

interface LLMProxyConfig {
  port: number;
  host: string;
  providers: {
    openai?: boolean;
    anthropic?: boolean;
    llama?: boolean;
    ollama?: boolean;
  };
}

interface CompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface CompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMProxyService extends EventEmitter {
  private proxyProcess: ChildProcess | null = null;
  private axiosClient: AxiosInstance;
  private config: LLMProxyConfig;
  private isRunning: boolean = false;
  private startupTimeout: number = 30000; // 30 seconds
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LLMProxyConfig>) {
    super();
    this.config = {
      port: parseInt(process.env.LLM_PROXY_PORT || '8001'),
      host: process.env.LLM_PROXY_HOST || 'localhost',
      providers: {
        openai: process.env.OPENAI_API_KEY ? true : false,
        anthropic: process.env.ANTHROPIC_API_KEY ? true : false,
        llama: false,
        ollama: process.env.OLLAMA_BASE_URL ? true : false
      },
      ...config
    };

    this.axiosClient = axios.create({
      baseURL: `http://${this.config.host}:${this.config.port}`,
      timeout: 60000, // 60 second timeout for completions
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Start the LLM proxy server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info(LogCategory.SERVICES, 'LLM proxy is already running');
      return;
    }

    try {
      // Check if proxy script exists
      const proxyPath = path.join(process.cwd(), 'llm_proxy.py');
      await fs.access(proxyPath);

      // Set up environment variables for the proxy
      const env = {
        ...process.env,
        LLM_PROXY_PORT: this.config.port.toString()
      };

      // Start the proxy server
      this.proxyProcess = spawn('python3', [proxyPath, '--proxy'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle stdout
      this.proxyProcess.stdout?.on('data', (data) => {
        const message = data.toString();
        logger.debug(LogCategory.SERVICES, `LLM Proxy: ${message}`);
        if (message.includes('Uvicorn running on')) {
          this.isRunning = true;
          this.emit('started');
        }
      });

      // Handle stderr
      this.proxyProcess.stderr?.on('data', (data) => {
        logger.error(LogCategory.SERVICES, `LLM Proxy Error: ${data.toString()}`);
      });

      // Handle process exit
      this.proxyProcess.on('exit', (code) => {
        logger.info(LogCategory.SERVICES, `LLM proxy exited with code ${code}`);
        this.isRunning = false;
        this.emit('stopped', code);
      });

      // Wait for server to be ready
      await this.waitForReady();

      // Start health monitoring
      this.startHealthCheck();

      logger.info(LogCategory.SERVICES, `LLM proxy started on http://${this.config.host}:${this.config.port}`);
    } catch (error) {
      logger.error(LogCategory.SERVICES, 'Failed to start LLM proxy:', error);
      throw error;
    }
  }

  /**
   * Wait for the proxy server to be ready
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

    while (Date.now() - startTime < this.startupTimeout) {
      try {
        await this.health();
        return; // Server is ready
      } catch {
        // Server not ready yet
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error('LLM proxy failed to start within timeout');
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.health();
      } catch (error) {
        logger.error(LogCategory.SERVICES, 'LLM proxy health check failed:', error);
        this.emit('unhealthy', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop the LLM proxy server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.proxyProcess) {
      this.proxyProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if not stopped
          this.proxyProcess?.kill('SIGKILL');
          resolve();
        }, 5000);

        this.proxyProcess?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.proxyProcess = null;
    }

    this.isRunning = false;
    logger.info(LogCategory.SERVICES, 'LLM proxy stopped');
  }

  /**
   * Check proxy health
   */
  async health(): Promise<{ status: string; providers: any }> {
    const response = await this.axiosClient.get('/health');
    return response.data;
  }

  /**
   * Send completion request to the proxy
   */
  async completion(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.axiosClient.post('/chat/completions', request);
      return response.data;
    } catch (error: any) {
      logger.error(LogCategory.SERVICES, 'LLM proxy completion error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Stream completion request
   */
  async *streamCompletion(request: CompletionRequest): AsyncGenerator<string, void, unknown> {
    const streamRequest = { ...request, stream: true };
    
    try {
      const response = await this.axiosClient.post('/chat/completions', streamRequest, {
        responseType: 'stream'
      });

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            yield data;
          }
        }
      }
    } catch (error: any) {
      logger.error(LogCategory.SERVICES, 'LLM proxy stream error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get available providers
   */
  async getProviders(): Promise<string[]> {
    try {
      const health = await this.health();
      return Object.keys(health.providers || {});
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific provider is available
   */
  async isProviderAvailable(provider: string): Promise<boolean> {
    const providers = await this.getProviders();
    return providers.includes(provider);
  }

  /**
   * Send a Llama-specific completion request
   */
  async llamaCompletion(
    messages: CompletionRequest['messages'],
    options?: {
      temperature?: number;
      max_tokens?: number;
      useLocal?: boolean;
    }
  ): Promise<CompletionResponse> {
    const model = options?.useLocal ? 'ollama/llama' : 'llama/llama-coder-480b';
    
    return this.completion({
      model,
      messages,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.max_tokens || 4096
    });
  }

  /**
   * Send a Claude-specific completion request (for compatibility)
   */
  async claudeCompletion(
    messages: CompletionRequest['messages'],
    options?: {
      temperature?: number;
      max_tokens?: number;
    }
  ): Promise<CompletionResponse> {
    return this.completion({
      model: 'anthropic/claude-3-opus',
      messages,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.max_tokens || 4096
    });
  }

  /**
   * Check if proxy is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get proxy configuration
   */
  get configuration(): LLMProxyConfig {
    return this.config;
  }
}

// Export singleton instance with automatic startup
export const llmProxy = new LLMProxyService();

// Auto-start proxy if enabled
if (process.env.USE_LLM_PROXY === 'true') {
  llmProxy.start().catch(error => {
    console.error('Failed to auto-start LLM proxy:', error);
  });
}
