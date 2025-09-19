import { config } from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env' : `.env.${process.env.NODE_ENV || 'development'}`;
config({ path: path.resolve(process.cwd(), envFile) });

export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai'
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  apiEndpoint: string;
  model: string;
  enabled: boolean;
  maxTokens?: number;
  temperature?: number;
  contextWindow?: number;
  cliCommand?: string;
  proxyEnabled?: boolean;
  isLocal?: boolean;
  ollamaModel?: string;
}

export interface AIProviderManager {
  getProvider(provider?: AIProvider): AIProviderConfig;
  getDefaultProvider(): AIProvider;
  isProviderEnabled(provider: AIProvider): boolean;
  getAllProviders(): AIProviderConfig[];
  getProviderCommand(provider: AIProvider): string;
}

class AIProviderConfigManager implements AIProviderManager {
  private providers: Map<AIProvider, AIProviderConfig>;
  private defaultProvider: AIProvider;

  constructor() {
    this.providers = new Map();
    // Initialize with default values synchronously
    this.initializeProvidersSync();
    this.defaultProvider = this.determineDefaultProvider();
    // Then update with database values asynchronously
    this.refreshApiKeys();
  }
  
  async refreshApiKeys(): Promise<void> {
    await this.initializeProviders();
  }
  
  private initializeProvidersSync(): void {
    // Initialize with environment variables only for immediate availability
    // Check both ANTHROPIC_API_KEY and CLAUDE_API_KEY (ANTHROPIC_API_KEY is the standard)
    const claudeApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    
    this.providers.set(AIProvider.CLAUDE, {
      provider: AIProvider.CLAUDE,
      apiKey: claudeApiKey,
      apiEndpoint: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1',
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      enabled: true,
      maxTokens: 4096,
      temperature: 0.7,
      contextWindow: 200000,
      cliCommand: 'claude'
    });
    
    this.providers.set(AIProvider.OPENAI, {
      provider: AIProvider.OPENAI,
      apiKey: process.env.OPENAI_API_KEY || '',
      apiEndpoint: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      enabled: process.env.OPENAI_ENABLED === 'true',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '8192'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      contextWindow: 128000,
      cliCommand: 'openai-cli'
    });
    
  }

