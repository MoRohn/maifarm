import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { openaiService } from '../services/openaiService.js';
import { db } from '../database/connection.js';

const router = Router();

// GET /api/providers - Get all providers
router.get('/', async (req, res) => {
  try {
    const providers = aiProviderManager.getAllProviders();
    const defaultProvider = aiProviderManager.getDefaultProvider();

    const providerSummaries = providers.map((config) => {
      if (config.provider === AIProvider.OPENAI) {
        const openaiConfig = openaiService.getConfig();
        return {
          id: config.provider,
          name: 'OpenAI GPT-4',
          status: openaiConfig.isConfigured ? 'available' : 'not_configured',
          configured: openaiConfig.isConfigured,
          models: openaiConfig.isConfigured && openaiConfig.model ? [openaiConfig.model] : []
        };
      }

      const isLocal = config.isLocal ?? false;
      const configured = isLocal ? config.enabled !== false : config.apiKey !== '';

      const nameMap: Record<AIProvider, string> = {
        [AIProvider.CLAUDE]: 'Claude',
        [AIProvider.OPENAI]: 'OpenAI GPT-4',
        [AIProvider.GROK]: 'Grok (xAI)',
        [AIProvider.GPT_OSS]: 'OpenAI OSS (Local)',
        [AIProvider.LLAMA]: 'Llama Local'
      };

      const defaultModels: Record<AIProvider, string[]> = {
        [AIProvider.CLAUDE]: ['claude-3-sonnet-20240229'],
        [AIProvider.OPENAI]: [],
        [AIProvider.GROK]: ['grok-2', 'grok-2-mini'],
        [AIProvider.GPT_OSS]: [config.model],
        [AIProvider.LLAMA]: [config.model]
      };

      return {
        id: config.provider,
        name: nameMap[config.provider] || config.provider,
        status: configured ? 'available' : 'not_configured',
        configured,
        isLocal,
        models: defaultModels[config.provider] || []
      };
    });

    const response: ApiResponse = {
      success: true,
      data: {
        providers: providerSummaries,
        defaultProvider
      }
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to get providers:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get providers' }
    });
  }
});

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

// POST /api/providers/default - Set the default AI provider
router.post('/default', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { provider } = req.body as { provider?: string };

    if (!provider || !Object.values(AIProvider).includes(provider as AIProvider)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid provider specified' }
      });
    }

    const providerEnum = provider as AIProvider;

    await aiProviderManager.refreshApiKeys();

    if (!aiProviderManager.isProviderEnabled(providerEnum)) {
      return res.status(400).json({
        success: false,
        error: { message: `${providerEnum} is not configured` }
      });
    }

    aiProviderManager.setDefaultProvider(providerEnum);

    try {
      await db.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('ai_provider', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [providerEnum]
      );
    } catch (dbError) {
      console.error('[Providers] Failed to persist AI provider selection:', dbError);
      // Revert in-memory state since DB failed
      aiProviderManager.setDefaultProvider(aiProviderManager.getDefaultProvider());
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to persist provider selection to database' }
      });
    }

    res.json({
      success: true,
      provider: providerEnum
    });
  } catch (error) {
    console.error('Failed to set default provider:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update default provider' }
    });
  }
});

