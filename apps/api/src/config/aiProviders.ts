import { logger } from '../utils/logger';

export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GROK = 'grok',
  GEMINI = 'gemini',
  GPT_OSS = 'gpt-oss',
  LLAMA = 'llama'
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
  setDefaultProvider(provider: AIProvider): void;
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
    await this.loadPersistedDefaultProvider();
    this.ensureDefaultProvider();
  }
  
  private initializeProvidersSync(): void {
    // Initialize with default values ONLY (no .env reading)
    // Claude Opus 4.5 is the default model for MaiFarm
    this.providers.set(AIProvider.CLAUDE, {
      provider: AIProvider.CLAUDE,
      apiKey: '',
      apiEndpoint: 'https://api.anthropic.com/v1',
      model: 'claude-opus-4-5-20251101',  // Default to Opus 4.5
      enabled: false, // Disabled until user configures
      maxTokens: 16384,
      temperature: 0.7,
      contextWindow: 200000,
      cliCommand: 'claude'
    });

    this.providers.set(AIProvider.OPENAI, {
      provider: AIProvider.OPENAI,
      apiKey: '',
      apiEndpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',  // Updated to GPT-4o - latest flagship model
      enabled: false, // Disabled until user configures
      maxTokens: 16384,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'openai-cli'
    });

    this.providers.set(AIProvider.GEMINI, {
      provider: AIProvider.GEMINI,
      apiKey: '',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-1.5-pro',  // Gemini 1.5 Pro - latest model
      enabled: false, // Disabled until user configures
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 1000000,  // 1M token context window
      cliCommand: 'gemini'
    });

    this.providers.set(AIProvider.GROK, {
      provider: AIProvider.GROK,
      apiKey: '',
      apiEndpoint: 'https://api.x.ai/v1',
      model: 'grok-2',
      enabled: false, // Disabled until user configures
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'grok'
    });

    this.providers.set(AIProvider.GPT_OSS, {
      provider: AIProvider.GPT_OSS,
      apiKey: '',
      apiEndpoint: 'http://localhost:8000/v1',
      model: 'openai/gpt-oss-20b',
      enabled: true, // Local provider, enabled by default
      maxTokens: 8192,
      temperature: 0.6,
      contextWindow: 131072,
      cliCommand: 'gpt-oss',
      isLocal: true
    });

    this.providers.set(AIProvider.LLAMA, {
      provider: AIProvider.LLAMA,
      apiKey: '',
      apiEndpoint: 'http://localhost:8001/v1',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      enabled: true, // Local provider, enabled by default
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'llama',
      isLocal: true
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
    // Load API keys from database ONLY (no .env fallback)
    const [claudeDbKey, openaiDbKey, grokDbKey, geminiDbKey] = await Promise.all([
      this.loadApiKeyFromDatabase('claude'),
      this.loadApiKeyFromDatabase('openai'),
      this.loadApiKeyFromDatabase('grok'),
      this.loadApiKeyFromDatabase('gemini')
    ]);

    // Check if database keys are test/placeholder values
    const isTestKey = (key: string | null) => {
      return key && (
        key.startsWith('test-') ||
        key.startsWith('sk-test-') ||
        key === 'your-api-key-here' ||
        key.length < 30 // Real API keys are typically longer
      );
    };

    // Use database keys if valid, NO fallback to environment variables
    const claudeKey = (!isTestKey(claudeDbKey) ? claudeDbKey : null) || '';
    const openaiKey = (!isTestKey(openaiDbKey) ? openaiDbKey : null) || '';
    const grokKey = (!isTestKey(grokDbKey) ? grokDbKey : null) || '';
    const geminiKey = (!isTestKey(geminiDbKey) ? geminiDbKey : null) || '';

    // Log key sources for debugging
    if (claudeKey && !isTestKey(claudeKey)) {
      logger.debug('[AIProviderManager] Claude API key loaded from database');
      // Do NOT set global environment variables - keep per-user
    } else {
      logger.debug('[AIProviderManager] No valid Claude API key stored by user (clean slate)');
    }

    if (openaiKey && !isTestKey(openaiKey)) {
      logger.debug('[AIProviderManager] OpenAI API key loaded from database');
      // Do NOT set global environment variables - keep per-user
    } else {
      logger.debug('[AIProviderManager] No valid OpenAI API key stored by user (clean slate)');
    }

    if (grokKey && !isTestKey(grokKey)) {
      logger.debug('[AIProviderManager] Grok API key loaded from database');
      // Do NOT set global environment variables - keep per-user
    } else {
      logger.debug('[AIProviderManager] No valid Grok API key stored by user (clean slate)');
    }

    if (geminiKey && !isTestKey(geminiKey)) {
      logger.debug('[AIProviderManager] Gemini API key loaded from database');
      // Do NOT set global environment variables - keep per-user
    } else {
      logger.debug('[AIProviderManager] No valid Gemini API key stored by user (clean slate)');
    }


    // Log API key status for debugging (database only)
    logger.debug('[AIProviders] Claude API key from DB:', claudeDbKey ? 'Found (length: ' + claudeDbKey.length + ')' : 'Not found');
    logger.debug('[AIProviders] OpenAI API key from DB:', openaiDbKey ? 'Found (length: ' + openaiDbKey.length + ')' : 'Not found');
    logger.debug('[AIProviders] Grok API key from DB:', grokDbKey ? 'Found (length: ' + grokDbKey.length + ')' : 'Not found');
    logger.debug('[AIProviders] Gemini API key from DB:', geminiDbKey ? 'Found (length: ' + geminiDbKey.length + ')' : 'Not found');
    
    // Claude configuration - Use database keys only
    const claudeConfig: AIProviderConfig = {
      provider: AIProvider.CLAUDE,
      apiKey: claudeKey || '',
      apiEndpoint: 'https://api.anthropic.com/v1',
      model: 'claude-opus-4-5-20251101',  // Updated to Opus 4.5 - most advanced model
      enabled: !!claudeKey && !isTestKey(claudeKey), // Only enabled if valid key exists
      maxTokens: 16384,
      temperature: 0.7,
      contextWindow: 200000,
      cliCommand: 'claude'
    };

    // OpenAI GPT-4o configuration - Use database keys only
    const openaiConfig: AIProviderConfig = {
      provider: AIProvider.OPENAI,
      apiKey: openaiKey || '',
      apiEndpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o',  // Updated to GPT-4o - latest flagship model
      enabled: !!openaiKey && !isTestKey(openaiKey),
      maxTokens: 16384,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'openai-cli'
    };

    // Grok (xAI) configuration - Use database keys only
    const grokConfig: AIProviderConfig = {
      provider: AIProvider.GROK,
      apiKey: grokKey || '',
      apiEndpoint: 'https://api.x.ai/v1',
      model: 'grok-2',
      enabled: !!grokKey && !isTestKey(grokKey),
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'grok'
    };

    // Gemini (Google AI) configuration - Use database keys only
    const geminiConfig: AIProviderConfig = {
      provider: AIProvider.GEMINI,
      apiKey: geminiKey || '',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-1.5-pro',  // Gemini 1.5 Pro - latest flagship model
      enabled: !!geminiKey && !isTestKey(geminiKey),
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 1000000,  // 1M token context window
      cliCommand: 'gemini'
    };

    this.providers.set(AIProvider.CLAUDE, claudeConfig);
    this.providers.set(AIProvider.OPENAI, openaiConfig);
    this.providers.set(AIProvider.GROK, grokConfig);
    this.providers.set(AIProvider.GEMINI, geminiConfig);

    // GPT-OSS configuration - Local provider, no API key needed
    const gptOssConfig: AIProviderConfig = {
      provider: AIProvider.GPT_OSS,
      apiKey: '',
      apiEndpoint: 'http://localhost:8000/v1',
      model: 'openai/gpt-oss-20b',
      enabled: true, // Always enabled (local provider)
      maxTokens: 8192,
      temperature: 0.6,
      contextWindow: 131072,
      cliCommand: 'gpt-oss',
      isLocal: true
    };

    // Llama configuration - Local provider, no API key needed
    const llamaConfig: AIProviderConfig = {
      provider: AIProvider.LLAMA,
      apiKey: '',
      apiEndpoint: 'http://localhost:8001/v1',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      enabled: true, // Always enabled (local provider)
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 128000,
      cliCommand: 'llama',
      isLocal: true
    };

    this.providers.set(AIProvider.GPT_OSS, gptOssConfig);
    this.providers.set(AIProvider.LLAMA, llamaConfig);
  }

  private determineDefaultProvider(): AIProvider {
    // No environment variable check - pure user preference based
    // Default to GPT-OSS as it's always available locally
    const preferenceOrder: AIProvider[] = [
      AIProvider.GPT_OSS,
      AIProvider.CLAUDE,
      AIProvider.OPENAI,
      AIProvider.GROK,
      AIProvider.LLAMA
    ];

    for (const provider of preferenceOrder) {
      if (this.isProviderEnabled(provider)) {
        return provider;
      }
    }

    // Fallback to GPT-OSS (local provider, always available)
    return AIProvider.GPT_OSS;
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

  public setDefaultProvider(provider: AIProvider): void {
    if (!this.providers.has(provider)) {
      throw new Error(`AI provider ${provider} not found`);
    }

    if (!this.isProviderEnabled(provider)) {
      throw new Error(`AI provider ${provider} is not enabled`);
    }

    this.defaultProvider = provider;
    // Do NOT set global environment variable - keep per-user
    logger.info('[AIProviderManager] Default provider set to', provider);
  }

  isProviderEnabled(provider: AIProvider): boolean {
    const config = this.providers.get(provider);
    if (!config) return false;

    if (config.isLocal) {
      return config.enabled !== false;
    }

    if (provider === AIProvider.CLAUDE) {
      return config.enabled && config.apiKey !== '';
    }

    if (provider === AIProvider.OPENAI) {
      return config.enabled && config.apiKey !== '';
    }

    if (provider === AIProvider.GROK) {
      return config.enabled && config.apiKey !== '';
    }

    if (provider === AIProvider.GEMINI) {
      return config.enabled && config.apiKey !== '';
    }

    return config.enabled;
  }

  getAllProviders(): AIProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getProviderCommand(provider: AIProvider): string {
    const config = this.getProvider(provider);
    
    return config.cliCommand || 'claude';
  }

  /**
   * Get environment variables for running commands with specific provider
   * FIXED: Removed duplicate Claude logic from unreachable else block
   */
  getProviderEnvironment(provider: AIProvider): Record<string, string> {
    const config = this.getProvider(provider);
    const env: Record<string, string> = {
      ...process.env,
      AI_PROVIDER: provider
    };

    // Set provider-specific environment variables
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
    } else if (provider === AIProvider.GROK) {
      if (config.apiKey) {
        env.GROK_API_KEY = config.apiKey;
        env.XAI_API_KEY = config.apiKey;
      }
      env.GROK_API_ENDPOINT = config.apiEndpoint;
      env.GROK_MODEL = config.model;
      env.GROK_MAX_TOKENS = String(config.maxTokens ?? 8192);
      env.GROK_TEMPERATURE = String(config.temperature ?? 0.7);

      // Log for debugging
      logger.debug('[AIProviderManager] Setting Grok environment - API Key:',
        config.apiKey ? `Present (${config.apiKey.length} chars)` : 'MISSING');
    } else if (provider === AIProvider.GPT_OSS) {
      env.GPT_OSS_HOST = config.apiEndpoint;
      env.GPT_OSS_MODEL = config.model;
      env.GPT_OSS_MAX_TOKENS = String(config.maxTokens ?? 8192);
      env.GPT_OSS_TEMPERATURE = String(config.temperature ?? 0.6);
    } else if (provider === AIProvider.LLAMA) {
      env.LLAMA_API_ENDPOINT = config.apiEndpoint;
      env.LLAMA_MODEL = config.model;
      env.LLAMA_MAX_TOKENS = String(config.maxTokens ?? 8192);
      env.LLAMA_TEMPERATURE = String(config.temperature ?? 0.7);
    } else if (provider === AIProvider.GEMINI) {
      if (config.apiKey) {
        env.GOOGLE_API_KEY = config.apiKey;
        env.GEMINI_API_KEY = config.apiKey;
      }
      env.GEMINI_API_ENDPOINT = config.apiEndpoint;
      env.GEMINI_MODEL = config.model;
      env.GEMINI_MAX_TOKENS = String(config.maxTokens ?? 8192);
      env.GEMINI_TEMPERATURE = String(config.temperature ?? 0.7);

      // Log for debugging
      logger.debug('[AIProviderManager] Setting Gemini environment - API Key:',
        config.apiKey ? `Present (${config.apiKey.length} chars)` : 'MISSING');
    }

    return env;
  }

  private async loadPersistedDefaultProvider(): Promise<void> {
    try {
      const { db } = await import('../database/connection');
      const result = await db.query(
        "SELECT value FROM settings WHERE key = 'ai_provider' ORDER BY updated_at DESC LIMIT 1"
      );

      const storedProvider = result.rows[0]?.value?.toLowerCase();
      if (!storedProvider) {
        return;
      }

      const providerValues = Object.values(AIProvider);
      if (!providerValues.includes(storedProvider as AIProvider)) {
        logger.warn('[AIProviderManager] Stored AI provider is invalid:', storedProvider);
        return;
      }

      const providerEnum = storedProvider as AIProvider;
      if (this.isProviderEnabled(providerEnum)) {
        this.defaultProvider = providerEnum;
        process.env.AI_PROVIDER = providerEnum;
        logger.info('[AIProviderManager] Loaded persisted AI provider:', providerEnum);
      } else {
        logger.warn('[AIProviderManager] Persisted AI provider is not currently enabled:', providerEnum);
      }
    } catch (error) {
      logger.warn('[AIProviderManager] Failed to load persisted AI provider selection', error);
    }
  }

  private ensureDefaultProvider(): void {
    if (this.isProviderEnabled(this.defaultProvider)) {
      return;
    }

    this.defaultProvider = AIProvider.GPT_OSS;
    // Do NOT set global environment variable - keep per-user
    logger.info('[AIProviderManager] Default provider reset to gpt-oss (local provider always available)');
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
