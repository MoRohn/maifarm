import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { costTrackingService } from './costTrackingService';

export interface ProviderMetrics {
  // CRITICAL FIX: Added 'grok' to provider types
  provider: 'claude' | 'llama' | 'openai' | 'gpt_oss' | 'grok';
  availability: number; // 0-100%
  responseTime: number; // ms
  errorRate: number; // 0-100%
  costPerToken: number;
  currentLoad: number;
  successCount: number;
  failureCount: number;
  totalTokensUsed: number;
  rateLimit: {
    remaining: number;
    resetAt: Date;
    limit: number;
  };
  lastMeasured: Date;
}

export interface TaskRequirements {
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedTokens: number;
  maxCost?: number;
  minAvailability?: number;
  maxResponseTime?: number;
  preferredProvider?: string;
  fallbackProviders?: string[];
}

export interface ProviderScore {
  provider: string;
  score: number;
  factors: {
    availability: number;
    performance: number;
    cost: number;
    reliability: number;
  };
}

class ProviderMetricsService extends EventEmitter {
  private metrics: Map<string, ProviderMetrics> = new Map();
  private metricsHistory: Map<string, ProviderMetrics[]> = new Map();
  private readonly METRICS_UPDATE_INTERVAL = 30000; // 30 seconds
  private readonly HISTORY_RETENTION_COUNT = 100;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeMetrics();
    this.startMetricsCollection();
  }

  /**
   * Initialize metrics for all providers
   */
  private async initializeMetrics(): Promise<void> {
    // CRITICAL FIX: Added 'grok' to providers array
    const providers: ProviderMetrics['provider'][] = ['claude', 'llama', 'openai', 'gpt_oss', 'grok'];
    
    for (const provider of providers) {
      const metrics: ProviderMetrics = {
        provider,
        availability: 100,
        responseTime: 0,
        errorRate: 0,
        costPerToken: this.getBaseCostPerToken(provider),
        currentLoad: 0,
        successCount: 0,
        failureCount: 0,
        totalTokensUsed: 0,
        rateLimit: {
          remaining: this.getDefaultRateLimit(provider),
          resetAt: new Date(Date.now() + 3600000),
          limit: this.getDefaultRateLimit(provider)
        },
        lastMeasured: new Date()
      };

      this.metrics.set(provider, metrics);
      this.metricsHistory.set(provider, []);
    }

    // Load historical metrics from database
    await this.loadHistoricalMetrics();
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
    }, this.METRICS_UPDATE_INTERVAL);

    logger.info('[ProviderMetricsService] Started metrics collection');
  }

  /**
   * Collect metrics for all providers
   */
  async collectMetrics(): Promise<void> {
    for (const [provider, currentMetrics] of this.metrics) {
      try {
        // Collect real-time metrics
        const newMetrics = await this.collectProviderMetrics(provider as ProviderMetrics['provider']);
        
        // Update metrics
        this.metrics.set(provider, newMetrics);
        
        // Add to history
        const history = this.metricsHistory.get(provider) || [];
        history.push(newMetrics);
        
        // Limit history size
        if (history.length > this.HISTORY_RETENTION_COUNT) {
          history.shift();
        }
        
        this.metricsHistory.set(provider, history);
        
        // Persist to database
        await this.persistMetrics(newMetrics);
        
        // Emit update event
        this.emit('metrics:updated', { provider, metrics: newMetrics });
        
      } catch (error) {
        logger.error(`[ProviderMetricsService] Error collecting metrics for ${provider}:`, error);
      }
    }

    // Broadcast aggregated metrics
    websocketManager.broadcast('providers:metrics', {
      metrics: Array.from(this.metrics.values()),
      timestamp: new Date()
    });
  }

  /**
   * Collect metrics for a specific provider
   */
  private async collectProviderMetrics(provider: ProviderMetrics['provider']): Promise<ProviderMetrics> {
    const currentMetrics = this.metrics.get(provider) || this.createDefaultMetrics(provider);

    // Check provider health endpoint
    const healthCheck = await this.checkProviderHealth(provider);
    currentMetrics.availability = healthCheck.available ? 100 : 0;
    currentMetrics.responseTime = healthCheck.responseTime;

    // Get recent request statistics
    const stats = await this.getProviderStatistics(provider);
    currentMetrics.successCount = stats.successCount;
    currentMetrics.failureCount = stats.failureCount;
    currentMetrics.errorRate = stats.totalRequests > 0 
      ? (stats.failureCount / stats.totalRequests) * 100 
      : 0;

    // Get token usage and cost
    // NOTE: costTrackingService doesn't have getProviderUsage method
    // Using direct database query instead
    try {
      // Get usage from database directly
      const usageResult = await db.query(
        `SELECT SUM(total_tokens) as total_tokens, AVG(total_cost) as avg_cost 
         FROM token_usage 
         WHERE provider = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [provider]
      );
      
      currentMetrics.totalTokensUsed = parseInt(usageResult.rows[0]?.total_tokens || '0');
      currentMetrics.costPerToken = parseFloat(usageResult.rows[0]?.avg_cost || '0') || this.getBaseCostPerToken(provider);
    } catch (error) {
      // Fallback to default values if query fails
      currentMetrics.totalTokensUsed = 0;
      currentMetrics.costPerToken = this.getBaseCostPerToken(provider);
    }

    // Get current load (active agents using this provider)
    currentMetrics.currentLoad = await this.getProviderLoad(provider);

    // Update rate limits
    currentMetrics.rateLimit = await this.getProviderRateLimit(provider);

    currentMetrics.lastMeasured = new Date();

    return currentMetrics;
  }

  /**
   * Check provider health
   */
  private async checkProviderHealth(provider: string): Promise<{
    available: boolean;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Provider-specific health checks
      switch (provider) {
        case 'claude':
          // Check Anthropic API
          const claudeResponse = await fetch('https://api.anthropic.com/v1/health', {
            method: 'GET',
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY || ''
            },
            signal: AbortSignal.timeout(5000)
          });
          return {
            available: claudeResponse.ok,
            responseTime: Date.now() - startTime
          };

        case 'openai':
          // Check OpenAI API
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
            },
            signal: AbortSignal.timeout(5000)
          });
          return {
            available: openaiResponse.ok,
            responseTime: Date.now() - startTime
          };

        case 'llama':
          // Check Dashscope/Ollama
          if (process.env.LLAMA_USE_LOCAL === 'true') {
            const ollamaResponse = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/tags`, {
              signal: AbortSignal.timeout(5000)
            });
            return {
              available: ollamaResponse.ok,
              responseTime: Date.now() - startTime
            };
          } else {
            // Dashscope API check
            return {
              available: true, // Assume available for now
              responseTime: Date.now() - startTime
            };
          }

        case 'gpt_oss':
          // Check local/OSS model
          return {
            available: true,
            responseTime: Date.now() - startTime
          };

        // CRITICAL FIX: Added Grok (xAI) health check
        case 'grok':
          // Check xAI API
          const grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
          if (!grokApiKey) {
            return {
              available: false,
              responseTime: Date.now() - startTime
            };
          }
          const grokResponse = await fetch('https://api.x.ai/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${grokApiKey}`
            },
            signal: AbortSignal.timeout(5000)
          });
          return {
            available: grokResponse.ok,
            responseTime: Date.now() - startTime
          };

        default:
          return {
            available: false,
            responseTime: 0
          };
      }
    } catch (error) {
      logger.error(`[ProviderMetricsService] Health check failed for ${provider}:`, error);
      return {
        available: false,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get provider statistics from database
   */
  private async getProviderStatistics(provider: string): Promise<{
    successCount: number;
    failureCount: number;
    totalRequests: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as success_count,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failure_count,
          COUNT(*) as total_requests
        FROM tasks
        WHERE metadata->>'provider' = $1
          AND created_at > NOW() - INTERVAL '1 hour'
      `, [provider]);

      const row = result.rows[0];
      return {
        successCount: parseInt(row.success_count) || 0,
        failureCount: parseInt(row.failure_count) || 0,
        totalRequests: parseInt(row.total_requests) || 0
      };
    } catch (error) {
      logger.error(`[ProviderMetricsService] Error getting statistics for ${provider}:`, error);
      return { successCount: 0, failureCount: 0, totalRequests: 0 };
    }
  }

  /**
   * Get current provider load
   */
  private async getProviderLoad(provider: string): Promise<number> {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as active_agents
        FROM agents a
        JOIN farms f ON a.farm_id = f.id
        WHERE f.provider = $1
          AND a.status IN ('starting', 'ready', 'working')
      `, [provider]);

      return parseInt(result.rows[0].active_agents) || 0;
    } catch (error) {
      logger.error(`[ProviderMetricsService] Error getting load for ${provider}:`, error);
      return 0;
    }
  }

  /**
   * Get provider rate limit information
   */
  private async getProviderRateLimit(provider: string): Promise<ProviderMetrics['rateLimit']> {
    // This would be enhanced with actual API rate limit tracking
    // CRITICAL FIX: Added 'grok' to rate limit defaults
    const defaults = {
      claude: { limit: 100000, remaining: 100000, resetAt: new Date(Date.now() + 3600000) },
      openai: { limit: 10000, remaining: 10000, resetAt: new Date(Date.now() + 60000) },
      llama: { limit: 50000, remaining: 50000, resetAt: new Date(Date.now() + 3600000) },
      gpt_oss: { limit: 999999, remaining: 999999, resetAt: new Date(Date.now() + 86400000) },
      grok: { limit: 60000, remaining: 60000, resetAt: new Date(Date.now() + 60000) }
    };

    return defaults[provider] || { limit: 1000, remaining: 1000, resetAt: new Date(Date.now() + 3600000) };
  }

  /**
   * Get optimal provider based on requirements
   */
  async getOptimalProvider(requirements: TaskRequirements): Promise<string> {
    const scores = await this.scoreProviders(requirements);
    
    // Sort by score
    scores.sort((a, b) => b.score - a.score);
    
    // Filter by requirements
    const eligible = scores.filter(s => {
      const metrics = this.metrics.get(s.provider);
      if (!metrics) return false;
      
      if (requirements.minAvailability && metrics.availability < requirements.minAvailability) {
        return false;
      }
      
      if (requirements.maxResponseTime && metrics.responseTime > requirements.maxResponseTime) {
        return false;
      }
      
      if (requirements.maxCost) {
        const estimatedCost = metrics.costPerToken * requirements.estimatedTokens;
        if (estimatedCost > requirements.maxCost) {
          return false;
        }
      }
      
      return true;
    });

    // Return best eligible provider or fallback to preferred/default
    if (eligible.length > 0) {
      return eligible[0].provider;
    } else if (requirements.preferredProvider) {
      return requirements.preferredProvider;
    } else {
      return 'claude'; // Default fallback
    }
  }

  /**
   * Score providers based on requirements
   */
  private async scoreProviders(requirements: TaskRequirements): Promise<ProviderScore[]> {
    const scores: ProviderScore[] = [];

    for (const [provider, metrics] of this.metrics) {
      const score = this.calculateProviderScore(metrics, requirements);
      scores.push(score);
    }

    return scores;
  }

  /**
   * Calculate score for a provider
   */
  private calculateProviderScore(metrics: ProviderMetrics, requirements: TaskRequirements): ProviderScore {
    const factors = {
      availability: metrics.availability / 100,
      performance: Math.max(0, 1 - (metrics.responseTime / 5000)), // Normalize to 0-1
      cost: Math.max(0, 1 - (metrics.costPerToken * 10000)), // Normalize cost
      reliability: Math.max(0, 1 - (metrics.errorRate / 100))
    };

    // Weight factors based on requirements
    let weights = {
      availability: 0.25,
      performance: 0.25,
      cost: 0.25,
      reliability: 0.25
    };

    // Adjust weights based on priority
    if (requirements.priority === 'critical') {
      weights.availability = 0.4;
      weights.reliability = 0.4;
      weights.performance = 0.15;
      weights.cost = 0.05;
    } else if (requirements.priority === 'low') {
      weights.cost = 0.5;
      weights.performance = 0.1;
      weights.availability = 0.2;
      weights.reliability = 0.2;
    }

    // Calculate weighted score
    const score = 
      factors.availability * weights.availability +
      factors.performance * weights.performance +
      factors.cost * weights.cost +
      factors.reliability * weights.reliability;

    return {
      provider: metrics.provider,
      score: score * 100, // Convert to 0-100 scale
      factors
    };
  }

  /**
   * Get all provider metrics
   */
  async getAllMetrics(): Promise<ProviderMetrics[]> {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics for a specific provider
   */
  async getProviderMetrics(provider: string): Promise<ProviderMetrics | null> {
    return this.metrics.get(provider) || null;
  }

  /**
   * Get provider recommendations
   */
  async getProviderRecommendations(taskType: string): Promise<{
    primary: string;
    fallbacks: string[];
    reasons: string[];
  }> {
    const requirements: TaskRequirements = this.getTaskRequirements(taskType);
    const optimal = await this.getOptimalProvider(requirements);
    
    // Get fallback chain
    const fallbacks = await this.buildFallbackChain(optimal, requirements);
    
    // Generate reasoning
    const reasons = this.generateRecommendationReasons(optimal, this.metrics.get(optimal)!);

    return {
      primary: optimal,
      fallbacks,
      reasons
    };
  }

  /**
   * Build fallback chain for a provider
   */
  async buildFallbackChain(primaryProvider: string, requirements: TaskRequirements): Promise<string[]> {
    // CRITICAL FIX: Added 'grok' to all providers
    const allProviders = ['claude', 'llama', 'openai', 'gpt_oss', 'grok'];
    const fallbacks = allProviders.filter(p => p !== primaryProvider);
    
    // Sort fallbacks by score
    const scores = await this.scoreProviders(requirements);
    const sortedFallbacks = scores
      .filter(s => s.provider !== primaryProvider)
      .sort((a, b) => b.score - a.score)
      .map(s => s.provider);

    return sortedFallbacks;
  }

  /**
   * Get task requirements based on type
   */
  private getTaskRequirements(taskType: string): TaskRequirements {
    const requirementsMap: Record<string, TaskRequirements> = {
      'quick-task': {
        priority: 'high',
        estimatedTokens: 1000,
        minAvailability: 90,
        maxResponseTime: 2000
      },
      'farm': {
        priority: 'medium',
        estimatedTokens: 5000,
        minAvailability: 80,
        maxResponseTime: 5000
      },
      'gowild': {
        priority: 'low',
        estimatedTokens: 10000,
        minAvailability: 70,
        maxCost: 1.0
      }
    };

    return requirementsMap[taskType] || {
      priority: 'medium',
      estimatedTokens: 2000
    };
  }

  /**
   * Generate recommendation reasons
   */
  private generateRecommendationReasons(provider: string, metrics: ProviderMetrics): string[] {
    const reasons = [];

    if (metrics.availability >= 95) {
      reasons.push(`${provider} has excellent availability (${metrics.availability.toFixed(1)}%)`);
    }
    
    if (metrics.responseTime < 1000) {
      reasons.push(`Fast response time (${metrics.responseTime}ms)`);
    }
    
    if (metrics.errorRate < 1) {
      reasons.push(`Very low error rate (${metrics.errorRate.toFixed(2)}%)`);
    }
    
    if (metrics.costPerToken < 0.0001) {
      reasons.push(`Cost-effective pricing`);
    }

    return reasons;
  }

  /**
   * Get base cost per token for provider
   */
  private getBaseCostPerToken(provider: string): number {
    // CRITICAL FIX: Added 'grok' to cost configuration
    const costs = {
      claude: 0.00008,  // $0.08 per 1K tokens
      openai: 0.00006,  // $0.06 per 1K tokens
      llama: 0.00004,   // $0.04 per 1K tokens
      gpt_oss: 0.00001, // $0.01 per 1K tokens (self-hosted)
      grok: 0.00005     // $0.05 per 1K tokens (xAI)
    };

    return costs[provider] || 0.00005;
  }

  /**
   * Get default rate limit for provider
   */
  private getDefaultRateLimit(provider: string): number {
    // CRITICAL FIX: Added 'grok' to rate limits
    const limits = {
      claude: 100000,
      openai: 10000,
      llama: 50000,
      gpt_oss: 999999,
      grok: 60000
    };

    return limits[provider] || 10000;
  }

  /**
   * Create default metrics for provider
   */
  private createDefaultMetrics(provider: ProviderMetrics['provider']): ProviderMetrics {
    return {
      provider,
      availability: 100,
      responseTime: 0,
      errorRate: 0,
      costPerToken: this.getBaseCostPerToken(provider),
      currentLoad: 0,
      successCount: 0,
      failureCount: 0,
      totalTokensUsed: 0,
      rateLimit: {
        remaining: this.getDefaultRateLimit(provider),
        resetAt: new Date(Date.now() + 3600000),
        limit: this.getDefaultRateLimit(provider)
      },
      lastMeasured: new Date()
    };
  }

  /**
   * Load historical metrics from database
   */
  private async loadHistoricalMetrics(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM provider_metrics
        WHERE measured_at > NOW() - INTERVAL '24 hours'
        ORDER BY measured_at DESC
      `);

      for (const row of result.rows) {
        const history = this.metricsHistory.get(row.provider) || [];
        history.push({
          provider: row.provider,
          availability: parseFloat(row.availability),
          responseTime: row.response_time_ms,
          errorRate: parseFloat(row.error_rate),
          costPerToken: parseFloat(row.cost_per_token),
          currentLoad: row.current_load,
          successCount: parseInt(row.success_count),
          failureCount: parseInt(row.failure_count),
          totalTokensUsed: parseInt(row.total_tokens_used),
          rateLimit: {
            remaining: row.rate_limit_remaining || this.getDefaultRateLimit(row.provider),
            resetAt: row.rate_limit_reset_at || new Date(Date.now() + 3600000),
            limit: this.getDefaultRateLimit(row.provider)
          },
          lastMeasured: row.measured_at
        });
        this.metricsHistory.set(row.provider, history);
      }
    } catch (error) {
      logger.error('[ProviderMetricsService] Error loading historical metrics:', error);
    }
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(metrics: ProviderMetrics): Promise<void> {
    try {
      await db.query(`
        INSERT INTO provider_metrics 
        (provider, availability, response_time_ms, error_rate, cost_per_token,
         current_load, rate_limit_remaining, rate_limit_reset_at,
         success_count, failure_count, total_tokens_used, measured_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        metrics.provider,
        metrics.availability,
        metrics.responseTime,
        metrics.errorRate,
        metrics.costPerToken,
        metrics.currentLoad,
        metrics.rateLimit.remaining,
        metrics.rateLimit.resetAt,
        metrics.successCount,
        metrics.failureCount,
        metrics.totalTokensUsed,
        metrics.lastMeasured,
        JSON.stringify({})
      ]);
    } catch (error) {
      logger.error('[ProviderMetricsService] Error persisting metrics:', error);
    }
  }

  /**
   * Record provider request outcome
   */
  async recordRequestOutcome(
    provider: string,
    success: boolean,
    responseTime: number,
    tokensUsed?: number
  ): Promise<void> {
    const metrics = this.metrics.get(provider);
    if (!metrics) return;

    // Update metrics
    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }

    // Update response time (rolling average)
    metrics.responseTime = (metrics.responseTime * 0.9) + (responseTime * 0.1);

    // Update tokens used
    if (tokensUsed) {
      metrics.totalTokensUsed += tokensUsed;
      metrics.rateLimit.remaining = Math.max(0, metrics.rateLimit.remaining - tokensUsed);
    }

    // Recalculate error rate
    const total = metrics.successCount + metrics.failureCount;
    metrics.errorRate = total > 0 ? (metrics.failureCount / total) * 100 : 0;

    this.metrics.set(provider, metrics);

    // Emit update
    this.emit('provider:request:complete', {
      provider,
      success,
      responseTime,
      tokensUsed
    });
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

// Export singleton instance
export const providerMetricsService = new ProviderMetricsService();