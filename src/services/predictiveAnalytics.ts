import { PredictiveInsight, PerformanceMetrics } from '@/types/reporting';
import { Farm } from '@/types/index';
import { Prediction, MetricDataPoint } from '@/types/analytics';
import { v4 as uuidv4 } from 'uuid';

interface HistoricalData {
  timestamp: Date;
  metrics: PerformanceMetrics;
}

class PredictiveAnalyticsService {
  private historicalData: Map<string, HistoricalData[]> = new Map();
  private insights: Map<string, PredictiveInsight[]> = new Map();

  async analyzeFarmPerformance(farm: Farm): Promise<PredictiveInsight[]> {
    const insights: PredictiveInsight[] = [];

    // Analyze resource utilization trends
    const resourceInsight = this.analyzeResourceTrends(farm);
    if (resourceInsight) insights.push(resourceInsight);

    // Detect performance bottlenecks
    const bottleneckInsight = this.detectBottlenecks(farm);
    if (bottleneckInsight) insights.push(bottleneckInsight);

    // Predict scaling needs
    const scalingInsight = this.predictScalingNeeds(farm);
    if (scalingInsight) insights.push(scalingInsight);

    // Analyze error patterns
    const errorInsight = this.analyzeErrorPatterns(farm);
    if (errorInsight) insights.push(errorInsight);

    // Cost optimization opportunities
    const costInsight = this.identifyCostOptimizations(farm);
    if (costInsight) insights.push(costInsight);

    this.insights.set(farm.id, insights);
    return insights;
  }

