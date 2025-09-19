import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { aiProviderService } from '../services/unified/aiProviderService';

// Create openaiService as a facade for aiProviderService
const openaiService = {
  getConfig: () => aiProviderService.getProviderConfig('openai'),
  validateConnection: () => aiProviderService.validateProvider('openai'),
  testAPI: () => aiProviderService.testProvider('openai')
};

const router = Router();

// GET /api/settings/ai-provider - Get current AI provider
router.get('/ai-provider', async (req, res) => {
  try {
    const provider = aiProviderManager.getDefaultProvider();
    res.json({ provider });
  } catch (error) {
    console.error('Failed to get AI provider:', error);
    res.status(500).json({ error: 'Failed to get AI provider' });
  }
});

// Alias for compatibility
router.get('/current', async (req, res) => {
  try {
    const provider = aiProviderManager.getDefaultProvider();
    res.json({ provider });
  } catch (error) {
    console.error('Failed to get AI provider:', error);
    res.status(500).json({ error: 'Failed to get AI provider' });
  }
});

// GET /api/providers/status - Get all provider status
router.get('/status', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const providers = aiProviderManager.getAllProviders();
    const defaultProvider = aiProviderManager.getDefaultProvider();
    
    // Get OpenAI status
    const openaiConfig = openaiService.getConfig();
    const openaiValidation = openaiConfig.isConfigured ? await openaiService.validateConnection() : null;
    
    const providerStatus = [
      ...providers.map(config => ({
        provider: config.provider,
        name: config.provider === 'claude' ? 'Claude Code' : 'Unknown Provider',
        enabled: config.enabled,
        configured: config.apiKey !== '',
        model: config.model,
        contextWindow: config.contextWindow,
        isDefault: config.provider === defaultProvider,
        isLocal: false
      })),
      {
        provider: 'openai',
        name: 'OpenAI GPT-4',
        enabled: openaiConfig.isConfigured,
        configured: openaiConfig.isConfigured,
        model: openaiValidation?.selectedModel || openaiConfig.model,
        contextWindow: openaiValidation?.tokenLimit || 128000,
        isDefault: defaultProvider === 'openai',
        capabilities: openaiValidation?.capabilities
      }
    ];

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
    
    if (!['claude', 'openai'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: 'Invalid provider specified'
        }
      };
      return res.status(400).json(response);
    }
    
    // Handle OpenAI provider separately
    if (provider === 'openai') {
      const openaiConfig = openaiService.getConfig();
      const validation = openaiConfig.isConfigured ? await openaiService.validateConnection() : null;
      
      const response: ApiResponse = {
        success: true,
        data: {
          provider: 'openai',
          name: 'OpenAI GPT-4',
          enabled: openaiConfig.isConfigured,
          configured: openaiConfig.isConfigured,
          model: validation?.selectedModel || openaiConfig.model,
          endpoint: openaiConfig.apiEndpoint,
          contextWindow: validation?.tokenLimit || 128000,
          maxTokens: openaiConfig.maxTokens,
          temperature: openaiConfig.temperature,
          capabilities: validation?.capabilities,
          availableModels: validation?.availableModels || [],
          error: validation?.error
        }
      };
      return res.json(response);
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
        name: config.provider === 'claude' ? 'Claude Code' : 'Unknown Provider',
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
    
    if (!['claude', 'openai'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: 'Invalid provider specified'
        }
      };
      return res.status(400).json(response);
    }
    
    // Handle OpenAI provider separately
    if (provider === 'openai') {
      const testResult = await openaiService.testAPI();
      
      const response: ApiResponse = {
        success: testResult.success,
        data: {
          provider: 'openai',
          status: testResult.success ? 'connected' : 'error',
          message: testResult.success ? 
            'OpenAI GPT-4 is properly configured and ready' : 
            testResult.error || 'OpenAI connection failed',
          response: testResult.response,
          timestamp: new Date()
        }
      };
      return res.json(response);
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
    
    // TODO: Implement actual API connectivity test for Claude/Qwen
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


// POST /api/providers/claude/validate - Validate Claude API key
router.post('/claude/validate', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return res.json({
        success: false,
        error: { message: 'Invalid Claude API key format' }
      });
    }
    
    // For now, just validate format
    // TODO: Add actual API validation when Claude client is available
    const response: ApiResponse = {
      success: true,
      data: { valid: true, message: 'Claude API key format is valid' }
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to validate Claude API key' }
    });
  }
});

// POST /api/providers/claude/configure - Configure Claude
router.post('/claude/configure', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    // Save API key to environment or config
    process.env.ANTHROPIC_API_KEY = apiKey;
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'Claude configured successfully' }
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to configure Claude' }
    });
  }
});

// POST /api/providers/openai/validate - Validate OpenAI API key
router.post('/openai/validate', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey, model } = req.body;
    
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.json({
        success: false,
        error: { message: 'Invalid OpenAI API key format' }
      });
    }
    
    // Update OpenAI service configuration
    process.env.OPENAI_API_KEY = apiKey;
    if (model) process.env.OPENAI_MODEL = model;
    
    // Test the connection
    const testResult = await openaiService.testAPI();
    
    const response: ApiResponse = {
      success: testResult.success,
      data: testResult.success ? 
        { valid: true, message: 'OpenAI API key is valid' } :
        { valid: false, message: testResult.error || 'Invalid API key' }
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to validate OpenAI API key' }
    });
  }
});

// POST /api/providers/openai/configure - Configure OpenAI
router.post('/openai/configure', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey, model } = req.body;
    
    // Save configuration
    process.env.OPENAI_API_KEY = apiKey;
    if (model) process.env.OPENAI_MODEL = model;
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'OpenAI configured successfully' }
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to configure OpenAI' }
    });
  }
});



export default router;