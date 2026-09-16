import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { engineGateway } from './engineGateway';
import type { ChatMessage, ChatRequest, ChatResponse } from '../engines';
import { EngineExecutionError } from '../engines/errors';

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

  private resolveEngineKey(provider: AIProviderConfig): string {
    switch (provider.provider) {
      case AIProvider.OPENAI:
        return 'openai';
      case AIProvider.CLAUDE:
      default:
        return 'claude-code';
    }
  }

  private buildChatRequest(request: UnifiedAIRequest): ChatRequest {
    const chatMessages: ChatMessage[] = [];
    let system: string | undefined;

    for (const message of request.messages) {
      if (message.role === 'system' && !system) {
        system = message.content;
        continue;
      }

      chatMessages.push({
        role: message.role,
        content: message.content
      });
    }

    const metadata = request.metadata
      ? Object.fromEntries(
          Object.entries(request.metadata).map(([key, value]) => [key, value === undefined ? '' : String(value)])
        )
      : undefined;

    return {
      system,
      messages: chatMessages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      metadata
    };
  }

  private normalizeContent(content: ChatResponse['content'], toolCalls?: ChatResponse['tool_calls']): string {
    if (typeof content === 'string') {
      return content;
    }
    if (content && 'json' in content) {
      return JSON.stringify(content.json);
    }
    if (toolCalls && toolCalls.length > 0) {
      return JSON.stringify(toolCalls[0].arguments ?? {});
    }
    return '';
  }

  private toUnifiedResponse(
    provider: AIProviderConfig,
    response: ChatResponse,
    metadata?: UnifiedAIRequest['metadata']
  ): UnifiedAIResponse {
    const content = this.normalizeContent(response.content, response.tool_calls);

    return {
      content,
      model: (response.raw as any)?.model ?? provider.model,
      provider: provider.provider === AIProvider.OPENAI ? 'openai' : 'claude',
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens:
              response.usage.total_tokens ??
              (response.usage.prompt_tokens ?? 0) + (response.usage.completion_tokens ?? 0)
          }
        : undefined,
      metadata
    };
  }

  /**
   * Send a unified request to the active AI provider
   */
  async sendRequest(request: UnifiedAIRequest, providerOverride?: AIProvider): Promise<UnifiedAIResponse> {
    const provider = this.resolveProvider(providerOverride);

    const engineKey = this.resolveEngineKey(provider);
    const chatRequest = this.buildChatRequest(request);

    try {
      const response = await engineGateway.chat(chatRequest, {
        engineKey,
        model: provider.model
      });
      return this.toUnifiedResponse(provider, response, request.metadata);
    } catch (error) {
      if (error instanceof EngineExecutionError) {
        throw new Error(error.message);
      }
      throw error;
    }
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
    const engineKey = this.resolveEngineKey(provider);
    const chatRequest = this.buildChatRequest(request);

    try {
      const stream = await engineGateway.stream(chatRequest, {
        engineKey,
        model: provider.model
      });

      for await (const event of stream) {
        if (event.type === 'token') {
          onChunk(event.value);
        }
      }

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      if (error instanceof EngineExecutionError) {
        throw new Error(error.message);
      }
      throw error;
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
