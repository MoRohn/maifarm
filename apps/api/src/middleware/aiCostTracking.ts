/**
 * AI Cost Tracking Middleware
 * Automatically tracks all AI API usage with accurate token counts and costs
 *
 * This middleware intercepts AI provider responses and logs:
 * - Token usage (from provider responses)
 * - Calculated costs based on model pricing
 * - Request metadata (farm, agent, timestamps)
 * - Error tracking
 *
 * Best practices:
 * - Always use token counts from provider responses (most accurate)
 * - Never estimate token counts - providers return exact values
 * - Log every API call, even errors (for budget tracking)
 * - Use database transactions for consistency
 *
 * @module middleware/aiCostTracking
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { aiEngineManagementService } from '../services/AIEngineManagementService';

/**
 * AI API Call Data
 */
export interface AIAPICallData {
  // Correlation
  farmId?: string;
  agentId?: string;
  userId?: number;
  requestId: string;

  // Provider info
  provider: 'claude' | 'openai';
  model: string;
  apiVersion?: string;

  // Token usage (from API response)
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // Costs
  inputCost: number;
  outputCost: number;
  totalCost: number;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;

  // Request metadata
  endpoint?: string;
  statusCode?: number;
  responseTimeMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Cost Tracking Service
 */
class CostTrackingService {
  private static instance: CostTrackingService;

  private constructor() {
    logger.info('CostTrackingService initialized');
  }

  public static getInstance(): CostTrackingService {
    if (!CostTrackingService.instance) {
      CostTrackingService.instance = new CostTrackingService();
    }
    return CostTrackingService.instance;
  }

  /**
   * Log AI API call to database
   */
  public async logAPICall(data: AIAPICallData): Promise<void> {
    try {
      await db.query(
        `INSERT INTO ai_api_usage (
          farm_id, agent_id, user_id, request_id,
          provider, model, api_version,
          input_tokens, output_tokens, total_tokens,
          input_cost, output_cost, total_cost,
          cost_per_1k_input_tokens, cost_per_1k_output_tokens,
          endpoint, status_code, response_time_ms, error_message,
          metadata, timestamp
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13,
          $14, $15,
          $16, $17, $18, $19,
          $20, NOW()
        )`,
        [
          data.farmId || null,
          data.agentId || null,
          data.userId || null,
          data.requestId,
          data.provider,
          data.model,
          data.apiVersion || null,
          data.inputTokens,
          data.outputTokens,
          data.totalTokens,
          data.inputCost,
          data.outputCost,
          data.totalCost,
          data.costPer1kInputTokens,
          data.costPer1kOutputTokens,
          data.endpoint || null,
          data.statusCode || null,
          data.responseTimeMs || null,
          data.errorMessage || null,
          data.metadata ? JSON.stringify(data.metadata) : null
        ]
      );

      logger.debug('AI API call logged', {
        requestId: data.requestId,
        provider: data.provider,
        model: data.model,
        totalCost: data.totalCost,
        totalTokens: data.totalTokens
      });

    } catch (error) {
      logger.error('Failed to log AI API call:', error);
      // Don't throw - cost tracking failure shouldn't break the application
    }
  }

