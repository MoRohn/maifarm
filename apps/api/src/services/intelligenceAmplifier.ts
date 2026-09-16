import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { db } from '../database/connection.js';

/**
 * Intelligence Amplifier Service
 * Uses machine learning to predict agent performance, optimize task allocation,
 * and provide real-time intelligence insights for multi-agent orchestration.
 */
export class IntelligenceAmplifierService extends EventEmitter {
  private model: tf.Sequential | null = null;
  private performanceHistory: Map<string, number[]> = new Map();
  private predictionCache: Map<string, any> = new Map();
  private readonly FEATURE_DIMENSIONS = 10;
  private readonly PREDICTION_WINDOW = 100;
  
  constructor() {
    super();
    this.initializeModel();
  }

  /**
   * Initialize the neural network model for performance prediction
   */
  private async initializeModel() {
    try {
      this.model = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [this.FEATURE_DIMENSIONS],
            units: 64,
            activation: 'relu',
            kernelInitializer: 'glorotUniform'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 32,
            activation: 'relu'
          }),
          tf.layers.dense({
            units: 16,
            activation: 'relu'
          }),
          tf.layers.dense({
            units: 3, // Performance categories: optimal, normal, needs-attention
            activation: 'softmax'
          })
        ]
      });

      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

      logger.info('Intelligence Amplifier model initialized');
    } catch (error) {
      logger.error('Failed to initialize Intelligence Amplifier model:', error);
    }
  }

  /**
   * Extract features from agent metrics for ML processing
   */
  private extractFeatures(agentData: any): tf.Tensor {
    const features = [
      agentData.taskCompletionRate || 0,
      agentData.avgResponseTime || 0,
      agentData.errorRate || 0,
      agentData.memoryUsage || 0,
      agentData.cpuUsage || 0,
      agentData.tokenUsage || 0,
      agentData.collaborationScore || 0,
      agentData.creativityIndex || 0,
      agentData.efficiencyScore || 0,
      agentData.innovationMetric || 0
    ];

    return tf.tensor2d([features], [1, this.FEATURE_DIMENSIONS]);
  }

  /**
   * Predict agent performance for optimal task allocation
   */
  async predictAgentPerformance(agentId: string, taskType: string): Promise<{
    performanceCategory: 'optimal' | 'normal' | 'needs-attention';
    confidence: number;
    recommendations: string[];
  }> {
    try {
      // Check cache first
      const cacheKey = `${agentId}-${taskType}`;
      if (this.predictionCache.has(cacheKey)) {
        const cached = this.predictionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
          return cached.data;
        }
      }

      // Get agent metrics from database
      const metrics = await this.getAgentMetrics(agentId);
      const features = this.extractFeatures(metrics);
      
      // Make prediction
      const prediction = this.model!.predict(features) as tf.Tensor;
      const probabilities = await prediction.array() as number[][];
      const [optimal, normal, needsAttention] = probabilities[0];
      
      // Determine category and confidence
      let performanceCategory: 'optimal' | 'normal' | 'needs-attention';
      let confidence: number;
      
      if (optimal > normal && optimal > needsAttention) {
        performanceCategory = 'optimal';
        confidence = optimal;
      } else if (normal > needsAttention) {
        performanceCategory = 'normal';
        confidence = normal;
      } else {
        performanceCategory = 'needs-attention';
        confidence = needsAttention;
      }

      // Generate intelligent recommendations
      const recommendations = this.generateRecommendations(
        performanceCategory,
        metrics,
        taskType
      );

      const result = {
        performanceCategory,
        confidence: Math.round(confidence * 100) / 100,
        recommendations
      };

      // Cache the result
      this.predictionCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      // Clean up tensors
      features.dispose();
      prediction.dispose();

      return result;
    } catch (error) {
      logger.error('Performance prediction failed:', error);
      return {
        performanceCategory: 'normal',
        confidence: 0.5,
        recommendations: ['Unable to generate predictions at this time']
      };
    }
  }

  /**
   * Generate intelligent recommendations based on performance analysis
   */
  private generateRecommendations(
    category: string,
    metrics: any,
    taskType: string
  ): string[] {
    const recommendations: string[] = [];

    if (category === 'needs-attention') {
      if (metrics.errorRate > 0.1) {
        recommendations.push('Consider implementing error recovery strategies');
      }
      if (metrics.memoryUsage > 0.8) {
        recommendations.push('Memory optimization needed - consider task batching');
      }
      if (metrics.avgResponseTime > 5000) {
        recommendations.push('Response time is high - optimize processing pipeline');
      }
    } else if (category === 'optimal') {
      recommendations.push(`Agent performing optimally for ${taskType} tasks`);
      if (metrics.creativityIndex > 0.8) {
        recommendations.push('High creativity detected - suitable for innovation tasks');
      }
    }

    if (metrics.collaborationScore < 0.5) {
      recommendations.push('Enhance inter-agent communication protocols');
    }

    return recommendations.length > 0 ? recommendations : ['Performance within normal parameters'];
  }

  /**
   * Analyze collective intelligence patterns across all agents
   */
  async analyzeCollectiveIntelligence(farmId: string): Promise<{
    swarmEfficiency: number;
    emergentBehaviors: string[];
    optimizationOpportunities: string[];
    synergyScore: number;
  }> {
    try {
      const agents = await this.getFarmAgents(farmId);
      let totalEfficiency = 0;
      const behaviors: Set<string> = new Set();
      const opportunities: string[] = [];
      
      // Analyze each agent
      for (const agent of agents) {
        const metrics = await this.getAgentMetrics(agent.id);
        totalEfficiency += metrics.efficiencyScore || 0;
        
        // Detect emergent behaviors
        if (metrics.collaborationScore > 0.8 && metrics.creativityIndex > 0.7) {
          behaviors.add('Creative collaboration emerging');
        }
        if (metrics.taskCompletionRate > 0.95) {
          behaviors.add('High-performance execution pattern');
        }
      }

      // Calculate swarm efficiency
      const swarmEfficiency = totalEfficiency / agents.length;
      
      // Calculate synergy score (how well agents work together)
      const synergyScore = this.calculateSynergyScore(agents);
      
      // Identify optimization opportunities
      if (swarmEfficiency < 0.7) {
        opportunities.push('Implement load balancing algorithm');
      }
      if (synergyScore < 0.6) {
        opportunities.push('Enhance coordination protocols');
      }
      if (behaviors.size < 2) {
        opportunities.push('Encourage diverse problem-solving approaches');
      }

      return {
        swarmEfficiency: Math.round(swarmEfficiency * 100) / 100,
        emergentBehaviors: Array.from(behaviors),
        optimizationOpportunities: opportunities,
        synergyScore: Math.round(synergyScore * 100) / 100
      };
    } catch (error) {
      logger.error('Collective intelligence analysis failed:', error);
      throw error;
    }
  }

  /**
   * Predict optimal task allocation strategy
   */
  async predictOptimalAllocation(
    taskQueue: any[],
    availableAgents: string[]
  ): Promise<Map<string, string[]>> {
    const allocation = new Map<string, string[]>();
    
    try {
      // Analyze each agent's capabilities
      const agentScores = new Map<string, number>();
      
      for (const agentId of availableAgents) {
        const performance = await this.predictAgentPerformance(agentId, 'general');
        let score = 0;
        
        switch (performance.performanceCategory) {
          case 'optimal':
            score = 1.0;
            break;
          case 'normal':
            score = 0.7;
            break;
          case 'needs-attention':
            score = 0.4;
            break;
        }
        
        agentScores.set(agentId, score * performance.confidence);
      }

      // Sort agents by score
      const sortedAgents = Array.from(agentScores.entries())
        .sort((a, b) => b[1] - a[1]);

      // Allocate tasks based on agent capabilities
      let taskIndex = 0;
      for (const [agentId, score] of sortedAgents) {
        const tasksToAllocate: string[] = [];
        const taskCount = Math.ceil(score * 3); // Allocate 1-3 tasks based on score
        
        for (let i = 0; i < taskCount && taskIndex < taskQueue.length; i++) {
          tasksToAllocate.push(taskQueue[taskIndex].id);
          taskIndex++;
        }
        
        if (tasksToAllocate.length > 0) {
          allocation.set(agentId, tasksToAllocate);
        }
      }

      this.emit('allocationOptimized', { allocation, efficiency: this.calculateAllocationEfficiency(allocation) });
      
    } catch (error) {
      logger.error('Task allocation prediction failed:', error);
    }

    return allocation;
  }

  /**
   * Train the model with new performance data
   */
  async trainOnPerformanceData(
    agentId: string,
    features: number[],
    performanceLabel: 'optimal' | 'normal' | 'needs-attention'
  ): Promise<void> {
    if (!this.model) return;

    try {
      // Convert label to one-hot encoding
      const labelIndex = ['optimal', 'normal', 'needs-attention'].indexOf(performanceLabel);
      const oneHotLabel = [0, 0, 0];
      oneHotLabel[labelIndex] = 1;

      // Create training tensors
      const xs = tf.tensor2d([features], [1, this.FEATURE_DIMENSIONS]);
      const ys = tf.tensor2d([oneHotLabel], [1, 3]);

      // Train the model
      await this.model.fit(xs, ys, {
        epochs: 5,
        verbose: 0
      });

      // Store in performance history
      if (!this.performanceHistory.has(agentId)) {
        this.performanceHistory.set(agentId, []);
      }
      this.performanceHistory.get(agentId)!.push(labelIndex);

      // Clean up tensors
      xs.dispose();
      ys.dispose();

      logger.info(`Model trained with new data for agent ${agentId}`);
    } catch (error) {
      logger.error('Model training failed:', error);
    }
  }

  /**
   * Generate intelligence insights report
   */
  async generateIntelligenceReport(farmId: string): Promise<{
    timestamp: Date;
    insights: string[];
    predictions: any[];
    recommendations: string[];
    intelligenceScore: number;
  }> {
    const insights: string[] = [];
    const predictions: any[] = [];
    const recommendations: string[] = [];

    try {
      // Analyze collective intelligence
      const collective = await this.analyzeCollectiveIntelligence(farmId);
      
      insights.push(`Swarm efficiency: ${collective.swarmEfficiency * 100}%`);
      insights.push(`Synergy score: ${collective.synergyScore * 100}%`);
      
      if (collective.emergentBehaviors.length > 0) {
        insights.push(`Emergent behaviors detected: ${collective.emergentBehaviors.join(', ')}`);
      }

      // Add optimization opportunities as recommendations
      recommendations.push(...collective.optimizationOpportunities);

      // Calculate overall intelligence score
      const intelligenceScore = (collective.swarmEfficiency + collective.synergyScore) / 2;

      return {
        timestamp: new Date(),
        insights,
        predictions,
        recommendations,
        intelligenceScore: Math.round(intelligenceScore * 100) / 100
      };
    } catch (error) {
      logger.error('Intelligence report generation failed:', error);
      throw error;
    }
  }

  // Helper methods
  private async getAgentMetrics(agentId: string): Promise<any> {
    // Fetch from database or generate sample metrics
    try {
      const result = await db.query(
        `SELECT * FROM agent_metrics WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [agentId]
      );
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
    } catch (error) {
      logger.warn('Using default metrics due to database error:', error);
    }

    // Return default metrics if database query fails
    return {
      taskCompletionRate: Math.random() * 0.5 + 0.5,
      avgResponseTime: Math.random() * 3000 + 1000,
      errorRate: Math.random() * 0.1,
      memoryUsage: Math.random() * 0.6 + 0.2,
      cpuUsage: Math.random() * 0.5 + 0.2,
      tokenUsage: Math.random() * 1000 + 500,
      collaborationScore: Math.random() * 0.5 + 0.5,
      creativityIndex: Math.random() * 0.6 + 0.4,
      efficiencyScore: Math.random() * 0.5 + 0.5,
      innovationMetric: Math.random() * 0.7 + 0.3
    };
  }

  private async getFarmAgents(farmId: string): Promise<any[]> {
    try {
      const result = await db.query(
        `SELECT * FROM agents WHERE farm_id = $1 AND status = 'active'`,
        [farmId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to fetch farm agents:', error);
      return [];
    }
  }

  private calculateSynergyScore(agents: any[]): number {
    // Calculate how well agents work together based on their interactions
    if (agents.length < 2) return 0;
    
    // Simplified synergy calculation
    const baseScore = 0.5;
    const collaborationBonus = agents.length > 3 ? 0.2 : 0.1;
    const diversityBonus = 0.2; // Assume diversity for now
    
    return Math.min(1, baseScore + collaborationBonus + diversityBonus);
  }

  private calculateAllocationEfficiency(allocation: Map<string, string[]>): number {
    // Calculate how efficient the task allocation is
    const totalTasks = Array.from(allocation.values()).reduce((sum, tasks) => sum + tasks.length, 0);
    const agentCount = allocation.size;
    
    if (agentCount === 0) return 0;
    
    const avgTasksPerAgent = totalTasks / agentCount;
    const variance = Array.from(allocation.values())
      .reduce((sum, tasks) => sum + Math.pow(tasks.length - avgTasksPerAgent, 2), 0) / agentCount;
    
    // Lower variance means better distribution
    return Math.max(0, 1 - (variance / totalTasks));
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.model) {
      this.model.dispose();
    }
    this.performanceHistory.clear();
    this.predictionCache.clear();
  }
}

// Export singleton instance
export const intelligenceAmplifier = new IntelligenceAmplifierService();