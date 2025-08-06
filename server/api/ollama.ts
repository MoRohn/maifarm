import { Router, Request, Response } from 'express';
import { ollamaModelDetector } from '../services/ollamaModelDetector';
import { ollamaService } from '../services/ollamaService';
import type { OllamaValidationResult, OllamaDownloadInstructions } from '../types/ollama';

const router = Router();

/**
 * Check if local Qwen model is available
 */
router.get('/detect', async (req: Request, res: Response) => {
  try {
    const detection = await ollamaModelDetector.detectQwenModel();
    res.json(detection);
  } catch (error) {
    console.error('Error detecting Qwen model:', error);
    res.status(500).json({
      error: 'Failed to detect local Qwen model',
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
 * Get download instructions for Qwen model
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