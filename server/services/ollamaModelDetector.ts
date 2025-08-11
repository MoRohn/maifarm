import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  OllamaModel,
  OllamaDetectionResult,
  OllamaValidationResult,
  OllamaDownloadInstructions,
  OllamaModelConfig
} from '../types/ollama';

const execAsync = promisify(exec);

export class OllamaModelDetector {
  private ollamaBasePath: string;
  private customModelPaths: string[] = [];
  private supportedQwenModels = [
    'qwen2.5-coder:32b',
    'qwen2.5-coder:14b',
    'qwen2.5-coder:7b',
    'qwen2.5-coder:3b',
    'qwen2.5-coder:1.5b',
    'qwen2.5-coder:0.5b',
    'qwen2.5-coder',
    'qwen-coder',
    'qwen3-coder',
    'qwen3-coder:480b'
  ];

  constructor() {
    this.ollamaBasePath = this.getOllamaPath();
    this.loadCustomPaths();
  }

  /**
   * Load custom model paths from environment or config
   */
  private loadCustomPaths(): void {
    const customPath = process.env.QWEN_MODEL_PATH;
    if (customPath) {
      this.customModelPaths.push(customPath);
    }
    
    // Add common alternative locations
    const homeDir = os.homedir();
    this.customModelPaths.push(
      path.join(homeDir, 'models', 'ollama'),
      path.join(homeDir, 'models', 'qwen'),
      '/opt/ollama/models',
      '/usr/local/ollama/models'
    );
  }

  /**
   * Set a custom model path
   */
  setCustomModelPath(path: string): void {
    if (!this.customModelPaths.includes(path)) {
      this.customModelPaths.unshift(path);
    }
  }

  /**
   * Get the default Ollama installation path
   */
  getOllamaPath(): string {
    const homeDir = os.homedir();
    const platform = os.platform();

    switch (platform) {
      case 'darwin': // macOS
        return path.join(homeDir, '.ollama');
      case 'linux':
        return process.env.OLLAMA_HOME || path.join(homeDir, '.ollama');
      case 'win32':
        return path.join(process.env.LOCALAPPDATA || homeDir, 'Ollama');
      default:
        return path.join(homeDir, '.ollama');
    }
  }

