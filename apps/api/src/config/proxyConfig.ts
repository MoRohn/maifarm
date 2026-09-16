/**
 * Proxy Configuration for AI Provider Compatibility
 * Handles translation between Claude and Llama API formats
 */

export interface ProxyRoute {
  source: string;
  target: string;
  transform?: (data: any) => any;
}

export interface ProxyConfig {
  enabled: boolean;
  routes: ProxyRoute[];
  middleware: {
    requestTransform: boolean;
    responseTransform: boolean;
    errorHandling: boolean;
  };
  providers: {
    claude: {
      baseUrl: string;
      headers: Record<string, string>;
    };
    llama: {
      baseUrl: string;
      headers: Record<string, string>;
    };
  };
}

/**
 * Transform Claude request format to Llama format
 */
export function transformClaudeToLlamaRequest(claudeRequest: any): any {
  // Handle different Claude request formats
  if (claudeRequest.prompt) {
    // Simple prompt format
    return {
      input: {
        messages: [
          {
            role: 'user',
            content: claudeRequest.prompt
          }
        ]
      },
      parameters: {
        temperature: claudeRequest.temperature || 0.7,
        max_tokens: claudeRequest.max_tokens || 8192,
        top_p: claudeRequest.top_p || 0.95
      },
      model: 'llama-coder-480b'
    };
  }

  // Message-based format
  if (claudeRequest.messages) {
    return {
      input: {
        messages: claudeRequest.messages.map((msg: any) => ({
          role: msg.role === 'human' ? 'user' : msg.role,
          content: msg.content || msg.text || ''
        }))
      },
      parameters: {
        temperature: claudeRequest.temperature || 0.7,
        max_tokens: claudeRequest.max_tokens || 8192,
        top_p: claudeRequest.top_p || 0.95
      },
      model: claudeRequest.model || 'llama-coder-480b'
    };
  }

  // Default passthrough
  return claudeRequest;
}

/**
 * Transform Llama response to Claude format
 */
export function transformLlamaToClaudeResponse(llamaResponse: any): any {
  if (llamaResponse.output) {
    // Llama standard response format
    return {
      completion: llamaResponse.output.text || llamaResponse.output.content || '',
      stop_reason: llamaResponse.output.finish_reason || 'stop',
      model: 'claude-3-sonnet-20240229', // Mimic Claude model
      usage: {
        input_tokens: llamaResponse.usage?.input_tokens || 0,
        output_tokens: llamaResponse.usage?.output_tokens || 0
      }
    };
  }

  // Handle streaming response
  if (llamaResponse.choices && llamaResponse.choices[0]) {
    const choice = llamaResponse.choices[0];
    return {
      completion: choice.message?.content || choice.text || '',
      stop_reason: choice.finish_reason || 'stop',
      model: 'claude-3-sonnet-20240229',
      usage: llamaResponse.usage || {}
    };
  }

  // Default passthrough
  return llamaResponse;
}

/**
 * Default proxy configuration
 */
export const proxyConfig: ProxyConfig = {
  enabled: process.env.AI_PROXY_ENABLED === 'true',
  routes: [
    {
      source: '/v1/messages',
      target: '/services/aigc/text-generation/generation',
      transform: transformClaudeToLlamaRequest
    },
    {
      source: '/v1/complete',
      target: '/services/aigc/text-generation/generation',
      transform: transformClaudeToLlamaRequest
    }
  ],
  middleware: {
    requestTransform: true,
    responseTransform: true,
    errorHandling: true
  },
  providers: {
    claude: {
      baseUrl: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY || '',
        'anthropic-version': '2023-06-01'
      }
    },
    llama: {
      baseUrl: process.env.LLAMA_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
      headers: {
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable'
      }
    }
  }
};

/**
 * Get proxy configuration for a specific provider
 */
export function getProviderProxyConfig(provider: 'claude' | 'llama'): typeof proxyConfig.providers.claude {
  return proxyConfig.providers[provider];
}

/**
 * Check if proxy is enabled for current configuration
 */
export function isProxyEnabled(): boolean {
  return proxyConfig.enabled && process.env.AI_PROVIDER === 'llama';
}
