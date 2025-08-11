import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import crypto from 'crypto';

const router = Router();

// Simple encryption for demo - in production use proper encryption
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

function encrypt(text: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text: string): string {
  try {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
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
    
    // Store in database (encrypted)
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
      `, ['claude', encrypted, hashed, name || 'Claude API Key', ['read', 'write'], 'user']);
      
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

export default router;