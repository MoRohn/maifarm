import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import { llmProxy } from './llmProxyService';
import { ollamaService } from './ollamaService';
import { v4 as uuidv4 } from 'uuid';
import type { QwenModelInfo, QwenCompletionOptions, QwenResponse } from '../types/qwen';

interface QwenConfig {
  useProxy: boolean;
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  preferLocal?: boolean;
}

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class QwenService extends EventEmitter {
  private config: QwenConfig;
  private directClient?: AxiosInstance;
  private localModelAvailable: boolean = false;
  private localModelName?: string;
  private initialized: boolean = false;

  constructor(config?: Partial<QwenConfig>) {
    super();
    this.config = {
      useProxy: process.env.USE_LLM_PROXY === 'true',
      apiKey: process.env.QWEN_API_KEY,
      apiEndpoint: process.env.QWEN_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
      model: process.env.QWEN_MODEL || 'qwen-coder-480b',
      maxTokens: parseInt(process.env.QWEN_MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.QWEN_TEMPERATURE || '0.7'),
      preferLocal: process.env.QWEN_PREFER_LOCAL === 'true',
      ...config
    };

    // Set up direct client if not using proxy
    if (!this.config.useProxy && this.config.apiKey) {
      this.directClient = axios.create({
        baseURL: this.config.apiEndpoint,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minutes for large model responses
      });
    }
  }

  /**
   * Initialize the Qwen service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Check for local Qwen model via Ollama
      const localCheck = await ollamaService.checkQwenModel();
      if (localCheck.available && localCheck.model) {
        this.localModelAvailable = true;
        this.localModelName = localCheck.model.name;
        console.log(`Local Qwen model available: ${this.localModelName}`);
        this.emit('local:available', this.localModelName);
      }

      // Start LLM proxy if configured
      if (this.config.useProxy && !llmProxy.running) {
        console.log('Starting LLM proxy for Qwen integration...');
        await llmProxy.start();
      }

      // Verify API availability if configured
      if (this.config.apiKey && !this.config.useProxy) {
        const apiAvailable = await this.checkAPIAvailability();
        if (apiAvailable) {
          console.log('Qwen API is available');
          this.emit('api:available');
        }
      }

      this.initialized = true;
      this.emit('initialized', {
        localAvailable: this.localModelAvailable,
        apiAvailable: !!this.config.apiKey,
        useProxy: this.config.useProxy
      });

    } catch (error) {
      console.error('Failed to initialize Qwen service:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if Qwen API is available
   */
  private async checkAPIAvailability(): Promise<boolean> {
    if (!this.directClient) {
      return false;
    }

    try {
      // Test with a minimal request
      const response = await this.directClient.post('/services/aigc/text-generation/generation', {
        model: this.config.model,
        input: {
          messages: [{ role: 'user', content: 'test' }]
        },
        parameters: {
          max_tokens: 1
        }
      });
      return response.status === 200;
    } catch (error) {
      console.error('Qwen API availability check failed:', error);
      return false;
    }
  }

  /**
   * Send a completion request to Qwen
   */
  async completion(
    messages: QwenMessage[],
    options?: QwenCompletionOptions
  ): Promise<QwenResponse> {
    await this.initialize();

    const useLocal = this.shouldUseLocal(options);

    if (useLocal && this.localModelAvailable) {
      return this.localCompletion(messages, options);
    } else if (this.config.useProxy) {
      return this.proxyCompletion(messages, options);
    } else if (this.directClient) {
      return this.directAPICompletion(messages, options);
    } else {
      throw new Error('No Qwen provider available. Please configure local model or API access.');
    }
  }

  /**
   * Determine whether to use local model
   */
  private shouldUseLocal(options?: QwenCompletionOptions): boolean {
    // Explicit option takes precedence
    if (options?.useLocal !== undefined) {
      return options.useLocal;
    }
    // Otherwise use config preference
    return this.config.preferLocal && this.localModelAvailable;
  }

  /**
   * Send completion via local Ollama model
   */
  private async localCompletion(
    messages: QwenMessage[],
    options?: QwenCompletionOptions
  ): Promise<QwenResponse> {
    const prompt = this.messagesToPrompt(messages);
    
    const response = await ollamaService.generate({
      model: this.localModelName!,
      prompt,
      options: {
        temperature: options?.temperature || this.config.temperature,
        num_predict: options?.maxTokens || this.config.maxTokens
      }
    });

    return {
      id: uuidv4(),
      model: this.localModelName!,
      choices: [{
        message: {
          role: 'assistant',
          content: response.response
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: this.estimateTokens(prompt),
        completion_tokens: this.estimateTokens(response.response),
        total_tokens: this.estimateTokens(prompt + response.response)
      },
      provider: 'ollama'
    };
  }

  /**
   * Send completion via LLM proxy
   */
  private async proxyCompletion(
    messages: QwenMessage[],
    options?: QwenCompletionOptions
  ): Promise<QwenResponse> {
    const response = await llmProxy.qwenCompletion(messages, {
      temperature: options?.temperature || this.config.temperature,
      max_tokens: options?.maxTokens || this.config.maxTokens,
      useLocal: options?.useLocal
    });

    return {
      ...response,
      provider: 'proxy'
    } as QwenResponse;
  }

  /**
   * Send completion directly to Qwen API
   */
  private async directAPICompletion(
    messages: QwenMessage[],
    options?: QwenCompletionOptions
  ): Promise<QwenResponse> {
    if (!this.directClient) {
      throw new Error('Direct API client not configured');
    }

    const response = await this.directClient.post('/services/aigc/text-generation/generation', {
      model: options?.model || this.config.model,
      input: {
        messages
      },
      parameters: {
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature || this.config.temperature,
        top_p: options?.topP || 0.9,
        top_k: options?.topK || 50,
        repetition_penalty: options?.repetitionPenalty || 1.0,
        presence_penalty: options?.presencePenalty || 0,
        frequency_penalty: options?.frequencyPenalty || 0,
        seed: options?.seed,
        stop: options?.stop
      }
    });

    const data = response.data;
    
    return {
      id: data.request_id || uuidv4(),
      model: this.config.model!,
      choices: [{
        message: {
          role: 'assistant',
          content: data.output?.text || data.output?.choices?.[0]?.message?.content || ''
        },
        finish_reason: data.output?.finish_reason || 'stop'
      }],
      usage: data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      provider: 'api'
    };
  }

  /**
   * Stream completion response
   */
  async *streamCompletion(
    messages: QwenMessage[],
    options?: QwenCompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    await this.initialize();

    if (this.config.useProxy) {
      // Use proxy streaming
      const request = {
        model: 'qwen/qwen-coder-480b',
        messages,
        temperature: options?.temperature || this.config.temperature,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        stream: true
      };

      for await (const chunk of llmProxy.streamCompletion(request)) {
        yield chunk;
      }
    } else {
      // Direct API doesn't support streaming in this implementation
      // Fall back to non-streaming and simulate
      const response = await this.completion(messages, options);
      const content = response.choices[0].message.content;
      
      // Simulate streaming by yielding chunks
      const chunkSize = 20;
      for (let i = 0; i < content.length; i += chunkSize) {
        yield content.slice(i, i + chunkSize);
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
      }
    }
  }

  /**
   * Convert messages to a single prompt string
   */
  private messagesToPrompt(messages: QwenMessage[]): string {
    return messages
      .map(msg => {
        const role = msg.role === 'system' ? 'System' : 
                    msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    // Qwen may use different tokenization, but this is close enough
    return Math.ceil(text.length / 4);
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<QwenModelInfo> {
    await this.initialize();

    return {
      name: this.config.model || 'qwen-coder-480b',
      parameters: '480B (35B active)',
      contextWindow: 256000,
      localAvailable: this.localModelAvailable,
      localModel: this.localModelName,
      apiAvailable: !!this.config.apiKey,
      useProxy: this.config.useProxy,
      provider: this.config.useProxy ? 'proxy' : 
                this.localModelAvailable ? 'ollama' : 'api'
    };
  }

  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    await this.initialize();
    return this.localModelAvailable || !!this.config.apiKey || this.config.useProxy;
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    localAvailable: boolean;
    apiConfigured: boolean;
    proxyEnabled: boolean;
    preferLocal: boolean;
  } {
    return {
      initialized: this.initialized,
      localAvailable: this.localModelAvailable,
      apiConfigured: !!this.config.apiKey,
      proxyEnabled: this.config.useProxy,
      preferLocal: this.config.preferLocal || false
    };
  }
}

// Export singleton instance
export const qwenService = new QwenService();