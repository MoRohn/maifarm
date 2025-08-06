import { config } from 'dotenv';
import path from 'path';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env' : `.env.${process.env.NODE_ENV || 'development'}`;
config({ path: path.resolve(process.cwd(), envFile) });

export enum AIProvider {
  CLAUDE = 'claude',
  QWEN = 'qwen',
  QWEN_LOCAL = 'qwen_local'
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
    this.initializeProviders();
    this.defaultProvider = this.determineDefaultProvider();
  }

  private initializeProviders(): void {
    // Claude configuration
    const claudeConfig: AIProviderConfig = {
      provider: AIProvider.CLAUDE,
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      apiEndpoint: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1',
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      enabled: true, // Claude is always enabled as the primary provider
      maxTokens: 4096,
      temperature: 0.7,
      contextWindow: 200000,
      cliCommand: 'claude'
    };

    // Qwen API configuration
    const qwenConfig: AIProviderConfig = {
      provider: AIProvider.QWEN,
      apiKey: process.env.QWEN_API_KEY || '',
      apiEndpoint: process.env.QWEN_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
      model: process.env.QWEN_MODEL || 'qwen-coder-480b',
      enabled: process.env.QWEN_ENABLED === 'true',
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 256000, // Can extend to 1M
      cliCommand: 'qwen-code',
      proxyEnabled: process.env.QWEN_PROXY_ENABLED === 'true'
    };

    // Qwen Local (Ollama) configuration
    const qwenLocalConfig: AIProviderConfig = {
      provider: AIProvider.QWEN_LOCAL,
      apiKey: '', // Not needed for local
      apiEndpoint: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      model: process.env.QWEN_LOCAL_MODEL || 'qwen2.5-coder:7b',
      enabled: process.env.QWEN_LOCAL_ENABLED === 'true',
      maxTokens: 8192,
      temperature: 0.7,
      contextWindow: 32768, // Depends on model
      cliCommand: 'ollama',
      isLocal: true,
      ollamaModel: process.env.QWEN_LOCAL_MODEL || 'qwen2.5-coder:7b'
    };

    this.providers.set(AIProvider.CLAUDE, claudeConfig);
    this.providers.set(AIProvider.QWEN, qwenConfig);
    this.providers.set(AIProvider.QWEN_LOCAL, qwenLocalConfig);
  }

  private determineDefaultProvider(): AIProvider {
    const envProvider = process.env.AI_PROVIDER?.toLowerCase();
    
    if (envProvider === 'qwen_local' && this.isProviderEnabled(AIProvider.QWEN_LOCAL)) {
      return AIProvider.QWEN_LOCAL;
    }
    
    if (envProvider === AIProvider.QWEN && this.isProviderEnabled(AIProvider.QWEN)) {
      return AIProvider.QWEN;
    }
    
    return AIProvider.CLAUDE;
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
    
    // Check if Qwen has necessary configuration
    if (provider === AIProvider.QWEN) {
      return config.enabled && (config.apiKey !== '' || config.proxyEnabled === true);
    }
    
    // Check if Qwen Local is enabled and available
    if (provider === AIProvider.QWEN_LOCAL) {
      return config.enabled;
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
    
    // If using Qwen with proxy, still use 'claude' command
    if (provider === AIProvider.QWEN && config.proxyEnabled) {
      return 'claude';
    }
    
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

    if (provider === AIProvider.QWEN) {
      env.QWEN_API_KEY = config.apiKey;
      env.QWEN_API_ENDPOINT = config.apiEndpoint;
      env.QWEN_MODEL = config.model;
      
      if (config.proxyEnabled) {
        env.CLAUDE_CODE_ROUTER = 'qwen';
        env.DASHSCOPE_API_KEY = config.apiKey;
      }
    } else {
      env.ANTHROPIC_API_KEY = config.apiKey;
      env.CLAUDE_API_ENDPOINT = config.apiEndpoint;
      env.CLAUDE_MODEL = config.model;
    }

    return env;
  }
}

// Export singleton instance
export const aiProviderManager = new AIProviderConfigManager();