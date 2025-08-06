import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { ollamaModelDetector } from './ollamaModelDetector';
import type { OllamaModel, OllamaModelConfig } from '../types/ollama';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaService extends EventEmitter {
  private client: AxiosInstance;
  private baseUrl: string;
  private ollamaProcess?: ChildProcess;
  private isRunning: boolean = false;
  private modelConfig?: OllamaModelConfig;

  constructor(baseUrl: string = 'http://localhost:11434') {
    super();
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: `${baseUrl}/api`,
      timeout: 60000, // 60 seconds for large model responses
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Initialize Ollama service and detect local models
   */
  async initialize(): Promise<void> {
    try {
      // Check if Ollama is running
      this.isRunning = await ollamaModelDetector.isOllamaRunning();
      
      if (!this.isRunning) {
        console.log('Starting Ollama service...');
        this.isRunning = await ollamaModelDetector.startOllama();
      }

      if (this.isRunning) {
        // Detect available Qwen model
        this.modelConfig = await ollamaModelDetector.getQwenModelConfig();
        
        if (this.modelConfig) {
          console.log(`Detected local Qwen model: ${this.modelConfig.model}`);
          this.emit('model:detected', this.modelConfig);
        } else {
          console.log('No local Qwen model found. Please run: ollama pull qwen2.5-coder:7b');
          this.emit('model:missing');
        }
      }
    } catch (error) {
      console.error('Failed to initialize Ollama service:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check if Qwen model is available
   */
  async checkQwenModel(): Promise<{ available: boolean; model?: OllamaModel }> {
    const detection = await ollamaModelDetector.detectQwenModel();
    if (detection.found && detection.models && detection.models.length > 0) {
      return {
        available: true,
        model: detection.models[0]
      };
    }
    return { available: false };
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    try {
      const response = await this.client.get('/tags');
      const models: OllamaModel[] = response.data.models || [];
      return models.some(m => m.name === modelName);
    } catch (error) {
      console.error('Failed to check model availability:', error);
      return false;
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const pullProcess = spawn('ollama', ['pull', modelName], {
        stdio: 'pipe'
      });

      pullProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`Pulling ${modelName}: ${output}`);
        this.emit('pull:progress', { model: modelName, message: output });
      });

      pullProcess.stderr?.on('data', (data) => {
        console.error(`Error pulling ${modelName}: ${data.toString()}`);
      });

      pullProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Successfully pulled ${modelName}`);
          this.emit('pull:complete', { model: modelName });
          resolve();
        } else {
          const error = new Error(`Failed to pull model ${modelName} (exit code: ${code})`);
          this.emit('pull:error', { model: modelName, error });
          reject(error);
        }
      });

      pullProcess.on('error', (error) => {
        console.error(`Failed to start pull process: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Generate completion using local Ollama model
   */
  async generate(request: OllamaGenerateRequest): Promise<string> {
    try {
      const response = await this.client.post<OllamaGenerateResponse>('/generate', {
        ...request,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      console.error('Failed to generate completion:', error);
      throw error;
    }
  }

  /**
   * Stream generation for real-time responses
   */
  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<string> {
    try {
      const response = await this.client.post('/generate', {
        ...request,
        stream: true
      }, {
        responseType: 'stream'
      });

      for await (const chunk of response.data) {
        const lines = chunk.toString().trim().split('\n');
        for (const line of lines) {
          if (line) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                yield data.response;
              }
              if (data.done) {
                return;
              }
            } catch (e) {
              console.error('Failed to parse stream chunk:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate stream:', error);
      throw error;
    }
  }

  /**
   * Create embedding for text
   */
  async createEmbedding(model: string, prompt: string): Promise<number[]> {
    try {
      const response = await this.client.post('/embeddings', {
        model,
        prompt
      });
      return response.data.embedding;
    } catch (error) {
      console.error('Failed to create embedding:', error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(modelName: string): Promise<any> {
    try {
      const response = await this.client.post('/show', {
        name: modelName
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get model info:', error);
      throw error;
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.client.get('/tags');
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * Get the configured Qwen model name
   */
  getConfiguredModel(): string | undefined {
    return this.modelConfig?.model;
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Stop Ollama service
   */
  async stop(): Promise<void> {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill('SIGTERM');
      this.ollamaProcess = undefined;
      this.isRunning = false;
    }
  }

  /**
   * Create a completion compatible with Claude/Qwen format
   */
  async createCompletion(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
  }): Promise<string> {
    const model = this.getConfiguredModel();
    if (!model) {
      throw new Error('No Qwen model configured. Please run: ollama pull qwen2.5-coder:7b');
    }

    const request: OllamaGenerateRequest = {
      model,
      prompt,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 4096,
        stop: options?.stopSequences
      }
    };

    return this.generate(request);
  }
}

// Export singleton instance
export const ollamaService = new OllamaService();