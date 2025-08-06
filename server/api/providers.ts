import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { getQwenOllamaClient } from '../services/qwenOllamaClient';
import { ollamaService } from '../services/ollamaService';

const router = Router();

// GET /api/providers/status - Get all provider status
router.get('/status', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const providers = aiProviderManager.getAllProviders();
    const defaultProvider = aiProviderManager.getDefaultProvider();
    
    const providerStatus = providers.map(config => ({
      provider: config.provider,
      name: config.provider === 'claude' ? 'Claude Code' : 'Qwen3-Coder',
      enabled: config.enabled,
      configured: config.apiKey !== '',
      model: config.model,
      contextWindow: config.contextWindow,
      isDefault: config.provider === defaultProvider
    }));

    const response: ApiResponse = {
      success: true,
      data: {
        providers: providerStatus,
        defaultProvider,
        currentProvider: process.env.AI_PROVIDER || defaultProvider
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting provider status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get provider status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/providers/:provider - Get specific provider details
router.get('/:provider', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { provider } = req.params;
    
    if (!['claude', 'qwen'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: 'Invalid provider specified'
        }
      };
      return res.status(400).json(response);
    }
    
    const isEnabled = aiProviderManager.isProviderEnabled(provider as AIProvider);
    
    if (!isEnabled) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider ${provider} is not enabled or configured`
        }
      };
      return res.status(404).json(response);
    }
    
    const config = aiProviderManager.getProvider(provider as AIProvider);
    
    const response: ApiResponse = {
      success: true,
      data: {
        provider: config.provider,
        name: config.provider === 'claude' ? 'Claude Code' : 'Qwen3-Coder',
        enabled: config.enabled,
        configured: config.apiKey !== '',
        model: config.model,
        endpoint: config.apiEndpoint,
        contextWindow: config.contextWindow,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        cliCommand: config.cliCommand,
        proxyEnabled: config.proxyEnabled
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting provider details:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get provider details'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/providers/test - Test provider connectivity
router.post('/test', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { provider = aiProviderManager.getDefaultProvider() } = req.body;
    
    if (!['claude', 'qwen'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: 'Invalid provider specified'
        }
      };
      return res.status(400).json(response);
    }
    
    const isEnabled = aiProviderManager.isProviderEnabled(provider as AIProvider);
    
    if (!isEnabled) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PROVIDER_NOT_ENABLED',
          message: `Provider ${provider} is not enabled or configured`
        }
      };
      return res.status(400).json(response);
    }
    
    // TODO: Implement actual API connectivity test
    // For now, just check configuration
    const config = aiProviderManager.getProvider(provider as AIProvider);
    const isConfigured = config.apiKey !== '' || config.proxyEnabled === true;
    
    const response: ApiResponse = {
      success: true,
      data: {
        provider,
        status: isConfigured ? 'connected' : 'not_configured',
        message: isConfigured ? 
          `${provider} is properly configured and ready` : 
          `${provider} requires API key configuration`,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error testing provider:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to test provider'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/providers/ollama/status - Check Ollama and local models status
router.get('/ollama/status', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const systemInfo = await ollamaService.getSystemInfo();
    
    const response: ApiResponse = {
      success: true,
      data: systemInfo
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting Ollama status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get Ollama status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/providers/ollama/models - List available Ollama models
router.get('/ollama/models', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const models = await ollamaService.listModels();
    
    const response: ApiResponse = {
      success: true,
      data: {
        models,
        recommendations: ollamaService.getRecommendedModels()
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error listing Ollama models:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list Ollama models'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/providers/ollama/instructions - Get setup instructions
router.get('/ollama/instructions', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { model = 'qwen2.5-coder:7b' } = req.query;
    const instructions = ollamaService.getPullInstructions(model as string);
    
    const response: ApiResponse = {
      success: true,
      data: instructions
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting Ollama instructions:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get Ollama instructions'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/providers/ollama/test - Test a local model
router.post('/ollama/test', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { model } = req.body;
    
    if (!model) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Model name is required'
        }
      };
      return res.status(400).json(response);
    }
    
    const testResult = await ollamaService.testModel(model);
    
    const response: ApiResponse = {
      success: testResult.success,
      data: testResult
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error testing Ollama model:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to test Ollama model'
      }
    };
    res.status(500).json(response);
  }
});

export default router;