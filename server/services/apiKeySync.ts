/**
 * API Key Sync Service
 * Syncs API keys from database to environment for subprocess access
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '../database/connection';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

class ApiKeySyncService {
  private envFilePath: string;
  private isInitialized: boolean = false;

  constructor() {
    // Use a separate .env file for runtime API keys
    this.envFilePath = path.join(process.cwd(), '.env.runtime');
  }

  /**
   * Get encryption key
   */
  private getKey(): Buffer {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }

  /**
   * Encrypt API key for database storage
   */
  private encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const key = this.getKey();
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption failed:', error);
      return '';
    }
  }

  /**
   * Decrypt API key from database
   */
  private decrypt(text: string): string {
    try {
      const parts = text.split(':');
      if (parts.length !== 2) {
        console.error('Invalid encrypted format');
        return '';
      }
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];
      const key = this.getKey();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  /**
   * Load API keys from database and sync to environment
   */
  async syncApiKeys(): Promise<void> {
    try {
      logger.info('[ApiKeySync] Syncing API keys from database...');

      // Load API keys from database (with error handling for missing table)
      let result = { rows: [] };
      try {
        result = await db.query(
          'SELECT * FROM api_keys WHERE is_active = true'
        );
      } catch (dbError: any) {
        if (dbError.message?.includes('does not exist')) {
          logger.warn('[ApiKeySync] api_keys table does not exist yet - using environment variables only');
        } else {
          logger.error('[ApiKeySync] Database query error:', dbError.message);
        }
      }

      const envVars: Record<string, string> = {};
      let foundDatabaseKeys = false;

      for (const row of result.rows) {
        // Handle anthropic provider (Claude) - check both provider and service columns for compatibility
        if (row.provider === 'anthropic' || row.service === 'anthropic') {
          // Try key_encrypted first, fall back to encrypted_key
          const encryptedKeyData = row.key_encrypted || row.encrypted_key;
          if (encryptedKeyData) {
            const decryptedKey = this.decrypt(encryptedKeyData);
            if (decryptedKey && decryptedKey.length > 30 && !decryptedKey.startsWith('test-')) {
              // Set in current process environment
              process.env.ANTHROPIC_API_KEY = decryptedKey;
              process.env.CLAUDE_API_KEY = decryptedKey;

              // Add to env vars for file
              envVars.ANTHROPIC_API_KEY = decryptedKey;
              envVars.CLAUDE_API_KEY = decryptedKey;
              foundDatabaseKeys = true;

              logger.info('[ApiKeySync] Claude API key synced from database (length: ' + decryptedKey.length + ')');
            }
          }
        } else if (row.provider === 'openai' || row.service === 'openai') {
          // Try key_encrypted first, fall back to encrypted_key
          const encryptedKeyData = row.key_encrypted || row.encrypted_key;
          if (encryptedKeyData) {
            const decryptedKey = this.decrypt(encryptedKeyData);
            if (decryptedKey && decryptedKey.length > 30 && !decryptedKey.startsWith('test-')) {
              // Set in current process environment
              process.env.OPENAI_API_KEY = decryptedKey;

              // Add to env vars for file
              envVars.OPENAI_API_KEY = decryptedKey;
              foundDatabaseKeys = true;

              logger.info('[ApiKeySync] OpenAI API key synced from database (length: ' + decryptedKey.length + ')');
            }
          }
        }
      }
      
      // CRITICAL: If no database keys found, use environment variables as fallback
      if (!foundDatabaseKeys) {
        logger.info('[ApiKeySync] No API keys found in database, using environment variables as fallback');
        
        // Check for Anthropic/Claude API key in environment
        const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
        if (anthropicKey && anthropicKey.length > 30 && !anthropicKey.startsWith('test-') && !anthropicKey.includes('your-')) {
          envVars.ANTHROPIC_API_KEY = anthropicKey;
          envVars.CLAUDE_API_KEY = anthropicKey;
          logger.info('[ApiKeySync] Using ANTHROPIC_API_KEY from environment (length: ' + anthropicKey.length + ')');
          
          // Auto-store in database for future use
          await this.storeApiKeyInDatabase('anthropic', anthropicKey, 'Claude API Key (auto-imported)');
        } else {
          logger.warn('[ApiKeySync] No valid ANTHROPIC_API_KEY found in environment or database');
        }
        
        // Check for OpenAI API key in environment
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey && openaiKey.length > 30 && !openaiKey.startsWith('test-') && !openaiKey.includes('your-')) {
          envVars.OPENAI_API_KEY = openaiKey;
          logger.info('[ApiKeySync] Using OPENAI_API_KEY from environment (length: ' + openaiKey.length + ')');
          
          // Auto-store in database for future use
          await this.storeApiKeyInDatabase('openai', openaiKey, 'OpenAI API Key (auto-imported)');
        } else {
          logger.warn('[ApiKeySync] No valid OPENAI_API_KEY found in environment or database');
        }
      }
      
      // Write to runtime env file for subprocess access
      await this.writeRuntimeEnv(envVars);
      
      // Also update .env.development if API keys are found (for persistence)
      await this.updateDevelopmentEnv(envVars);
      
      this.isInitialized = true;
      
      logger.info('[ApiKeySync] API key sync completed');
      
    } catch (error) {
      logger.error('[ApiKeySync] Error syncing API keys:', error);
      throw error;
    }
  }

  /**
   * Write runtime environment file for subprocess access
   */
  private async writeRuntimeEnv(envVars: Record<string, string>): Promise<void> {
    try {
      const lines: string[] = [
        '# Runtime API Keys - Auto-generated from database',
        '# DO NOT COMMIT THIS FILE TO VERSION CONTROL',
        ''
      ];
      
      for (const [key, value] of Object.entries(envVars)) {
        lines.push(`${key}=${value}`);
      }
      
      await fs.writeFile(this.envFilePath, lines.join('\n'), 'utf-8');
      
      logger.info('[ApiKeySync] Written runtime env file: ' + this.envFilePath);
      
    } catch (error) {
      logger.error('[ApiKeySync] Failed to write runtime env:', error);
    }
  }

  /**
   * Store API key in database for persistence
   */
  private async storeApiKeyInDatabase(service: string, apiKey: string, name: string): Promise<void> {
    try {
      const encryptedKey = this.encrypt(apiKey);
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Map service to provider for database storage
      const provider = service === 'anthropic' || service === 'claude' ? 'anthropic' : service.toLowerCase();

      // Check if key already exists using provider column
      const existing = await db.query(
        'SELECT id FROM api_keys WHERE provider = $1 AND key_hash = $2',
        [provider, keyHash]
      );

      if (existing.rows.length === 0) {
        // Insert new API key using only columns that exist in the table
        await db.query(`
          INSERT INTO api_keys (provider, encrypted_key, key_encrypted, key_hash, is_active)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          provider,
          encryptedKey,
          encryptedKey,  // Store in both columns for compatibility
          keyHash,
          true
        ]);

        logger.info(`[ApiKeySync] Stored ${provider} API key in database: ${name}`);
      } else {
        logger.info(`[ApiKeySync] ${provider} API key already exists in database`);
      }
    } catch (error) {
      logger.error(`[ApiKeySync] Failed to store ${service} API key:`, error);
      // Don't throw the error, just log it - API keys from env will still work
    }
  }

  /**
   * Update .env.development with API keys if they don't exist
   */
  private async updateDevelopmentEnv(envVars: Record<string, string>): Promise<void> {
    try {
      const envPath = path.join(process.cwd(), '.env.development');
      
      // Read existing .env.development
      let content = '';
      try {
        content = await fs.readFile(envPath, 'utf-8');
      } catch (error) {
        logger.warn('[ApiKeySync] .env.development not found, creating new file');
      }
      
      // Check if API keys already exist
      let updated = false;
      
      if (envVars.ANTHROPIC_API_KEY && !content.includes('ANTHROPIC_API_KEY=')) {
        // Add ANTHROPIC_API_KEY after AI_PROVIDER line
        const lines = content.split('\n');
        const aiProviderIndex = lines.findIndex(line => line.startsWith('AI_PROVIDER='));
        
        if (aiProviderIndex !== -1) {
          lines.splice(aiProviderIndex + 1, 0, '', 
            '# Claude/Anthropic Configuration (Auto-added from Settings)',
            `ANTHROPIC_API_KEY=${envVars.ANTHROPIC_API_KEY}`,
            `CLAUDE_API_KEY=${envVars.CLAUDE_API_KEY || envVars.ANTHROPIC_API_KEY}`
          );
          content = lines.join('\n');
          updated = true;
        } else {
          // Just append at the end
          content += '\n\n# Claude/Anthropic Configuration (Auto-added from Settings)\n';
          content += `ANTHROPIC_API_KEY=${envVars.ANTHROPIC_API_KEY}\n`;
          content += `CLAUDE_API_KEY=${envVars.CLAUDE_API_KEY || envVars.ANTHROPIC_API_KEY}\n`;
          updated = true;
        }
        
        logger.info('[ApiKeySync] Added ANTHROPIC_API_KEY to .env.development');
      }
      
      if (envVars.OPENAI_API_KEY && content.includes('OPENAI_API_KEY=your-openai-api-key-here')) {
        // Replace placeholder with actual key
        content = content.replace(
          'OPENAI_API_KEY=your-openai-api-key-here',
          `OPENAI_API_KEY=${envVars.OPENAI_API_KEY}`
        );
        updated = true;
        logger.info('[ApiKeySync] Updated OPENAI_API_KEY in .env.development');
      }
      
      // Write back if updated
      if (updated) {
        await fs.writeFile(envPath, content, 'utf-8');
        logger.info('[ApiKeySync] Updated .env.development with API keys from Settings');
      }
      
    } catch (error) {
      logger.error('[ApiKeySync] Failed to update .env.development:', error);
    }
  }

  /**
   * Get runtime environment variables for subprocess
   */
  getSubprocessEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    
    // Ensure API keys are included
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      env.CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    
    if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    
    return env;
  }

  /**
   * Initialize service on startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.syncApiKeys();
    
    // Re-sync periodically to catch updates
    setInterval(() => {
      this.syncApiKeys().catch(error => {
        logger.error('[ApiKeySync] Periodic sync failed:', error);
      });
    }, 60000); // Every minute
  }
}

export const apiKeySyncService = new ApiKeySyncService();