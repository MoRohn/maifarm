import { Request, Response, NextFunction } from 'express';
import { proxyConfig, transformClaudeToQwenRequest, transformQwenToClaudeResponse, isProxyEnabled } from '../config/proxyConfig';
import { aiProxy } from '../services/aiProxy';
import axios from 'axios';

/**
 * AI Proxy Middleware
 * Intercepts Claude API calls and routes them to Qwen when configured
 */

export interface ProxyRequest extends Request {
  isProxied?: boolean;
  originalProvider?: string;
  targetProvider?: string;
}

/**
 * Middleware to intercept and proxy AI requests
 */
export function aiProxyMiddleware(req: ProxyRequest, res: Response, next: NextFunction) {
  // Skip if proxy is not enabled
  if (!isProxyEnabled()) {
    return next();
  }

  // Check if this is a Claude API endpoint
  const isClaudeEndpoint = req.path.includes('/claude/') || req.path.includes('/v1/messages') || req.path.includes('/v1/complete');
  
  if (!isClaudeEndpoint) {
    return next();
  }

  // Mark request as proxied
  req.isProxied = true;
  req.originalProvider = 'claude';
  req.targetProvider = 'qwen';

  console.log(`[AI Proxy] Intercepting Claude request to ${req.path}`);

  // Continue to next middleware - actual proxying happens in route handlers
  next();
}

/**
 * Handle proxied requests in route handlers
 */
export async function handleProxiedRequest(req: ProxyRequest, res: Response) {
  if (!req.isProxied || req.targetProvider !== 'qwen') {
    throw new Error('Invalid proxy request');
  }

  try {
    // Transform request body
    const transformedRequest = transformClaudeToQwenRequest(req.body);
    
    // Get Qwen configuration
    const qwenConfig = proxyConfig.providers.qwen;
    
    // Make request to Qwen
    const response = await axios.post(
      `${qwenConfig.baseUrl}/services/aigc/text-generation/generation`,
      transformedRequest,
      {
        headers: qwenConfig.headers,
        timeout: 300000 // 5 minutes
      }
    );

    // Transform response back to Claude format
    const transformedResponse = transformQwenToClaudeResponse(response.data);
    
    // Send response
    res.json(transformedResponse);
  } catch (error) {
    console.error('[AI Proxy] Error proxying request:', error);
    
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status || 500).json({
        error: {
          type: 'proxy_error',
          message: error.response?.data?.message || error.message
        }
      });
    } else {
      res.status(500).json({
        error: {
          type: 'proxy_error',
          message: 'Failed to proxy request to Qwen'
        }
      });
    }
  }
}

/**
 * Streaming proxy handler
 */
export async function handleStreamingProxiedRequest(req: ProxyRequest, res: Response) {
  if (!req.isProxied || req.targetProvider !== 'qwen') {
    throw new Error('Invalid proxy request');
  }

  try {
    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Transform request
    const transformedRequest = transformClaudeToQwenRequest(req.body);
    transformedRequest.parameters = {
      ...transformedRequest.parameters,
      incremental_output: true
    };

    // Get Qwen configuration
    const qwenConfig = proxyConfig.providers.qwen;

    // Make streaming request
    const response = await axios.post(
      `${qwenConfig.baseUrl}/services/aigc/text-generation/generation`,
      transformedRequest,
      {
        headers: qwenConfig.headers,
        responseType: 'stream',
        timeout: 300000
      }
    );

    // Process streaming response
    response.data.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            // Transform to Claude streaming format
            const claudeFormat = {
              completion: parsed.output?.text || '',
              stop_reason: null,
              model: 'claude-3-sonnet-20240229'
            };
            
            res.write(`data: ${JSON.stringify(claudeFormat)}\n\n`);
          } catch (e) {
            console.error('[AI Proxy] Error parsing streaming chunk:', e);
          }
        }
      }
    });

    response.data.on('error', (error: Error) => {
      console.error('[AI Proxy] Streaming error:', error);
      res.write(`data: {"error": "${error.message}"}\n\n`);
      res.end();
    });

    response.data.on('end', () => {
      if (!res.writableEnded) {
        res.end();
      }
    });

  } catch (error) {
    console.error('[AI Proxy] Streaming proxy error:', error);
    res.write(`data: {"error": "Streaming proxy failed"}\n\n`);
    res.end();
  }
}

/**
 * Middleware to log proxy usage
 */
export function proxyLoggingMiddleware(req: ProxyRequest, res: Response, next: NextFunction) {
  if (req.isProxied) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[AI Proxy] ${req.method} ${req.path} - ${req.originalProvider} -> ${req.targetProvider} - ${res.statusCode} - ${duration}ms`);
    });
  }
  
  next();
}