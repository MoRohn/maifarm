import { Router, Request, Response } from 'express';
import { logger } from '../monitoring/logger.js';
import { db } from '../database/connection.js';
import crypto from 'crypto';
import { openaiService } from '../services/openaiService.js';

const router = Router();

// Encryption functions (updated to use createCipheriv/createDecipheriv)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

// Generate a consistent IV from the key for backward compatibility
function getKeyAndIV(password: string) {
  const key = crypto.createHash('sha256').update(password).digest();
  const iv = crypto.createHash('md5').update(password).digest();
  return { key, iv };
}

function encrypt(text: string): string {
  const { key, iv } = getKeyAndIV(ENCRYPTION_KEY);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text: string): string {
  try {
    const { key, iv } = getKeyAndIV(ENCRYPTION_KEY);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Load OpenAI API key from database on startup
async function loadOpenAIKeyFromDatabase() {
  try {
    const result = await db.query(
      'SELECT * FROM api_keys WHERE service = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      ['openai']
    );
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const decryptedKey = decrypt(row.key_encrypted);
      if (decryptedKey) {
        process.env.OPENAI_API_KEY = decryptedKey;
        openaiService.updateConfiguration(decryptedKey);
        logger.info('[API Keys] OpenAI API key loaded from database');
      }
    }
  } catch (error) {
    logger.error('[API Keys] Error loading OpenAI key from database:', error);
  }
}

// Initialize on module load
loadOpenAIKeyFromDatabase();

/**
 * GET /api/openai/status
 * Check OpenAI provider status and configuration
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = openaiService.getStatus();
    
    res.json({
      status: status.configured ? 'ready' : 'not_configured',
      configured: status.configured,
      enabled: status.enabled,
      model: status.model,
      keyPreview: status.keyPreview,
      message: status.configured ? 'OpenAI API configured' : 'OpenAI API key not configured'
    });
  } catch (error: any) {
    logger.error('Error checking OpenAI status:', error);
    res.status(500).json({
      status: 'error',
      configured: false,
      error: error.message || 'Failed to check OpenAI status'
    });
  }
});

/**
 * POST /api/openai/validate
 * Validate OpenAI API connectivity and model availability
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { apiKey, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        valid: false,
        error: 'API key is required'
      });
    }

    const validation = await openaiService.validateApiKey(apiKey, model || 'gpt-4-turbo-preview');
    
    res.json({
      valid: validation.valid,
      models: validation.models,
      error: validation.error
    });
  } catch (error: any) {
    logger.error('Error validating OpenAI connection:', error);
    res.status(500).json({
      valid: false,
      error: error.message || 'Validation failed'
    });
  }
});

/**
 * POST /api/openai/test
 * Test OpenAI API with a simple request
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    // Simple test chat to verify API works
    const result = await openaiService.chat([
      { role: 'user', content: 'Say "Hello World" and nothing else.' }
    ], { maxTokens: 10 });
    
    res.json({
      success: true,
      response: result.choices[0].message.content,
      message: 'OpenAI API test successful'
    });
  } catch (error: any) {
    logger.error('Error testing OpenAI API:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Test failed',
      message: 'OpenAI API test failed'
    });
  }
});

/**
 * GET /api/openai/models
 * Get list of available OpenAI models
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const status = openaiService.getStatus();
    
    if (!status.configured) {
      return res.status(400).json({
        error: 'OpenAI not configured',
        models: []
      });
    }

    // Get available models by validating the stored API key
    const validation = await openaiService.validateApiKey(
      process.env.OPENAI_API_KEY || '',
      status.model || 'gpt-4-turbo-preview'
    );

    res.json({
      models: validation.models || [],
      selectedModel: status.model,
      configured: status.configured
    });
  } catch (error: any) {
    logger.error('Error fetching OpenAI models:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch models',
      models: []
    });
  }
});

/**
 * POST /api/openai/configure
 * Configure OpenAI settings and persist to database
 */
router.post('/configure', async (req: Request, res: Response) => {
  try {
    const { apiKey, model, maxTokens, temperature, name } = req.body;

    // Validate required fields
    if (!apiKey) {
      return res.status(400).json({
        error: 'API key is required',
        success: false
      });
    }

    // Configure the service
    const result = await openaiService.configure(
      apiKey,
      model || 'gpt-4-turbo-preview',
      true // enabled
    );

    // Store in database (encrypted) for persistence
    try {
      const encrypted = encrypt(apiKey);
      const hashed = hashKey(apiKey);
      
      // Upsert - update if exists, insert if not
      await db.query(`
        INSERT INTO api_keys (service, key_encrypted, key_hash, name, permissions, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (service, key_hash) 
        DO UPDATE SET 
          key_encrypted = $2,
          name = $4,
          last_used = CURRENT_TIMESTAMP,
          is_active = true
      `, ['openai', encrypted, hashed, name || 'OpenAI API Key', ['read', 'write'], 'user']);
      
      logger.info('[API Keys] OpenAI API key stored in database');
    } catch (dbError) {
      logger.error('[API Keys] Database storage failed:', dbError);
      // Continue even if DB fails - key is in memory
    }

    res.json({
      success: result.success,
      message: 'OpenAI API configured successfully'
    });
  } catch (error: any) {
    logger.error('Error configuring OpenAI:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Configuration failed'
    });
  }
});

/**
 * GET /api/openai/config
 * Get current OpenAI configuration (without sensitive data)
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const status = openaiService.getStatus();
    
    res.json({
      configured: status.configured,
      enabled: status.enabled,
      model: status.model,
      keyPreview: status.keyPreview
    });
  } catch (error: any) {
    logger.error('Error getting OpenAI config:', error);
    res.status(500).json({
      error: error.message || 'Failed to get configuration'
    });
  }
});

export default router;
