import { Request, Response, NextFunction } from 'express';
import { proxyConfig, transformClaudeToLlamaRequest, transformLlamaToClaudeResponse, isProxyEnabled } from '../config/proxyConfig';
import { aiProxy } from '../services/aiProxy';
import axios from 'axios';

/**
 * AI Proxy Middleware
 * Intercepts Claude API calls and routes them to Llama when configured
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
  req.targetProvider = 'llama';

  console.log(`[AI Proxy] Intercepting Claude request to ${req.path}`);

  // Continue to next middleware - actual proxying happens in route handlers
  next();
}

/**
 * Handle proxied requests in route handlers
 */
export async function handleProxiedRequest(req: ProxyRequest, res: Response) {
  if (!req.isProxied || req.targetProvider !== 'llama') {
    throw new Error('Invalid proxy request');
  }

  try {
    // Transform request body
    const transformedRequest = transformClaudeToLlamaRequest(req.body);
    
    // Get Llama configuration
    const llamaConfig = proxyConfig.providers.llama;
    
    // Make request to Llama
    const response = await axios.post(
      `${llamaConfig.baseUrl}/services/aigc/text-generation/generation`,
      transformedRequest,
      {
        headers: llamaConfig.headers,
        timeout: 300000 // 5 minutes
      }
    );

    // Transform response back to Claude format
    const transformedResponse = transformLlamaToClaudeResponse(response.data);
    
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
          message: 'Failed to proxy request to Llama'
        }
      });
    }
  }
}

/**
 * Streaming proxy handler
 */
export async function handleStreamingProxiedRequest(req: ProxyRequest, res: Response) {
  if (!req.isProxied || req.targetProvider !== 'llama') {
    throw new Error('Invalid proxy request');
  }

  try {
    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Transform request
    const transformedRequest = transformClaudeToLlamaRequest(req.body);
    transformedRequest.parameters = {
      ...transformedRequest.parameters,
      incremental_output: true
    };

    // Get Llama configuration
    const llamaConfig = proxyConfig.providers.llama;

    // Make streaming request
    const response = await axios.post(
      `${llamaConfig.baseUrl}/services/aigc/text-generation/generation`,
      transformedRequest,
      {
        headers: llamaConfig.headers,
        responseType: 'stream',
        timeout: 300000
      }
    );

    // Process streaming response
    // FIX: Track if response has ended to prevent writing to closed response
    let responseEnded = false;

    response.data.on('data', (chunk: Buffer) => {
      // FIX: Early return if response already ended to prevent write errors
      if (responseEnded || res.writableEnded) {
        return;
      }

      const lines = chunk.toString().split('\n').filter(line => line.trim());

      for (const line of lines) {
        // FIX: Check again in loop since we might have ended during iteration
        if (responseEnded || res.writableEnded) {
          return;
        }

        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();

          if (data === '[DONE]') {
            responseEnded = true;
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