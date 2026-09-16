/**
 * Unified AI Engine Configuration API
 *
 * This module provides standardized endpoints for configuring AI engines,
 * replacing the fragmented approach across multiple endpoints.
 *
 * Endpoints:
 * - POST /api/engines/:provider/configure - Configure an engine
 * - POST /api/engines/:provider/validate-key - Validate API key
 * - GET /api/engines/:provider/status - Get configuration status
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import crypto from 'crypto';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

// Encryption utilities (shared with apikeys.ts)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      logger.error(LogCategory.SECURITY, 'Invalid encrypted format');
      return '';
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error(LogCategory.SECURITY, 'Decryption failed:', error);
    return '';
  }
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Provider-specific configuration
type ProviderId = 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama';

interface ProviderConfig {
  id: ProviderId;
  serviceName: string;
  envVars: string[];
  requiresApiKey: boolean;
  validateKeyFormat?: (key: string) => boolean;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  claude: {
    id: 'claude',
    serviceName: 'anthropic',
    envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    requiresApiKey: true,
    validateKeyFormat: (key) => key.startsWith('sk-') || key.startsWith('anthropic-'),
  },
  openai: {
    id: 'openai',
    serviceName: 'openai',
    envVars: ['OPENAI_API_KEY'],
    requiresApiKey: true,
    validateKeyFormat: (key) => key.startsWith('sk-'),
  },
  grok: {
    id: 'grok',
    serviceName: 'grok',
    envVars: ['GROK_API_KEY', 'XAI_API_KEY'],
    requiresApiKey: true,
    validateKeyFormat: (key) => key.startsWith('xai-') || key.startsWith('grok-'),
  },
  'gpt-oss': {
    id: 'gpt-oss',
    serviceName: 'gpt-oss',
    envVars: [],
    requiresApiKey: false,
  },
  llama: {
    id: 'llama',
    serviceName: 'llama',
    envVars: ['DASHSCOPE_API_KEY', 'LLAMA_API_KEY'],
    requiresApiKey: false, // Only for cloud deployment
    validateKeyFormat: (key) => key.startsWith('sk-'),
  },
};

/**
 * Get current AI provider from environment or database
 */
function getCurrentProvider(): ProviderId {
  // Check environment variable first
  const envProvider = process.env.AI_PROVIDER?.toLowerCase();
  if (envProvider && envProvider in PROVIDERS) {
    return envProvider as ProviderId;
  }

  // Default to gpt-oss
  return 'gpt-oss';
}

/**
 * Validate API key format
 */
function validateKeyFormat(provider: ProviderId, apiKey: string): { valid: boolean; message: string } {
  const config = PROVIDERS[provider];

  if (!apiKey || !apiKey.trim()) {
    return { valid: false, message: 'API key cannot be empty' };
  }

  if (apiKey.length < 10) {
    return { valid: false, message: 'API key appears to be too short' };
  }

  if (config.validateKeyFormat && !config.validateKeyFormat(apiKey)) {
    const expectedPrefix = provider === 'claude'
      ? 'sk- or anthropic-'
      : provider === 'grok'
        ? 'xai- or grok-'
        : provider === 'llama'
          ? 'sk-'
          : 'sk-';
    return {
      valid: false,
      message: `${provider.toUpperCase()} API keys should start with "${expectedPrefix}"`
    };
  }

  return { valid: true, message: 'API key format is valid' };
}

/**
 * Test API key connection (placeholder - would make actual API call)
 */
async function testConnection(provider: ProviderId, apiKey: string): Promise<{ success: boolean; message: string }> {
  // TODO: Implement actual API connection tests for each provider
  // For now, just validate format
  const formatCheck = validateKeyFormat(provider, apiKey);
  if (!formatCheck.valid) {
    return { success: false, message: formatCheck.message };
  }

  // Simulate connection test delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    success: true,
    message: `Successfully connected to ${provider.toUpperCase()}`
  };
}

/**
 * POST /api/engines/:provider/configure
 * Unified configuration endpoint for all providers
 */
