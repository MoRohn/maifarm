#!/usr/bin/env node

/**
 * Fix API key sync from Settings to environment
 * This ensures the API key saved in Settings is properly synced to .env.development
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'maifarm_dev',
  user: process.env.DB_USER || 'maifarm',
  password: process.env.DB_PASSWORD || 'maifarm123'
};

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

// Decrypt function matching the server implementation
function decrypt(text) {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      console.error('Invalid encrypted format');
      return '';
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

async function fixApiKeySync() {
  console.log('🔧 Fixing API Key Sync from Settings to Environment\n');
  
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Query for Claude API keys from Settings
    const result = await client.query(`
      SELECT service, key_encrypted, name, created_at 
      FROM api_keys 
      WHERE is_active = true 
        AND (service = 'claude' OR service = 'Claude' OR service = 'anthropic')
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No Claude API key found in database');
      console.log('   Please add your API key through Settings > API Keys in the UI\n');
      return;
    }
    
    const apiKeyRow = result.rows[0];
    console.log(`✅ Found API key in database: ${apiKeyRow.name || 'Claude API Key'}`);
    console.log(`   Service: ${apiKeyRow.service}`);
    console.log(`   Created: ${apiKeyRow.created_at}`);
    
    // Decrypt the API key
    const decryptedKey = decrypt(apiKeyRow.key_encrypted);
    
    if (!decryptedKey || decryptedKey.length < 30) {
      console.log('❌ Failed to decrypt API key or key is invalid');
      return;
    }
    
    console.log(`✅ Decrypted API key (length: ${decryptedKey.length})`);
    
    // Update .env.development
    const envPath = path.join(process.cwd(), '.env.development');
    let envContent = '';
    
    try {
      envContent = fs.readFileSync(envPath, 'utf-8');
    } catch (error) {
      console.log('⚠️  .env.development not found, creating new file');
    }
    
    // Check if API keys already exist
    const hasAnthropicKey = envContent.includes('ANTHROPIC_API_KEY=');
    const hasClaudeKey = envContent.includes('CLAUDE_API_KEY=');
    
    if (hasAnthropicKey || hasClaudeKey) {
      // Update existing keys
      console.log('🔄 Updating existing API keys in .env.development');
      
      if (hasAnthropicKey) {
        envContent = envContent.replace(
          /ANTHROPIC_API_KEY=.*/,
          `ANTHROPIC_API_KEY=${decryptedKey}`
        );
      }
      
      if (hasClaudeKey) {
        envContent = envContent.replace(
          /CLAUDE_API_KEY=.*/,
          `CLAUDE_API_KEY=${decryptedKey}`
        );
      }
      
      // Add missing key if only one exists
      if (hasAnthropicKey && !hasClaudeKey) {
        const lines = envContent.split('\n');
        const anthropicIndex = lines.findIndex(line => line.startsWith('ANTHROPIC_API_KEY='));
        lines.splice(anthropicIndex + 1, 0, `CLAUDE_API_KEY=${decryptedKey}`);
        envContent = lines.join('\n');
      } else if (!hasAnthropicKey && hasClaudeKey) {
        const lines = envContent.split('\n');
        const claudeIndex = lines.findIndex(line => line.startsWith('CLAUDE_API_KEY='));
        lines.splice(claudeIndex, 0, `ANTHROPIC_API_KEY=${decryptedKey}`);
        envContent = lines.join('\n');
      }
    } else {
      // Add new keys
      console.log('➕ Adding API keys to .env.development');
      
      const lines = envContent.split('\n');
      const aiProviderIndex = lines.findIndex(line => line.startsWith('AI_PROVIDER='));
      
      if (aiProviderIndex !== -1) {
        // Add after AI_PROVIDER line
        lines.splice(aiProviderIndex + 1, 0, 
          '',
          '# Claude/Anthropic Configuration (Auto-synced from Settings)',
          `ANTHROPIC_API_KEY=${decryptedKey}`,
          `CLAUDE_API_KEY=${decryptedKey}`
        );
        envContent = lines.join('\n');
      } else {
        // Append at the end
        envContent += '\n\n# Claude/Anthropic Configuration (Auto-synced from Settings)\n';
        envContent += `ANTHROPIC_API_KEY=${decryptedKey}\n`;
        envContent += `CLAUDE_API_KEY=${decryptedKey}\n`;
      }
    }
    
    // Write updated content back to file
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('✅ Updated .env.development with API keys');
    
    // Also create .env.runtime for subprocess access
    const runtimePath = path.join(process.cwd(), '.env.runtime');
    const runtimeContent = [
      '# Runtime API Keys - Auto-generated from database',
      '# DO NOT COMMIT THIS FILE TO VERSION CONTROL',
      '',
      `ANTHROPIC_API_KEY=${decryptedKey}`,
      `CLAUDE_API_KEY=${decryptedKey}`,
      ''
    ].join('\n');
    
    fs.writeFileSync(runtimePath, runtimeContent, 'utf-8');
    console.log('✅ Created .env.runtime for subprocess access');
    
    // Set in current process environment
    process.env.ANTHROPIC_API_KEY = decryptedKey;
    process.env.CLAUDE_API_KEY = decryptedKey;
    console.log('✅ Set API keys in current process environment');
    
    console.log('\n🎉 API Key sync complete!');
    console.log('   The API key from Settings is now available to:');
    console.log('   - The Node.js server process');
    console.log('   - Python orchestrator.py script');
    console.log('   - Claude CLI agents');
    console.log('\n   Restart the server to ensure all services pick up the key:');
    console.log('   npm run dev\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

// Run the fix
fixApiKeySync().catch(console.error);