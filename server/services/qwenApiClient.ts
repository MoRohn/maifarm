import axios, { AxiosInstance, AxiosError } from 'axios';
import { getActiveProvider } from '../config/aiProviders';
import { ollamaService } from './ollamaService';
import { v4 as uuidv4 } from 'uuid';

export interface QwenCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface QwenCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class QwenApiClient {
  private client?: AxiosInstance;
  private apiKey?: string;
  private modelName: string;
  private useLocalOllama: boolean;
  private localModel?: string;

  constructor() {
    const provider = getActiveProvider();
    
    if (provider.type !== 'qwen') {
      throw new Error('QwenApiClient can only be used when Qwen is the active provider');
    }

    // Check if we should use local Ollama instead of API
    this.useLocalOllama = process.env.QWEN_USE_LOCAL === 'true' || !provider.apiKey;
    this.modelName = provider.modelName || 'qwen-coder-480b';

    if (this.useLocalOllama) {
      // Use local Ollama
      console.log('[Qwen] Using local Ollama for Qwen model');
      this.initializeLocalMode();
    } else {
      // Use API mode
      if (!provider.apiKey) {
        throw new Error('QWEN_API_KEY is not configured and local mode is not enabled');
      }

      this.apiKey = provider.apiKey;

      this.client = axios.create({
        baseURL: provider.apiEndpoint,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'enable' // Enable server-sent events for streaming
        },
        timeout: 300000 // 5 minutes timeout for large context processing
      });

      // Add request/response interceptors for debugging
      this.setupInterceptors();
    }
  }

  private async initializeLocalMode() {
    // Check if Ollama is running
    const isRunning = await ollamaService.isOllamaRunning();
    if (!isRunning) {
      console.warn('[Qwen] Ollama is not running. Please start Ollama to use local Qwen models.');
    }

    // Check for available Qwen model
    const modelInfo = await ollamaService.checkQwenModel();
    if (modelInfo.available && modelInfo.model) {
      this.localModel = modelInfo.model.name;
      console.log(`[Qwen] Found local Qwen model: ${this.localModel}`);
    } else {
      console.warn('[Qwen] No local Qwen model found. Please pull a Qwen model using Ollama.');
      // Set a default model name to try
      this.localModel = 'qwen2.5-coder:7b';
    }
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[Qwen API] Request to ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[Qwen API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[Qwen API] Response from ${response.config.url}:`, response.status);
        return response;
      },
      (error: AxiosError) => {
        console.error('[Qwen API] Response error:', error.response?.data || error.message);
        
        // Handle specific Qwen API errors
        if (error.response?.status === 401) {
          throw new Error('Invalid Qwen API key. Please check your QWEN_API_KEY configuration.');
        }
        
        if (error.response?.status === 429) {
          throw new Error('Qwen API rate limit exceeded. Please try again later.');
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Send a completion request to Qwen
   */
  async createCompletion(request: Partial<QwenCompletionRequest>): Promise<QwenCompletionResponse> {
    const payload: QwenCompletionRequest = {
      model: this.modelName,
      temperature: 0.7,
      max_tokens: 256000, // Qwen's large context window
      ...request,
      messages: request.messages || []
    };

    if (this.useLocalOllama) {
      // Use local Ollama
      try {
        // Convert messages to prompt format for Ollama
        const prompt = this.messagesToPrompt(payload.messages);
        
        const ollamaResponse = await ollamaService.createCompletion(
          this.localModel || 'qwen2.5-coder:7b',
          prompt,
          {
            options: {
              temperature: payload.temperature,
              num_predict: payload.max_tokens,
              top_p: payload.top_p
            }
          }
        );

        // Convert Ollama response to QwenCompletionResponse format
        return {
          id: uuidv4(),
          object: 'chat.completion',
          created: Date.now(),
          model: this.localModel || 'qwen-local',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: ollamaResponse.response || ''
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: ollamaResponse.prompt_eval_count || 0,
            completion_tokens: ollamaResponse.eval_count || 0,
            total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
          }
        };
      } catch (error) {
        console.error('Local Ollama error:', error);
        throw new Error(`Local Ollama error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Use API mode
      try {
        if (!this.client) {
          throw new Error('API client not initialized');
        }
        
        const response = await this.client.post<QwenCompletionResponse>(
          '/services/aigc/text-generation/generation',
          {
            input: {
              messages: payload.messages
            },
            parameters: {
              temperature: payload.temperature,
              max_tokens: payload.max_tokens,
              top_p: payload.top_p
            },
            model: payload.model
          }
        );

        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error('Qwen API error:', error.response?.data);
          throw new Error(`Qwen API error: ${error.response?.data?.message || error.message}`);
        }
        throw error;
      }
    }
  }

  /**
   * Convert messages array to a single prompt string for Ollama
   */
  private messagesToPrompt(messages: QwenCompletionRequest['messages']): string {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}`;
      } else if (msg.role === 'user') {
        return `User: ${msg.content}`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}`;
      }
      return msg.content;
    }).join('\n\n') + '\n\nAssistant:';
  }

  /**
   * Create a streaming completion
   */
  async createStreamingCompletion(
    request: Partial<QwenCompletionRequest>,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const payload: QwenCompletionRequest = {
      model: this.modelName,
      temperature: 0.7,
      max_tokens: 256000,
      stream: true,
      ...request,
      messages: request.messages || []
    };

    try {
      const response = await this.client.post(
        '/services/aigc/text-generation/generation',
        {
          input: {
            messages: payload.messages
          },
          parameters: {
            temperature: payload.temperature,
            max_tokens: payload.max_tokens,
            top_p: payload.top_p,
            incremental_output: true
          },
          model: payload.model
        },
        {
          responseType: 'stream'
        }
      );

      // Process streaming response
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.output?.text) {
                onChunk(parsed.output.text);
              }
            } catch (e) {
              console.error('Error parsing streaming chunk:', e);
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Qwen streaming error:', error.response?.data);
        throw new Error(`Qwen streaming error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Translate Claude-style messages to Qwen format
   */
  translateClaudeToQwen(claudeMessages: any[]): QwenCompletionRequest['messages'] {
    return claudeMessages.map(msg => {
      // Handle different message formats
      if (typeof msg === 'string') {
        return { role: 'user' as const, content: msg };
      }
      
      // Map Claude roles to Qwen roles
      const roleMap: Record<string, 'system' | 'user' | 'assistant'> = {
        'human': 'user',
        'assistant': 'assistant',
        'system': 'system'
      };

      return {
        role: roleMap[msg.role] || 'user',
        content: msg.content || msg.text || ''
      };
    });
  }

  /**
   * Check if Qwen service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.useLocalOllama) {
        // Check if Ollama is running and model is available
        const isRunning = await ollamaService.isOllamaRunning();
        if (!isRunning) {
          return false;
        }
        
        // Try to get model info
        const modelInfo = await ollamaService.checkQwenModel();
        return modelInfo.available;
      } else {
        // Try a minimal completion request for API mode
        await this.createCompletion({
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });
        return true;
      }
    } catch (error) {
      console.error('Qwen health check failed:', error);
      return false;
    }
  }

  /**
   * Get information about the current Qwen provider
   */
  async getProviderInfo(): Promise<{
    mode: 'local' | 'api';
    modelName: string;
    available: boolean;
    details?: any;
  }> {
    if (this.useLocalOllama) {
      const modelInfo = await ollamaService.checkQwenModel();
      return {
        mode: 'local',
        modelName: this.localModel || 'not-configured',
        available: modelInfo.available,
        details: modelInfo
      };
    } else {
      const available = await this.healthCheck();
      return {
        mode: 'api',
        modelName: this.modelName,
        available,
        details: {
          apiEndpoint: this.client?.defaults.baseURL,
          hasApiKey: !!this.apiKey
        }
      };
    }
  }
}

// Export singleton instance
export const qwenApiClient = new QwenApiClient();