  /**
   * Detect if Qwen model is available locally
   */
  async detectQwenModel(): Promise<OllamaDetectionResult> {
    try {
      // First try to use ollama CLI to list models
      const cliModels = await this.getModelsFromCLI();
      if (cliModels.length > 0) {
        const qwenModel = cliModels.find(m => 
          this.supportedQwenModels.some(supported => 
            m.name.toLowerCase().includes(supported.toLowerCase().split(':')[0])
          )
        );

        if (qwenModel) {
          return {
            found: true,
            path: this.ollamaBasePath,
            models: [qwenModel]
          };
        }
      }

      // Check default path
      const fsModels = await this.getModelsFromFileSystem();
      let qwenModels = fsModels.filter(m => 
        this.supportedQwenModels.some(supported => 
          m.name.toLowerCase().includes('qwen')
        )
      );

      if (qwenModels.length > 0) {
        return {
          found: true,
          path: this.ollamaBasePath,
          models: qwenModels
        };
      }

      // Check custom paths
      for (const customPath of this.customModelPaths) {
        const customModels = await this.scanCustomPath(customPath);
        if (customModels.length > 0) {
          return {
            found: true,
            path: customPath,
            models: customModels
          };
        }
      }

      return {
        found: false,
        path: this.ollamaBasePath,
        models: [],
        error: 'No Qwen models found. Please run: ollama pull qwen2.5-coder:7b or specify a custom model path'
      };
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : 'Failed to detect Ollama models'
      };
    }
  }

  /**
   * Scan a custom path for Qwen models
   */
  private async scanCustomPath(customPath: string): Promise<OllamaModel[]> {
    const models: OllamaModel[] = [];
    
    try {
      const exists = await fs.access(customPath).then(() => true).catch(() => false);
      if (!exists) return models;

      // Look for GGUF files or model directories
      const files = await fs.readdir(customPath);
      
      for (const file of files) {
        const filePath = path.join(customPath, file);
        const stat = await fs.stat(filePath);
        
        // Check for Qwen model files
        if ((file.toLowerCase().includes('qwen') || file.toLowerCase().includes('coder')) &&
            (file.endsWith('.gguf') || file.endsWith('.bin') || stat.isDirectory())) {
          
          const modelName = file.replace(/\.(gguf|bin)$/, '');
          models.push({
            name: modelName,
            model: modelName,
            size: stat.size,
            digest: '',
            modified_at: stat.mtime.toISOString()
          });
        }
      }
    } catch (error) {
      console.log(`Could not scan custom path ${customPath}:`, error);
    }

    return models;
  }

  /**
   * Get models using Ollama CLI
   */
  private async getModelsFromCLI(): Promise<OllamaModel[]> {
    try {
      const { stdout } = await execAsync('ollama list');
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      
      return lines.map(line => {
        const parts = line.split(/\s+/);
        const name = parts[0];
        const digest = parts[1] || '';
        const size = parts[2] || '0';
        const modified = parts.slice(3).join(' ');

        return {
          name,
          model: name,
          size: this.parseSizeToBytes(size),
          digest,
          modified_at: modified
        };
      }).filter(m => m.name);
    } catch (error) {
      console.log('Ollama CLI not available, falling back to file system detection');
      return [];
    }
  }

  /**
   * Get models from file system
   */
  private async getModelsFromFileSystem(): Promise<OllamaModel[]> {
    const models: OllamaModel[] = [];
    const modelsPath = path.join(this.ollamaBasePath, 'models', 'manifests');

    try {
      const exists = await fs.access(modelsPath).then(() => true).catch(() => false);
      if (!exists) return models;

      const registries = await fs.readdir(modelsPath);
      
      for (const registry of registries) {
        const libraryPath = path.join(modelsPath, registry, 'library');
        const libraryExists = await fs.access(libraryPath).then(() => true).catch(() => false);
        
        if (libraryExists) {
          const modelDirs = await fs.readdir(libraryPath);
          
          for (const modelDir of modelDirs) {
            const modelPath = path.join(libraryPath, modelDir);
            const stat = await fs.stat(modelPath);
            
            if (stat.isDirectory()) {
              const tags = await fs.readdir(modelPath);
              
              for (const tag of tags) {
                models.push({
                  name: `${modelDir}:${tag}`,
                  model: `${registry}/library/${modelDir}:${tag}`,
                  size: 0,
                  digest: '',
                  modified_at: stat.mtime.toISOString()
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading Ollama models directory:', error);
    }

    return models;
  }

  /**
   * Validate a specific model
   */
  async validateModel(modelName: string): Promise<OllamaValidationResult> {
    try {
      // Try to get model info using ollama CLI
      const { stdout } = await execAsync(`ollama show ${modelName}`);
      
      if (stdout.includes(modelName)) {
        return {
          valid: true,
          model: {
            name: modelName,
            model: modelName,
            size: 0,
            digest: '',
            modified_at: new Date().toISOString()
          }
        };
      }

      return {
        valid: false,
        error: `Model ${modelName} not found`,
        suggestion: `Run: ollama pull ${modelName}`
      };
    } catch (error) {
      // Check if model exists in file system
      const detection = await this.detectQwenModel();
      const model = detection.models?.find(m => m.name === modelName);
      
      if (model) {
        return { valid: true, model };
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
        suggestion: `Install Ollama and run: ollama pull ${modelName}`
      };
    }
  }

  /**
   * List all available models
   */
  async listAvailableModels(): Promise<OllamaModel[]> {
    const cliModels = await this.getModelsFromCLI();
    if (cliModels.length > 0) {
      return cliModels;
    }
    return this.getModelsFromFileSystem();
  }

  /**
   * Get download instructions for Qwen model
   */
  getDownloadInstructions(modelSize: string = '7b'): OllamaDownloadInstructions {
    const modelName = `qwen2.5-coder:${modelSize}`;
    const sizeMap: Record<string, { size: string, memory: string }> = {
      '32b': { size: '20GB', memory: '32GB' },
      '14b': { size: '9GB', memory: '16GB' },
      '7b': { size: '4.5GB', memory: '8GB' },
      '3b': { size: '2GB', memory: '4GB' },
      '1.5b': { size: '1GB', memory: '2GB' },
      '0.5b': { size: '400MB', memory: '1GB' }
    };

    const requirements = sizeMap[modelSize] || sizeMap['7b'];

    return {
      command: `ollama pull ${modelName}`,
      huggingFaceUrl: `https://huggingface.co/Qwen/Qwen2.5-Coder-${modelSize.toUpperCase()}`,
      estimatedSize: requirements.size,
      requirements: {
        diskSpace: requirements.size,
        memory: requirements.memory
      }
    };
  }

  /**
   * Check if Ollama service is running
   */
  async isOllamaRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('curl -s http://localhost:11434/api/tags');
      return stdout.includes('models') || stdout.includes('name');
    } catch {
      return false;
    }
  }

  /**
   * Start Ollama service
   */
  async startOllama(): Promise<boolean> {
    try {
      // Check if already running
      if (await this.isOllamaRunning()) {
        console.log('Ollama service is already running');
        return true;
      }

      // Try to start Ollama service
      exec('ollama serve', { 
        detached: true,
        stdio: 'ignore'
      }, (error) => {
        if (error) {
          console.log('Ollama serve command failed, it might already be running');
        }
      });
      
      // Wait for service to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if started successfully
      const isRunning = await this.isOllamaRunning();
      if (isRunning) {
        console.log('Ollama service started successfully');
      } else {
        console.log('Failed to start Ollama service. Please start it manually with: ollama serve');
      }
      
      return isRunning;
    } catch (error) {
      console.error('Failed to start Ollama:', error);
      return false;
    }
  }

  /**
   * Programmatically run a Qwen model
   */
  async runQwenModel(modelName?: string): Promise<{ success: boolean; model?: string; error?: string }> {
    try {
      // Ensure Ollama is running
      if (!await this.isOllamaRunning()) {
        const started = await this.startOllama();
        if (!started) {
          return {
            success: false,
            error: 'Failed to start Ollama service. Please install Ollama from https://ollama.com'
          };
        }
      }

      // Detect available Qwen model if not specified
      if (!modelName) {
        const detection = await this.detectQwenModel();
        if (detection.found && detection.models && detection.models.length > 0) {
          modelName = detection.models[0].name;
        } else {
          // Try to pull a default model
          console.log('No local Qwen model found. Pulling qwen2.5-coder:7b...');
          try {
            await execAsync('ollama pull qwen2.5-coder:7b');
            modelName = 'qwen2.5-coder:7b';
          } catch (pullError) {
            return {
              success: false,
              error: 'No Qwen model found and failed to pull default model. Please run: ollama pull qwen2.5-coder:7b'
            };
          }
        }
      }

      // Validate the model exists
      const validation = await this.validateModel(modelName);
      if (!validation.valid) {
        // Try to pull the model
        console.log(`Model ${modelName} not found. Attempting to pull...`);
        try {
          await execAsync(`ollama pull ${modelName}`);
        } catch (pullError) {
          return {
            success: false,
            error: `Model ${modelName} not found. ${validation.suggestion}`
          };
        }
      }

      console.log(`Qwen model ${modelName} is ready for use`);
      return {
        success: true,
        model: modelName
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run Qwen model'
      };
    }
  }

  /**
   * Get Ollama configuration for Qwen model
   */
  async getQwenModelConfig(): Promise<OllamaModelConfig | null> {
    const detection = await this.detectQwenModel();
    
    if (detection.found && detection.models && detection.models.length > 0) {
      // Prefer larger models for better performance
      const preferredOrder = ['32b', '14b', '7b', '3b', '1.5b', '0.5b'];
      let selectedModel = detection.models[0];
      
      for (const size of preferredOrder) {
        const model = detection.models.find(m => m.name.includes(size));
        if (model) {
          selectedModel = model;
          break;
        }
      }

      return {
        model: selectedModel.name,
        path: detection.path,
        isLocal: true,
        baseUrl: 'http://localhost:11434'
      };
    }

    return null;
  }

  /**
   * Parse size string to bytes
   */
  private parseSizeToBytes(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      return Math.floor(value * (units[unit] || 1));
    }

    return 0;
  }
}

// Export singleton instance
export const ollamaModelDetector = new OllamaModelDetector();