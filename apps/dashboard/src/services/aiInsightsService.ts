import { v4 as uuidv4 } from 'uuid';
import { Farm, Agent } from '@/types';
import { 
  AggregatedMetrics, 
  AgentPerformanceMetric, 
  TimeSeriesData 
} from '@/types/analytics';

export interface AIInsight {
  id: string;
  type: 'optimization' | 'anomaly' | 'trend' | 'recommendation' | 'alert';
  category: 'performance' | 'cost' | 'reliability' | 'scaling' | 'collaboration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  analysis: {
    dataPoints: number;
    confidence: number;
    impactScore: number;
    timeframe: string;
  };
  actionItems: {
    action: string;
    priority: 'low' | 'medium' | 'high';
    estimatedImpact: string;
    automated: boolean;
  }[];
  relatedMetrics: string[];
  visualizations?: {
    type: 'chart' | 'heatmap' | 'network' | 'timeline';
    data: any;
  }[];
  createdAt: Date;
  expiresAt?: Date;
  applied?: boolean;
  feedback?: {
    helpful: boolean;
    comments: string;
    timestamp: Date;
  };
}

export interface OptimizationSuggestion {
  id: string;
  targetArea: 'agent_allocation' | 'task_distribution' | 'resource_usage' | 'workflow' | 'scheduling';
  currentState: any;
  suggestedState: any;
  expectedImprovement: {
    metric: string;
    currentValue: number;
    expectedValue: number;
    improvementPercentage: number;
  }[];
  implementation: {
    steps: string[];
    estimatedTime: string;
    complexity: 'low' | 'medium' | 'high';
    requiresDowntime: boolean;
  };
  risks: {
    description: string;
    likelihood: 'low' | 'medium' | 'high';
    mitigation: string;
  }[];
}

class AIInsightsService {
  private insights: Map<string, AIInsight> = new Map();
  private suggestions: Map<string, OptimizationSuggestion> = new Map();
  private insightHistory: AIInsight[] = [];
  private learningData: Map<string, any> = new Map();

  async analyzeSystem(
    farms: Farm[],
    metrics: AggregatedMetrics,
    agentPerformance: AgentPerformanceMetric[],
    timeSeriesData: TimeSeriesData[]
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Analyze performance patterns
    const performanceInsights = await this.analyzePerformance(agentPerformance, timeSeriesData);
    insights.push(...performanceInsights);

    // Detect anomalies
    const anomalies = await this.detectAnomalies(metrics, timeSeriesData);
    insights.push(...anomalies);

    // Generate cost optimizations
    const costInsights = await this.analyzeCosts(farms, metrics);
    insights.push(...costInsights);

    // Analyze collaboration patterns
    const collaborationInsights = await this.analyzeCollaboration(farms, agentPerformance);
    insights.push(...collaborationInsights);

    // Predict scaling needs
    const scalingInsights = await this.predictScaling(farms, metrics, timeSeriesData);
    insights.push(...scalingInsights);

    // Store insights
    insights.forEach(insight => {
      this.insights.set(insight.id, insight);
      this.insightHistory.push(insight);
    });

    // Limit history size
    if (this.insightHistory.length > 1000) {
      this.insightHistory = this.insightHistory.slice(-1000);
    }

    return insights;
  }

