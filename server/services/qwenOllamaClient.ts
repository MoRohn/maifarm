import { Ollama } from 'ollama';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

interface QwenModelInfo {
  name: string;
  size: string;
  modified: Date;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenCompletionOptions {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class QwenOllamaClient extends EventEmitter {
  private ollama: Ollama;
  private ollamaPath: string;
  private availableModels: QwenModelInfo[] = [];
  private selectedModel: string | null = null;
  private isOllamaRunning: boolean = false;

  constructor() {
    super();
    
    // Initialize Ollama client with default local endpoint
    this.ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    });

    // Set the Ollama models path
    const homeDir = os.homedir();
    this.ollamaPath = process.env.OLLAMA_PATH || path.join(homeDir, '.ollama');
    
    this.initialize();
  }

  private async initialize() {
    // Check if Ollama is running
    await this.checkOllamaStatus();
    
    // Scan for available Qwen models
    if (this.isOllamaRunning) {
      await this.scanForQwenModels();
    }
  }

  /**
   * Check if Ollama service is running
   */
  async checkOllamaStatus(): Promise<boolean> {
    try {
      // Try to list models as a health check
      await this.ollama.list();
      this.isOllamaRunning = true;
      console.log('[Qwen Ollama] Ollama service is running');
      return true;
    } catch (error) {
      this.isOllamaRunning = false;
      console.log('[Qwen Ollama] Ollama service is not running. Please start Ollama first.');
      return false;
    }
  }

