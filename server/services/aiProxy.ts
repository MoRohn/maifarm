import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { QwenCompletionRequest } from './qwenApiClient';
import axios from 'axios';

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

  private getCurrentProvider(): AIProviderConfig {
    const defaultProvider = aiProviderManager.getDefaultProvider();
    return aiProviderManager.getProvider(defaultProvider);
  }

  /**
   * Send a unified request to the active AI provider
   */
  async sendRequest(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
    const provider = this.getCurrentProvider();

    switch (provider.provider) {
      case AIProvider.QWEN:
        return this.sendQwenRequest(request);
      case AIProvider.CLAUDE:
        return this.sendClaudeRequest(request);
      default:
        throw new Error(`Unsupported provider: ${provider.provider}`);
    }
  }

  /**
   * Send request to Qwen
   */
  private async sendQwenRequest(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
    try {
      const provider = this.getCurrentProvider();
      const qwenRequest: Partial<QwenCompletionRequest> = {
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens || provider.maxTokens,
        model: provider.model
      };

      // Create Qwen API client inline
      const qwenClient = axios.create({
        baseURL: provider.apiEndpoint,
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'enable'
        },
        timeout: 300000
      });

      const response = await qwenClient.post('/services/aigc/text-generation/generation', {
        input: {
          messages: qwenRequest.messages
        },
        parameters: {
          temperature: qwenRequest.temperature,
          max_tokens: qwenRequest.max_tokens
        },
        model: qwenRequest.model
      });

      const responseData = response.data;
      return {
        content: responseData.output?.text || responseData.choices?.[0]?.message.content || '',
        model: provider.model,
        provider: 'openai',
        usage: responseData.usage ? {
          promptTokens: responseData.usage.prompt_tokens || 0,
          completionTokens: responseData.usage.completion_tokens || 0,
          totalTokens: responseData.usage.total_tokens || 0
        } : undefined,
        metadata: {
          ...request.metadata,
          qwenId: responseData.request_id || responseData.id,
          finishReason: responseData.output?.finish_reason
        }
      };
    } catch (error) {
      console.error('Qwen request failed:', error);
      throw new Error(`Qwen request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send request to Claude (placeholder - would integrate with actual Claude API)
   */
  private async sendClaudeRequest(request: UnifiedAIRequest): Promise<UnifiedAIResponse> {
    // In a real implementation, this would call the Claude API
    // For now, we'll simulate the response format
    console.log('Claude request:', request);
    const provider = this.getCurrentProvider();

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
    onComplete?: () => void
  ): Promise<void> {
    const provider = this.getCurrentProvider();

    switch (provider.provider) {
      case AIProvider.QWEN:
        await this.streamQwenRequest(request, onChunk);
        break;
      case AIProvider.CLAUDE:
        await this.streamClaudeRequest(request, onChunk);
        break;
      default:
        throw new Error(`Unsupported provider for streaming: ${provider.provider}`);
    }

    if (onComplete) {
      onComplete();
    }
  }

  /**
   * Stream request to Qwen
   */
  private async streamQwenRequest(
    request: UnifiedAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    // For now, simulate streaming for Qwen
    const response = await this.sendQwenRequest(request);
    const words = response.content.split(' ');
    
    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 50));
      onChunk(word + ' ');
    }
  }

  /**
   * Stream request to Claude (placeholder)
   */
  private async streamClaudeRequest(
    request: UnifiedAIRequest,
    onChunk: (chunk: string) => void
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
    if (targetProvider === 'qwen') {
      // Add Qwen-specific optimizations
      return `${prompt}

[Qwen3-Coder Instructions]
- Leverage your 256K token context window for comprehensive analysis
- Use chain-of-thought reasoning for complex tasks
- Provide detailed step-by-step breakdowns when needed
- Optimize for the 35B active parameters efficiency`;
    }

    // Claude format (default)
    return prompt;
  }

  /**
   * Get provider-specific configuration hints
   */
  getProviderHints(provider: 'claude' | 'openai'): Record<string, any> {
    switch (provider) {
      case 'qwen':
        return {
          maxContextTokens: 256000,
          supportedLanguages: ['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'C++'],
          specialCapabilities: [
            'Extended context window (256K tokens)',
            'Free API access',
            'Chain-of-thought reasoning',
            'Code generation and refactoring'
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
      const provider = this.getCurrentProvider();
      if (provider.provider === AIProvider.QWEN) {
        // Simple health check for Qwen
        return !!provider.apiKey || provider.proxyEnabled === true;
      }
      // Add Claude health check when implemented
      return true;
    } catch (error) {
      console.error('Provider availability check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const aiProxy = new AIProxy();