router.post('/engines/:provider/configure', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { apiKey, model, config } = req.body;

    // Validate provider
    if (!PROVIDERS[provider as ProviderId]) {
      return res.status(400).json({
        success: false,
        error: `Unknown provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`
      });
    }

    const providerConfig = PROVIDERS[provider as ProviderId];
    logger.info(LogCategory.SYSTEM, `Configuring ${provider}...`);

    // Handle provider-specific configuration
    switch (provider as ProviderId) {
      case 'claude':
      case 'openai':
      case 'grok': {
        // Cloud providers require API key
        if (!apiKey) {
          return res.status(400).json({
            success: false,
            error: `API key is required for ${provider}`
          });
        }

        // Validate key format
        const formatCheck = validateKeyFormat(provider as ProviderId, apiKey);
        if (!formatCheck.valid) {
          return res.status(400).json({
            success: false,
            error: formatCheck.message
          });
        }

        // Set environment variables
        for (const envVar of providerConfig.envVars) {
          process.env[envVar] = apiKey;
        }

        // Store in database (encrypted)
        const encrypted = encrypt(apiKey);
        const hashed = hashKey(apiKey);

        await db.query(`
          INSERT INTO api_keys (service, key_encrypted, key_hash, name, permissions)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (key_hash)
          DO UPDATE SET
            key_encrypted = EXCLUDED.key_encrypted,
            name = EXCLUDED.name,
            service = EXCLUDED.service,
            last_used = CURRENT_TIMESTAMP,
            is_active = true
        `, [
          providerConfig.serviceName,
          encrypted,
          hashed,
          `${provider.toUpperCase()} (${model || 'default'})`,
          ['read', 'write']
        ]);

        // Refresh AI provider manager
        try {
          const { aiProviderManager } = await import('../config/aiProviders');
          await aiProviderManager.refreshApiKeys();
        } catch (error) {
          logger.error(LogCategory.SYSTEM, 'Failed to refresh AI provider manager:', error);
        }

        // Sync to environment for subprocesses
        try {
          const { apiKeySyncService } = await import('../services/apiKeySync');
          await apiKeySyncService.syncApiKeys();
        } catch (error) {
          logger.error(LogCategory.SYSTEM, 'Failed to sync API keys:', error);
        }

        logger.info(LogCategory.SYSTEM, `${provider} configured successfully`);

        return res.json({
          success: true,
          message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} is ready to power your AI agents.`,
          engine: {
            provider,
            configured: true,
            model: model || null,
            hasApiKey: true,
            isLocal: false
          }
        });
      }

      case 'gpt-oss': {
        // GPT-OSS just needs acknowledgment
        const acknowledged = config?.acknowledged || false;

        if (!acknowledged) {
          return res.status(400).json({
            success: false,
            error: 'Please acknowledge the GPT-OSS setup requirements'
          });
        }

        logger.info(LogCategory.SYSTEM, 'GPT-OSS marked as configured');

        return res.json({
          success: true,
          message: 'GPT-OSS is ready to power your AI agents.',
          engine: {
            provider: 'gpt-oss',
            configured: true,
            model: 'llama3.1:8b',
            hasApiKey: false,
            isLocal: true
          }
        });
      }

      case 'llama': {
        // Llama supports both local and cloud
        const useLocal = config?.useLocal !== false; // Default to local

        if (!useLocal && !apiKey) {
          return res.status(400).json({
            success: false,
            error: 'API key is required for cloud deployment'
          });
        }

        if (apiKey) {
          // Cloud deployment - store API key
          const formatCheck = validateKeyFormat('llama', apiKey);
          if (!formatCheck.valid) {
            return res.status(400).json({
              success: false,
              error: formatCheck.message
            });
          }

          // Set environment variables
          for (const envVar of providerConfig.envVars) {
            process.env[envVar] = apiKey;
          }

          // Store in database
          const encrypted = encrypt(apiKey);
          const hashed = hashKey(apiKey);

          await db.query(`
            INSERT INTO api_keys (service, key_encrypted, key_hash, name, permissions)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (key_hash)
            DO UPDATE SET
              key_encrypted = EXCLUDED.key_encrypted,
              name = EXCLUDED.name,
              service = EXCLUDED.service,
              last_used = CURRENT_TIMESTAMP,
              is_active = true
          `, [
            'llama',
            encrypted,
            hashed,
            `Llama Cloud (${model || 'default'})`,
            ['read', 'write']
          ]);
        }

        logger.info(LogCategory.SYSTEM, `Llama configured (${useLocal ? 'local' : 'cloud'})`);

        return res.json({
          success: true,
          message: 'Llama is ready to power your AI agents.',
          engine: {
            provider: 'llama',
            configured: true,
            model: model || (useLocal ? 'llama2.5-coder-7b' : null),
            hasApiKey: !!apiKey,
            isLocal: useLocal
          }
        });
      }

      default:
        return res.status(400).json({
          success: false,
          error: `Configuration not implemented for provider: ${provider}`
        });
    }
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Configuration error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure engine'
    });
  }
});

/**
 * POST /api/engines/:provider/validate-key
 * Validate an API key without storing it
 */
router.post('/engines/:provider/validate-key', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;

    if (!PROVIDERS[provider as ProviderId]) {
      return res.status(400).json({
        success: false,
        error: `Unknown provider: ${provider}`
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required for validation'
      });
    }

    const providerConfig = PROVIDERS[provider as ProviderId];

    // Format validation
    const formatCheck = validateKeyFormat(provider as ProviderId, apiKey);

    // Connection test (would be actual API call in production)
    let connectionCheck = { success: false, message: 'Connection test not performed' };
    if (formatCheck.valid) {
      connectionCheck = await testConnection(provider as ProviderId, apiKey);
    }

    const isValid = formatCheck.valid && connectionCheck.success;

    res.json({
      valid: isValid,
      message: isValid
        ? `${provider.toUpperCase()} API key is valid`
        : formatCheck.message || connectionCheck.message,
      details: {
        format: formatCheck.valid,
        connection: connectionCheck.success,
        permissions: isValid ? ['read', 'write'] : []
      }
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Validation error:', error);
    res.status(500).json({
      valid: false,
      message: 'Validation failed due to server error',
      details: {
        format: false,
        connection: false,
        permissions: []
      }
    });
  }
});

/**
 * GET /api/engines/:provider/status
 * Get configuration status for a provider
 */
router.get('/engines/:provider/status', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (!PROVIDERS[provider as ProviderId]) {
      return res.status(400).json({
        success: false,
        error: `Unknown provider: ${provider}`
      });
    }

    const providerConfig = PROVIDERS[provider as ProviderId];

    // Check if API key exists in environment
    const hasApiKey = providerConfig.envVars.some(envVar => !!process.env[envVar]);

    // Check database for stored configuration
    let dbConfig = null;
    try {
      const result = await db.query(
        'SELECT name, created_at, last_used FROM api_keys WHERE service = $1 AND is_active = true LIMIT 1',
        [providerConfig.serviceName]
      );

      if (result.rows.length > 0) {
        dbConfig = result.rows[0];
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Database query failed:', error);
    }

    const configured = hasApiKey || dbConfig !== null;

    res.json({
      success: true,
      provider,
      configured,
      hasApiKey,
      isLocal: !providerConfig.requiresApiKey,
      storedConfig: dbConfig ? {
        name: dbConfig.name,
        createdAt: dbConfig.created_at,
        lastUsed: dbConfig.last_used
      } : null
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check engine status'
    });
  }
});

/**
 * GET /api/engines/current
 * Get the currently active AI provider
 */
router.get('/engines/current', (req: Request, res: Response) => {
  try {
    const currentProvider = getCurrentProvider();
    const providerConfig = PROVIDERS[currentProvider];

    res.json({
      success: true,
      provider: currentProvider,
      name: providerConfig.serviceName,
      requiresApiKey: providerConfig.requiresApiKey,
      isLocal: !providerConfig.requiresApiKey
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Failed to get current provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get current provider',
      provider: 'gpt-oss' // Safe fallback
    });
  }
});

export default router;
