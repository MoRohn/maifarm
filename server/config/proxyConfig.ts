/**
 * Proxy Configuration for AI Provider Compatibility
 * Handles translation between Claude and Qwen API formats
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
    qwen: {
      baseUrl: string;
      headers: Record<string, string>;
    };
  };
}

/**
 * Transform Claude request format to Qwen format
 */
export function transformClaudeToQwenRequest(claudeRequest: any): any {
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
      model: 'qwen-coder-480b'
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
      model: claudeRequest.model || 'qwen-coder-480b'
    };
  }

  // Default passthrough
  return claudeRequest;
}

/**
 * Transform Qwen response to Claude format
 */
export function transformQwenToClaudeResponse(qwenResponse: any): any {
  if (qwenResponse.output) {
    // Qwen standard response format
    return {
      completion: qwenResponse.output.text || qwenResponse.output.content || '',
      stop_reason: qwenResponse.output.finish_reason || 'stop',
      model: 'claude-3-sonnet-20240229', // Mimic Claude model
      usage: {
        input_tokens: qwenResponse.usage?.input_tokens || 0,
        output_tokens: qwenResponse.usage?.output_tokens || 0
      }
    };
  }

  // Handle streaming response
  if (qwenResponse.choices && qwenResponse.choices[0]) {
    const choice = qwenResponse.choices[0];
    return {
      completion: choice.message?.content || choice.text || '',
      stop_reason: choice.finish_reason || 'stop',
      model: 'claude-3-sonnet-20240229',
      usage: qwenResponse.usage || {}
    };
  }

  // Default passthrough
  return qwenResponse;
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
      transform: transformClaudeToQwenRequest
    },
    {
      source: '/v1/complete',
      target: '/services/aigc/text-generation/generation',
      transform: transformClaudeToQwenRequest
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
    qwen: {
      baseUrl: process.env.QWEN_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
      headers: {
        'Authorization': `Bearer ${process.env.QWEN_API_KEY || ''}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable'
      }
    }
  }
};

/**
 * Get proxy configuration for a specific provider
 */
export function getProviderProxyConfig(provider: 'claude' | 'qwen'): typeof proxyConfig.providers.claude {
  return proxyConfig.providers[provider];
}

/**
 * Check if proxy is enabled for current configuration
 */
export function isProxyEnabled(): boolean {
  return proxyConfig.enabled && process.env.AI_PROVIDER === 'qwen';
}