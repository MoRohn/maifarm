import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import crypto from 'crypto';

const router = Router();

// Simple encryption for demo - in production use proper encryption
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

// Create a 32-byte key from the string (for AES-256)
function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

// Create a random IV for each encryption
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Prepend IV to the encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      console.error('Invalid encrypted format');
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
    console.error('Decryption failed:', error);
    return '';
  }
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Load API keys from database on startup
async function loadApiKeysFromDatabase() {
  try {
    const result = await db.query(
      'SELECT * FROM api_keys WHERE is_active = true'
    );
    
    for (const row of result.rows) {
      if (row.service === 'claude' || row.service === 'Claude') {
        const decryptedKey = decrypt(row.key_encrypted);
        if (decryptedKey) {
          process.env.ANTHROPIC_API_KEY = decryptedKey;
          process.env.CLAUDE_API_KEY = decryptedKey;
          console.log('[API Keys] Claude API key loaded from database');
        }
      }
      // Add other services as needed
    }
  } catch (error) {
    console.error('[API Keys] Error loading from database:', error);
  }
}

// Initialize on module load
loadApiKeysFromDatabase();

// Store API key securely (encrypted in production)
router.post('/apikeys/claude', async (req: Request, res: Response) => {
  try {
    const { apiKey, name } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'API key is required' 
      });
    }
    
    // Set in environment for immediate use
    process.env.ANTHROPIC_API_KEY = apiKey;
    process.env.CLAUDE_API_KEY = apiKey;
    
    // Refresh the AI provider configuration to pick up the new key
    const { aiProviderManager } = await import('../config/aiProviders');
    await aiProviderManager.refreshApiKeys();
    
    // Sync API keys to environment for subprocess access
    const { apiKeySyncService } = await import('../services/apiKeySync');
    await apiKeySyncService.syncApiKeys();
    console.log('[API Keys] Synced API keys to environment');
    
    // Store in database (encrypted)
    try {
      const encrypted = encrypt(apiKey);
      const hashed = hashKey(apiKey);
      
      // Upsert - update if exists, insert if not
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
      `, ['anthropic', encrypted, hashed, name || 'Claude API Key', ['read', 'write']]);
      
      console.log('[API Keys] Claude API key stored in database');
    } catch (dbError) {
      console.error('[API Keys] Database storage failed:', dbError);
      // Continue even if DB fails - key is in memory
    }
    
    res.json({ 
      success: true, 
      message: 'Claude API key configured successfully' 
    });
  } catch (error) {
    console.error('Error storing API key:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to store API key' 
    });
  }
});

// Check if Claude API key is configured
router.get('/apikeys/claude/status', async (req: Request, res: Response) => {
  const isConfigured = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
  
  res.json({
    success: true,
    configured: isConfigured,
    provider: 'claude'
  });
});

// Get all API keys (masked for security)
router.get('/apikeys', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, service, name, permissions, created_at, last_used FROM api_keys WHERE is_active = true'
    );
    
    const keys = result.rows.map(row => ({
      id: row.id,
      service: row.service,
      name: row.name,
      permissions: row.permissions,
      createdAt: row.created_at,
      lastUsed: row.last_used,
      // Return masked key for display
      key: '••••••••••••••••' // Masked for security
    }));
    
    res.json({
      success: true,
      keys
    });
  } catch (error) {
    console.error('[API Keys] Error fetching keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API keys'
    });
  }
});

// Get specific API key details (for verification)
router.get('/apikeys/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;
    
    const result = await db.query(
      'SELECT id, service, name, permissions, created_at, last_used FROM api_keys WHERE service = $1 AND is_active = true',
      [service.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        configured: false,
        service
      });
    }
    
    const key = result.rows[0];
    res.json({
      success: true,
      configured: true,
      key: {
        id: key.id,
        service: key.service,
        name: key.name,
        permissions: key.permissions,
        createdAt: key.created_at,
        lastUsed: key.last_used
      }
    });
  } catch (error) {
    console.error('[API Keys] Error fetching key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API key'
    });
  }
});

// Store any API key (generic endpoint)
router.post('/apikeys', async (req: Request, res: Response) => {
  try {
    const { service, apiKey, name } = req.body;
    
    if (!service || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Service and API key are required'
      });
    }
    
    const normalizedService = service.toLowerCase();

    if (normalizedService === 'qwen') {
      return res.status(400).json({
        success: false,
        error: 'Qwen API keys are no longer supported'
      });
    }

    // Set in environment based on service
    if (normalizedService === 'claude' || normalizedService === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = apiKey;
      process.env.CLAUDE_API_KEY = apiKey;
    } else if (normalizedService === 'openai') {
      process.env.OPENAI_API_KEY = apiKey;
    }
    
    // Refresh the AI provider configuration
    const { aiProviderManager } = await import('../config/aiProviders');
    await aiProviderManager.refreshApiKeys();
    
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
    `, [normalizedService === 'claude' ? 'anthropic' : normalizedService, encrypted, hashed, name || `${service} API Key`, ['read', 'write']]);
    
    console.log(`[API Keys] ${service} API key stored in database`);
    
    res.json({
      success: true,
      message: `${service} API key configured successfully`
    });
  } catch (error) {
    console.error('Error storing API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store API key'
    });
  }
});

// Delete API key
router.delete('/apikeys/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db.query('SELECT service FROM api_keys WHERE id = $1', [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    const service = (existing.rows[0].service as string).toLowerCase();

    await db.query(
      'UPDATE api_keys SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    if (service === 'anthropic' || service === 'claude') {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_KEY;
    } else if (service === 'openai') {
      delete process.env.OPENAI_API_KEY;
    }

    const { aiProviderManager } = await import('../config/aiProviders');
    await aiProviderManager.refreshApiKeys();

    const { apiKeySyncService } = await import('../services/apiKeySync');
    await apiKeySyncService.syncApiKeys();

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('[API Keys] Error deleting key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

export default router;
