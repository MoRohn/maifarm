/**
 * Thinking Strategy Service
 * 
 * Manages the application of Claude's extended thinking capabilities
 * to enhance agent problem-solving for complex tasks.
 */

import {
  ThinkingLevel,
  ThinkingConfig,
  ThinkingEnhancedPrompt,
  ThinkingMetrics,
  ComplexityIndicators,
  ThinkingPreferences,
  THINKING_TRIGGERS
} from '../types/thinking';
import logger from '../utils/logger';
import { db } from '../database/connection';

class ThinkingStrategyService {
  private static instance: ThinkingStrategyService;
  private metricsCache: Map<string, ThinkingMetrics[]> = new Map();
  private userPreferences: Map<string, ThinkingPreferences> = new Map();

  private constructor() {
    this.loadUserPreferences();
  }

  static getInstance(): ThinkingStrategyService {
    if (!ThinkingStrategyService.instance) {
      ThinkingStrategyService.instance = new ThinkingStrategyService();
    }
    return ThinkingStrategyService.instance;
  }

  /**
   * Enhance a prompt with thinking strategy
   */
  enhancePrompt(
    prompt: string,
    config: ThinkingConfig
  ): ThinkingEnhancedPrompt {
    const startTime = Date.now();
    
    // Determine the actual thinking level to apply
    let appliedLevel = config.level;
    
    // Auto-escalate if enabled and complexity warrants it
    if (config.autoEscalate && config.complexityScore) {
      appliedLevel = this.selectLevelByComplexity(config.complexityScore);
      
      // Respect maximum level constraint
      if (config.maxLevel && this.compareLevels(appliedLevel, config.maxLevel) > 0) {
        appliedLevel = config.maxLevel;
      }
    }
    
    // Skip enhancement if level is NONE
    if (appliedLevel === ThinkingLevel.NONE) {
      return {
        originalPrompt: prompt,
        enhancedPrompt: prompt,
        appliedLevel: ThinkingLevel.NONE,
        estimatedOverhead: 0
      };
    }
    
    // Build the enhanced prompt
    const enhancedPrompt = this.buildEnhancedPrompt(
      prompt,
      appliedLevel,
      config
    );
    
    // Calculate estimated overhead
    const estimatedOverhead = this.estimateProcessingOverhead(appliedLevel);
    
    logger.info(`[ThinkingStrategy] Enhanced prompt with ${appliedLevel} level`, {
      originalLength: prompt.length,
      enhancedLength: enhancedPrompt.length,
      processingTime: Date.now() - startTime,
      estimatedOverhead
    });
    
    return {
      originalPrompt: prompt,
      enhancedPrompt,
      appliedLevel,
      addedContext: config.context,
      estimatedOverhead
    };
  }

  /**
   * Build the enhanced prompt with thinking triggers
   */
  private buildEnhancedPrompt(
    prompt: string,
    level: ThinkingLevel,
    config: ThinkingConfig
  ): string {
    const trigger = THINKING_TRIGGERS[level];
    
    // Task-specific thinking instructions
    const taskInstructions = this.getTaskSpecificInstructions(
      config.taskType,
      level
    );
    
    // Build the enhanced prompt
    let enhancedPrompt = '';
    
    // Add thinking trigger and context
    if (trigger) {
      enhancedPrompt += `Please ${trigger} carefully about this ${config.taskType || 'task'}.\n\n`;
    }
    
    // Add task-specific instructions
    if (taskInstructions) {
      enhancedPrompt += `${taskInstructions}\n\n`;
    }
    
    // Add custom context if provided
    if (config.context) {
      enhancedPrompt += `Context: ${config.context}\n\n`;
    }
    
    // Add the original prompt
    enhancedPrompt += `Task: ${prompt}`;
    
    // Add thinking guidance based on level
    if (level !== ThinkingLevel.NONE) {
      enhancedPrompt += '\n\n' + this.getThinkingGuidance(level);
    }
    
    return enhancedPrompt;
  }