  /**
   * Parse Claude API response and extract token usage
   */
  public parseClaudeResponse(response: any): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } {
    const usage = response.usage || {};

    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
    };
  }

  /**
   * Parse OpenAI API response and extract token usage
   */
  public parseOpenAIResponse(response: any): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } {
    const usage = response.usage || {};

    return {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
    };
  }

  /**
   * Calculate cost for API call
   */
  public calculateCost(
    provider: 'claude' | 'openai',
    model: string,
    inputTokens: number,
    outputTokens: number
  ): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    costPer1kInputTokens: number;
    costPer1kOutputTokens: number;
  } {
    // Get model info from service
    const modelInfo = aiEngineManagementService.getModelById(provider, model);

    if (!modelInfo) {
      logger.warn(`Model ${model} not found for provider ${provider}, using default pricing`);

      // Fallback pricing if model not found
      const fallbackPricing = {
        claude: {
          costPer1kInputTokens: 3.0,
          costPer1kOutputTokens: 15.0
        },
        openai: {
          costPer1kInputTokens: 10.0,
          costPer1kOutputTokens: 30.0
        }
      };

      const pricing = fallbackPricing[provider];

      const inputCost = (inputTokens / 1000) * pricing.costPer1kInputTokens;
      const outputCost = (outputTokens / 1000) * pricing.costPer1kOutputTokens;

      return {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
        costPer1kInputTokens: pricing.costPer1kInputTokens,
        costPer1kOutputTokens: pricing.costPer1kOutputTokens
      };
    }

    const inputCost = (inputTokens / 1000) * modelInfo.costPer1kPromptTokens;
    const outputCost = (outputTokens / 1000) * modelInfo.costPer1kCompletionTokens;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      costPer1kInputTokens: modelInfo.costPer1kPromptTokens,
      costPer1kOutputTokens: modelInfo.costPer1kCompletionTokens
    };
  }

  /**
   * Get cost summary for a scope
   */
  public async getCostSummary(
    scopeType: 'farm' | 'user' | 'global',
    scopeId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  }> {
    try {
      let query = `
        SELECT
          provider,
          model,
          SUM(total_cost) as total_cost,
          COUNT(*) as request_count,
          SUM(total_tokens) as total_tokens
        FROM ai_api_usage
        WHERE 1=1
      `;

      const params: any[] = [];

      // Scope filtering
      if (scopeType === 'farm' && scopeId) {
        query += ` AND farm_id = $${params.length + 1}`;
        params.push(scopeId);
      } else if (scopeType === 'user' && scopeId) {
        query += ` AND user_id = $${params.length + 1}`;
        params.push(parseInt(scopeId));
      }

      // Date filtering
      if (startDate) {
        query += ` AND timestamp >= $${params.length + 1}`;
        params.push(startDate);
      }
      if (endDate) {
        query += ` AND timestamp <= $${params.length + 1}`;
        params.push(endDate);
      }

      query += ' GROUP BY provider, model';

      const result = await db.query(query, params);

      // Aggregate results
      let totalCost = 0;
      let totalRequests = 0;
      let totalTokens = 0;
      const byProvider: Record<string, number> = {};
      const byModel: Record<string, number> = {};

      for (const row of result.rows) {
        const cost = parseFloat(row.total_cost);
        const requests = parseInt(row.request_count);
        const tokens = parseInt(row.total_tokens);

        totalCost += cost;
        totalRequests += requests;
        totalTokens += tokens;

        byProvider[row.provider] = (byProvider[row.provider] || 0) + cost;
        byModel[row.model] = (byModel[row.model] || 0) + cost;
      }

      return {
        totalCost,
        totalRequests,
        totalTokens,
        byProvider,
        byModel
      };

    } catch (error) {
      logger.error('Failed to get cost summary:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const costTrackingService = CostTrackingService.getInstance();

/**
 * Express middleware to track AI API calls
 *
 * Usage:
 * 1. After making an AI API call, store the response in req
 * 2. This middleware will extract tokens and log to database
 *
 * Example:
 *   const response = await aiProvider.sendRequest(...)
 *   req.aiApiResponse = response;
 *   // Middleware will automatically log it
 */
export function trackAICost(req: Request, res: Response, next: NextFunction) {
  // Store request start time
  const startTime = Date.now();

  // Capture the original json method
  const originalJson = res.json;

  // Override json method to intercept AI provider responses
  res.json = function (body: any): Response {
    // Check if this is an AI provider response
    if (req.path.includes('/claude') || req.path.includes('/openai') || req.path.includes('/providers')) {
      const responseTime = Date.now() - startTime;

      // Extract provider from path or body
      let provider: 'claude' | 'openai' | null = null;
      if (req.path.includes('claude')) provider = 'claude';
      else if (req.path.includes('openai')) provider = 'openai';

      // Extract token usage from response body
      let tokenUsage: any = null;
      let model: string | null = null;

      if (provider && body) {
        if (provider === 'claude') {
          tokenUsage = costTrackingService.parseClaudeResponse(body);
          model = body.model;
        } else if (provider === 'openai') {
          tokenUsage = costTrackingService.parseOpenAIResponse(body);
          model = body.model;
        }

        // Log the API call
        if (tokenUsage && model) {
          const costs = costTrackingService.calculateCost(
            provider,
            model,
            tokenUsage.inputTokens,
            tokenUsage.outputTokens
          );

          const callData: AIAPICallData = {
            farmId: (req as any).farmId || (req.body?.farmId),
            agentId: (req as any).agentId || (req.body?.agentId),
            userId: (req as any).user?.id,
            requestId: (req as any).correlationId || uuidv4(),
            provider,
            model,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            inputCost: costs.inputCost,
            outputCost: costs.outputCost,
            totalCost: costs.totalCost,
            costPer1kInputTokens: costs.costPer1kInputTokens,
            costPer1kOutputTokens: costs.costPer1kOutputTokens,
            endpoint: req.path,
            statusCode: res.statusCode,
            responseTimeMs: responseTime
          };

          // Log asynchronously (don't block response)
          costTrackingService.logAPICall(callData).catch(error => {
            logger.error('Failed to log AI API call in middleware:', error);
          });
        }
      }
    }

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Helper function to manually log AI API calls
 * Use this when you need to log AI API calls outside of HTTP middleware
 */
export async function logAIAPICall(
  provider: 'claude' | 'openai',
  model: string,
  response: any,
  metadata?: {
    farmId?: string;
    agentId?: string;
    userId?: number;
    endpoint?: string;
    responseTimeMs?: number;
  }
): Promise<void> {
  try {
    let tokenUsage: any;

    if (provider === 'claude') {
      tokenUsage = costTrackingService.parseClaudeResponse(response);
    } else {
      tokenUsage = costTrackingService.parseOpenAIResponse(response);
    }

    const costs = costTrackingService.calculateCost(
      provider,
      model,
      tokenUsage.inputTokens,
      tokenUsage.outputTokens
    );

    const callData: AIAPICallData = {
      ...metadata,
      requestId: uuidv4(),
      provider,
      model,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost,
      costPer1kInputTokens: costs.costPer1kInputTokens,
      costPer1kOutputTokens: costs.costPer1kOutputTokens
    };

    await costTrackingService.logAPICall(callData);

  } catch (error) {
    logger.error('Failed to log AI API call:', error);
    // Don't throw - cost tracking failure shouldn't break the application
  }
}
