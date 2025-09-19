import { openaiService } from '../../services/unified/aiProviderService.js';
import { claudeService } from '../../services/unified/aiProviderService.js';

interface ProviderConfig {
  provider: string;
  apiKey?: string;
  model: string;
  endpoint?: string;
}

export class ProviderManager {
  private providers = new Map<string, any>();
  
  constructor() {
    this.registerProviders();
  }
  
  private registerProviders() {
    this.providers.set('claude', claudeService);
    this.providers.set('openai', openaiService);
  }
  
  async listProviders() {
    return Array.from(this.providers.keys()).map(name => ({
      name,
      available: this.providers.get(name)?.isAvailable() ?? false,
      configured: this.providers.get(name)?.isConfigured() ?? false
    }));
  }
  
  async configureProvider(config: ProviderConfig) {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new Error(`Unknown provider: ${config.provider}`);
    }
    
    return provider.configure(config);
  }
  
  async getProviderStatus(providerName: string) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    
    return provider.getStatus();
  }
  
  async testProvider(providerName: string) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    
    return provider.test();
  }
}