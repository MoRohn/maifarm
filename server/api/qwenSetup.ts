import { Router } from 'express';
import { ollamaModelDetector } from '../services/ollamaModelDetector';
import { ollamaService } from '../services/ollamaService';
import { qwenCodeManager } from '../services/qwenCodeManager';
import { EventEmitter } from 'events';

const router = Router();
const pullEventEmitter = new EventEmitter();

/**
 * GET /api/qwen/ollama/status
 * Check if Ollama service is running
 */
router.get('/ollama/status', async (req, res) => {
  try {
    const isRunning = await ollamaModelDetector.isOllamaRunning();
    res.json({ isRunning });
  } catch (error) {
    console.error('Error checking Ollama status:', error);
    res.status(500).json({ error: 'Failed to check Ollama status' });
  }
});

/**
 * POST /api/qwen/ollama/start
 * Start Ollama service
 */
router.post('/ollama/start', async (req, res) => {
  try {
    const started = await ollamaModelDetector.startOllama();
    if (started) {
      res.json({ success: true, message: 'Ollama service started' });
    } else {
      res.status(500).json({ error: 'Failed to start Ollama service' });
    }
  } catch (error) {
    console.error('Error starting Ollama:', error);
    res.status(500).json({ error: 'Failed to start Ollama service' });
  }
});

/**
 * GET /api/qwen/models/detect
 * Detect local Qwen models
 */
router.get('/models/detect', async (req, res) => {
  try {
    const detection = await ollamaModelDetector.detectQwenModel();
    res.json(detection);
  } catch (error) {
    console.error('Error detecting models:', error);
    res.status(500).json({ error: 'Failed to detect models' });
  }
});

/**
 * POST /api/qwen/models/path
 * Set custom model path
 */
router.post('/models/path', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    ollamaModelDetector.setCustomModelPath(path);
    const detection = await ollamaModelDetector.detectQwenModel();
    res.json({ success: true, detection });
  } catch (error) {
    console.error('Error setting custom path:', error);
    res.status(500).json({ error: 'Failed to set custom model path' });
  }
});

/**
 * GET /api/qwen/models/pull
 * Pull a model with SSE progress updates
 */
router.get('/models/pull', async (req, res) => {
  const { model } = req.query;
  
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'Model name is required' });
  }
  
  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  try {
    // Listen for pull progress
    const progressListener = (data: any) => {
      if (data.model === model) {
        const progress = data.progress || 0;
        res.write(`data: ${JSON.stringify({ progress })}\n\n`);
      }
    };
    
    const completeListener = (data: any) => {
      if (data.model === model) {
        res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
        res.end();
      }
    };
    
    const errorListener = (data: any) => {
      if (data.model === model) {
        res.write(`data: ${JSON.stringify({ error: data.error })}\n\n`);
        res.end();
      }
    };
    
    ollamaService.on('pull:progress', progressListener);
    ollamaService.on('pull:complete', completeListener);
    ollamaService.on('pull:error', errorListener);
    
    // Start pulling the model
    ollamaService.pullModel(model).catch((error) => {
      console.error('Error pulling model:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
    
    // Clean up listeners on disconnect
    req.on('close', () => {
      ollamaService.off('pull:progress', progressListener);
      ollamaService.off('pull:complete', completeListener);
      ollamaService.off('pull:error', errorListener);
    });
  } catch (error) {
    console.error('Error in pull endpoint:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to pull model' })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/qwen/models/activate
 * Activate a model for use
 */
router.post('/models/activate', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    // Run the model to ensure it's ready
    const result = await ollamaModelDetector.runQwenModel(model);
    
    if (result.success) {
      // Update the configured model in the service
      const validation = await ollamaModelDetector.validateModel(model);
      if (validation.valid) {
        res.json({ 
          success: true, 
          model: result.model,
          message: 'Model activated successfully' 
        });
      } else {
        res.status(400).json({ error: validation.error });
      }
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error activating model:', error);
    res.status(500).json({ error: 'Failed to activate model' });
  }
});

/**
 * GET /api/qwen/models/list
 * List all available models
 */
router.get('/models/list', async (req, res) => {
  try {
    const models = await ollamaModelDetector.listAvailableModels();
    const qwenModels = models.filter(m => 
      m.name.toLowerCase().includes('qwen') || 
      m.name.toLowerCase().includes('coder')
    );
    res.json({ models: qwenModels });
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

/**
 * GET /api/qwen/models/instructions
 * Get download instructions for a model size
 */
router.get('/models/instructions', (req, res) => {
  const { size = '7b' } = req.query;
  const instructions = ollamaModelDetector.getDownloadInstructions(size as string);
  res.json(instructions);
});

/**
 * GET /api/qwen/config
 * Get current Qwen configuration
 */
router.get('/config', async (req, res) => {
  try {
    const config = await ollamaModelDetector.getQwenModelConfig();
    const isRunning = await ollamaModelDetector.isOllamaRunning();
    
    res.json({
      config,
      isRunning,
      available: config !== null
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * POST /api/qwen/test
 * Test the Qwen model with a simple prompt
 */
router.post('/test', async (req, res) => {
  try {
    const { prompt = 'Hello, please respond with a simple greeting.' } = req.body;
    
    const model = ollamaService.getConfiguredModel();
    if (!model) {
      return res.status(400).json({ error: 'No Qwen model configured' });
    }
    
    const response = await ollamaService.createCompletion(prompt, {
      temperature: 0.7,
      maxTokens: 100
    });
    
    res.json({
      success: true,
      model,
      response
    });
  } catch (error) {
    console.error('Error testing model:', error);
    res.status(500).json({ error: 'Failed to test model' });
  }
});

export default router;