  /**
   * Start Ollama service if not running
   */
  async startOllamaService(): Promise<boolean> {
    if (this.isOllamaRunning) return true;

    return new Promise((resolve) => {
      console.log('[Qwen Ollama] Attempting to start Ollama service...');
      
      const ollamaProcess = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore'
      });

      ollamaProcess.on('error', (err) => {
        console.error('[Qwen Ollama] Failed to start Ollama:', err);
        resolve(false);
      });

      ollamaProcess.unref();

      // Wait a bit for Ollama to start
      setTimeout(async () => {
        const isRunning = await this.checkOllamaStatus();
        resolve(isRunning);
      }, 3000);
    });
  }

  /**
   * Scan for available Qwen models
   */
  async scanForQwenModels(): Promise<QwenModelInfo[]> {
    try {
      const models = await this.ollama.list();
      
      // Filter for Qwen models
      this.availableModels = models.models
        .filter(model => 
          model.name.toLowerCase().includes('qwen') ||
          model.name.toLowerCase().includes('coder')
        )
        .map(model => ({
          name: model.name,
          size: this.formatBytes(model.size),
          modified: new Date(model.modified_at),
          digest: model.digest,
          details: model.details as any
        }));

      console.log(`[Qwen Ollama] Found ${this.availableModels.length} Qwen models`);
      
      // Auto-select the best available model
      if (this.availableModels.length > 0 && !this.selectedModel) {
        // Prefer larger models for better performance
        const preferredModels = [
          'qwen2.5-coder:32b',
          'qwen2.5-coder:14b',
          'qwen2.5-coder:7b',
          'qwen2.5-coder:latest',
          'qwen2:72b',
          'qwen2:32b',
          'qwen2:7b'
        ];

        for (const preferred of preferredModels) {
          const found = this.availableModels.find(m => m.name === preferred);
          if (found) {
            this.selectedModel = found.name;
            console.log(`[Qwen Ollama] Auto-selected model: ${this.selectedModel}`);
            break;
          }
        }

        // Fallback to first available
        if (!this.selectedModel) {
          this.selectedModel = this.availableModels[0].name;
        }
      }

      return this.availableModels;
    } catch (error) {
      console.error('[Qwen Ollama] Error scanning for models:', error);
      return [];
    }
  }

  /**
   * Pull a Qwen model from Ollama registry
   */
  async pullModel(modelName: string): Promise<boolean> {
    try {
      console.log(`[Qwen Ollama] Pulling model ${modelName}...`);
      
      const stream = await this.ollama.pull({
        model: modelName,
        stream: true
      });

      for await (const part of stream) {
        if (part.status) {
          const progress = part.completed && part.total 
            ? Math.round((part.completed / part.total) * 100)
            : 0;
          
          this.emit('pull-progress', {
            model: modelName,
            status: part.status,
            progress,
            completed: part.completed,
            total: part.total
          });
        }
      }

      console.log(`[Qwen Ollama] Successfully pulled ${modelName}`);
      await this.scanForQwenModels();
      return true;
    } catch (error) {
      console.error(`[Qwen Ollama] Error pulling model ${modelName}:`, error);
      return false;
    }
  }

  /**
   * Generate a completion using selected Qwen model
   */
  async generateCompletion(
    prompt: string,
    options: QwenCompletionOptions = {}
  ): Promise<string> {
    if (!this.selectedModel) {
      throw new Error('No Qwen model selected. Please select or pull a model first.');
    }

    try {
      const response = await this.ollama.generate({
        model: this.selectedModel,
        prompt,
        options: {
          temperature: options.temperature ?? 0.7,
          top_p: options.top_p ?? 0.9,
          num_predict: options.max_tokens ?? 2048
        },
        stream: false
      });

      return response.response;
    } catch (error) {
      console.error('[Qwen Ollama] Generation error:', error);
      throw error;
    }
  }

  /**
   * Chat with Qwen model
   */
  async chat(
    messages: QwenChatMessage[],
    options: QwenCompletionOptions = {}
  ): Promise<string> {
    if (!this.selectedModel) {
      throw new Error('No Qwen model selected. Please select or pull a model first.');
    }

    try {
      const response = await this.ollama.chat({
        model: this.selectedModel,
        messages,
        options: {
          temperature: options.temperature ?? 0.7,
          top_p: options.top_p ?? 0.9,
          num_predict: options.max_tokens ?? 2048
        },
        stream: false
      });

      return response.message.content;
    } catch (error) {
      console.error('[Qwen Ollama] Chat error:', error);
      throw error;
    }
  }

  /**
   * Stream chat with Qwen model
   */
  async streamChat(
    messages: QwenChatMessage[],
    onChunk: (chunk: string) => void,
    options: QwenCompletionOptions = {}
  ): Promise<void> {
    if (!this.selectedModel) {
      throw new Error('No Qwen model selected. Please select or pull a model first.');
    }

    try {
      const stream = await this.ollama.chat({
        model: this.selectedModel,
        messages,
        options: {
          temperature: options.temperature ?? 0.7,
          top_p: options.top_p ?? 0.9,
          num_predict: options.max_tokens ?? 2048
        },
        stream: true
      });

      for await (const part of stream) {
        if (part.message?.content) {
          onChunk(part.message.content);
        }
      }
    } catch (error) {
      console.error('[Qwen Ollama] Stream chat error:', error);
      throw error;
    }
  }

  /**
   * Get installation instructions for Qwen models
   */
  getSetupInstructions(): {
    ollamaInstall: string[];
    modelPull: string[];
    verification: string[];
    troubleshooting: string[];
  } {
    const platform = os.platform();
    
    const ollamaInstall = platform === 'darwin' 
      ? [
          'Install Ollama using Homebrew:',
          'brew install ollama',
          '',
          'Or download from: https://ollama.com/download'
        ]
      : platform === 'win32'
      ? [
          'Download Ollama for Windows:',
          'https://ollama.com/download/windows',
          '',
          'Run the installer and follow the instructions'
        ]
      : [
          'Install Ollama on Linux:',
          'curl -fsSL https://ollama.com/install.sh | sh',
          '',
          'Or visit: https://ollama.com/download'
        ];

    return {
      ollamaInstall,
      modelPull: [
        'Pull a Qwen Coder model (recommended):',
        'ollama pull qwen2.5-coder:32b   # Best performance (21GB)',
        'ollama pull qwen2.5-coder:7b    # Good balance (4.7GB)',
        '',
        'Or pull standard Qwen models:',
        'ollama pull qwen2:72b           # Largest (41GB)',
        'ollama pull qwen2:7b            # Smaller (4.4GB)'
      ],
      verification: [
        'Verify installation:',
        'ollama list                     # Show installed models',
        'ollama run qwen2.5-coder:7b     # Test the model'
      ],
      troubleshooting: [
        'If Ollama is not running:',
        'ollama serve                    # Start Ollama service',
        '',
        'Check Ollama status:',
        'curl http://localhost:11434/api/tags'
      ]
    };
  }

  /**
   * Select a specific model
   */
  selectModel(modelName: string): boolean {
    const model = this.availableModels.find(m => m.name === modelName);
    if (model) {
      this.selectedModel = modelName;
      console.log(`[Qwen Ollama] Selected model: ${modelName}`);
      return true;
    }
    return false;
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      ollamaPath: this.ollamaPath,
      isOllamaRunning: this.isOllamaRunning,
      availableModels: this.availableModels,
      selectedModel: this.selectedModel,
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434'
    };
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if any Qwen model is available
   */
  hasQwenModel(): boolean {
    return this.availableModels.length > 0;
  }

  /**
   * Get recommended models for different use cases
   */
  getRecommendedModels() {
    return {
      bestPerformance: {
        name: 'qwen2.5-coder:32b',
        size: '~21GB',
        description: 'Best for complex coding tasks, requires 32GB+ RAM'
      },
      balanced: {
        name: 'qwen2.5-coder:7b',
        size: '~4.7GB',
        description: 'Good balance of performance and resource usage'
      },
      lightweight: {
        name: 'qwen2.5-coder:1.5b',
        size: '~1GB',
        description: 'Lightweight option for basic tasks'
      }
    };
  }
}

// Export singleton instance
let qwenOllamaClient: QwenOllamaClient | null = null;

export function getQwenOllamaClient(): QwenOllamaClient {
  if (!qwenOllamaClient) {
    qwenOllamaClient = new QwenOllamaClient();
  }
  return qwenOllamaClient;
}