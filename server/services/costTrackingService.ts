import { EventEmitter } from 'events';
import { db } from '../database/connection.js';
import { aiProviderManager, AIProvider } from '../config/aiProviders.js';
import { logger } from '../utils/logger.js';
import { telemetryService } from './telemetryService.js';
import { telemetryManager } from '../config/telemetry.js';
import axios from 'axios';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  provider: AIProvider;
  timestamp: Date;
  taskId?: string;
  farmId?: string;
  agentId?: string;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  provider: AIProvider;
  model: string;
  currency: string;
  timestamp: Date;
}

export interface ProviderPricing {
  provider: AIProvider;
  models: {
    [modelName: string]: {
      name: string;
      inputPricePerMillion: number;
      outputPricePerMillion: number;
      contextWindow: number;
      description?: string;
      active: boolean;
      lastUpdated: Date;
    };
  };
}

export interface RealTimeCostMetrics {
  currentSession: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    apiCalls: number;
    startTime: Date;
    provider: AIProvider;
    model: string;
  };
  hourlyCost: number;
  dailyCost: number;
  monthlyCost: number;
  projectedMonthlyCost: number;
  costPerTask: number;
  costPerAgent: { [agentId: string]: number };
  costPerFarm: { [farmId: string]: number };
  comparisonWithAlternative?: {
    currentProvider: AIProvider;
    alternativeProvider: AIProvider;
    currentCost: number;
    alternativeCost: number;
    potentialSavings: number;
    savingsPercentage: number;
  };
}

