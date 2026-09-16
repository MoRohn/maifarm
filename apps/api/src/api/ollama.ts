import { Router, Request, Response } from 'express';
import axios from 'axios';
import { aiProviderService, AIProvider } from '../services/unified/aiProviderService';
import type { OllamaValidationResult, OllamaDownloadInstructions } from '../types/ollama';

// Ollama API endpoint
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Create complete facades for ollama services
const ollamaModelDetector = {
  async detectInstalledModels() {
    try {
      const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
      return response.data.models || [];
    } catch {
      return [];
    }
  },

  async checkModelStatus(model: string) {
    try {
      const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
      const models = response.data.models || [];
      return models.some((m: any) => m.name === model || m.name.startsWith(model));
    } catch {
      return false;
    }
  },

  async listAvailableModels() {
    try {
      const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
      return (response.data.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
        digest: m.digest
      }));
    } catch {
      return [];
    }
  },

  async detectLlamaModel() {
    try {
      const models = await this.listAvailableModels();
      const llamaModels = models.filter((m: any) =>
        m.name.includes('llama') || m.name.includes('codellama')
      );
      return {
        detected: llamaModels.length > 0,
        models: llamaModels,
        recommended: llamaModels[0]?.name || null
      };
    } catch {
      return { detected: false, models: [], recommended: null };
    }
  },

  async validateModel(modelName: string): Promise<OllamaValidationResult> {
    try {
      const models = await this.listAvailableModels();
      const found = models.find((m: any) => m.name === modelName || m.name.startsWith(modelName));
      return {
        valid: !!found,
        model: found ? {
          name: found.name,
          model: found.name,
          size: found.size || 0,
          digest: found.digest || '',
          modified_at: found.modified_at || ''
        } : undefined,
        error: found ? undefined : 'Model not found',
        suggestion: found ? undefined : 'Run: ollama pull ' + modelName
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  },

  getDownloadInstructions(modelSize: string): OllamaDownloadInstructions {
    const modelMap: Record<string, string> = {
      '7b': 'llama2',
      '13b': 'llama2:13b',
      '70b': 'llama2:70b',
      'code': 'codellama',
      'mistral': 'mistral'
    };
    const model = modelMap[modelSize] || 'llama2';
    const sizeInfo = {
      '70b': { disk: '39GB', memory: '48GB' },
      '13b': { disk: '7GB', memory: '16GB' },
      '7b': { disk: '3.8GB', memory: '8GB' },
      'code': { disk: '3.8GB', memory: '8GB' },
      'mistral': { disk: '4GB', memory: '8GB' }
    };
    const sizes = sizeInfo[modelSize as keyof typeof sizeInfo] || sizeInfo['7b'];
    return {
      command: `ollama pull ${model}`,
      huggingFaceUrl: `https://ollama.ai/library/${model}`,
      estimatedSize: sizes.disk,
      requirements: {
        diskSpace: sizes.disk,
        memory: sizes.memory
      }
    };
  },

  async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 3000 });
      return response.status === 200;
    } catch {
      return false;
    }
  },

  async startOllama(): Promise<boolean> {
    // Ollama typically runs as a service, we can only check if it's running
    return this.isOllamaRunning();
  },

  getOllamaPath(): string {
    return OLLAMA_HOST;
  }
};

