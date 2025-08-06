import { 
  Insight, 
  InsightCategory, 
  InsightPriority,
  AggregatedMetrics,
  AgentPerformanceMetric,
  TimeSeriesData,
  Anomaly,
  Prediction
} from '../types/analytics';

interface InsightGenerationContext {
  metrics: AggregatedMetrics | null;
  agentPerformance: AgentPerformanceMetric[];
  timeSeriesData: TimeSeriesData[];
  anomalies: Anomaly[];
  predictions: Prediction[];
}

class AIInsightsService {
  async generateInsights(context: InsightGenerationContext): Promise<Insight[]> {
    const insights: Insight[] = [];

    // Performance insights
    insights.push(...this.generatePerformanceInsights(context));

    // Cost insights
    insights.push(...this.generateCostInsights(context));

    // Optimization insights
    insights.push(...this.generateOptimizationInsights(context));

    // Anomaly insights
    insights.push(...this.generateAnomalyInsights(context));

    // Sort by priority and confidence
    return insights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  private generatePerformanceInsights(context: InsightGenerationContext): Insight[] {
    const insights: Insight[] = [];

    if (!context.metrics) return insights;

    // Success rate insight
    const successRate = (context.metrics.completedTasks / context.metrics.totalTasks) * 100;
    if (successRate < 90) {
      insights.push({
        id: `insight_${Date.now()}_1`,
        category: 'performance',
        priority: successRate < 70 ? 'high' : 'medium',
        title: 'Below Target Success Rate',
        description: `Current success rate of ${successRate.toFixed(1)}% is below the target threshold of 90%. This may impact overall system reliability.`,
        impact: {
          metric: 'reliability',
          value: -((90 - successRate) / 90) * 100
        },
        evidence: [
          `${context.metrics.failedTasks} failed tasks out of ${context.metrics.totalTasks}`,
          `${context.metrics.errorRate.toFixed(2)}% error rate`
        ],
        suggestedActions: [
          'Review failed task logs',
          'Increase retry attempts',
          'Optimize agent workloads'
        ],
        generatedAt: new Date(),
        confidence: 0.95
      });
    }

    // Agent performance variations
    if (context.agentPerformance.length > 0) {
      const avgSuccessRate = context.agentPerformance.reduce((sum, a) => sum + a.successRate, 0) / context.agentPerformance.length;
      const underperformingAgents = context.agentPerformance.filter(a => a.successRate < avgSuccessRate * 0.8);

      if (underperformingAgents.length > 0) {
        insights.push({
          id: `insight_${Date.now()}_2`,
          category: 'performance',
          priority: 'medium',
          title: 'Agent Performance Imbalance',
          description: `${underperformingAgents.length} agents are performing significantly below average, indicating potential issues or inefficient task distribution.`,
          impact: {
            metric: 'efficiency',
            value: -15
          },
          evidence: underperformingAgents.map(a => `${a.agentName}: ${a.successRate.toFixed(1)}% success rate`),
          suggestedActions: [
            'Rebalance task distribution',
            'Investigate underperforming agents',
            'Consider agent-specific optimizations'
          ],
          generatedAt: new Date(),
          confidence: 0.88
        });
      }
    }

    return insights;
  }

  private generateCostInsights(context: InsightGenerationContext): Insight[] {
    const insights: Insight[] = [];

    if (!context.metrics) return insights;

    // Cost per task analysis
    const costPerTask = context.metrics.totalCost.total / context.metrics.completedTasks;
    const industryAverage = 0.15; // Example industry average

    if (costPerTask > industryAverage * 1.2) {
      insights.push({
        id: `insight_${Date.now()}_3`,
        category: 'cost',
        priority: costPerTask > industryAverage * 1.5 ? 'high' : 'medium',
        title: 'Above Average Cost Per Task',
        description: `Current cost per task ($${costPerTask.toFixed(3)}) is ${((costPerTask / industryAverage - 1) * 100).toFixed(0)}% above industry average.`,
        impact: {
          metric: 'cost_efficiency',
          value: -((costPerTask - industryAverage) / industryAverage) * 100
        },
        evidence: [
          `Total cost: $${context.metrics.totalCost.total.toFixed(2)}`,
          `Completed tasks: ${context.metrics.completedTasks}`,
          `Compute costs: $${context.metrics.totalCost.compute.toFixed(2)}`
        ],
        suggestedActions: [
          'Optimize resource allocation',
          'Consider spot instances',
          'Review and eliminate idle resources'
        ],
        generatedAt: new Date(),
        confidence: 0.92
      });
    }

    // Resource utilization vs cost
    const utilizationEfficiency = context.metrics.resourceUtilization.cpu * context.metrics.resourceUtilization.memory / 10000;
    if (utilizationEfficiency < 0.5) {
      insights.push({
        id: `insight_${Date.now()}_4`,
        category: 'cost',
        priority: 'medium',
        title: 'Low Resource Utilization',
        description: 'Resources are underutilized, leading to unnecessary costs. Consider downsizing or consolidating infrastructure.',
        impact: {
          metric: 'cost_savings',
          value: (1 - utilizationEfficiency) * 30
        },
        evidence: [
          `CPU utilization: ${context.metrics.resourceUtilization.cpu.toFixed(1)}%`,
          `Memory utilization: ${context.metrics.resourceUtilization.memory.toFixed(1)}%`
        ],
        suggestedActions: [
          'Implement auto-scaling',
          'Consolidate workloads',
          'Right-size instances'
        ],
        generatedAt: new Date(),
        confidence: 0.85
      });
    }

    return insights;
  }

  private generateOptimizationInsights(context: InsightGenerationContext): Insight[] {
    const insights: Insight[] = [];

    // Task completion time optimization
    if (context.metrics && context.metrics.averageCompletionTime > 300) { // 5 minutes
      insights.push({
        id: `insight_${Date.now()}_5`,
        category: 'optimization',
        priority: 'medium',
        title: 'Long Task Completion Times',
        description: `Average task completion time of ${(context.metrics.averageCompletionTime / 60).toFixed(1)} minutes exceeds optimal threshold.`,
        impact: {
          metric: 'throughput',
          value: -20
        },
        evidence: [
          `Average completion: ${context.metrics.averageCompletionTime}s`,
          `Total tasks: ${context.metrics.totalTasks}`
        ],
        suggestedActions: [
          'Implement task parallelization',
          'Optimize agent algorithms',
          'Add caching mechanisms'
        ],
        generatedAt: new Date(),
        confidence: 0.78
      });
    }

    // Agent pool optimization
    if (context.agentPerformance.length > 0) {
      const idleAgents = context.agentPerformance.filter(a => a.tasksCompleted === 0).length;
      const idlePercentage = (idleAgents / context.agentPerformance.length) * 100;

      if (idlePercentage > 20) {
        insights.push({
          id: `insight_${Date.now()}_6`,
          category: 'optimization',
          priority: 'low',
          title: 'Excessive Idle Agents',
          description: `${idlePercentage.toFixed(0)}% of agents are idle. Consider reducing pool size or improving task distribution.`,
          impact: {
            metric: 'resource_efficiency',
            value: idlePercentage
          },
          evidence: [
            `${idleAgents} idle agents out of ${context.agentPerformance.length}`,
            'No tasks completed by these agents'
          ],
          suggestedActions: [
            'Reduce agent pool size',
            'Implement dynamic scaling',
            'Improve load balancing'
          ],
          generatedAt: new Date(),
          confidence: 0.91
        });
      }
    }

    return insights;
  }

  private generateAnomalyInsights(context: InsightGenerationContext): Insight[] {
    const insights: Insight[] = [];

    // Check for anomalies
    context.anomalies.forEach(anomaly => {
      if (!anomaly.resolved && anomaly.severity === 'high') {
        insights.push({
          id: `insight_${Date.now()}_anomaly_${anomaly.id}`,
          category: 'anomaly',
          priority: 'high',
          title: `Critical Anomaly: ${anomaly.metric}`,
          description: anomaly.description,
          impact: {
            metric: anomaly.metric,
            value: ((anomaly.actualValue - anomaly.expectedValue) / anomaly.expectedValue) * 100
          },
          evidence: [
            `Expected: ${anomaly.expectedValue.toFixed(2)}`,
            `Actual: ${anomaly.actualValue.toFixed(2)}`,
            `Deviation: ${anomaly.deviation.toFixed(2)}σ`
          ],
          suggestedActions: [
            'Investigate root cause immediately',
            'Check system logs for errors',
            'Review recent changes'
          ],
          generatedAt: new Date(),
          confidence: 0.95
        });
      }
    });

    // Predictive anomalies
    context.predictions.forEach(prediction => {
      if (prediction.trend === 'down' && prediction.metric === 'performance' && prediction.confidence > 0.8) {
        insights.push({
          id: `insight_${Date.now()}_pred_${prediction.id}`,
          category: 'anomaly',
          priority: 'medium',
          title: 'Predicted Performance Degradation',
          description: prediction.insight || 'Performance metrics show concerning downward trend.',
          impact: {
            metric: 'performance',
            value: -15
          },
          evidence: [
            `Current trend: ${prediction.trend}`,
            `Predicted value: ${prediction.predictedValue.toFixed(2)}`,
            `Confidence: ${(prediction.confidence * 100).toFixed(0)}%`
          ],
          suggestedActions: prediction.recommendations || ['Monitor closely', 'Prepare mitigation strategies'],
          generatedAt: new Date(),
          confidence: prediction.confidence
        });
      }
    });

    return insights;
  }

  async generateRealtimeInsight(metric: string, currentValue: number, threshold: number): Promise<Insight | null> {
    if (Math.abs(currentValue - threshold) / threshold > 0.2) {
      const isAbove = currentValue > threshold;
      return {
        id: `insight_realtime_${Date.now()}`,
        category: 'anomaly',
        priority: 'high',
        title: `${metric} Threshold ${isAbove ? 'Exceeded' : 'Below Target'}`,
        description: `${metric} is currently at ${currentValue.toFixed(2)}, which is ${Math.abs(((currentValue - threshold) / threshold) * 100).toFixed(0)}% ${isAbove ? 'above' : 'below'} the threshold of ${threshold}.`,
        impact: {
          metric: metric.toLowerCase(),
          value: ((currentValue - threshold) / threshold) * 100
        },
        evidence: [`Current: ${currentValue}`, `Threshold: ${threshold}`],
        suggestedActions: [
          isAbove ? 'Scale resources' : 'Investigate performance issues',
          'Adjust thresholds if needed'
        ],
        generatedAt: new Date(),
        confidence: 1.0
      };
    }
    return null;
  }
}

export const aiInsights = new AIInsightsService();