  private async loadApiKeyFromDatabase(provider: string): Promise<string | null> {
    try {
      const { db } = await import('../database/connection');
      const crypto = await import('crypto');
      
      // Match the service name as stored in api_keys table
      // Handle both 'claude' and 'anthropic' service names for Claude API keys
      let query = `SELECT key_encrypted FROM api_keys WHERE is_active = true AND `;
      let params: string[] = [];
      
      if (provider === 'claude') {
        query += `(service = 'claude' OR service = 'Claude' OR service = 'anthropic') 
                  ORDER BY created_at DESC LIMIT 1`;
        params = [];
      } else {
        query += `service = $1 ORDER BY created_at DESC LIMIT 1`;
        params = [provider];
      }
      
      const result = await db.query(query, params);
      
      if (!result.rows[0]?.key_encrypted) {
        return null;
      }
      
      // Decrypt the key (matching the encryption used in apikeys.ts)
      const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
      try {
        const encrypted = result.rows[0].key_encrypted;
        // New format includes IV prepended with colon separator
        const parts = encrypted.split(':');
        if (parts.length !== 2) {
          console.error('Invalid encrypted format in database');
          return null;
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        
        // Create a 32-byte key from the string (matching apikeys.ts)
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (decryptError) {
        console.error(`Failed to decrypt API key for ${provider}:`, decryptError);
        return null;
      }
    } catch (error) {
      console.error(`Failed to load API key for ${provider} from database:`, error);
      return null;
    }
  }

  private async initializeProviders(): Promise<void> {
    // Load API keys from database first
    const [claudeDbKey, openaiDbKey] = await Promise.all([
      this.loadApiKeyFromDatabase('claude'),
      this.loadApiKeyFromDatabase('openai')
    ]);
    
    // Check if database keys are test/placeholder values and fall back to env if so
    const isTestKey = (key: string | null) => {
      return key && (
        key.startsWith('test-') || 
        key.startsWith('sk-test-') || 
        key === 'your-api-key-here' ||
        key.length < 30 // Real API keys are typically longer
      );
    };
    
    // Use database keys if valid, otherwise fall back to environment variables
    const claudeKey = (!isTestKey(claudeDbKey) ? claudeDbKey : null) || 
                      process.env.ANTHROPIC_API_KEY || 
                      process.env.CLAUDE_API_KEY || '';
    const openaiKey = (!isTestKey(openaiDbKey) ? openaiDbKey : null) || 
                      process.env.OPENAI_API_KEY || '';
    
    // Log key sources for debugging
    if (claudeKey && !isTestKey(claudeKey)) {
      logger.debug('[AIProviderManager] Claude API key loaded from:', 
        claudeDbKey && !isTestKey(claudeDbKey) ? 'database' : 'environment');
      process.env.ANTHROPIC_API_KEY = claudeKey;
      process.env.CLAUDE_API_KEY = claudeKey;
    } else {
      logger.warn('[AIProviderManager] No valid Claude API key found in database or environment');
    }
    
    if (openaiKey && !isTestKey(openaiKey)) {
      logger.debug('[AIProviderManager] OpenAI API key loaded from:', 
        openaiDbKey && !isTestKey(openaiDbKey) ? 'database' : 'environment');
      process.env.OPENAI_API_KEY = openaiKey;
    }
    
    
    // Log API key status for debugging (database only)
    logger.debug('[AIProviders] Claude API key from DB:', claudeDbKey ? 'Found (length: ' + claudeDbKey.length + ')' : 'Not found');
    logger.debug('[AIProviders] OpenAI API key from DB:', openaiDbKey ? 'Found (length: ' + openaiDbKey.length + ')' : 'Not found');
    
    // Claude configuration - Use valid keys only
    const claudeConfig: AIProviderConfig = {
      provider: AIProvider.CLAUDE,
      apiKey: claudeKey || '',  // Use the validated key (database or env)
      apiEndpoint: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1',
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      enabled: !!claudeKey && !isTestKey(claudeKey), // Only enabled if valid key exists
      maxTokens: 4096,
      temperature: 0.7,
      contextWindow: 200000,
      cliCommand: 'claude'
    };


    // OpenAI GPT-4 configuration - Use valid keys only
    const openaiConfig: AIProviderConfig = {
      provider: AIProvider.OPENAI,
      apiKey: openaiKey || '',  // Use the validated key (database or env)
      apiEndpoint: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      enabled: !!openaiKey && !isTestKey(openaiKey) && process.env.OPENAI_ENABLED === 'true',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '8192'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      contextWindow: 128000, // GPT-4 Turbo has 128K context window
      cliCommand: 'openai-cli' // Will need to configure OpenAI CLI tool
    };


    this.providers.set(AIProvider.CLAUDE, claudeConfig);
    this.providers.set(AIProvider.OPENAI, openaiConfig);
  }

  private determineDefaultProvider(): AIProvider {
    const envProvider = process.env.AI_PROVIDER?.toLowerCase();
    
    if (envProvider === AIProvider.OPENAI && this.isProviderEnabled(AIProvider.OPENAI)) {
      return AIProvider.OPENAI;
    }
    
    return AIProvider.CLAUDE;
  }

  async getProviderWithRefresh(provider?: AIProvider): Promise<AIProviderConfig> {
    // Refresh API keys from database before returning
    await this.refreshApiKeys();
    return this.getProvider(provider);
  }
  
  getProvider(provider?: AIProvider): AIProviderConfig {
    const targetProvider = provider || this.defaultProvider;
    const config = this.providers.get(targetProvider);
    
    if (!config) {
      throw new Error(`AI provider ${targetProvider} not found`);
    }
    
    if (!this.isProviderEnabled(targetProvider)) {
      throw new Error(`AI provider ${targetProvider} is not enabled`);
    }
    
    return config;
  }

  getDefaultProvider(): AIProvider {
    return this.defaultProvider;
  }

  isProviderEnabled(provider: AIProvider): boolean {
    const config = this.providers.get(provider);
    if (!config) return false;
    
    // Claude is always enabled
    if (provider === AIProvider.CLAUDE) return true;
    
    // Check if OpenAI has necessary configuration
    if (provider === AIProvider.OPENAI) {
      return config.enabled && config.apiKey !== '';
    }
    
    return false;
  }

  getAllProviders(): AIProviderConfig[] {
    return Array.from(this.providers.values()).filter(config => 
      this.isProviderEnabled(config.provider)
    );
  }

  getProviderCommand(provider: AIProvider): string {
    const config = this.getProvider(provider);
    
    return config.cliCommand || 'claude';
  }

  /**
   * Get environment variables for running commands with specific provider
   */
  getProviderEnvironment(provider: AIProvider): Record<string, string> {
    const config = this.getProvider(provider);
    const env: Record<string, string> = {
      ...process.env,
      AI_PROVIDER: provider
    };

    // CRITICAL FIX: Add ANTHROPIC_API_KEY for Claude provider
    if (provider === AIProvider.CLAUDE) {
      if (config.apiKey) {
        env.ANTHROPIC_API_KEY = config.apiKey;
        env.CLAUDE_API_KEY = config.apiKey;
      }
      env.CLAUDE_API_ENDPOINT = config.apiEndpoint;
      env.CLAUDE_MODEL = config.model;
      
      // Log for debugging
      logger.debug('[AIProviderManager] Setting Claude environment - API Key:', 
        config.apiKey ? `Present (${config.apiKey.length} chars)` : 'MISSING');
    } else if (provider === AIProvider.OPENAI) {
      env.OPENAI_API_KEY = config.apiKey;
      env.OPENAI_API_ENDPOINT = config.apiEndpoint;
      env.OPENAI_MODEL = config.model;
      env.OPENAI_MAX_TOKENS = String(config.maxTokens);
      env.OPENAI_TEMPERATURE = String(config.temperature);
      
      if (process.env.USE_LLM_PROXY === 'true') {
        env.CLAUDE_CODE_ROUTER = 'openai';
        env.USE_LLM_PROXY = 'true';
        env.LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'http://localhost:8001';
      }
    } else {
      // Claude provider - set both API key environment variables
      env.ANTHROPIC_API_KEY = config.apiKey;
      env.CLAUDE_API_KEY = config.apiKey;
      env.CLAUDE_API_ENDPOINT = config.apiEndpoint;
      env.CLAUDE_MODEL = config.model;
      
      // Log for debugging
      logger.debug('[AIProviders] Setting Claude environment - API key:', config.apiKey ? `Configured (length: ${config.apiKey.length})` : 'NOT CONFIGURED');
    }

    return env;
  }
}

// Export singleton instance
export const aiProviderManager = new AIProviderConfigManager();

// Helper functions for backward compatibility
export function getActiveProvider(): AIProvider {
  return aiProviderManager.getDefaultProvider();
}

export function isProviderAvailable(provider: AIProvider): boolean {
  return aiProviderManager.isProviderEnabled(provider);
}