const ollamaService = {
  getConfig() {
    return aiProviderService.getProviderConfig(AIProvider.OLLAMA);
  },

  getConfiguredModel(): string | null {
    const config = aiProviderService.getProviderConfig(AIProvider.OLLAMA);
    return config?.model || process.env.OLLAMA_MODEL || null;
  },

  async validateConnection(): Promise<boolean> {
    return ollamaModelDetector.isOllamaRunning();
  },

  async testAPI(): Promise<boolean> {
    return ollamaModelDetector.isOllamaRunning();
  },

  async initialize(): Promise<void> {
    // No-op: Ollama doesn't need initialization
  },

  // Event emitter stub (not supported in this facade)
  on(_event: string, _callback: (data: any) => void): void {
    // Pull progress events are handled via SSE in the route
  },

  async pullModel(modelName: string): Promise<void> {
    // Ollama pull is a long-running operation
    // This would typically be handled via the ollama CLI
    throw new Error('Model pulling should be done via CLI: ollama pull ' + modelName);
  },

  async createCompletion(prompt: string, options: { temperature?: number; maxTokens?: number }): Promise<string> {
    const model = this.getConfiguredModel() || 'llama2';
    const response = await axios.post(`${OLLAMA_HOST}/api/generate`, {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 100
      }
    }, { timeout: 30000 });
    return response.data.response;
  }
};

const router = Router();

/**
 * Check if local Llama model is available
 */
router.get('/detect', async (req: Request, res: Response) => {
  try {
    const detection = await ollamaModelDetector.detectLlamaModel();
    res.json(detection);
  } catch (error) {
    console.error('Error detecting Llama model:', error);
    res.status(500).json({
      error: 'Failed to detect local Llama model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Validate a specific model
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.body;
    
    if (!modelName) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    const validation: OllamaValidationResult = await ollamaModelDetector.validateModel(modelName);
    res.json(validation);
  } catch (error) {
    console.error('Error validating model:', error);
    res.status(500).json({
      error: 'Failed to validate model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * List all available local models
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const models = await ollamaModelDetector.listAvailableModels();
    res.json({ models });
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({
      error: 'Failed to list models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get download instructions for Llama model
 */
router.get('/download-instructions', async (req: Request, res: Response) => {
  try {
    const modelSize = req.query.size as string || '7b';
    const instructions: OllamaDownloadInstructions = ollamaModelDetector.getDownloadInstructions(modelSize);
    res.json(instructions);
  } catch (error) {
    console.error('Error getting download instructions:', error);
    res.status(500).json({
      error: 'Failed to get download instructions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Check if Ollama service is running
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isRunning = await ollamaModelDetector.isOllamaRunning();
    const configuredModel = ollamaService.getConfiguredModel();
    
    res.json({
      running: isRunning,
      configured: !!configuredModel,
      model: configuredModel
    });
  } catch (error) {
    console.error('Error checking Ollama status:', error);
    res.status(500).json({
      error: 'Failed to check Ollama status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Start Ollama service
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const started = await ollamaModelDetector.startOllama();
    
    if (started) {
      await ollamaService.initialize();
      res.json({ success: true, message: 'Ollama service started successfully' });
    } else {
      res.status(500).json({ error: 'Failed to start Ollama service' });
    }
  } catch (error) {
    console.error('Error starting Ollama:', error);
    res.status(500).json({
      error: 'Failed to start Ollama service',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Pull a model from Ollama registry
 */
router.post('/pull', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.body;
    
    if (!modelName) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    // Start SSE for progress updates
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Listen for pull progress
    ollamaService.on('pull:progress', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    });

    ollamaService.on('pull:complete', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
      res.end();
    });

    ollamaService.on('pull:error', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`);
      res.end();
    });

    // Start pulling the model
    await ollamaService.pullModel(modelName);
  } catch (error) {
    console.error('Error pulling model:', error);
    res.status(500).json({
      error: 'Failed to pull model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Ollama configuration path
 */
router.get('/path', async (req: Request, res: Response) => {
  try {
    const path = ollamaModelDetector.getOllamaPath();
    res.json({ path });
  } catch (error) {
    console.error('Error getting Ollama path:', error);
    res.status(500).json({
      error: 'Failed to get Ollama path',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test model with a simple prompt
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { prompt = 'Hello, how are you?' } = req.body;
    
    const response = await ollamaService.createCompletion(prompt, {
      temperature: 0.7,
      maxTokens: 100
    });
    
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error testing model:', error);
    res.status(500).json({
      error: 'Failed to test model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;