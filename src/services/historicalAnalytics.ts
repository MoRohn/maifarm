import { Farm, Agent } from '../types';

export interface HistoricalMetrics {
  totalFarms: number;
  successRate: number;
  averageDuration: number;
  averageAgentCount: number;
  mostProductiveTimeOfDay: string;
  commonPatterns: Pattern[];
  performanceTrends: Trend[];
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  successRate: number;
  averageImpact: number;
}

export interface Trend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  period: string;
  significance: 'low' | 'medium' | 'high';
}

export interface TimelineEvent {
  id: string;
  farmId: string;
  timestamp: Date;
  type: 'start' | 'complete' | 'error' | 'milestone' | 'insight';
  title: string;
  description: string;
  impact?: 'low' | 'medium' | 'high';
  agentIds?: string[];
}

export interface PerformanceInsight {
  id: string;
  type: 'efficiency' | 'collaboration' | 'bottleneck' | 'success_factor' | 'anomaly';
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
  relatedFarms: string[];
  potentialImpact: number; // 0-100
}

export interface FarmComparison {
  farmA: string;
  farmB: string;
  similarities: string[];
  differences: string[];
  performanceComparison: {
    metric: string;
    farmAValue: number;
    farmBValue: number;
    winner: string;
  }[];
}

export class HistoricalAnalyticsService {
  private farms: Map<string, Farm> = new Map();
  private events: TimelineEvent[] = [];
  private insights: PerformanceInsight[] = [];
  private patterns: Map<string, Pattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    const commonPatterns: Pattern[] = [
      {
        id: 'parallel-execution',
        name: 'Parallel Task Execution',
        description: 'Multiple agents working on independent tasks simultaneously',
        frequency: 0,
        successRate: 85,
        averageImpact: 40
      },
      {
        id: 'iterative-refinement',
        name: 'Iterative Refinement',
        description: 'Agents repeatedly improving solutions through multiple passes',
        frequency: 0,
        successRate: 78,
        averageImpact: 35
      },
      {
        id: 'specialized-teams',
        name: 'Specialized Agent Teams',
        description: 'Agents with specific roles working together',
        frequency: 0,
        successRate: 82,
        averageImpact: 45
      },
      {
        id: 'exploratory-phase',
        name: 'Initial Exploration Phase',
        description: 'Agents exploring problem space before implementation',
        frequency: 0,
        successRate: 73,
        averageImpact: 30
      }
    ];

    commonPatterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });
  }

  public addFarm(farm: Farm): void {
    this.farms.set(farm.id, farm);
    this.analyzeNewFarm(farm);
  }

  public getHistoricalMetrics(): HistoricalMetrics {
    const allFarms = Array.from(this.farms.values());
    const completedFarms = allFarms.filter(f => f.status === 'completed');
    
    return {
      totalFarms: allFarms.length,
      successRate: this.calculateSuccessRate(completedFarms),
      averageDuration: this.calculateAverageDuration(completedFarms),
      averageAgentCount: this.calculateAverageAgentCount(allFarms),
      mostProductiveTimeOfDay: this.findMostProductiveTime(completedFarms),
      commonPatterns: this.identifyCommonPatterns(allFarms),
      performanceTrends: this.analyzePerformanceTrends(allFarms)
    };
  }

  private calculateSuccessRate(farms: Farm[]): number {
    if (farms.length === 0) return 0;
    const successful = farms.filter(f => (f.metrics as any)?.successScore > 70).length;
    return Math.round((successful / farms.length) * 100);
  }

  private calculateAverageDuration(farms: Farm[]): number {
    if (farms.length === 0) return 0;
    const totalDuration = farms.reduce((sum, farm) => {
      if ((farm as any).startTime && (farm as any).endTime) {
        return sum + (new Date((farm as any).endTime).getTime() - new Date((farm as any).startTime).getTime());
      }
      return sum;
    }, 0);
    return Math.round(totalDuration / farms.length / 1000 / 60); // minutes
  }

  private calculateAverageAgentCount(farms: Farm[]): number {
    if (farms.length === 0) return 0;
    const totalAgents = farms.reduce((sum, farm) => sum + (farm.agents?.length || 0), 0);
    return Math.round(totalAgents / farms.length);
  }

  private findMostProductiveTime(farms: Farm[]): string {
    const hourBuckets: { [hour: number]: number } = {};
    
    farms.forEach(farm => {
      if ((farm as any).startTime && (farm.metrics as any)?.successScore > 70) {
        const hour = new Date((farm as any).startTime).getHours();
        hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
      }
    });

    const mostProductiveHour = Object.entries(hourBuckets)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (!mostProductiveHour) return 'Not enough data';
    
    const hour = parseInt(mostProductiveHour[0]);
    return `${hour}:00 - ${hour + 1}:00`;
  }

  private identifyCommonPatterns(farms: Farm[]): Pattern[] {
    // Analyze farms for patterns
    farms.forEach(farm => {
      this.detectPatternsInFarm(farm);
    });

    // Return patterns sorted by frequency
    return Array.from(this.patterns.values())
      .filter(p => p.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency);
  }

  private detectPatternsInFarm(farm: Farm): void {
    // Parallel execution detection
    if (farm.agents && farm.agents.length > 2) {
      const parallelTasks = this.detectParallelTasks(farm);
      if (parallelTasks > 2) {
        this.incrementPattern('parallel-execution');
      }
    }

    // Iterative refinement detection
    if ((farm.metrics as any)?.iterationCount > 3) {
      this.incrementPattern('iterative-refinement');
    }

    // Specialized teams detection
    if (this.hasSpecializedAgents(farm)) {
      this.incrementPattern('specialized-teams');
    }

    // Exploratory phase detection
    if ((farm.metrics as any)?.explorationTime > 0.2 * ((farm.metrics as any)?.totalTime || 1)) {
      this.incrementPattern('exploratory-phase');
    }
  }

  private detectParallelTasks(farm: Farm): number {
    // Simplified parallel task detection
    return farm.agents?.filter(a => a.status === 'working' || a.status === 'running').length || 0;
  }

  private hasSpecializedAgents(farm: Farm): boolean {
    if (!farm.agents) return false;
    const roles = new Set(farm.agents.map(a => (a as any).role || 'general'));
    return roles.size > 1;
  }

  private incrementPattern(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.frequency++;
    }
  }

  private analyzePerformanceTrends(farms: Farm[]): Trend[] {
    const trends: Trend[] = [];
    
    // Sort farms by date
    const sortedFarms = farms
      .filter(f => (f as any).startTime)
      .sort((a, b) => new Date((a as any).startTime!).getTime() - new Date((b as any).startTime!).getTime());
    
    if (sortedFarms.length < 5) {
      return trends; // Not enough data for trends
    }

    // Analyze success rate trend
    const successTrend = this.calculateTrend(
      sortedFarms,
      f => (f.metrics as any)?.successScore || 0
    );
    trends.push({
      metric: 'Success Rate',
      direction: successTrend.direction,
      changePercent: successTrend.changePercent,
      period: 'Last 7 days',
      significance: successTrend.significance
    });

    // Analyze duration trend
    const durationTrend = this.calculateTrend(
      sortedFarms,
      f => {
        if ((f as any).startTime && (f as any).endTime) {
          return new Date((f as any).endTime).getTime() - new Date((f as any).startTime).getTime();
        }
        return 0;
      }
    );
    trends.push({
      metric: 'Average Duration',
      direction: durationTrend.direction === 'up' ? 'down' : 'up', // Inverse for duration
      changePercent: durationTrend.changePercent,
      period: 'Last 7 days',
      significance: durationTrend.significance
    });

    // Analyze agent efficiency trend
    const efficiencyTrend = this.calculateTrend(
      sortedFarms,
      f => ((f.metrics as any)?.successScore || 0) / (f.agents?.length || 1)
    );
    trends.push({
      metric: 'Agent Efficiency',
      direction: efficiencyTrend.direction,
      changePercent: efficiencyTrend.changePercent,
      period: 'Last 7 days',
      significance: efficiencyTrend.significance
    });

    return trends;
  }

  private calculateTrend(
    farms: Farm[],
    metricExtractor: (farm: Farm) => number
  ): { direction: 'up' | 'down' | 'stable'; changePercent: number; significance: 'low' | 'medium' | 'high' } {
    const recentHalf = farms.slice(Math.floor(farms.length / 2));
    const olderHalf = farms.slice(0, Math.floor(farms.length / 2));
    
    const recentAvg = recentHalf.reduce((sum, f) => sum + metricExtractor(f), 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, f) => sum + metricExtractor(f), 0) / olderHalf.length;
    
    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    let direction: 'up' | 'down' | 'stable' = 'stable';
    let significance: 'low' | 'medium' | 'high' = 'low';
    
    if (Math.abs(changePercent) < 5) {
      direction = 'stable';
    } else if (changePercent > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }
    
    if (Math.abs(changePercent) > 20) {
      significance = 'high';
    } else if (Math.abs(changePercent) > 10) {
      significance = 'medium';
    }
    
    return { direction, changePercent: Math.abs(changePercent), significance };
  }

  private analyzeNewFarm(farm: Farm): void {
    // Add start event
    this.addEvent({
      id: `event-${Date.now()}-start`,
      farmId: farm.id,
      timestamp: new Date((farm as any).startTime || Date.now()),
      type: 'start',
      title: `Farm "${farm.name}" started`,
      description: `Started with ${farm.agents?.length || 0} agents`,
      agentIds: farm.agents?.map(a => a.id)
    });

    // Generate initial insights
    this.generateFarmInsights(farm);
  }

  private addEvent(event: TimelineEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private generateFarmInsights(farm: Farm): void {
    // Agent count insight
    if (farm.agents && farm.agents.length > 5) {
      this.insights.push({
        id: `insight-${Date.now()}-agents`,
        type: 'efficiency',
        title: 'Large Agent Team Detected',
        description: `This farm has ${farm.agents.length} agents, which is above average`,
        recommendation: 'Consider if all agents are necessary or if some tasks can be consolidated',
        confidence: 85,
        relatedFarms: [farm.id],
        potentialImpact: 30
      });
    }

    // Check for similar past farms
    const similarFarms = this.findSimilarFarms(farm);
    if (similarFarms.length > 0) {
      const bestPerformer = similarFarms
        .sort((a, b) => ((b.metrics as any)?.successScore || 0) - ((a.metrics as any)?.successScore || 0))[0];
      
      this.insights.push({
        id: `insight-${Date.now()}-similar`,
        type: 'success_factor',
        title: 'Similar Successful Farm Found',
        description: `Farm "${bestPerformer.name}" had similar configuration and achieved ${(bestPerformer.metrics as any)?.successScore}% success`,
        recommendation: `Review the approach used in "${bestPerformer.name}" for potential optimizations`,
        confidence: 75,
        relatedFarms: [farm.id, bestPerformer.id],
        potentialImpact: 45
      });
    }
  }

  private findSimilarFarms(targetFarm: Farm): Farm[] {
    return Array.from(this.farms.values()).filter(farm => {
      if (farm.id === targetFarm.id) return false;
      
      // Similar agent count
      const agentDiff = Math.abs((farm.agents?.length || 0) - (targetFarm.agents?.length || 0));
      if (agentDiff > 2) return false;
      
      // Similar configuration
      if ((farm as any).type !== (targetFarm as any).type) return false;
      
      return true;
    });
  }

  public getTimelineEvents(
    farmId?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): TimelineEvent[] {
    let filteredEvents = this.events;
    
    if (farmId) {
      filteredEvents = filteredEvents.filter(e => e.farmId === farmId);
    }
    
    if (startDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= startDate);
    }
    
    if (endDate) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= endDate);
    }
    
    return filteredEvents.slice(0, limit);
  }

  public getPerformanceInsights(
    farmId?: string,
    type?: PerformanceInsight['type']
  ): PerformanceInsight[] {
    let filteredInsights = this.insights;
    
    if (farmId) {
      filteredInsights = filteredInsights.filter(i => i.relatedFarms.includes(farmId));
    }
    
    if (type) {
      filteredInsights = filteredInsights.filter(i => i.type === type);
    }
    
    return filteredInsights.sort((a, b) => b.potentialImpact - a.potentialImpact);
  }

  public compareFarms(farmIdA: string, farmIdB: string): FarmComparison | null {
    const farmA = this.farms.get(farmIdA);
    const farmB = this.farms.get(farmIdB);
    
    if (!farmA || !farmB) return null;
    
    const similarities: string[] = [];
    const differences: string[] = [];
    const performanceComparison: FarmComparison['performanceComparison'] = [];
    
    // Compare basic properties
    if ((farmA as any).type === (farmB as any).type) {
      similarities.push(`Both are ${(farmA as any).type} farms`);
    } else {
      differences.push(`Different farm types: ${(farmA as any).type} vs ${(farmB as any).type}`);
    }
    
    // Compare agent counts
    const agentDiff = Math.abs((farmA.agents?.length || 0) - (farmB.agents?.length || 0));
    if (agentDiff <= 1) {
      similarities.push('Similar agent team sizes');
    } else {
      differences.push(`Different team sizes: ${farmA.agents?.length || 0} vs ${farmB.agents?.length || 0} agents`);
    }
    
    // Compare performance metrics
    if (farmA.metrics && farmB.metrics) {
      performanceComparison.push({
        metric: 'Success Score',
        farmAValue: (farmA.metrics as any).successScore || 0,
        farmBValue: (farmB.metrics as any).successScore || 0,
        winner: ((farmA.metrics as any).successScore || 0) > ((farmB.metrics as any).successScore || 0) ? farmIdA : farmIdB
      });
      
      performanceComparison.push({
        metric: 'Tasks Completed',
        farmAValue: farmA.metrics.completedTasks,
        farmBValue: farmB.metrics.completedTasks,
        winner: farmA.metrics.completedTasks > farmB.metrics.completedTasks ? farmIdA : farmIdB
      });
      
      if ((farmA as any).startTime && (farmA as any).endTime && (farmB as any).startTime && (farmB as any).endTime) {
        const durationA = new Date((farmA as any).endTime).getTime() - new Date((farmA as any).startTime).getTime();
        const durationB = new Date((farmB as any).endTime).getTime() - new Date((farmB as any).startTime).getTime();
        
        performanceComparison.push({
          metric: 'Duration (minutes)',
          farmAValue: Math.round(durationA / 1000 / 60),
          farmBValue: Math.round(durationB / 1000 / 60),
          winner: durationA < durationB ? farmIdA : farmIdB
        });
      }
    }
    
    return {
      farmA: farmIdA,
      farmB: farmIdB,
      similarities,
      differences,
      performanceComparison
    };
  }

  public searchFarms(query: string): Farm[] {
    const searchTerms = query.toLowerCase().split(' ');
    
    return Array.from(this.farms.values()).filter(farm => {
      const farmText = `${farm.name} ${farm.description ?? ''} ${(farm as any).type ?? ''}`.toLowerCase();
      
      return searchTerms.every(term => {
        // Check basic properties
        if (farmText.includes(term)) return true;
        
        // Check metrics
        if (term === 'successful' && (farm.metrics as any)?.successScore > 70) return true;
        if (term === 'failed' && (farm.metrics as any)?.successScore <= 30) return true;
        if (term === 'fast' && (farm.metrics as any)?.totalTime < 600) return true; // Less than 10 minutes
        if (term === 'slow' && (farm.metrics as any)?.totalTime > 1800) return true; // More than 30 minutes
        
        // Check agent properties
        if (term === 'collaborative' && (farm.agents?.length || 0) > 3) return true;
        if (term === 'solo' && (farm.agents?.length || 0) === 1) return true;
        
        return false;
      });
    });
  }

  public exportAnalytics(format: 'json' | 'csv'): string {
    const data = {
      metrics: this.getHistoricalMetrics(),
      insights: this.getPerformanceInsights(),
      patterns: Array.from(this.patterns.values()),
      recentEvents: this.getTimelineEvents(undefined, undefined, undefined, 50)
    };
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple CSV export
      const csvData: string[] = ['Metric,Value'];
      const metrics = data.metrics;
      
      csvData.push(`Total Farms,${metrics.totalFarms}`);
      csvData.push(`Success Rate,${metrics.successRate}%`);
      csvData.push(`Average Duration,${metrics.averageDuration} minutes`);
      csvData.push(`Average Agent Count,${metrics.averageAgentCount}`);
      csvData.push(`Most Productive Time,${metrics.mostProductiveTimeOfDay}`);
      
      return csvData.join('\n');
    }
  }
}