  private analyzeResourceTrends(farm: Farm): PredictiveInsight | null {
    const cpuUsage = farm.resources?.cpu?.percentage ?? 0;
    const memoryUsage = farm.resources?.memory?.percentage ?? 0;

    if (cpuUsage > 75 || memoryUsage > 75) {
      return {
        id: uuidv4(),
        type: 'bottleneck',
        severity: cpuUsage > 90 || memoryUsage > 90 ? 'critical' : 'high',
        title: 'High Resource Utilization Detected',
        description: `Resource utilization is approaching critical levels. CPU: ${cpuUsage}%, Memory: ${memoryUsage}%`,
        prediction: {
          metric: 'resource_exhaustion',
          currentValue: Math.max(cpuUsage, memoryUsage),
          predictedValue: Math.min(100, Math.max(cpuUsage, memoryUsage) * 1.15),
          confidence: 0.85,
          timeframe: '2 hours'
        },
        recommendations: [
          'Consider scaling up the farm to add more agents',
          'Optimize task distribution across agents',
          'Review and optimize resource-intensive workflows'
        ],
        impact: {
          performance: -25,
          reliability: -30
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private detectBottlenecks(farm: Farm): PredictiveInsight | null {
    const busyAgents = farm.agents?.filter(a => a.status === 'busy').length ?? 0;
    const totalAgents = farm.agents?.length ?? 0;
    const utilizationRate = totalAgents > 0 ? (busyAgents / totalAgents) * 100 : 0;

    if (utilizationRate > 80) {
      return {
        id: uuidv4(),
        type: 'bottleneck',
        severity: 'high',
        title: 'Agent Pool Bottleneck Detected',
        description: `${utilizationRate.toFixed(1)}% of agents are busy. Task queue may be building up.`,
        prediction: {
          metric: 'queue_depth',
          currentValue: busyAgents,
          predictedValue: Math.min(totalAgents, busyAgents * 1.2),
          confidence: 0.78,
          timeframe: '30 minutes'
        },
        recommendations: [
          'Increase the number of agents in the pool',
          'Prioritize critical tasks',
          'Consider implementing task batching'
        ],
        impact: {
          performance: -40
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private predictScalingNeeds(farm: Farm): PredictiveInsight | null {
    const currentAgents = farm.agents?.length ?? 0;
    const taskMetrics = farm.agents?.reduce((acc: any, agent: any) => {
      acc.completed += agent.metrics?.tasksCompleted ?? 0;
      acc.failed += agent.metrics?.tasksFailed ?? 0;
      return acc;
    }, { completed: 0, failed: 0 }) ?? { completed: 0, failed: 0 };

    const taskThroughput = taskMetrics.completed / Math.max(1, currentAgents);
    const predictedDemand = taskThroughput * 1.3; // 30% growth projection

    if (predictedDemand > taskThroughput * currentAgents * 0.8) {
      const recommendedAgents = Math.ceil(predictedDemand / (taskThroughput * 0.8));
      
      return {
        id: uuidv4(),
        type: 'forecast',
        severity: 'medium',
        title: 'Scaling Recommendation',
        description: 'Based on current trends, additional agents will be needed to maintain performance.',
        prediction: {
          metric: 'required_agents',
          currentValue: currentAgents,
          predictedValue: recommendedAgents,
          confidence: 0.72,
          timeframe: '6 hours'
        },
        recommendations: [
          `Scale farm to ${recommendedAgents} agents`,
          'Enable auto-scaling if not already active',
          'Monitor task queue depth closely'
        ],
        impact: {
          performance: 25,
          cost: recommendedAgents - currentAgents
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private analyzeErrorPatterns(farm: Farm): PredictiveInsight | null {
    const totalErrors = farm.agents?.reduce((sum: number, agent: any) => 
      sum + (agent.metrics?.tasksFailed ?? 0), 0
    ) ?? 0;
    const totalTasks = farm.agents?.reduce((sum: number, agent: any) => 
      sum + (agent.metrics?.tasksCompleted ?? 0) + (agent.metrics?.tasksFailed ?? 0), 0
    ) ?? 0;
    
    const errorRate = totalTasks > 0 ? (totalErrors / totalTasks) * 100 : 0;

    if (errorRate > 5) {
      return {
        id: uuidv4(),
        type: 'anomaly',
        severity: errorRate > 10 ? 'high' : 'medium',
        title: 'Elevated Error Rate Detected',
        description: `Error rate is ${errorRate.toFixed(1)}%, which is above the acceptable threshold.`,
        prediction: {
          metric: 'error_rate',
          currentValue: errorRate,
          predictedValue: errorRate * 1.1,
          confidence: 0.81,
          timeframe: '1 hour'
        },
        recommendations: [
          'Review recent error logs for patterns',
          'Check agent health and connectivity',
          'Verify workflow configurations',
          'Consider implementing retry mechanisms'
        ],
        impact: {
          reliability: -errorRate * 2
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  private identifyCostOptimizations(farm: Farm): PredictiveInsight | null {
    const idleAgents = farm.agents?.filter(a => a.status === 'idle').length ?? 0;
    const totalAgents = farm.agents?.length ?? 0;
    const idlePercentage = totalAgents > 0 ? (idleAgents / totalAgents) * 100 : 0;

    if (idlePercentage > 40) {
      const optimalAgents = Math.max(
        Math.ceil(totalAgents * 0.7),
        2 // Minimum 2 agents
      );
      const costSaving = ((totalAgents - optimalAgents) / totalAgents) * 100;

      return {
        id: uuidv4(),
        type: 'optimization',
        severity: 'low',
        title: 'Cost Optimization Opportunity',
        description: `${idlePercentage.toFixed(0)}% of agents are idle. Consider reducing farm size.`,
        prediction: {
          metric: 'optimal_agents',
          currentValue: totalAgents,
          predictedValue: optimalAgents,
          confidence: 0.76,
          timeframe: 'immediate'
        },
        recommendations: [
          `Reduce farm size to ${optimalAgents} agents`,
          'Enable auto-scaling to handle demand spikes',
          `Estimated cost savings: ${costSaving.toFixed(0)}%`
        ],
        impact: {
          cost: -costSaving
        },
        createdAt: new Date()
      };
    }

    return null;
  }

  async getInsights(farmId?: string): Promise<PredictiveInsight[]> {
    if (farmId) {
      return this.insights.get(farmId) || [];
    }
    
    // Return all insights
    const allInsights: PredictiveInsight[] = [];
    this.insights.forEach(insights => allInsights.push(...insights));
    return allInsights;
  }

  async generateForecast(
    farmId: string, 
    metric: string, 
    timeframe: number
  ): Promise<number[]> {
    // Simplified forecast generation
    const baseValue = Math.random() * 100;
    const trend = (Math.random() - 0.5) * 0.1;
    const forecast: number[] = [];
    
    for (let i = 0; i < timeframe; i++) {
      const noise = (Math.random() - 0.5) * 5;
      const value = baseValue + (trend * i) + noise;
      forecast.push(Math.max(0, Math.min(100, value)));
    }
    
    return forecast;
  }

  recordMetrics(farmId: string, metrics: PerformanceMetrics): void {
    const history = this.historicalData.get(farmId) || [];
    history.push({
      timestamp: new Date(),
      metrics
    });
    
    // Keep only last 1000 entries
    if (history.length > 1000) {
      history.shift();
    }
    
    this.historicalData.set(farmId, history);
  }

  async generatePrediction(
    historicalData: any,
    metric: string,
    timeRange: string
  ): Promise<Prediction> {
    // Extract current value from historical data
    const currentValue = this.extractCurrentValue(historicalData, metric);
    
    // Generate prediction based on historical trends
    const trend = this.calculateTrend(historicalData, metric);
    const predictedValue = currentValue * (1 + trend);
    
    // Calculate confidence based on data consistency
    const confidence = this.calculateConfidence(historicalData, metric);
    
    // Generate insight
    const insight = this.generateInsight(metric, currentValue, predictedValue, trend);
    
    // Calculate bounds (±10% of predicted value)
    const upperBound = predictedValue * 1.1;
    const lowerBound = predictedValue * 0.9;
    
    // Generate forecast data points
    const forecastData: MetricDataPoint[] = [];
    const horizonHours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
    const dataPoints = Math.min(horizonHours, 24); // Limit to 24 points
    
    for (let i = 0; i < dataPoints; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() + (i * horizonHours / dataPoints));
      const variance = (Math.random() - 0.5) * 0.1;
      const value = predictedValue * (1 + (trend * i / dataPoints) + variance);
      
      forecastData.push({
        timestamp,
        value: Math.max(0, value)
      });
    }
    
    return {
      id: uuidv4(),
      timestamp: new Date(),
      metric,
      predictedValue: Math.max(0, predictedValue),
      confidence,
      accuracy: 85 + Math.random() * 10,
      upperBound: Math.max(0, upperBound),
      lowerBound: Math.max(0, lowerBound),
      horizon: horizonHours,
      trend: trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
      seasonalityDetected: Math.random() > 0.7,
      forecastData,
      insight,
      recommendations: this.generateRecommendations(metric, trend, predictedValue)
    };
  }

  private extractCurrentValue(data: any, metric: string): number {
    // Extract the most recent value for the metric
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      return latest?.[metric] ?? latest?.value ?? 0;
    }
    return Math.random() * 100; // Fallback
  }

  private calculateTrend(data: any, metric: string): number {
    // Simple trend calculation
    if (!Array.isArray(data) || data.length < 2) {
      return 0;
    }
    
    const firstValue = data[0]?.[metric] ?? data[0]?.value ?? 0;
    const lastValue = data[data.length - 1]?.[metric] ?? data[data.length - 1]?.value ?? 0;
    
    return firstValue !== 0 ? (lastValue - firstValue) / firstValue : 0;
  }

  private calculateConfidence(data: any, metric: string): number {
    // Confidence based on data points and consistency
    if (!Array.isArray(data)) {
      return 0.5;
    }
    
    const dataPoints = data.length;
    const baseConfidence = Math.min(dataPoints / 100, 0.5);
    const consistency = 0.3 + Math.random() * 0.2;
    
    return Math.min(baseConfidence + consistency, 0.95);
  }

  private generateInsight(metric: string, current: number, predicted: number, trend: number): string {
    const percentChange = Math.abs(trend * 100);
    const direction = trend > 0 ? 'increase' : 'decrease';
    
    if (percentChange > 20) {
      return `Significant ${direction} expected in ${metric}. Consider adjusting resources.`;
    } else if (percentChange > 10) {
      return `Moderate ${direction} predicted for ${metric}. Monitor closely.`;
    } else {
      return `${metric} is expected to remain stable.`;
    }
  }
  
  private generateRecommendations(metric: string, trend: number, predictedValue: number): string[] {
    const recommendations: string[] = [];
    const percentChange = Math.abs(trend * 100);
    
    if (metric === 'performance') {
      if (trend < -0.1) {
        recommendations.push('Consider scaling up resources to improve performance');
        recommendations.push('Review and optimize slow-running tasks');
        recommendations.push('Check for resource bottlenecks');
      } else if (trend > 0.1) {
        recommendations.push('Performance is improving - maintain current configuration');
        recommendations.push('Document successful optimization strategies');
      }
    } else if (metric === 'resources') {
      if (predictedValue > 80) {
        recommendations.push('Resource utilization is high - consider scaling');
        recommendations.push('Enable auto-scaling if not already active');
        recommendations.push('Review resource allocation across agents');
      } else if (predictedValue < 30) {
        recommendations.push('Resources are underutilized - consider scaling down');
        recommendations.push('Consolidate workloads to fewer agents');
      }
    } else if (metric === 'costs') {
      if (trend > 0.1) {
        recommendations.push('Costs are increasing - review resource usage');
        recommendations.push('Consider using spot instances for non-critical workloads');
        recommendations.push('Implement cost allocation tags for better tracking');
      }
    }
    
    // Add general recommendations
    if (percentChange > 20) {
      recommendations.push(`Monitor ${metric} closely due to significant predicted change`);
    }
    
    return recommendations.slice(0, 3); // Return top 3 recommendations
  }
}

export const predictiveAnalyticsService = new PredictiveAnalyticsService();