  private async analyzePerformance(
    agentPerformance: AgentPerformanceMetric[],
    timeSeriesData: TimeSeriesData[]
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Analyze agent efficiency
    const avgSuccessRate = agentPerformance.reduce((sum, a) => sum + a.successRate, 0) / agentPerformance.length;
    const underperformingAgents = agentPerformance.filter(a => a.successRate < avgSuccessRate * 0.7);

    if (underperformingAgents.length > 0) {
      insights.push({
        id: uuidv4(),
        type: 'optimization',
        category: 'performance',
        severity: underperformingAgents.length > agentPerformance.length * 0.3 ? 'high' : 'medium',
        title: 'Underperforming Agents Detected',
        description: `${underperformingAgents.length} agents are performing below 70% of the average success rate`,
        analysis: {
          dataPoints: agentPerformance.length,
          confidence: 0.85,
          impactScore: underperformingAgents.length / agentPerformance.length,
          timeframe: 'last 24 hours'
        },
        actionItems: [
          {
            action: 'Redistribute tasks from underperforming agents',
            priority: 'high',
            estimatedImpact: `${(avgSuccessRate * 0.15).toFixed(1)}% improvement in overall success rate`,
            automated: true
          },
          {
            action: 'Review agent configurations for optimization opportunities',
            priority: 'medium',
            estimatedImpact: 'Potential 10-20% performance improvement',
            automated: false
          },
          {
            action: 'Consider retraining or replacing consistently underperforming agents',
            priority: 'low',
            estimatedImpact: 'Long-term reliability improvement',
            automated: false
          }
        ],
        relatedMetrics: ['agent_success_rate', 'task_completion_time', 'error_rate'],
        createdAt: new Date()
      });
    }

    // Analyze task completion trends
    const completionRateTrend = this.calculateTrend(timeSeriesData.find(s => s.label === 'Task Completion Rate'));
    if (completionRateTrend < -0.1) {
      insights.push({
        id: uuidv4(),
        type: 'trend',
        category: 'performance',
        severity: 'high',
        title: 'Declining Task Completion Rate',
        description: 'Task completion rate has decreased by more than 10% in the observed period',
        analysis: {
          dataPoints: timeSeriesData[0]?.data.length || 0,
          confidence: 0.78,
          impactScore: Math.abs(completionRateTrend),
          timeframe: 'trend analysis'
        },
        actionItems: [
          {
            action: 'Increase agent pool size to handle workload',
            priority: 'high',
            estimatedImpact: 'Restore completion rate to baseline',
            automated: true
          },
          {
            action: 'Analyze task queue for bottlenecks',
            priority: 'medium',
            estimatedImpact: 'Identify and resolve blocking issues',
            automated: false
          }
        ],
        relatedMetrics: ['task_queue_depth', 'agent_utilization', 'processing_time'],
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async detectAnomalies(
    metrics: AggregatedMetrics,
    timeSeriesData: TimeSeriesData[]
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Detect resource usage anomalies
    const cpuData = timeSeriesData.find(s => s.label === 'CPU Usage');
    if (cpuData) {
      const anomalies = this.detectTimeSeriesAnomalies(cpuData.data);
      if (anomalies.length > 0) {
        insights.push({
          id: uuidv4(),
          type: 'anomaly',
          category: 'performance',
          severity: anomalies.some(a => a.value > 90) ? 'critical' : 'high',
          title: 'Unusual CPU Usage Pattern Detected',
          description: `${anomalies.length} anomalous CPU usage spikes detected`,
          analysis: {
            dataPoints: cpuData.data.length,
            confidence: 0.82,
            impactScore: Math.max(...anomalies.map(a => a.value)) / 100,
            timeframe: 'recent activity'
          },
          actionItems: [
            {
              action: 'Investigate processes causing CPU spikes',
              priority: 'high',
              estimatedImpact: 'Prevent system overload',
              automated: false
            },
            {
              action: 'Enable automatic resource throttling',
              priority: 'medium',
              estimatedImpact: 'Maintain system stability',
              automated: true
            }
          ],
          relatedMetrics: ['cpu_usage', 'memory_usage', 'process_count'],
          visualizations: [{
            type: 'chart',
            data: anomalies
          }],
          createdAt: new Date()
        });
      }
    }

    // Detect error rate anomalies
    if (metrics.errorRate > 5) {
      insights.push({
        id: uuidv4(),
        type: 'anomaly',
        category: 'reliability',
        severity: metrics.errorRate > 10 ? 'critical' : 'high',
        title: 'Elevated Error Rate',
        description: `Error rate of ${metrics.errorRate.toFixed(1)}% exceeds acceptable threshold`,
        analysis: {
          dataPoints: metrics.totalTasks,
          confidence: 0.90,
          impactScore: metrics.errorRate / 100,
          timeframe: 'current'
        },
        actionItems: [
          {
            action: 'Enable automatic error recovery mechanisms',
            priority: 'high',
            estimatedImpact: 'Reduce error rate by 50%',
            automated: true
          },
          {
            action: 'Review recent changes and rollback if necessary',
            priority: 'high',
            estimatedImpact: 'Restore system stability',
            automated: false
          },
          {
            action: 'Implement circuit breakers for failing services',
            priority: 'medium',
            estimatedImpact: 'Prevent cascade failures',
            automated: true
          }
        ],
        relatedMetrics: ['error_rate', 'failed_tasks', 'retry_count'],
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async analyzeCosts(
    farms: Farm[],
    metrics: AggregatedMetrics
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Analyze cost efficiency
    const totalAgents = farms.reduce((sum, f) => sum + f.agents.length, 0);
    const idleAgents = farms.reduce((sum, f) => 
      sum + f.agents.filter(a => a.status === 'idle').length, 0
    );
    const idlePercentage = totalAgents > 0 ? (idleAgents / totalAgents) * 100 : 0;

    if (idlePercentage > 30) {
      const potentialSavings = (idleAgents * 0.05 * 24 * 30); // Assuming $0.05/hour per agent
      
      insights.push({
        id: uuidv4(),
        type: 'optimization',
        category: 'cost',
        severity: 'medium',
        title: 'Cost Optimization Opportunity',
        description: `${idlePercentage.toFixed(0)}% of agents are idle, presenting cost savings opportunity`,
        analysis: {
          dataPoints: totalAgents,
          confidence: 0.88,
          impactScore: idlePercentage / 100,
          timeframe: 'current state'
        },
        actionItems: [
          {
            action: `Scale down by ${Math.floor(idleAgents * 0.5)} agents`,
            priority: 'high',
            estimatedImpact: `Save $${(potentialSavings * 0.5).toFixed(2)}/month`,
            automated: true
          },
          {
            action: 'Enable aggressive auto-scaling policies',
            priority: 'medium',
            estimatedImpact: 'Maintain optimal agent count automatically',
            automated: true
          },
          {
            action: 'Implement predictive scaling based on workload patterns',
            priority: 'low',
            estimatedImpact: 'Further 10-15% cost reduction',
            automated: false
          }
        ],
        relatedMetrics: ['idle_agents', 'cost_per_task', 'agent_utilization'],
        createdAt: new Date()
      });
    }

    // Analyze cost per task
    const costPerTask = metrics.totalTasks > 0 ? 
      metrics.totalCost.total / metrics.totalTasks : 0;
    const benchmarkCostPerTask = 0.10; // $0.10 per task benchmark

    if (costPerTask > benchmarkCostPerTask * 1.5) {
      insights.push({
        id: uuidv4(),
        type: 'optimization',
        category: 'cost',
        severity: 'high',
        title: 'High Cost Per Task',
        description: `Cost per task ($${costPerTask.toFixed(3)}) is 50% above benchmark`,
        analysis: {
          dataPoints: metrics.totalTasks,
          confidence: 0.75,
          impactScore: (costPerTask - benchmarkCostPerTask) / benchmarkCostPerTask,
          timeframe: 'aggregated metrics'
        },
        actionItems: [
          {
            action: 'Optimize task batching to reduce overhead',
            priority: 'high',
            estimatedImpact: '20-30% cost reduction',
            automated: false
          },
          {
            action: 'Review and optimize agent resource allocation',
            priority: 'medium',
            estimatedImpact: '15% efficiency improvement',
            automated: false
          },
          {
            action: 'Consider using spot instances for non-critical workloads',
            priority: 'low',
            estimatedImpact: 'Up to 70% cost savings on compute',
            automated: false
          }
        ],
        relatedMetrics: ['cost_per_task', 'task_duration', 'resource_usage'],
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async analyzeCollaboration(
    farms: Farm[],
    agentPerformance: AgentPerformanceMetric[]
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Analyze agent collaboration efficiency
    const collaborativeTasks = this.identifyCollaborativeTasks(farms);
    
    if (collaborativeTasks.inefficient.length > 0) {
      insights.push({
        id: uuidv4(),
        type: 'optimization',
        category: 'collaboration',
        severity: 'medium',
        title: 'Inefficient Agent Collaboration Detected',
        description: `${collaborativeTasks.inefficient.length} collaborative workflows show suboptimal coordination`,
        analysis: {
          dataPoints: collaborativeTasks.total,
          confidence: 0.72,
          impactScore: collaborativeTasks.inefficient.length / collaborativeTasks.total,
          timeframe: 'recent workflows'
        },
        actionItems: [
          {
            action: 'Reorganize agent teams based on skill compatibility',
            priority: 'high',
            estimatedImpact: '25% improvement in collaboration efficiency',
            automated: false
          },
          {
            action: 'Implement better task handoff protocols',
            priority: 'medium',
            estimatedImpact: 'Reduce handoff delays by 40%',
            automated: true
          },
          {
            action: 'Create specialized agent pools for common workflows',
            priority: 'low',
            estimatedImpact: 'Long-term efficiency gains',
            automated: false
          }
        ],
        relatedMetrics: ['collaboration_score', 'handoff_time', 'workflow_duration'],
        visualizations: [{
          type: 'network',
          data: collaborativeTasks.graph
        }],
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async predictScaling(
    farms: Farm[],
    metrics: AggregatedMetrics,
    timeSeriesData: TimeSeriesData[]
  ): Promise<AIInsight[]> {
    const insights: AIInsight[] = [];

    // Predict future scaling needs
    const workloadTrend = this.calculateTrend(
      timeSeriesData.find(s => s.label === 'Active Tasks')
    );
    
    if (workloadTrend > 0.2) {
      const currentCapacity = farms.reduce((sum, f) => sum + f.agents.length, 0);
      const predictedCapacityNeeded = Math.ceil(currentCapacity * (1 + workloadTrend));
      
      insights.push({
        id: uuidv4(),
        type: 'recommendation',
        category: 'scaling',
        severity: 'medium',
        title: 'Proactive Scaling Recommended',
        description: 'Workload trending upward, scaling recommended to maintain performance',
        analysis: {
          dataPoints: timeSeriesData[0]?.data.length || 0,
          confidence: 0.68,
          impactScore: workloadTrend,
          timeframe: 'next 6 hours'
        },
        actionItems: [
          {
            action: `Pre-scale to ${predictedCapacityNeeded} agents`,
            priority: 'medium',
            estimatedImpact: 'Prevent performance degradation',
            automated: true
          },
          {
            action: 'Enable predictive auto-scaling',
            priority: 'high',
            estimatedImpact: 'Automatic capacity management',
            automated: true
          },
          {
            action: 'Reserve additional capacity for peak times',
            priority: 'low',
            estimatedImpact: 'Ensure availability during spikes',
            automated: false
          }
        ],
        relatedMetrics: ['workload_trend', 'capacity_utilization', 'queue_depth'],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) // Expires in 6 hours
      });
    }

    return insights;
  }

  private calculateTrend(series?: TimeSeriesData): number {
    if (!series || series.data.length < 2) return 0;
    
    const firstHalf = series.data.slice(0, Math.floor(series.data.length / 2));
    const secondHalf = series.data.slice(Math.floor(series.data.length / 2));
    
    const avgFirst = firstHalf.reduce((sum, d) => sum + d.value, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, d) => sum + d.value, 0) / secondHalf.length;
    
    return (avgSecond - avgFirst) / avgFirst;
  }

  private detectTimeSeriesAnomalies(data: any[]): any[] {
    if (!data || data.length < 10) return [];
    
    const values = data.map(d => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    
    // Detect values more than 2 standard deviations from mean
    return data.filter(d => Math.abs(d.value - mean) > 2 * stdDev);
  }

  private identifyCollaborativeTasks(farms: Farm[]): {
    total: number;
    efficient: any[];
    inefficient: any[];
    graph: any;
  } {
    // Simplified collaboration analysis
    return {
      total: farms.length * 10,
      efficient: [],
      inefficient: farms.slice(0, Math.floor(farms.length * 0.2)),
      graph: {
        nodes: farms.flatMap(f => f.agents.map(a => ({ id: a.id, group: f.id }))),
        links: []
      }
    };
  }

  async generateOptimizationPlan(
    insights: AIInsight[]
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    // Group insights by category
    const grouped = insights.reduce((acc, insight) => {
      if (!acc[insight.category]) acc[insight.category] = [];
      acc[insight.category].push(insight);
      return acc;
    }, {} as Record<string, AIInsight[]>);
    
    // Generate optimization suggestions for each category
    Object.entries(grouped).forEach(([category, categoryInsights]) => {
      const suggestion = this.createOptimizationSuggestion(category, categoryInsights);
      if (suggestion) {
        suggestions.push(suggestion);
        this.suggestions.set(suggestion.id, suggestion);
      }
    });
    
    return suggestions;
  }

  private createOptimizationSuggestion(
    category: string,
    insights: AIInsight[]
  ): OptimizationSuggestion | null {
    const highPriorityInsights = insights.filter(i => i.severity === 'high' || i.severity === 'critical');
    
    if (highPriorityInsights.length === 0) return null;
    
    const targetArea = this.mapCategoryToTargetArea(category);
    const steps = highPriorityInsights.flatMap(i => 
      i.actionItems.filter(a => a.priority === 'high').map(a => a.action)
    );
    
    return {
      id: uuidv4(),
      targetArea,
      currentState: { insights: insights.length, issues: highPriorityInsights.length },
      suggestedState: { optimized: true, automatedActions: steps.length },
      expectedImprovement: [{
        metric: category,
        currentValue: 60,
        expectedValue: 85,
        improvementPercentage: 41.7
      }],
      implementation: {
        steps,
        estimatedTime: '2-4 hours',
        complexity: highPriorityInsights.length > 3 ? 'high' : 'medium',
        requiresDowntime: false
      },
      risks: [{
        description: 'Temporary performance impact during optimization',
        likelihood: 'low',
        mitigation: 'Implement changes during low-traffic period'
      }]
    };
  }

  private mapCategoryToTargetArea(category: string): OptimizationSuggestion['targetArea'] {
    const mapping: Record<string, OptimizationSuggestion['targetArea']> = {
      performance: 'resource_usage',
      cost: 'agent_allocation',
      reliability: 'workflow',
      scaling: 'agent_allocation',
      collaboration: 'task_distribution'
    };
    return mapping[category] || 'workflow';
  }

  getInsights(
    filter?: {
      type?: AIInsight['type'];
      category?: AIInsight['category'];
      severity?: AIInsight['severity'];
      applied?: boolean;
    }
  ): AIInsight[] {
    let insights = Array.from(this.insights.values());
    
    if (filter) {
      if (filter.type) insights = insights.filter(i => i.type === filter.type);
      if (filter.category) insights = insights.filter(i => i.category === filter.category);
      if (filter.severity) insights = insights.filter(i => i.severity === filter.severity);
      if (filter.applied !== undefined) insights = insights.filter(i => i.applied === filter.applied);
    }
    
    return insights.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  applyInsight(insightId: string): boolean {
    const insight = this.insights.get(insightId);
    if (!insight) return false;
    
    // Execute automated actions
    const automatedActions = insight.actionItems.filter(a => a.automated);
    automatedActions.forEach(action => {
      console.log(`Executing automated action: ${action.action}`);
      // In production, this would trigger actual automation
    });
    
    insight.applied = true;
    this.insights.set(insightId, insight);
    return true;
  }

  provideFeedback(
    insightId: string,
    helpful: boolean,
    comments: string
  ): void {
    const insight = this.insights.get(insightId);
    if (!insight) return;
    
    insight.feedback = {
      helpful,
      comments,
      timestamp: new Date()
    };
    
    this.insights.set(insightId, insight);
    
    // Use feedback to improve future insights
    this.updateLearningData(insight, helpful);
  }

  private updateLearningData(insight: AIInsight, helpful: boolean): void {
    const key = `${insight.type}_${insight.category}`;
    const data = this.learningData.get(key) || { helpful: 0, total: 0 };
    
    data.total++;
    if (helpful) data.helpful++;
    
    this.learningData.set(key, data);
  }

  getInsightStatistics(): {
    total: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    applied: number;
    feedbackRate: number;
    helpfulRate: number;
  } {
    const insights = Array.from(this.insights.values());
    const withFeedback = insights.filter(i => i.feedback);
    const helpful = withFeedback.filter(i => i.feedback?.helpful);
    
    return {
      total: insights.length,
      byType: this.countBy(insights, 'type'),
      byCategory: this.countBy(insights, 'category'),
      bySeverity: this.countBy(insights, 'severity'),
      applied: insights.filter(i => i.applied).length,
      feedbackRate: insights.length > 0 ? withFeedback.length / insights.length : 0,
      helpfulRate: withFeedback.length > 0 ? helpful.length / withFeedback.length : 0
    };
  }

  private countBy<T>(items: T[], key: keyof T): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = String(item[key]);
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

export const aiInsightsService = new AIInsightsService();