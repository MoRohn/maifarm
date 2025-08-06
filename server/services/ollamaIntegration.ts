import { execSync, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified: Date;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ModelValidationResult {
  isValid: boolean;
  modelInfo?: OllamaModelInfo;
  error?: string;
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  modelPath?: string;
}

export class OllamaIntegration {
  private readonly ollamaBaseUrl: string = 'http://localhost:11434';
  private readonly ollamaModelsPath: string;
  private readonly supportedQwenModels = [
    'qwen2.5-coder:32b',
    'qwen2.5-coder:7b',
    'qwen2.5-coder:1.5b',
    'qwen2.5-coder:0.5b',
    'qwen2.5-coder:latest',
    'qwen2.5:32b',
    'qwen2.5:7b',
    'qwen2.5:latest'
  ];

  constructor() {
    // Determine Ollama models path based on OS
    const homeDir = os.homedir();
    this.ollamaModelsPath = path.join(homeDir, '.ollama', 'models');
  }

  /**
   * Check if Ollama is installed on the system
   */
  async isOllamaInstalled(): Promise<boolean> {
    try {
      const result = execSync('which ollama', { encoding: 'utf-8' });
      return !!result.trim();
    } catch {
      return false;
    }
  }

  /**
   * Check if Ollama service is running
   */
  async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.ollamaBaseUrl}/api/version`, {
        timeout: 2000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Start Ollama service if not running
   */
  async startOllamaService(): Promise<boolean> {
    if (await this.isOllamaRunning()) {
      return true;
    }

    try {
      // Start Ollama in background
      const ollamaProcess = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore'
      });
      ollamaProcess.unref();

      // Wait for service to be ready
      let attempts = 0;
      while (attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (await this.isOllamaRunning()) {
          return true;
        }
        attempts++;
      }
      return false;
    } catch (error) {
      console.error('Failed to start Ollama service:', error);
      return false;
    }
  }

  /**
   * List all available models in Ollama
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await axios.get(`${this.ollamaBaseUrl}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  /**
   * Find available Qwen models
   */
  async findQwenModels(): Promise<OllamaModelInfo[]> {
    const models = await this.listModels();
    return models.filter(model => 
      model.name.toLowerCase().includes('qwen') ||
      this.supportedQwenModels.some(supported => 
        model.name.toLowerCase().includes(supported.toLowerCase())
      )
    );
  }

  /**
   * Validate if a specific Qwen model is available
   */
  async validateQwenModel(modelName?: string): Promise<ModelValidationResult> {
    const ollamaInstalled = await this.isOllamaInstalled();
    const ollamaRunning = await this.isOllamaRunning();

    if (!ollamaInstalled) {
      return {
        isValid: false,
        ollamaInstalled: false,
        ollamaRunning: false,
        error: 'Ollama is not installed. Please install Ollama from https://ollama.ai'
      };
    }

    if (!ollamaRunning) {
      // Try to start Ollama
      const started = await this.startOllamaService();
      if (!started) {
        return {
          isValid: false,
          ollamaInstalled: true,
          ollamaRunning: false,
          error: 'Ollama service is not running. Please start it with: ollama serve'
        };
      }
    }

    const qwenModels = await this.findQwenModels();
    
    if (qwenModels.length === 0) {
      return {
        isValid: false,
        ollamaInstalled: true,
        ollamaRunning: true,
        error: 'No Qwen models found. Please pull a model with: ollama pull qwen2.5-coder:32b'
      };
    }

    // If specific model requested, check for it
    if (modelName) {
      const model = qwenModels.find(m => m.name === modelName);
      if (!model) {
        return {
          isValid: false,
          ollamaInstalled: true,
          ollamaRunning: true,
          error: `Model ${modelName} not found. Available models: ${qwenModels.map(m => m.name).join(', ')}`
        };
      }
      return {
        isValid: true,
        modelInfo: model,
        ollamaInstalled: true,
        ollamaRunning: true,
        modelPath: path.join(this.ollamaModelsPath, 'manifests', 'registry.ollama.ai', 'library', modelName.split(':')[0])
      };
    }

    // Return the first available Qwen model
    const defaultModel = qwenModels[0];
    return {
      isValid: true,
      modelInfo: defaultModel,
      ollamaInstalled: true,
      ollamaRunning: true,
      modelPath: path.join(this.ollamaModelsPath, 'manifests', 'registry.ollama.ai', 'library', defaultModel.name.split(':')[0])
    };
  }

  /**
   * Pull a Qwen model from Ollama registry
   */
  async pullQwenModel(modelName: string = 'qwen2.5-coder:32b'): Promise<{ success: boolean; error?: string }> {
    try {
      if (!await this.isOllamaInstalled()) {
        return { success: false, error: 'Ollama is not installed' };
      }

      if (!await this.isOllamaRunning()) {
        const started = await this.startOllamaService();
        if (!started) {
          return { success: false, error: 'Failed to start Ollama service' };
        }
      }

      // Use axios to pull model with progress tracking
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/pull`,
        { name: modelName },
        { 
          responseType: 'stream',
          timeout: 0 // No timeout for large downloads
        }
      );

      return new Promise((resolve) => {
        let lastStatus = '';
        
        response.data.on('data', (chunk: Buffer) => {
          try {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            for (const line of lines) {
              const data = JSON.parse(line);
              if (data.status && data.status !== lastStatus) {
                console.log(`[Ollama] ${data.status}`);
                lastStatus = data.status;
              }
              if (data.error) {
                resolve({ success: false, error: data.error });
                return;
              }
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        });

        response.data.on('end', () => {
          resolve({ success: true });
        });

        response.data.on('error', (error: Error) => {
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to pull model' };
    }
  }

  /**
   * Get model information from Ollama
   */
  async getModelInfo(modelName: string): Promise<OllamaModelInfo | null> {
    try {
      const response = await axios.post(`${this.ollamaBaseUrl}/api/show`, {
        name: modelName
      });
      
      return {
        name: modelName,
        size: response.data.size || 0,
        modified: new Date(response.data.modified_at || Date.now()),
        digest: response.data.digest || '',
        details: response.data.details
      };
    } catch (error) {
      console.error('Failed to get model info:', error);
      return null;
    }
  }

  /**
   * Test model with a simple prompt
   */
  async testModel(modelName: string): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/generate`,
        {
          model: modelName,
          prompt: 'Hello! Please respond with "Model working correctly" if you can read this.',
          stream: false
        },
        { timeout: 30000 }
      );

      return {
        success: true,
        response: response.data.response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to test model'
      };
    }
  }

  /**
   * Get recommended Qwen model based on system capabilities
   */
  async getRecommendedModel(): Promise<string> {
    const totalMem = os.totalmem();
    const totalMemGB = totalMem / (1024 * 1024 * 1024);

    // Recommend based on available RAM
    if (totalMemGB >= 64) {
      return 'qwen2.5-coder:32b';
    } else if (totalMemGB >= 16) {
      return 'qwen2.5-coder:7b';
    } else if (totalMemGB >= 8) {
      return 'qwen2.5-coder:1.5b';
    } else {
      return 'qwen2.5-coder:0.5b';
    }
  }

  /**
   * Get Ollama installation instructions based on OS
   */
  getInstallationInstructions(): string {
    const platform = os.platform();
    
    switch (platform) {
      case 'darwin':
        return `# macOS Installation
        
1. Download Ollama from: https://ollama.ai/download/mac
2. Open the downloaded file and follow installation instructions
3. Or install via Homebrew: brew install ollama
4. Start Ollama: ollama serve`;
        
      case 'linux':
        return `# Linux Installation
        
1. Run the installation script:
   curl -fsSL https://ollama.ai/install.sh | sh
2. Start Ollama service:
   ollama serve`;
        
      case 'win32':
        return `# Windows Installation
        
1. Download Ollama from: https://ollama.ai/download/windows
2. Run the installer and follow instructions
3. Ollama will start automatically after installation`;
        
      default:
        return 'Please visit https://ollama.ai for installation instructions';
    }
  }
}

// Export singleton instance
export const ollamaIntegration = new OllamaIntegration();