  /**
   * Get task-specific thinking instructions
   */
  private getTaskSpecificInstructions(
    taskType?: string,
    level?: ThinkingLevel
  ): string {
    if (!taskType || level === ThinkingLevel.NONE) return '';
    
    const instructions: Record<string, Record<ThinkingLevel, string>> = {
      debugging: {
        [ThinkingLevel.BASIC]: 'Consider the symptoms and potential causes.',
        [ThinkingLevel.MODERATE]: 'Analyze the stack trace, review recent changes, and consider edge cases.',
        [ThinkingLevel.DEEP]: 'Systematically trace through the execution flow, examine all dependencies, and consider race conditions or timing issues.',
        [ThinkingLevel.ULTRA]: 'Perform exhaustive root cause analysis considering all system interactions, memory states, concurrency issues, and environmental factors.',
        [ThinkingLevel.NONE]: ''
      },
      testing: {
        [ThinkingLevel.BASIC]: 'Identify key test scenarios and happy paths.',
        [ThinkingLevel.MODERATE]: 'Design comprehensive test cases including edge cases and error conditions.',
        [ThinkingLevel.DEEP]: 'Create exhaustive test suites covering all code paths, boundary conditions, and integration points.',
        [ThinkingLevel.ULTRA]: 'Develop complete test strategies including unit, integration, E2E, performance, and security testing with full coverage analysis.',
        [ThinkingLevel.NONE]: ''
      },
      development: {
        [ThinkingLevel.BASIC]: 'Plan the basic implementation approach.',
        [ThinkingLevel.MODERATE]: 'Design the architecture considering scalability and maintainability.',
        [ThinkingLevel.DEEP]: 'Architect a robust solution with design patterns, error handling, and future extensibility.',
        [ThinkingLevel.ULTRA]: 'Create a comprehensive system design considering all architectural trade-offs, performance implications, and long-term evolution.',
        [ThinkingLevel.NONE]: ''
      },
      analysis: {
        [ThinkingLevel.BASIC]: 'Review the data and identify patterns.',
        [ThinkingLevel.MODERATE]: 'Perform detailed analysis with statistical validation.',
        [ThinkingLevel.DEEP]: 'Conduct comprehensive analysis considering all variables and correlations.',
        [ThinkingLevel.ULTRA]: 'Execute exhaustive multi-dimensional analysis with predictive modeling and confidence intervals.',
        [ThinkingLevel.NONE]: ''
      },
      optimization: {
        [ThinkingLevel.BASIC]: 'Identify obvious performance bottlenecks.',
        [ThinkingLevel.MODERATE]: 'Profile the system and analyze resource utilization.',
        [ThinkingLevel.DEEP]: 'Perform comprehensive performance analysis with benchmarking and optimization strategies.',
        [ThinkingLevel.ULTRA]: 'Conduct system-wide optimization considering all layers, caching strategies, and architectural refactoring.',
        [ThinkingLevel.NONE]: ''
      },
      exploration: {
        [ThinkingLevel.BASIC]: 'Explore the immediate possibilities.',
        [ThinkingLevel.MODERATE]: 'Investigate multiple approaches and alternatives.',
        [ThinkingLevel.DEEP]: 'Thoroughly explore all viable paths and their implications.',
        [ThinkingLevel.ULTRA]: 'Exhaustively explore the entire solution space with creative and unconventional approaches.',
        [ThinkingLevel.NONE]: ''
      }
    };
    
    return instructions[taskType]?.[level] || '';
  }

