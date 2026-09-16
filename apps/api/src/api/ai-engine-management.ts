/**
 * AI Engine Management API Endpoints
 * Handles version management, model selection, and cost tracking for AI providers
 *
 * Endpoints:
 * - GET    /api/ai-engines/status           - Get status of all engines
 * - GET    /api/ai-engines/:provider/version - Get version info for provider
 * - GET    /api/ai-engines/:provider/models  - Get available models
 * - POST   /api/ai-engines/:provider/model   - Change active model
 * - POST   /api/ai-engines/:provider/upgrade - Upgrade engine version
 * - POST   /api/ai-engines/:provider/validate- Validate API key
 * - GET    /api/ai-engines/costs             - Get cost metrics
 * - GET    /api/ai-engines/costs/:provider   - Get provider-specific costs
 *
 * @module api/ai-engine-management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { aiEngineManagementService } from '../services/AIEngineManagementService';
import { aiProviderManager } from '../config/aiProviders';
import { logger } from '../utils/logger';
import { db } from '../database/connection';

const router = Router();

/**
 * Request validation schemas
 */
const ModelChangeSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  validateCompatibility: z.boolean().optional().default(true)
});

const EngineUpgradeSchema = z.object({
  targetVersion: z.string().min(1, 'Target version is required'),
  forceUpgrade: z.boolean().optional().default(false),
  backupConfig: z.boolean().optional().default(true)
});

const ValidateApiKeySchema = z.object({
  apiKey: z.string().min(10, 'Valid API key is required')
});

const parseCapabilities = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      const parts = value.split(',').map(part => part.trim()).filter(Boolean);
      if (parts.length > 0) {
        return parts;
      }
    }
  }

  return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  return undefined;
};

const ModelFilterSchema = z.object({
  capabilities: z.preprocess(parseCapabilities, z.array(z.string())).optional(),
  maxCostPerRequest: z.preprocess(parseNumber, z.number()).optional(),
  minContextWindow: z.preprocess(parseNumber, z.number()).optional(),
  includeDeprecated: z.preprocess(parseBoolean, z.boolean()).optional()
});

/**
 * GET /api/ai-engines/status
 * Get status of all AI engines
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const providers = aiProviderManager.getAllProviders();

    const status = await Promise.all(
      providers.map(async (config) => {
        let version;

        if (config.provider === 'claude' || config.provider === 'openai') {
          version = await aiEngineManagementService.getCurrentVersion(
            config.provider === 'claude' ? 'claude' : 'openai'
          );
        } else {
          version = {
            current: config.model,
            latest: config.model,
            releaseDate: new Date().toISOString().split('T')[0],
            isDeprecated: false,
            updateAvailable: false
          };
        }

        return {
          provider: config.provider,
          enabled: config.enabled,
          isLocal: config.isLocal ?? false,
          model: config.model,
          version,
          contextWindow: config.contextWindow,
          apiEndpoint: config.apiEndpoint,
          hasApiKey: !!config.apiKey && config.apiKey.length > 0
        };
      })
    );

    res.json({
      success: true,
      engines: status,
      defaultProvider: aiProviderManager.getDefaultProvider(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get engine status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve engine status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai-engines/:provider/version
 * Get version information for a specific provider
 */