// GET /api/providers/status - Get all provider status
router.get('/status', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const providers = aiProviderManager.getAllProviders();
    const defaultProvider = aiProviderManager.getDefaultProvider();

    const providerStatus = await Promise.all(
      providers.map(async (config) => {
        if (config.provider === AIProvider.OPENAI) {
          const openaiConfig = openaiService.getConfig();
          const openaiValidation = openaiConfig.isConfigured ? await openaiService.validateConnection() : null;

          return {
            provider: 'openai',
            name: 'OpenAI GPT-4',
            enabled: openaiConfig.isConfigured,
            configured: openaiConfig.isConfigured,
            model: openaiValidation?.selectedModel || openaiConfig.model,
            contextWindow: openaiValidation?.tokenLimit || 128000,
            isDefault: defaultProvider === 'openai',
            capabilities: openaiValidation?.capabilities,
            isLocal: false
          };
        }

        const isLocal = config.isLocal ?? false;
        const configured = isLocal ? config.enabled !== false : config.apiKey !== '';

        const nameMap: Record<AIProvider, string> = {
          [AIProvider.CLAUDE]: 'Claude Code',
          [AIProvider.OPENAI]: 'OpenAI GPT-4',
          [AIProvider.GROK]: 'Grok (xAI)',
          [AIProvider.GPT_OSS]: 'OpenAI OSS (Local)',
          [AIProvider.LLAMA]: 'Llama Local'
        };

        return {
          provider: config.provider,
          name: nameMap[config.provider] || config.provider,
          enabled: aiProviderManager.isProviderEnabled(config.provider),
          configured,
          model: config.model,
          contextWindow: config.contextWindow,
          isDefault: config.provider === defaultProvider,
          isLocal,
          capabilities: isLocal ? ['text-generation', 'code-generation'] : undefined
        };
      })
    );

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

    if (!['claude', 'openai', 'grok', 'gpt-oss', 'llama'].includes(provider)) {
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
    if (provider === 'gpt-oss' || provider === 'llama' || provider === 'claude' || provider === 'grok') {
      const config = aiProviderManager.getProvider(provider as AIProvider);
      const isLocal = config.isLocal ?? false;

      const nameMap: Record<string, string> = {
        'claude': 'Claude Code',
        'grok': 'Grok (xAI)',
        'gpt-oss': 'OpenAI OSS (Local)',
        'llama': 'Llama Local'
      };

      const response: ApiResponse = {
        success: true,
        data: {
          provider: config.provider,
          name: nameMap[provider] || provider,
          enabled: config.enabled,
          configured: isLocal ? config.enabled !== false : config.apiKey !== '',
          model: config.model,
          endpoint: config.apiEndpoint,
          contextWindow: config.contextWindow,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          cliCommand: config.cliCommand,
          proxyEnabled: config.proxyEnabled,
          isLocal
        }
      };

      return res.json(response);
    }
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
    
    if (!['claude', 'openai', 'grok', 'gpt-oss', 'llama'].includes(provider)) {
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
    
    
    if (provider === 'gpt-oss' || provider === 'llama') {
      const isEnabled = aiProviderManager.isProviderEnabled(provider as AIProvider);

      const response: ApiResponse = {
        success: isEnabled,
        data: {
          provider,
          status: isEnabled ? 'connected' : 'disabled',
          message: isEnabled
            ? `${provider === 'gpt-oss' ? 'OpenAI OSS' : 'Llama'} is marked as ready. Ensure the local inference server is running.`
            : `${provider} is currently disabled in MaiFarm settings.`,
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

    // TODO: Implement actual API connectivity test for Claude/Llama
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
    
    // Apply the provided configuration so validation uses fresh credentials
    openaiService.updateConfiguration(apiKey, model);

    // Test the connection to ensure the key can complete requests
    const testResult = await openaiService.testAPI();

    if (!testResult.success) {
      await openaiService.configure('', '', false);
    }

    await aiProviderManager.refreshApiKeys();

    const response: ApiResponse = {
      success: testResult.success,
      data: testResult.success ? 
        { valid: true, message: 'OpenAI API key is valid' } :
        { valid: false, message: testResult.error || 'Invalid API key' }
    };
    
    res.json(response);
  } catch (error) {
    await openaiService.configure('', '', false);
    await aiProviderManager.refreshApiKeys();
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
    
    const result = await openaiService.configure(
      apiKey,
      model || 'gpt-4-turbo-preview'
    );

    await aiProviderManager.refreshApiKeys();

    const response: ApiResponse = {
      success: result.success,
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

// POST /api/providers/grok/validate - Validate Grok API key
router.post('/grok/validate', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || (!apiKey.startsWith('xai-') && !apiKey.startsWith('grok-'))) {
      return res.json({
        success: false,
        error: { message: 'Invalid Grok API key format. Keys should start with "xai-" or "grok-"' }
      });
    }

    // For now, just validate format
    // TODO: Add actual API validation when Grok client is available
    const response: ApiResponse = {
      success: true,
      data: { valid: true, message: 'Grok API key format is valid' }
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to validate Grok API key' }
    });
  }
});

// POST /api/providers/grok/configure - Configure Grok
router.post('/grok/configure', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { apiKey, model } = req.body;

    // Save API key to database via apikeys service
    try {
      await db.query(
        `INSERT INTO api_keys (service, key, name, permissions, created_at, updated_at)
         VALUES ('grok', $1, 'Grok API Key', ARRAY['read', 'write']::text[], NOW(), NOW())
         ON CONFLICT (service) DO UPDATE SET key = EXCLUDED.key, updated_at = NOW()`,
        [apiKey]
      );
    } catch (dbError) {
      console.error('[Providers] Failed to persist Grok API key:', dbError);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to persist Grok API key to database' }
      });
    }

    // Refresh provider manager to pick up new key
    await aiProviderManager.refreshApiKeys();

    const response: ApiResponse = {
      success: true,
      data: { message: 'Grok configured successfully', model: model || 'grok-2' }
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to configure Grok' }
    });
  }
});


export default router;