  /**
   * Get thinking guidance based on level
   */
  private getThinkingGuidance(level: ThinkingLevel): string {
    const guidance: Record<ThinkingLevel, string> = {
      [ThinkingLevel.NONE]: '',
      [ThinkingLevel.BASIC]: 'Take a moment to consider the problem before starting.',
      [ThinkingLevel.MODERATE]: 'Carefully analyze the requirements and plan your approach:\n' +
        '1. Break down the problem into components\n' +
        '2. Consider potential challenges\n' +
        '3. Plan a systematic solution',
      [ThinkingLevel.DEEP]: 'Thoroughly examine all aspects of this task:\n' +
        '1. Analyze the problem from multiple perspectives\n' +
        '2. Consider all edge cases and failure modes\n' +
        '3. Evaluate different solution approaches\n' +
        '4. Plan for robustness and maintainability\n' +
        '5. Anticipate future requirements',
      [ThinkingLevel.ULTRA]: 'Engage in comprehensive analysis before proceeding:\n' +
        '1. Deconstruct the problem to its fundamental components\n' +
        '2. Explore all possible solution strategies\n' +
        '3. Consider architectural and design implications\n' +
        '4. Evaluate trade-offs between different approaches\n' +
        '5. Plan for scalability, security, and performance\n' +
        '6. Anticipate integration challenges and dependencies\n' +
        '7. Consider long-term maintenance and evolution\n' +
        '8. Document your reasoning and decision process'
    };
    
    return guidance[level];
  }

  /**
   * Analyze prompt complexity and return indicators
   */
  analyzeComplexity(prompt: string): ComplexityIndicators {
    const wordCount = prompt.split(/\s+/).length;
    
    // Technical terms that indicate complexity
    const technicalTerms = [
      'architecture', 'scalability', 'performance', 'optimization',
      'integration', 'authentication', 'authorization', 'security',
      'database', 'api', 'microservice', 'distributed', 'concurrent',
      'async', 'cache', 'algorithm', 'data structure', 'refactor',
      'migration', 'deployment', 'infrastructure', 'monitoring'
    ];
    
    const promptLower = prompt.toLowerCase();
    const technicalTermCount = technicalTerms.filter(term => 
      promptLower.includes(term)
    ).length;
    
    // Complex requirement indicators
    const complexPhrases = [
      'multiple', 'comprehensive', 'extensive', 'all', 'every',
      'complete', 'thorough', 'detailed', 'complex', 'advanced'
    ];
    const hasComplexRequirements = complexPhrases.some(phrase => 
      promptLower.includes(phrase)
    );
    
    // System integration indicators
    const integrationTerms = ['integrate', 'connect', 'sync', 'coordinate', 'orchestrate'];
    const hasSystemIntegration = integrationTerms.some(term => 
      promptLower.includes(term)
    );
    
    // Architectural indicators
    const architecturalTerms = ['design', 'architect', 'structure', 'pattern', 'framework'];
    const hasArchitecturalImpact = architecturalTerms.some(term => 
      promptLower.includes(term)
    );
    
    // Debugging indicators
    const debuggingTerms = ['debug', 'fix', 'error', 'bug', 'issue', 'problem', 'troubleshoot'];
    const hasDebuggingNeeds = debuggingTerms.some(term => 
      promptLower.includes(term)
    );
    
    // Testing indicators
    const testingTerms = ['test', 'verify', 'validate', 'check', 'ensure', 'coverage'];
    const hasTestingRequirements = testingTerms.some(term => 
      promptLower.includes(term)
    );
    
    // Estimate duration based on indicators
    let estimatedDuration = 5; // Base 5 minutes
    if (wordCount > 100) estimatedDuration += 5;
    if (wordCount > 200) estimatedDuration += 10;
    if (technicalTermCount > 3) estimatedDuration += 10;
    if (hasComplexRequirements) estimatedDuration += 15;
    if (hasSystemIntegration) estimatedDuration += 20;
    if (hasArchitecturalImpact) estimatedDuration += 25;
    
    return {
      wordCount,
      technicalTermCount,
      hasComplexRequirements,
      hasSystemIntegration,
      hasArchitecturalImpact,
      hasDebuggingNeeds,
      hasTestingRequirements,
      estimatedDuration
    };
  }

