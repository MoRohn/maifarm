import { Router, Request, Response } from 'express';
import { costTrackingService } from '../services/costTrackingService.js';
import { aiProviderManager, AIProvider } from '../config/aiProviders.js';
import { authenticateToken as authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Apply authentication to all cost tracking routes
router.use(authenticate);

/**
 * GET /api/cost-tracking/pricing
 * Get current pricing data for all providers
 */
router.get('/pricing', async (req: Request, res: Response) => {
  try {
    const pricingData = costTrackingService.getPricingData();
    const formattedPricing = Array.from(pricingData.entries()).map(([provider, pricing]) => ({
      provider,
      models: Object.entries(pricing.models).map(([key, model]) => ({
        key,
        ...model
      }))
    }));

    res.json({
      success: true,
      data: formattedPricing
    });
  } catch (error: any) {
    logger.error('Error fetching pricing data:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch pricing data',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/metrics
 * Get real-time cost metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await costTrackingService.getRealTimeMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    logger.error('Error fetching cost metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch cost metrics',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/cost-tracking/track
 * Track token usage from an API call
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    const {
      inputTokens,
      outputTokens,
      model,
      provider,
      taskId,
      farmId,
      agentId
    } = req.body;

    // Validate required fields
    if (!inputTokens || !outputTokens || !model || !provider) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields',
          required: ['inputTokens', 'outputTokens', 'model', 'provider']
        }
      });
    }

    const tokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model,
      provider: provider as AIProvider,
      timestamp: new Date(),
      taskId,
      farmId,
      agentId
    };

    const cost = await costTrackingService.trackTokenUsage(tokenUsage);

    res.json({
      success: true,
      data: {
        usage: tokenUsage,
        cost
      }
    });
  } catch (error: any) {
    logger.error('Error tracking token usage:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to track token usage',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/history
 * Get historical cost data
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { start, end, groupBy = 'day' } = req.query;
    
    const startDate = start ? new Date(start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end as string) : new Date();
    
    const data = await costTrackingService.getHistoricalCostData(
      { start: startDate, end: endDate },
      groupBy as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    logger.error('Error fetching historical cost data:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch historical cost data',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/cost-tracking/calculate
 * Calculate cost for given token usage without tracking
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { inputTokens, outputTokens, model, provider } = req.body;

    if (!inputTokens || !outputTokens || !model || !provider) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields',
          required: ['inputTokens', 'outputTokens', 'model', 'provider']
        }
      });
    }

    const usage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model,
      provider: provider as AIProvider,
      timestamp: new Date()
    };

    const cost = costTrackingService.calculateCost(usage);
    
    // Also calculate alternative provider cost
    const alternativeProvider = provider === AIProvider.CLAUDE ? AIProvider.QWEN : AIProvider.CLAUDE;
    const alternativeCost = costTrackingService.calculateAlternativeCost(usage, alternativeProvider);

    res.json({
      success: true,
      data: {
        currentCost: cost,
        alternativeCost,
        comparison: {
          savings: cost.totalCost - alternativeCost.totalCost,
          savingsPercentage: ((cost.totalCost - alternativeCost.totalCost) / cost.totalCost) * 100
        }
      }
    });
  } catch (error: any) {
    logger.error('Error calculating cost:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to calculate cost',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/export
 * Export cost report with enhanced options
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { 
      start, 
      end, 
      format = 'csv',
      includeMetadata = 'false',
      groupBy = 'day',
      includeOptimizations = 'false'
    } = req.query;
    
    const startDate = start ? new Date(start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end as string) : new Date();
    
    const report = await costTrackingService.exportCostReport(
      { start: startDate, end: endDate },
      format as 'csv' | 'json' | 'detailed_csv',
      {
        includeMetadata: includeMetadata === 'true',
        groupBy: groupBy as 'hour' | 'day' | 'week' | 'month',
        includeOptimizations: includeOptimizations === 'true'
      }
    );

    if (format === 'csv' || format === 'detailed_csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cost-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
    }

    res.send(report);
  } catch (error: any) {
    logger.error('Error exporting cost report:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to export cost report',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/optimization-tips
 * Get cost optimization recommendations
 */
router.get('/optimization-tips', async (req: Request, res: Response) => {
  try {
    const metrics = await costTrackingService.getRealTimeMetrics();
    const currentProvider = aiProviderManager.getDefaultProvider();
    
    const tips = [];

    // Provider switching recommendation
    if (metrics.comparisonWithAlternative && metrics.comparisonWithAlternative.savingsPercentage > 20) {
      tips.push({
        priority: 'high',
        category: 'provider',
        title: `Switch to ${metrics.comparisonWithAlternative.alternativeProvider} for significant savings`,
        description: `You could save ${metrics.comparisonWithAlternative.savingsPercentage.toFixed(1)}% by switching providers`,
        estimatedSavings: metrics.comparisonWithAlternative.potentialSavings,
        action: 'switch-provider'
      });
    }

    // Model optimization
    if (currentProvider === AIProvider.CLAUDE) {
      tips.push({
        priority: 'medium',
        category: 'model',
        title: 'Use Claude 3 Haiku for simple tasks',
        description: 'Haiku is 80% cheaper than Sonnet for basic operations',
        estimatedSavings: metrics.dailyCost * 0.3,
        action: 'optimize-model-selection'
      });
    }

    // Caching recommendation
    tips.push({
      priority: 'medium',
      category: 'caching',
      title: 'Implement response caching',
      description: 'Cache frequent queries to reduce API calls',
      estimatedSavings: metrics.dailyCost * 0.15,
      action: 'implement-caching'
    });

    // Batch processing
    tips.push({
      priority: 'low',
      category: 'batching',
      title: 'Batch similar requests',
      description: 'Process multiple similar tasks in single API calls',
      estimatedSavings: metrics.dailyCost * 0.1,
      action: 'enable-batching'
    });

    // Token optimization
    tips.push({
      priority: 'low',
      category: 'tokens',
      title: 'Optimize prompt length',
      description: 'Reduce prompt verbosity without losing context',
      estimatedSavings: metrics.dailyCost * 0.08,
      action: 'optimize-prompts'
    });

    res.json({
      success: true,
      data: {
        tips,
        totalPotentialSavings: tips.reduce((sum, tip) => sum + (tip.estimatedSavings || 0), 0),
        currentDailyCost: metrics.dailyCost
      }
    });
  } catch (error: any) {
    logger.error('Error generating optimization tips:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to generate optimization tips',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/cost-tracking/schedule-export
 * Schedule automated cost report exports
 */
router.post('/schedule-export', async (req: Request, res: Response) => {
  try {
    const { frequency, time, format, email, webhook, enabled } = req.body;

    if (!frequency || !time || !format) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields',
          required: ['frequency', 'time', 'format']
        }
      });
    }

    const scheduleId = costTrackingService.scheduleExport({
      frequency,
      time,
      format,
      email,
      webhook,
      enabled: enabled !== false
    });

    res.json({
      success: true,
      data: {
        scheduleId,
        message: 'Export schedule created successfully'
      }
    });
  } catch (error: any) {
    logger.error('Error scheduling export:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to schedule export',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/telemetry/stats
 * Get telemetry statistics
 */
router.get('/telemetry/stats', async (req: Request, res: Response) => {
  try {
    const { telemetryService } = await import('../services/telemetryService.js');
    const stats = telemetryService.getStatistics();
    const activeSessions = telemetryService.getActiveSessions();

    res.json({
      success: true,
      data: {
        ...stats,
        activeSessions: activeSessions.length,
        sessionIds: activeSessions
      }
    });
  } catch (error: any) {
    logger.error('Error fetching telemetry stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch telemetry statistics',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/telemetry/sessions/:sessionId
 * Get session-specific telemetry metrics
 */
router.get('/telemetry/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { telemetryService } = await import('../services/telemetryService.js');
    const metrics = telemetryService.getSessionMetrics(sessionId);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Session not found',
          sessionId
        }
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    logger.error('Error fetching session metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch session metrics',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/cost-tracking/alerts/budget-rules
 * Create a new budget rule
 */
router.post('/alerts/budget-rules', async (req: Request, res: Response) => {
  try {
    const { alertingService } = await import('../services/alertingService.js');
    const rule = await alertingService.createBudgetRule(req.body);

    res.json({
      success: true,
      data: rule
    });
  } catch (error: any) {
    logger.error('Error creating budget rule:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create budget rule',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/alerts/budget-rules
 * Get all budget rules
 */
router.get('/alerts/budget-rules', async (req: Request, res: Response) => {
  try {
    const { scope, scopeId } = req.query;
    const { alertingService } = await import('../services/alertingService.js');
    const rules = alertingService.getBudgetRules(
      scope as string,
      scopeId as string
    );

    res.json({
      success: true,
      data: rules
    });
  } catch (error: any) {
    logger.error('Error fetching budget rules:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch budget rules',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/cost-tracking/alerts/active
 * Get active cost alerts
 */
router.get('/alerts/active', async (req: Request, res: Response) => {
  try {
    const { alertingService } = await import('../services/alertingService.js');
    const alerts = alertingService.getActiveAlerts();

    res.json({
      success: true,
      data: alerts
    });
  } catch (error: any) {
    logger.error('Error fetching active alerts:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch active alerts',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/cost-tracking/alerts/:alertId/acknowledge
 * Acknowledge a cost alert
 */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { alertingService } = await import('../services/alertingService.js');
    
    await alertingService.acknowledgeAlert(alertId);

    res.json({
      success: true,
      message: 'Alert acknowledged successfully'
    });
  } catch (error: any) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to acknowledge alert',
        details: error.message
      }
    });
  }
});

export default router;