class CostTrackingService extends EventEmitter {
  private tokenUsageCache: Map<string, TokenUsage[]> = new Map();
  private costCache: Map<string, CostCalculation[]> = new Map();
  private pricingData: Map<AIProvider, ProviderPricing> = new Map();
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.initializePricingData();
    this.startMetricsUpdater();
  }

  /**
   * Initialize pricing data for all providers
   * Dynamically fetches latest pricing when possible
   */
  private async initializePricingData(): Promise<void> {
    // Claude pricing (as of 2025)
    const claudePricing: ProviderPricing = {
      provider: AIProvider.CLAUDE,
      models: {
        'claude-3-opus-20240229': {
          name: 'Claude 3 Opus',
          inputPricePerMillion: 15.00,
          outputPricePerMillion: 75.00,
          contextWindow: 200000,
          description: 'Most capable model for complex tasks',
          active: true,
          lastUpdated: new Date()
        },
        'claude-3-5-sonnet-20241022': {
          name: 'Claude 3.5 Sonnet',
          inputPricePerMillion: 3.00,
          outputPricePerMillion: 15.00,
          contextWindow: 200000,
          description: 'Balanced performance and cost',
          active: true,
          lastUpdated: new Date()
        },
        'claude-3-5-sonnet-20240620': {
          name: 'Claude 3.5 Sonnet (June)',
          inputPricePerMillion: 3.00,
          outputPricePerMillion: 15.00,
          contextWindow: 200000,
          description: 'Previous Sonnet version',
          active: true,
          lastUpdated: new Date()
        },
        'claude-3-haiku-20240307': {
          name: 'Claude 3 Haiku',
          inputPricePerMillion: 0.25,
          outputPricePerMillion: 1.25,
          contextWindow: 200000,
          description: 'Fast and cost-effective',
          active: true,
          lastUpdated: new Date()
        },
        'claude-2.1': {
          name: 'Claude 2.1',
          inputPricePerMillion: 8.00,
          outputPricePerMillion: 24.00,
          contextWindow: 200000,
          description: 'Legacy model',
          active: false,
          lastUpdated: new Date()
        },
        'claude-instant-1.2': {
          name: 'Claude Instant 1.2',
          inputPricePerMillion: 0.80,
          outputPricePerMillion: 2.40,
          contextWindow: 100000,
          description: 'Legacy instant model',
          active: false,
          lastUpdated: new Date()
        }
      }
    };

    // Qwen pricing (estimated based on typical China AI pricing)
    const qwenPricing: ProviderPricing = {
      provider: AIProvider.QWEN,
      models: {
        'qwen-coder-480b': {
          name: 'Qwen3-Coder 480B',
          inputPricePerMillion: 0.50,  // Estimated competitive pricing
          outputPricePerMillion: 2.00,
          contextWindow: 256000,
          description: '480B parameter coding model',
          active: true,
          lastUpdated: new Date()
        },
        'qwen-max': {
          name: 'Qwen-Max',
          inputPricePerMillion: 2.00,
          outputPricePerMillion: 10.00,
          contextWindow: 32000,
          description: 'Most capable Qwen model',
          active: true,
          lastUpdated: new Date()
        },
        'qwen-plus': {
          name: 'Qwen-Plus',
          inputPricePerMillion: 0.20,
          outputPricePerMillion: 1.00,
          contextWindow: 32000,
          description: 'Balanced Qwen model',
          active: true,
          lastUpdated: new Date()
        },
        'qwen-turbo': {
          name: 'Qwen-Turbo',
          inputPricePerMillion: 0.10,
          outputPricePerMillion: 0.50,
          contextWindow: 8000,
          description: 'Fast and economical',
          active: true,
          lastUpdated: new Date()
        }
      }
    };

    this.pricingData.set(AIProvider.CLAUDE, claudePricing);
    this.pricingData.set(AIProvider.QWEN, qwenPricing);

    // Try to fetch latest pricing from APIs if available
    await this.updatePricingFromAPIs();
  }

  /**
   * Attempt to fetch latest pricing from provider APIs
   */
  private async updatePricingFromAPIs(): Promise<void> {
    try {
      // In the future, when Anthropic provides a pricing API:
      // const claudePricing = await this.fetchAnthropicPricing();
      // For now, we'll use hardcoded values
      
      logger.info('Cost tracking service initialized with latest pricing data');
    } catch (error) {
      logger.error('Failed to update pricing from APIs:', error);
    }
  }

  /**
   * Track token usage from an API response
   * Enhanced with OpenTelemetry integration
   */
  async trackTokenUsage(usage: TokenUsage, sessionId?: string): Promise<CostCalculation> {
    const startTime = Date.now();
    
    try {
      // Store token usage
      const cacheKey = usage.farmId || usage.agentId || 'global';
      if (!this.tokenUsageCache.has(cacheKey)) {
        this.tokenUsageCache.set(cacheKey, []);
      }
      this.tokenUsageCache.get(cacheKey)!.push(usage);

      // Calculate cost
      const cost = this.calculateCost(usage);
      
      // Store cost calculation
      if (!this.costCache.has(cacheKey)) {
        this.costCache.set(cacheKey, []);
      }
      this.costCache.get(cacheKey)!.push(cost);

      // Store in database
      await this.persistTokenUsage(usage, cost);

      // Track via OpenTelemetry if enabled
      if (telemetryManager.isEnabled()) {
        telemetryService.trackTokenUsage(usage, cost, sessionId);
        
        // Track the tracking operation performance
        const duration = Date.now() - startTime;
        telemetryService.trackApiCall(
          usage.provider,
          usage.model,
          duration,
          true
        );
      }

      // Emit real-time update
      const metrics = await this.getRealTimeMetrics();
      this.emit('cost:update', {
        usage,
        cost,
        metrics
      });

      // Emit telemetry-specific event
      this.emit('cost:telemetry', {
        usage,
        cost,
        sessionId,
        timestamp: new Date()
      });

      return cost;
    } catch (error) {
      // Track error via telemetry
      if (telemetryManager.isEnabled()) {
        const duration = Date.now() - startTime;
        telemetryService.trackApiCall(
          usage.provider,
          usage.model,
          duration,
          false,
          error as Error
        );
      }
      
      logger.error('Failed to track token usage:', error);
      throw error;
    }
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(usage: TokenUsage): CostCalculation {
    const pricing = this.pricingData.get(usage.provider);
    if (!pricing) {
      throw new Error(`No pricing data available for provider: ${usage.provider}`);
    }

    const modelPricing = pricing.models[usage.model];
    if (!modelPricing) {
      // Fallback to default model for provider
      const defaultModel = Object.values(pricing.models).find(m => m.active);
      if (!defaultModel) {
        throw new Error(`No pricing data available for model: ${usage.model}`);
      }
      logger.warn(`Using default pricing for unknown model: ${usage.model}`);
    }

    const priceInfo = modelPricing || Object.values(pricing.models).find(m => m.active)!;
    
    const inputCost = (usage.inputTokens / 1_000_000) * priceInfo.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * priceInfo.outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      provider: usage.provider,
      model: usage.model,
      currency: 'USD',
      timestamp: usage.timestamp
    };
  }

  /**
   * Calculate alternative provider cost for comparison
   */
  calculateAlternativeCost(usage: TokenUsage, alternativeProvider: AIProvider): CostCalculation {
    const alternativeUsage = { ...usage, provider: alternativeProvider };
    
    // For Qwen, adjust the model mapping
    if (alternativeProvider === AIProvider.QWEN) {
      // Map Claude models to comparable Qwen models
      const modelMapping: { [key: string]: string } = {
        'claude-3-opus-20240229': 'qwen-max',
        'claude-3-5-sonnet-20241022': 'qwen-coder-480b',
        'claude-3-5-sonnet-20240620': 'qwen-coder-480b',
        'claude-3-haiku-20240307': 'qwen-turbo',
        'claude-2.1': 'qwen-plus',
        'claude-instant-1.2': 'qwen-turbo'
      };
      alternativeUsage.model = modelMapping[usage.model] || 'qwen-coder-480b';
    } else if (alternativeProvider === AIProvider.CLAUDE) {
      // Map Qwen models to comparable Claude models
      const modelMapping: { [key: string]: string } = {
        'qwen-coder-480b': 'claude-3-5-sonnet-20241022',
        'qwen-max': 'claude-3-opus-20240229',
        'qwen-plus': 'claude-3-5-sonnet-20241022',
        'qwen-turbo': 'claude-3-haiku-20240307'
      };
      alternativeUsage.model = modelMapping[usage.model] || 'claude-3-5-sonnet-20241022';
    }

    return this.calculateCost(alternativeUsage);
  }

  /**
   * Get real-time cost metrics
   */
  async getRealTimeMetrics(): Promise<RealTimeCostMetrics> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get current session metrics
    const currentProvider = aiProviderManager.getDefaultProvider();
    const currentSession = await this.getCurrentSessionMetrics();

    // Calculate time-based costs
    const hourlyCost = await this.getCostsSince(hourAgo);
    const dailyCost = await this.getCostsSince(dayAgo);
    const monthlyCost = await this.getCostsSince(monthAgo);

    // Project monthly cost based on daily average
    const daysInMonth = 30;
    const projectedMonthlyCost = dailyCost * daysInMonth;

    // Calculate per-task and per-agent costs
    const taskCount = await this.getTaskCount(dayAgo);
    const costPerTask = taskCount > 0 ? dailyCost / taskCount : 0;

    const costPerAgent = await this.getCostPerAgent(dayAgo);
    const costPerFarm = await this.getCostPerFarm(dayAgo);

    // Calculate comparison with alternative provider
    const alternativeProvider = currentProvider === AIProvider.CLAUDE ? AIProvider.QWEN : AIProvider.CLAUDE;
    const comparisonMetrics = await this.calculateProviderComparison(
      currentProvider,
      alternativeProvider,
      dayAgo
    );

    return {
      currentSession,
      hourlyCost,
      dailyCost,
      monthlyCost,
      projectedMonthlyCost,
      costPerTask,
      costPerAgent,
      costPerFarm,
      comparisonWithAlternative: comparisonMetrics
    };
  }

  /**
   * Get current session metrics
   */
  private async getCurrentSessionMetrics() {
    const sessionStart = new Date(Date.now() - 60 * 60 * 1000); // Last hour
    const result = await db.query(`
      SELECT 
        COUNT(*) as api_calls,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(total_cost) as total_cost,
        provider,
        model
      FROM token_usage
      WHERE timestamp >= $1
      GROUP BY provider, model
      ORDER BY total_cost DESC
      LIMIT 1
    `, [sessionStart]).catch(() => ({ rows: [] }));

    const row = result.rows[0];
    if (!row) {
      const provider = aiProviderManager.getDefaultProvider();
      const config = aiProviderManager.getProvider(provider);
      return {
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        apiCalls: 0,
        startTime: sessionStart,
        provider,
        model: config.model
      };
    }

    return {
      totalCost: parseFloat(row.total_cost || 0),
      inputTokens: parseInt(row.input_tokens || 0),
      outputTokens: parseInt(row.output_tokens || 0),
      apiCalls: parseInt(row.api_calls || 0),
      startTime: sessionStart,
      provider: row.provider,
      model: row.model
    };
  }

  /**
   * Get total costs since a specific time
   */
  private async getCostsSince(since: Date): Promise<number> {
    const result = await db.query(`
      SELECT SUM(total_cost) as total
      FROM token_usage
      WHERE timestamp >= $1
    `, [since]).catch(() => ({ rows: [{ total: 0 }] }));

    return parseFloat(result.rows[0]?.total || 0);
  }

  /**
   * Get task count since a specific time
   */
  private async getTaskCount(since: Date): Promise<number> {
    const result = await db.query(`
      SELECT COUNT(DISTINCT task_id) as count
      FROM token_usage
      WHERE timestamp >= $1 AND task_id IS NOT NULL
    `, [since]).catch(() => ({ rows: [{ count: 0 }] }));

    return parseInt(result.rows[0]?.count || 0);
  }

  /**
   * Get cost per agent
   */
  private async getCostPerAgent(since: Date): Promise<{ [agentId: string]: number }> {
    const result = await db.query(`
      SELECT agent_id, SUM(total_cost) as cost
      FROM token_usage
      WHERE timestamp >= $1 AND agent_id IS NOT NULL
      GROUP BY agent_id
    `, [since]).catch(() => ({ rows: [] }));

    const costPerAgent: { [agentId: string]: number } = {};
    for (const row of result.rows) {
      costPerAgent[row.agent_id] = parseFloat(row.cost);
    }
    return costPerAgent;
  }

  /**
   * Get cost per farm
   */
  private async getCostPerFarm(since: Date): Promise<{ [farmId: string]: number }> {
    const result = await db.query(`
      SELECT farm_id, SUM(total_cost) as cost
      FROM token_usage
      WHERE timestamp >= $1 AND farm_id IS NOT NULL
      GROUP BY farm_id
    `, [since]).catch(() => ({ rows: [] }));

    const costPerFarm: { [farmId: string]: number } = {};
    for (const row of result.rows) {
      costPerFarm[row.farm_id] = parseFloat(row.cost);
    }
    return costPerFarm;
  }

  /**
   * Calculate provider comparison metrics
   */
  private async calculateProviderComparison(
    currentProvider: AIProvider,
    alternativeProvider: AIProvider,
    since: Date
  ) {
    // Get all token usage for current provider
    const result = await db.query(`
      SELECT input_tokens, output_tokens, model
      FROM token_usage
      WHERE timestamp >= $1 AND provider = $2
    `, [since, currentProvider]).catch(() => ({ rows: [] }));

    if (result.rows.length === 0) {
      return undefined;
    }

    let currentTotalCost = 0;
    let alternativeTotalCost = 0;

    // Calculate costs for both providers
    for (const row of result.rows) {
      const usage: TokenUsage = {
        inputTokens: parseInt(row.input_tokens),
        outputTokens: parseInt(row.output_tokens),
        totalTokens: parseInt(row.input_tokens) + parseInt(row.output_tokens),
        model: row.model,
        provider: currentProvider,
        timestamp: new Date()
      };

      const currentCost = this.calculateCost(usage);
      const alternativeCost = this.calculateAlternativeCost(usage, alternativeProvider);

      currentTotalCost += currentCost.totalCost;
      alternativeTotalCost += alternativeCost.totalCost;
    }

    const potentialSavings = currentTotalCost - alternativeTotalCost;
    const savingsPercentage = currentTotalCost > 0 
      ? (potentialSavings / currentTotalCost) * 100 
      : 0;

    return {
      currentProvider,
      alternativeProvider,
      currentCost: currentTotalCost,
      alternativeCost: alternativeTotalCost,
      potentialSavings,
      savingsPercentage
    };
  }

  /**
   * Persist token usage to database
   */
  private async persistTokenUsage(usage: TokenUsage, cost: CostCalculation): Promise<void> {
    try {
      await db.query(`
        INSERT INTO token_usage (
          input_tokens, output_tokens, total_tokens, model, provider,
          timestamp, task_id, farm_id, agent_id, input_cost, output_cost,
          total_cost, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        usage.inputTokens, usage.outputTokens, usage.totalTokens,
        usage.model, usage.provider, usage.timestamp,
        usage.taskId, usage.farmId, usage.agentId,
        cost.inputCost, cost.outputCost, cost.totalCost, cost.currency
      ]).catch(() => {
        // If table doesn't exist, create it
        this.createTokenUsageTable();
      });
    } catch (error) {
      logger.error('Failed to persist token usage:', error);
    }
  }

  /**
   * Create token usage table if it doesn't exist
   */
  private async createTokenUsageTable(): Promise<void> {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS token_usage (
          id SERIAL PRIMARY KEY,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          model VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          task_id VARCHAR(255),
          farm_id VARCHAR(255),
          agent_id VARCHAR(255),
          input_cost DECIMAL(10, 6),
          output_cost DECIMAL(10, 6),
          total_cost DECIMAL(10, 6),
          currency VARCHAR(10) DEFAULT 'USD',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better query performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
        CREATE INDEX IF NOT EXISTS idx_token_usage_farm_id ON token_usage(farm_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id);
      `);

      logger.info('Token usage table created successfully');
    } catch (error) {
      logger.error('Failed to create token usage table:', error);
    }
  }

  /**
   * Start periodic metrics updater
   */
  private startMetricsUpdater(): void {
    // Update metrics every 30 seconds
    this.metricsUpdateInterval = setInterval(async () => {
      try {
        const metrics = await this.getRealTimeMetrics();
        this.emit('metrics:update', metrics);
      } catch (error) {
        logger.error('Failed to update metrics:', error);
      }
    }, 30000);
  }

  /**
   * Get pricing data for all providers
   */
  getPricingData(): Map<AIProvider, ProviderPricing> {
    return this.pricingData;
  }

  /**
   * Get historical cost data for analytics
   */
  async getHistoricalCostData(
    timeRange: { start: Date; end: Date },
    groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
  ) {
    const dateFormat = {
      hour: "DATE_TRUNC('hour', timestamp)",
      day: "DATE_TRUNC('day', timestamp)",
      week: "DATE_TRUNC('week', timestamp)",
      month: "DATE_TRUNC('month', timestamp)"
    };

    const result = await db.query(`
      SELECT 
        ${dateFormat[groupBy]} as period,
        provider,
        model,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(total_cost) as total_cost,
        COUNT(*) as api_calls
      FROM token_usage
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY period, provider, model
      ORDER BY period, provider, model
    `, [timeRange.start, timeRange.end]).catch(() => ({ rows: [] }));

    return result.rows.map(row => ({
      period: row.period,
      provider: row.provider,
      model: row.model,
      inputTokens: parseInt(row.input_tokens),
      outputTokens: parseInt(row.output_tokens),
      totalCost: parseFloat(row.total_cost),
      apiCalls: parseInt(row.api_calls)
    }));
  }

  /**
   * Export cost report as CSV or JSON
   * Enhanced with detailed metrics and custom formatting
   */
  async exportCostReport(
    timeRange: { start: Date; end: Date },
    format: 'csv' | 'json' | 'detailed_csv' = 'csv',
    options?: {
      includeMetadata?: boolean;
      groupBy?: 'hour' | 'day' | 'week' | 'month';
      includeOptimizations?: boolean;
    }
  ): Promise<string> {
    const data = await this.getHistoricalCostData(
      timeRange, 
      options?.groupBy || 'day'
    );

    if (format === 'json') {
      const exportData = {
        metadata: options?.includeMetadata ? {
          exportedAt: new Date().toISOString(),
          timeRange,
          totalRecords: data.length,
          totalCost: data.reduce((sum, row) => sum + row.totalCost, 0),
          totalTokens: data.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0)
        } : undefined,
        data,
        optimizations: options?.includeOptimizations ? await this.generateOptimizationReport(timeRange) : undefined
      };
      return JSON.stringify(exportData, null, 2);
    }

    if (format === 'detailed_csv') {
      return this.generateDetailedCSV(data, timeRange, options);
    }

    // Standard CSV format
    const headers = ['Date', 'Provider', 'Model', 'Input Tokens', 'Output Tokens', 'Total Cost', 'API Calls'];
    const rows = data.map(row => [
      row.period.toISOString().split('T')[0],
      row.provider,
      row.model,
      row.inputTokens,
      row.outputTokens,
      row.totalCost.toFixed(4),
      row.apiCalls
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Generate detailed CSV with additional metrics and insights
   */
  private generateDetailedCSV(
    data: any[], 
    timeRange: { start: Date; end: Date },
    options?: any
  ): string {
    const headers = [
      'Date',
      'Provider', 
      'Model',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Total Cost',
      'Input Cost',
      'Output Cost',
      'API Calls',
      'Avg Cost Per Call',
      'Avg Cost Per Token',
      'Cost Efficiency Score'
    ];

    const rows = data.map(row => {
      const avgCostPerCall = row.apiCalls > 0 ? row.totalCost / row.apiCalls : 0;
      const totalTokens = row.inputTokens + row.outputTokens;
      const avgCostPerToken = totalTokens > 0 ? row.totalCost / totalTokens : 0;
      
      // Simple efficiency score: lower cost per token = higher score
      const efficiencyScore = avgCostPerToken > 0 ? Math.min(100, (1 / avgCostPerToken) * 1000) : 0;
      
      return [
        row.period.toISOString().split('T')[0],
        row.provider,
        row.model,
        row.inputTokens,
        row.outputTokens,
        totalTokens,
        row.totalCost.toFixed(4),
        (row.totalCost * 0.2).toFixed(4), // Estimated input cost (rough approximation)
        (row.totalCost * 0.8).toFixed(4), // Estimated output cost
        row.apiCalls,
        avgCostPerCall.toFixed(4),
        avgCostPerToken.toFixed(6),
        efficiencyScore.toFixed(2)
      ];
    });

    // Add metadata header
    const metadataRows = [
      ['# Cost Report - Generated ' + new Date().toISOString()],
      ['# Time Range: ' + timeRange.start.toISOString() + ' to ' + timeRange.end.toISOString()],
      ['# Total Records: ' + data.length],
      ['# Total Cost: $' + data.reduce((sum, row) => sum + row.totalCost, 0).toFixed(2)],
      [''],
      headers
    ];

    const allRows = [...metadataRows, ...rows];
    return allRows.map(row => row.join(',')).join('\n');
  }

  /**
   * Generate optimization report for export
   */
  private async generateOptimizationReport(timeRange: { start: Date; end: Date }) {
    const data = await this.getHistoricalCostData(timeRange, 'day');
    const totalCost = data.reduce((sum, row) => sum + row.totalCost, 0);
    const totalTokens = data.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
    
    // Provider analysis
    const providerCosts = data.reduce((acc, row) => {
      acc[row.provider] = (acc[row.provider] || 0) + row.totalCost;
      return acc;
    }, {} as { [provider: string]: number });

    // Model analysis
    const modelCosts = data.reduce((acc, row) => {
      acc[row.model] = (acc[row.model] || 0) + row.totalCost;
      return acc;
    }, {} as { [model: string]: number });

    return {
      summary: {
        totalCost,
        totalTokens,
        avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
        avgDailyCost: totalCost / Math.max(1, data.length)
      },
      providerBreakdown: providerCosts,
      modelBreakdown: modelCosts,
      recommendations: [
        totalCost > 100 ? 'Consider implementing cost controls' : null,
        Object.keys(providerCosts).length > 1 ? 'Evaluate provider switching opportunities' : null,
        totalTokens > 1000000 ? 'Consider prompt optimization to reduce token usage' : null
      ].filter(Boolean)
    };
  }

  /**
   * Schedule automated CSV exports
   */
  scheduleExport(
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly';
      time: string; // HH:MM format
      format: 'csv' | 'json' | 'detailed_csv';
      email?: string;
      webhook?: string;
      enabled: boolean;
    }
  ): string {
    const scheduleId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // In a real implementation, this would use a job scheduler like node-cron
    // For now, we'll just log the schedule creation
    logger.info('Export schedule created', {
      scheduleId,
      frequency: schedule.frequency,
      time: schedule.time,
      format: schedule.format
    });

    // Store schedule in memory (in production, this should be persisted)
    // This is a simplified implementation
    this.emit('export:scheduled', {
      scheduleId,
      schedule,
      createdAt: new Date()
    });

    return scheduleId;
  }

  /**
   * Execute scheduled export
   */
  async executeScheduledExport(scheduleId: string): Promise<void> {
    try {
      // This would retrieve the schedule from persistent storage
      // For now, we'll generate a sample export
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
      
      const report = await this.exportCostReport(
        { start, end },
        'detailed_csv',
        {
          includeMetadata: true,
          includeOptimizations: true
        }
      );

      // In production, this would send the report via email or webhook
      logger.info('Scheduled export executed', {
        scheduleId,
        reportSize: report.length,
        generatedAt: new Date()
      });

      this.emit('export:completed', {
        scheduleId,
        reportSize: report.length,
        completedAt: new Date()
      });

    } catch (error) {
      logger.error('Failed to execute scheduled export:', error);
      this.emit('export:failed', {
        scheduleId,
        error: error.message,
        failedAt: new Date()
      });
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const costTrackingService = new CostTrackingService();