router.get('/:provider/version', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    const version = await aiEngineManagementService.getCurrentVersion(provider);

    res.json({
      success: true,
      provider,
      version,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to get version for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve version information',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai-engines/:provider/models
 * Get available models for a provider
 */
router.get('/:provider/models', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    // Parse query parameters for filtering
    const parsedFilters = ModelFilterSchema.safeParse(req.query);

    if (!parsedFilters.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filter parameters',
        details: parsedFilters.error.errors
      });
    }

    const filterInput = parsedFilters.data || {};
    const filter = {
      ...filterInput,
      includeDeprecated: filterInput.includeDeprecated ?? false
    };

    const modelsResponse = await aiEngineManagementService.getAvailableModels(
      provider,
      filter
    );

    res.json({
      success: true,
      ...modelsResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to get models for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve available models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai-engines/:provider/model
 * Change the active model for a provider
 */
router.post('/:provider/model', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    const validated = ModelChangeSchema.parse(req.body);

    const result = await aiEngineManagementService.changeModel({
      provider,
      ...validated
    });

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to change model for ${req.params.provider}:`, error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to change model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai-engines/:provider/upgrade
 * Upgrade engine version for a provider
 */
router.post('/:provider/upgrade', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    const validated = EngineUpgradeSchema.parse(req.body);

    const result = await aiEngineManagementService.upgradeEngine({
      provider,
      ...validated
    });

    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to upgrade engine for ${req.params.provider}:`, error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upgrade engine',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai-engines/:provider/validate
 * Validate API key for a provider
 */
router.post('/:provider/validate', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    const { apiKey } = ValidateApiKeySchema.parse(req.body);

    // Test API key with a minimal request
    let isValid = false;
    let errorMessage: string | undefined;

    if (provider === 'claude') {
      try {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-haiku-20240307',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }]
          },
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            timeout: 10000
          }
        );
        isValid = response.status === 200;
      } catch (error: any) {
        if (error.response?.status === 401) {
          errorMessage = 'Invalid API key';
        } else if (error.response?.status === 403) {
          errorMessage = 'API key does not have required permissions';
        } else {
          errorMessage = error.message;
        }
      }
    } else if (provider === 'openai') {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        isValid = response.status === 200;
      } catch (error: any) {
        if (error.response?.status === 401) {
          errorMessage = 'Invalid API key';
        } else if (error.response?.status === 403) {
          errorMessage = 'API key does not have required permissions';
        } else {
          errorMessage = error.message;
        }
      }
    }

    res.json({
      success: true,
      provider,
      valid: isValid,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to validate API key for ${req.params.provider}:`, error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to validate API key',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai-engines/costs
 * Get cost metrics for all providers
 */
router.get('/costs', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    // Build query based on date range
    let query = `
      SELECT
        provider,
        model,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_cost) as total_cost,
        COUNT(*) as request_count,
        DATE_TRUNC($1, timestamp) as period
      FROM ai_api_usage
      WHERE 1=1
    `;

    const params: any[] = [groupBy];

    if (startDate) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ' GROUP BY provider, model, period ORDER BY period DESC, total_cost DESC';

    const result = await db.query(query, params);

    // Calculate summary statistics
    const summary = {
      totalCost: result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost), 0),
      totalRequests: result.rows.reduce((sum, row) => sum + parseInt(row.request_count), 0),
      totalInputTokens: result.rows.reduce((sum, row) => sum + parseInt(row.total_input_tokens), 0),
      totalOutputTokens: result.rows.reduce((sum, row) => sum + parseInt(row.total_output_tokens), 0)
    };

    // Group by provider
    const byProvider = result.rows.reduce((acc: any, row) => {
      if (!acc[row.provider]) {
        acc[row.provider] = {
          provider: row.provider,
          totalCost: 0,
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          models: []
        };
      }

      acc[row.provider].totalCost += parseFloat(row.total_cost);
      acc[row.provider].totalRequests += parseInt(row.request_count);
      acc[row.provider].totalInputTokens += parseInt(row.total_input_tokens);
      acc[row.provider].totalOutputTokens += parseInt(row.total_output_tokens);

      acc[row.provider].models.push({
        model: row.model,
        cost: parseFloat(row.total_cost),
        requests: parseInt(row.request_count),
        inputTokens: parseInt(row.total_input_tokens),
        outputTokens: parseInt(row.total_output_tokens),
        period: row.period
      });

      return acc;
    }, {});

    res.json({
      success: true,
      summary,
      byProvider: Object.values(byProvider),
      details: result.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get cost metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ai-engines/costs/:provider
 * Get cost metrics for a specific provider
 */
router.get('/costs/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (provider !== 'claude' && provider !== 'openai') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider',
        message: 'Provider must be either "claude" or "openai"'
      });
    }

    let query = `
      SELECT
        provider,
        model,
        farm_id,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_cost) as total_cost,
        COUNT(*) as request_count,
        DATE_TRUNC($1, timestamp) as period
      FROM ai_api_usage
      WHERE provider = $2
    `;

    const params: any[] = [groupBy, provider];

    if (startDate) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ' GROUP BY provider, model, farm_id, period ORDER BY period DESC, total_cost DESC';

    const result = await db.query(query, params);

    // Calculate summary
    const summary = {
      provider,
      totalCost: result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost), 0),
      totalRequests: result.rows.reduce((sum, row) => sum + parseInt(row.request_count), 0),
      totalInputTokens: result.rows.reduce((sum, row) => sum + parseInt(row.total_input_tokens), 0),
      totalOutputTokens: result.rows.reduce((sum, row) => sum + parseInt(row.total_output_tokens), 0),
      averageCostPerRequest: 0
    };

    summary.averageCostPerRequest = summary.totalRequests > 0
      ? summary.totalCost / summary.totalRequests
      : 0;

    // Group by model
    const byModel = result.rows.reduce((acc: any, row) => {
      if (!acc[row.model]) {
        acc[row.model] = {
          model: row.model,
          totalCost: 0,
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          farms: []
        };
      }

      acc[row.model].totalCost += parseFloat(row.total_cost);
      acc[row.model].totalRequests += parseInt(row.request_count);
      acc[row.model].totalInputTokens += parseInt(row.total_input_tokens);
      acc[row.model].totalOutputTokens += parseInt(row.total_output_tokens);

      if (row.farm_id) {
        acc[row.model].farms.push({
          farmId: row.farm_id,
          cost: parseFloat(row.total_cost),
          requests: parseInt(row.request_count),
          period: row.period
        });
      }

      return acc;
    }, {});

    res.json({
      success: true,
      summary,
      byModel: Object.values(byModel),
      details: result.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to get cost metrics for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
