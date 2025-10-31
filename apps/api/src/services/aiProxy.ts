import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { openaiService } from './openaiService';

/**
 * AI Proxy Service
 * Translates requests between Claude and OpenAI formats
 * Enables seamless switching between AI providers
 */

export interface UnifiedAIRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: {
    farmId?: string;
    agentId?: string;
    taskId?: string;
  };
}

export interface UnifiedAIResponse {
  content: string;
  model: string;
  provider: 'claude' | 'openai';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: any;
}

export class AIProxy extends EventEmitter {
  constructor() {
    super();
  }

  private resolveProvider(provider?: AIProvider): AIProviderConfig {
    if (provider) {
      return aiProviderManager.getProvider(provider);
    }
    const defaultProvider = aiProviderManager.getDefaultProvider();
    return aiProviderManager.getProvider(defaultProvider);
  }

  /**
   * Send a unified request to the active AI provider
   */
  async sendRequest(request: UnifiedAIRequest, providerOverride?: AIProvider): Promise<UnifiedAIResponse> {
    const provider = this.resolveProvider(providerOverride);

    switch (provider.provider) {
      case AIProvider.OPENAI:
        return this.sendOpenAIRequest(request, provider);
      case AIProvider.CLAUDE:
        return this.sendClaudeRequest(request, provider);
      default:
        throw new Error(`Unsupported provider: ${provider.provider}`);
    }
  }

  private async sendOpenAIRequest(
    request: UnifiedAIRequest,
    provider: AIProviderConfig
  ): Promise<UnifiedAIResponse> {
    if (!provider.apiKey) {
      throw new Error('OpenAI provider is not configured');
    }

    if (!openaiService.isConfigured()) {
      openaiService.updateConfiguration(provider.apiKey, provider.model);
    }

    try {
      const response = await openaiService.chat(request.messages, {
        maxTokens: request.maxTokens || provider.maxTokens,
        temperature: request.temperature || provider.temperature
      });

      const message = response?.choices?.[0]?.message?.content || '';

      return {
        content: message,
        model: response?.model || provider.model,
        provider: 'openai',
        usage: response?.usage ? {
          promptTokens: response.usage.prompt_tokens || 0,
          completionTokens: response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0
        } : undefined,
        metadata: request.metadata
      };
    } catch (error: any) {
      const message = error?.message || 'OpenAI request failed';
      throw new Error(message);
    }
  }

  /**
   * Send request to Claude (placeholder - would integrate with actual Claude API)
   */
  private async sendClaudeRequest(
    request: UnifiedAIRequest,
    provider: AIProviderConfig
  ): Promise<UnifiedAIResponse> {
    // In a real implementation, this would call the Claude API
    // For now, we'll simulate the response format
    console.log('Claude request:', request);

    // Simulate Claude API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          content: `[Claude Mock Response] Processing request with ${request.messages.length} messages`,
          model: provider.model || 'claude-3-sonnet',
          provider: 'claude',
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150
          },
          metadata: request.metadata
        });
      }, 1000);
    });
  }

  /**
   * Stream a request to the active provider
   */
  async streamRequest(
    request: UnifiedAIRequest,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    providerOverride?: AIProvider
  ): Promise<void> {
    const provider = this.resolveProvider(providerOverride);

    switch (provider.provider) {
      case AIProvider.OPENAI:
        await this.streamOpenAIRequest(request, onChunk, provider);
        break;
      case AIProvider.CLAUDE:
        await this.streamClaudeRequest(request, onChunk, provider);
        break;
      default:
        throw new Error(`Unsupported provider for streaming: ${provider.provider}`);
    }

    if (onComplete) {
      onComplete();
    }
  }

  private async streamOpenAIRequest(
    request: UnifiedAIRequest,
    onChunk: (chunk: string) => void,
    provider: AIProviderConfig
  ): Promise<void> {
    const response = await this.sendOpenAIRequest(request, provider);
    const words = response.content.split(' ');

    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 40));
      onChunk(word + ' ');
    }
  }

  /**
   * Stream request to Claude (placeholder)
   */
  private async streamClaudeRequest(
    request: UnifiedAIRequest,
    onChunk: (chunk: string) => void,
    _provider: AIProviderConfig
  ): Promise<void> {
    // Simulate streaming for Claude
    const mockResponse = '[Claude Mock Stream] This is a simulated streaming response...';
    const words = mockResponse.split(' ');

    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 100));
      onChunk(word + ' ');
    }
  }

  /**
   * Translate farm creation prompts for different providers
   */
  translateFarmPrompt(prompt: string, targetProvider: 'claude' | 'openai'): string {
    if (targetProvider === 'openai') {
      return `${prompt}

[OpenAI GPT-4 Instructions]
- Utilize function calling when structured data is requested
- Provide intermediate reasoning steps for complex tasks
- Return concise, actionable plans when possible
- Highlight potential risks or uncertainties`;
    }

    // Claude format (default)
    return prompt;
  }

  /**
   * Get provider-specific configuration hints
   */
  getProviderHints(provider: 'claude' | 'openai'): Record<string, any> {
    switch (provider) {
      case 'openai':
        return {
          maxContextTokens: 128000,
          supportedLanguages: ['All major programming languages'],
          specialCapabilities: [
            'Large context window (128K tokens)',
            'Function calling support',
            'Vision-enabled reasoning',
            'JSON mode for structured outputs'
          ],
          recommendedSettings: {
            temperature: 0.7,
            maxTokens: 8192
          }
        };
      
      case 'claude':
        return {
          maxContextTokens: 8192,
          supportedLanguages: ['All major programming languages'],
          specialCapabilities: [
            'Constitutional AI',
            'Advanced reasoning',
            'Code understanding and generation'
          ],
          recommendedSettings: {
            temperature: 0.7,
            maxTokens: 4096
          }
        };
      
      default:
        return {};
    }
  }

  /**
   * Check if current provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const provider = this.resolveProvider();
      if (provider.provider === AIProvider.OPENAI) {
        return !!provider.apiKey;
      }
      return true;
    } catch (error) {
      console.error('Provider availability check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const aiProxy = new AIProxy();