  /**
   * Calculate complexity score from indicators
   */
  calculateComplexityScore(indicators: ComplexityIndicators): number {
    let score = 0;
    
    // Word count contribution (0-20 points)
    score += Math.min(indicators.wordCount / 10, 20);
    
    // Technical terms contribution (0-20 points)
    score += Math.min(indicators.technicalTermCount * 5, 20);
    
    // Boolean indicators (10 points each)
    if (indicators.hasComplexRequirements) score += 10;
    if (indicators.hasSystemIntegration) score += 10;
    if (indicators.hasArchitecturalImpact) score += 10;
    if (indicators.hasDebuggingNeeds) score += 10;
    if (indicators.hasTestingRequirements) score += 10;
    
    // Duration contribution (0-10 points)
    score += Math.min(indicators.estimatedDuration / 6, 10);
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Select thinking level based on complexity score
   */
  selectLevelByComplexity(complexityScore: number): ThinkingLevel {
    if (complexityScore < 20) return ThinkingLevel.NONE;
    if (complexityScore < 40) return ThinkingLevel.BASIC;
    if (complexityScore < 60) return ThinkingLevel.MODERATE;
    if (complexityScore < 80) return ThinkingLevel.DEEP;
    return ThinkingLevel.ULTRA;
  }

  /**
   * Recommend thinking level for a prompt
   */
  recommendThinkingLevel(
    prompt: string,
    taskType?: string
  ): {
    level: ThinkingLevel;
    confidence: number;
    reasoning: string;
    complexityScore: number;
  } {
    const indicators = this.analyzeComplexity(prompt);
    const complexityScore = this.calculateComplexityScore(indicators);
    const level = this.selectLevelByComplexity(complexityScore);
    
    // Calculate confidence based on how clear the indicators are
    let confidence = 0.5; // Base confidence
    if (indicators.technicalTermCount > 2) confidence += 0.2;
    if (taskType) confidence += 0.1;
    if (indicators.hasComplexRequirements) confidence += 0.1;
    if (indicators.wordCount > 50) confidence += 0.1;
    confidence = Math.min(confidence, 1.0);
    
    // Build reasoning
    const reasons = [];
    if (indicators.wordCount > 100) {
      reasons.push(`detailed prompt (${indicators.wordCount} words)`);
    }
    if (indicators.technicalTermCount > 0) {
      reasons.push(`${indicators.technicalTermCount} technical terms`);
    }
    if (indicators.hasComplexRequirements) {
      reasons.push('complex requirements detected');
    }
    if (indicators.hasSystemIntegration) {
      reasons.push('system integration needed');
    }
    if (indicators.hasArchitecturalImpact) {
      reasons.push('architectural decisions required');
    }
    if (indicators.hasDebuggingNeeds) {
      reasons.push('debugging/troubleshooting involved');
    }
    
    const reasoning = reasons.length > 0 
      ? `Based on: ${reasons.join(', ')}`
      : 'Simple task with minimal complexity';
    
    return {
      level,
      confidence,
      reasoning,
      complexityScore
    };
  }

  /**
   * Estimate processing overhead in seconds
   */
  private estimateProcessingOverhead(level: ThinkingLevel): number {
    const overheads: Record<ThinkingLevel, number> = {
      [ThinkingLevel.NONE]: 0,
      [ThinkingLevel.BASIC]: 2,
      [ThinkingLevel.MODERATE]: 5,
      [ThinkingLevel.DEEP]: 10,
      [ThinkingLevel.ULTRA]: 20
    };
    
    return overheads[level];
  }

  /**
   * Compare thinking levels
   */
  private compareLevels(a: ThinkingLevel, b: ThinkingLevel): number {
    const order = [
      ThinkingLevel.NONE,
      ThinkingLevel.BASIC,
      ThinkingLevel.MODERATE,
      ThinkingLevel.DEEP,
      ThinkingLevel.ULTRA
    ];
    
    return order.indexOf(a) - order.indexOf(b);
  }

  /**
   * Record metrics for a thinking-enhanced task
   */
  async recordMetrics(metrics: ThinkingMetrics): Promise<void> {
    try {
      // Store in database
      await db.query(
        `INSERT INTO thinking_metrics 
         (task_id, level, processing_time, quality_score, success, errors, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          metrics.taskId,
          metrics.level,
          metrics.processingTime,
          metrics.qualityScore || null,
          metrics.success,
          JSON.stringify(metrics.errors || []),
          metrics.timestamp
        ]
      );
      
      // Update cache
      const taskMetrics = this.metricsCache.get(metrics.taskId) || [];
      taskMetrics.push(metrics);
      this.metricsCache.set(metrics.taskId, taskMetrics);
      
      logger.info('[ThinkingStrategy] Recorded metrics', {
        taskId: metrics.taskId,
        level: metrics.level,
        success: metrics.success,
        processingTime: metrics.processingTime
      });
    } catch (error) {
      logger.error('[ThinkingStrategy] Failed to record metrics', error);
    }
  }

  /**
   * Get aggregated metrics for analysis
   */
  async getAggregatedMetrics(
    taskType?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    averageProcessingTime: Record<ThinkingLevel, number>;
    successRate: Record<ThinkingLevel, number>;
    averageQuality: Record<ThinkingLevel, number>;
    usage: Record<ThinkingLevel, number>;
  }> {
    // This would query the database for historical metrics
    // For now, return mock data
    return {
      averageProcessingTime: {
        [ThinkingLevel.NONE]: 1000,
        [ThinkingLevel.BASIC]: 3000,
        [ThinkingLevel.MODERATE]: 7000,
        [ThinkingLevel.DEEP]: 15000,
        [ThinkingLevel.ULTRA]: 30000
      },
      successRate: {
        [ThinkingLevel.NONE]: 0.7,
        [ThinkingLevel.BASIC]: 0.8,
        [ThinkingLevel.MODERATE]: 0.85,
        [ThinkingLevel.DEEP]: 0.9,
        [ThinkingLevel.ULTRA]: 0.95
      },
      averageQuality: {
        [ThinkingLevel.NONE]: 65,
        [ThinkingLevel.BASIC]: 75,
        [ThinkingLevel.MODERATE]: 82,
        [ThinkingLevel.DEEP]: 88,
        [ThinkingLevel.ULTRA]: 94
      },
      usage: {
        [ThinkingLevel.NONE]: 45,
        [ThinkingLevel.BASIC]: 30,
        [ThinkingLevel.MODERATE]: 15,
        [ThinkingLevel.DEEP]: 8,
        [ThinkingLevel.ULTRA]: 2
      }
    };
  }

  /**
   * Load user preferences from database
   */
  private async loadUserPreferences(): Promise<void> {
    // This would load from database
    // For now, set defaults
    const defaultPreferences: ThinkingPreferences = {
      defaultLevel: ThinkingLevel.BASIC,
      enableAutoSelection: true,
      showRecommendations: true,
      maxAllowedLevel: ThinkingLevel.DEEP,
      speedQualityBalance: 50
    };
    
    this.userPreferences.set('default', defaultPreferences);
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string = 'default'): ThinkingPreferences {
    return this.userPreferences.get(userId) || {
      defaultLevel: ThinkingLevel.BASIC,
      enableAutoSelection: true,
      showRecommendations: true,
      maxAllowedLevel: ThinkingLevel.DEEP,
      speedQualityBalance: 50
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: string,
    preferences: Partial<ThinkingPreferences>
  ): Promise<void> {
    const current = this.getUserPreferences(userId);
    const updated = { ...current, ...preferences };
    this.userPreferences.set(userId, updated);
    
    // TODO: Persist to database
    logger.info('[ThinkingStrategy] Updated user preferences', {
      userId,
      preferences: updated
    });
  }
}

// Export singleton instance
export const thinkingStrategyService = ThinkingStrategyService.getInstance();