import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../monitoring/logger.js';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

interface OpenAIValidationResult {
  valid: boolean;
  models?: string[];
  error?: string;
}

class OpenAIService {
  private config: Partial<OpenAIConfig> = {};
  private isConfigured = false;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.loadConfiguration();
  }

  private loadConfiguration() {
    // Load from environment variables
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const baseUrl = process.env.OPENAI_BASE_URL || this.baseUrl;
    const maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '4096');
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || '0.7');

    // Check if API key is valid (not empty, not placeholder)
    const isValidApiKey = apiKey && 
                          apiKey.length > 10 && 
                          !apiKey.includes('your-') && 
                          !apiKey.includes('here') &&
                          !apiKey.includes('placeholder') &&
                          !apiKey.includes('example');

    if (isValidApiKey) {
      this.config = {
        apiKey,
        model,
        baseUrl,
        maxTokens,
        temperature
      };
      this.isConfigured = true;
      logger.info('OpenAI service configured from environment variables');
    } else if (apiKey) {
      logger.warn('OpenAI API key appears to be a placeholder value');
      this.isConfigured = false;
    }
  }

  // Update configuration with new API key from settings
  updateConfiguration(apiKey: string, model?: string) {
    // Check if API key is valid (not empty, not placeholder)
    const isValidApiKey = apiKey && 
                          apiKey.length > 10 && 
                          !apiKey.includes('your-') && 
                          !apiKey.includes('here') &&
                          !apiKey.includes('placeholder') &&
                          !apiKey.includes('example');

    if (isValidApiKey) {
      this.config = {
        apiKey,
        model: model || this.config.model || 'gpt-4-turbo-preview',
        baseUrl: this.baseUrl,
        maxTokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.7
      };
      this.isConfigured = true;
      
      // Update environment variable for persistence
      process.env.OPENAI_API_KEY = apiKey;
      if (model) {
        process.env.OPENAI_MODEL = model;
      }
      process.env.OPENAI_ENABLED = 'true';
      
      logger.info('OpenAI service configuration updated from settings');
    } else if (apiKey) {
      logger.warn('OpenAI API key appears to be a placeholder value');
      this.isConfigured = false;
    } else {
      this.isConfigured = false;
    }
  }

  async validateApiKey(apiKey: string, model: string = 'gpt-4-turbo-preview'): Promise<OpenAIValidationResult> {
    try {
      // Test the API key by listing available models
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        const models = response.data.data
          .filter((m: any) => m.id.includes('gpt'))
          .map((m: any) => m.id);
        
        // Check if the requested model is available
        const modelAvailable = models.some((m: string) => m.includes(model.split('-').slice(0, 2).join('-')));
        
        if (!modelAvailable) {
          return {
            valid: false,
            error: `Model ${model} is not available with your API key`
          };
        }

        return {
          valid: true,
          models
        };
      }

      return {
        valid: false,
        error: 'Invalid API response'
      };
    } catch (error: any) {
      logger.error('OpenAI API key validation failed:', error);
      
      if (error.response?.status === 401) {
        return {
          valid: false,
          error: 'Invalid API key'
        };
      }
      
      if (error.response?.status === 429) {
        return {
          valid: false,
          error: 'Rate limit exceeded. Please try again later.'
        };
      }

      return {
        valid: false,
        error: error.message || 'Failed to validate API key'
      };
    }
  }

  async configure(apiKey: string, model: string, enabled: boolean = true) {
    if (!enabled) {
      this.isConfigured = false;
      this.config = {};
      return { success: true };
    }

    // Validate before saving
    const validation = await this.validateApiKey(apiKey, model);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Use the updateConfiguration method to set the config
    this.updateConfiguration(apiKey, model);

    logger.info('OpenAI service configured successfully');
    return { success: true };
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      enabled: this.isConfigured && !!this.config.apiKey,
      model: this.config.model,
      keyPreview: this.config.apiKey ? 
        this.config.apiKey.substring(this.config.apiKey.length - 4) : undefined
    };
  }

  getConfig() {
    return {
      isConfigured: this.isConfigured,
      model: this.config.model,
      baseUrl: this.config.baseUrl || this.baseUrl,
      maxTokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature || 0.7,
      hasApiKey: !!this.config.apiKey
    };
  }

  async chat(messages: any[], options: any = {}) {
    if (!this.isConfigured || !this.config.apiKey) {
      throw new Error('OpenAI service is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: options.model || this.config.model,
          messages,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('OpenAI chat request failed:', error);
      throw new Error(error.response?.data?.error?.message || 'Chat request failed');
    }
  }

  async streamChat(messages: any[], options: any = {}) {
    if (!this.isConfigured || !this.config.apiKey) {
      throw new Error('OpenAI service is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: options.model || this.config.model,
          messages,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          stream: true,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('OpenAI stream chat request failed:', error);
      throw new Error(error.response?.data?.error?.message || 'Stream chat request failed');
    }
  }

  // Function calling support for GPT-4
  async functionCall(messages: any[], functions: any[], options: any = {}) {
    if (!this.isConfigured || !this.config.apiKey) {
      throw new Error('OpenAI service is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: options.model || this.config.model || 'gpt-4-turbo-preview',
          messages,
          functions,
          function_call: options.functionCall || 'auto',
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('OpenAI function call request failed:', error);
      throw new Error(error.response?.data?.error?.message || 'Function call request failed');
    }
  }

  // Vision capabilities for GPT-4 Turbo
  async vision(imageUrl: string, prompt: string, options: any = {}) {
    if (!this.isConfigured || !this.config.apiKey) {
      throw new Error('OpenAI service is not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          max_tokens: options.maxTokens || 4096,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('OpenAI vision request failed:', error);
      throw new Error(error.response?.data?.error?.message || 'Vision request failed');
    }
  }

  // JSON mode for structured output
  async jsonMode(messages: any[], schema?: any, options: any = {}) {
    if (!this.isConfigured || !this.config.apiKey) {
      throw new Error('OpenAI service is not configured');
    }

    try {
      const systemMessage = schema ? 
        `You must respond with valid JSON that matches this schema: ${JSON.stringify(schema)}` :
        'You must respond with valid JSON.';

      const enhancedMessages = [
        { role: 'system', content: systemMessage },
        ...messages
      ];

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: options.model || this.config.model || 'gpt-4-turbo-preview',
          messages: enhancedMessages,
          response_format: { type: 'json_object' },
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          ...options
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Parse and validate JSON response
      const content = response.data.choices[0].message.content;
      try {
        const jsonData = JSON.parse(content);
        return { ...response.data, parsed: jsonData };
      } catch (parseError) {
        logger.error('Failed to parse JSON response:', parseError);
        return response.data;
      }
    } catch (error: any) {
      logger.error('OpenAI JSON mode request failed:', error);
      throw new Error(error.response?.data?.error?.message || 'JSON mode request failed');
    }
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();

// Export service class for testing
export default OpenAIService;