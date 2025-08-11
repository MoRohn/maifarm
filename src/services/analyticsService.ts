import { 
  AggregatedMetrics, 
  TimeSeriesData, 
  AgentPerformanceMetric,
  TimeRange,
  AnalyticsFilter,
  ResourceUtilization,
  CostBreakdown,
  PerformanceTrend,
  TaskCompletion,
  ErrorMetric,
  MetricDataPoint
} from '../types/analytics';
import { Farm, Agent } from '../types';
import { format, subHours, subDays, startOfHour, startOfDay, differenceInMinutes } from 'date-fns';
import { groupBy, mean, sum, max, min } from 'lodash';
import { websocketService } from './websocket';
import apiClient from './apiClient';

class AnalyticsService {
  private mockDataInterval: NodeJS.Timeout | null = null;
  private claudeCodeMetrics: any = null;
  private realtimeListeners: Map<string, (data: any) => void> = new Map();
  private websocketSubscribed: boolean = false;

  // Generate mock historical data for development
  generateMockTimeSeriesData(timeRange: TimeRange): TimeSeriesData[] {
    const { start, end } = timeRange;
    
    // Defensive type checking - ensure start and end are Date objects
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn('Invalid date range provided to generateMockTimeSeriesData, using default range');
      const now = new Date();
      const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      return this.generateMockTimeSeriesData({ start: defaultStart, end: now });
    }
    
    const dataPoints: Array<{ timestamp: Date; value: number }> = [];
    const interval = differenceInMinutes(endDate, startDate) / 50; // 50 data points
    
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(startDate.getTime() + i * interval * 60 * 1000);
      dataPoints.push({
        timestamp: timestamp,
        value: Math.random() * 100 + Math.sin(i / 10) * 20,
      });
    }

    return [
      {
        label: 'CPU Usage',
        data: dataPoints.map(p => ({ timestamp: p.timestamp, value: Math.min(100, Math.max(0, p.value)) })),
        unit: '%',
        color: '#3B82F6',
      },
      {
        label: 'Memory Usage',
        data: dataPoints.map(p => ({ timestamp: p.timestamp, value: Math.min(100, Math.max(0, p.value * 0.8)) })),
        unit: '%',
        color: '#8B5CF6',
      },
      {
        label: 'Task Completion Rate',
        data: dataPoints.map(p => ({ timestamp: p.timestamp, value: Math.min(100, Math.max(0, p.value * 0.9 + 10)) })),
        unit: '%',
        color: '#10B981',
      },
      {
        label: 'Error Rate',
        data: dataPoints.map(p => ({ timestamp: p.timestamp, value: Math.min(20, Math.max(0, 20 - p.value * 0.15)) })),
        unit: '%',
        color: '#EF4444',
      },
      {
        label: 'Cost per Hour',
        data: dataPoints.map(p => ({ timestamp: p.timestamp, value: Math.max(0.1, p.value * 0.005 + 0.5) })),
        unit: '$',
        color: '#F59E0B',
      },
    ];
  }

  // Fetch real Claude Code metrics
  async fetchClaudeCodeMetrics(): Promise<any> {
    try {
      // Check for active agents file from Claude Code
      const response = await apiClient.get('/api/analytics/claude-metrics');
      if (response.data) {
        this.claudeCodeMetrics = response.data;
        return this.claudeCodeMetrics;
      }
    } catch (error) {
      console.warn('Failed to fetch Claude Code metrics, using simulated data');
    }
    return null;
  }

  // Refresh metrics from backend
  async refreshMetrics(): Promise<void> {
    try {
      const [metrics, costs, efficiency, cpuGpu] = await Promise.all([
        apiClient.get('/api/analytics/metrics'),
        apiClient.get('/api/analytics/costs'),
        apiClient.get('/api/analytics/agent-efficiency'),
        apiClient.get('/api/analytics/cpu-gpu')
      ]);

      // Emit updates through WebSocket service
      if (websocketService.connected) {
        websocketService.emit('analytics:update', {
          metrics: metrics.data,
          costs: costs.data,
          efficiency: efficiency.data,
          resources: cpuGpu.data
        });
      }

      // Update local cache
      localStorage.setItem('analytics_cache', JSON.stringify({
        metrics: metrics.data,
        costs: costs.data,
        efficiency: efficiency.data,
        resources: cpuGpu.data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to refresh metrics:', error);
      throw error;
    }
  }

  // Calculate aggregated metrics from raw data
  async calculateAggregatedMetrics(
    timeRange: TimeRange,
    farms?: Farm[],
    agents?: Agent[]
  ): Promise<AggregatedMetrics> {
    // Try to get real metrics from Claude Code first
    const claudeMetrics = await this.fetchClaudeCodeMetrics();
    
    // Use real metrics if available, otherwise use calculated/mock data
    const totalTasks = claudeMetrics?.totalTasks || (farms?.reduce((acc, farm) => acc + (farm.tasks?.length || 0), 0) || Math.floor(Math.random() * 1000) + 500);
    const completedTasks = claudeMetrics?.completedTasks || Math.floor(totalTasks * 0.85);
    const failedTasks = claudeMetrics?.failedTasks || Math.floor(totalTasks * 0.05);
    const activeAgents = claudeMetrics?.activeAgents || agents?.length || Math.floor(Math.random() * 20) + 5;

    // Get real resource metrics from system or Claude Code
    const resourceUtilization: ResourceUtilization = {
      cpu: claudeMetrics?.cpu || Math.random() * 60 + 20,
      memory: claudeMetrics?.memory || Math.random() * 50 + 30,
      storage: claudeMetrics?.storage || Math.random() * 40 + 20,
      network: claudeMetrics?.network || Math.random() * 30 + 10,
      gpu: claudeMetrics?.gpu || Math.random() * 40 + 10, // Add GPU metrics
      timestamp: new Date(),
    };

      // Calculate real costs based on Claude Code API usage
    const apiCallCount = claudeMetrics?.apiCalls || 1000;
    const apiCostPerCall = 0.002; // $0.002 per API call (matching backend)
    const computeHours = (resourceUtilization.cpu / 100) * 24; // CPU hours
    const computeCostPerHour = 0.10; // $0.10 per compute hour
    
    const costBreakdown: CostBreakdown = {
      total: 0, // Will calculate below
      compute: claudeMetrics?.costs?.compute || (computeHours * computeCostPerHour),
      storage: claudeMetrics?.costs?.storage || (Math.random() * 100 + 20),
      network: claudeMetrics?.costs?.network || (Math.random() * 50 + 10),
      api: claudeMetrics?.costs?.api || (apiCallCount * apiCostPerCall),
      period: 'daily',
      currency: 'USD',
    };
    costBreakdown.total = costBreakdown.compute + costBreakdown.storage + costBreakdown.network + costBreakdown.api;

    const performanceTrends: PerformanceTrend[] = [
      {
        metric: 'Task Completion Time',
        currentValue: 45.2,
        previousValue: 52.1,
        change: -6.9,
        changePercent: -13.2,
        trend: 'down',
        forecast: [44.5, 43.8, 43.2, 42.9, 42.5],
      },
      {
        metric: 'Success Rate',
        currentValue: 94.5,
        previousValue: 92.3,
        change: 2.2,
        changePercent: 2.4,
        trend: 'up',
        forecast: [94.8, 95.1, 95.3, 95.5, 95.7],
      },
      {
        metric: 'Resource Efficiency',
        currentValue: 78.3,
        previousValue: 78.1,
        change: 0.2,
        changePercent: 0.3,
        trend: 'stable',
        forecast: [78.4, 78.5, 78.5, 78.6, 78.7],
      },
    ];

    // Calculate harvest metrics
    const harvestMetrics = farms ? this.calculateHarvestMetrics(farms) : {
      totalYield: Math.floor(Math.random() * 1000),
      qualityScore: Math.floor(Math.random() * 30 + 70),
      efficiency: Math.floor(Math.random() * 30 + 60)
    };
    
    // Calculate pending and in-progress tasks
    const inProgressTasks = Math.floor(totalTasks * 0.08);
    const pendingTasks = totalTasks - completedTasks - failedTasks - inProgressTasks;

    return {
      timeRange,
      totalTasks,
      completedTasks,
      failedTasks,
      inProgressTasks,
      pendingTasks,
      averageCompletionTime: Math.random() * 60 + 30,
      totalCost: costBreakdown,
      activeAgents,
      resourceUtilization,
      errorRate: (failedTasks / totalTasks) * 100,
      performanceTrends,
      harvestMetrics,
    };
  }

  // Get agent performance metrics
  async getAgentPerformanceMetrics(
    agents: Agent[],
    timeRange: TimeRange
  ): Promise<AgentPerformanceMetric[]> {
    return agents.map(agent => ({
      agentId: agent.id,
      agentName: agent.name,
      tasksCompleted: Math.floor(Math.random() * 100) + 20,
      tasksInProgress: agent.status === 'working' ? Math.floor(Math.random() * 5) + 1 : 0,
      tasksFailed: Math.floor(Math.random() * 10),
      averageResponseTime: Math.random() * 30 + 10,
      successRate: Math.random() * 20 + 80,
      lastActive: agent.lastActive,
      resourceUsage: {
        cpu: agent.cpu,
        memory: agent.memory,
        storage: Math.random() * 50 + 10,
        network: Math.random() * 20 + 5,
        timestamp: new Date(),
      },
      costMetrics: {
        total: Math.random() * 50 + 10,
        compute: Math.random() * 20 + 5,
        storage: Math.random() * 10 + 2,
        network: Math.random() * 5 + 1,
        api: Math.random() * 15 + 2,
        period: 'hourly',
        currency: 'USD',
      },
    }));
  }

  // Get recent task completions
  async getTaskCompletions(
    timeRange: TimeRange,
    limit: number = 100
  ): Promise<TaskCompletion[]> {
    // Defensive type checking
    const startDate = timeRange.start instanceof Date ? timeRange.start : new Date(timeRange.start);
    const endDate = timeRange.end instanceof Date ? timeRange.end : new Date(timeRange.end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn('Invalid date range provided to getTaskCompletions');
      return [];
    }
    
    const tasks: TaskCompletion[] = [];
    const statuses: TaskCompletion['status'][] = ['completed', 'failed', 'in_progress', 'pending'];
    
    for (let i = 0; i < limit; i++) {
      const startTime = new Date(
        startDate.getTime() + 
        Math.random() * (endDate.getTime() - startDate.getTime())
      );
      const duration = Math.random() * 3600000; // Up to 1 hour
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      tasks.push({
        taskId: `task-${i}`,
        taskName: `Task ${i}: ${['Build', 'Test', 'Deploy', 'Analyze'][Math.floor(Math.random() * 4)]}`,
        startTime,
        endTime: status === 'completed' || status === 'failed' ? new Date(startTime.getTime() + duration) : undefined,
        duration: status === 'completed' || status === 'failed' ? duration : undefined,
        status,
        agentId: `agent-${Math.floor(Math.random() * 10)}`,
        resourcesUsed: {
          cpu: Math.random() * 100,
          memory: Math.random() * 100,
          network: Math.random() * 50,
        },
        cost: Math.random() * 10,
      });
    }
    
    return tasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  // Get error metrics
  async getErrorMetrics(timeRange: TimeRange): Promise<ErrorMetric[]> {
    // Defensive type checking
    const startDate = timeRange.start instanceof Date ? timeRange.start : new Date(timeRange.start);
    const endDate = timeRange.end instanceof Date ? timeRange.end : new Date(timeRange.end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn('Invalid date range provided to getErrorMetrics');
      return [];
    }
    
    const errors: ErrorMetric[] = [];
    const errorTypes = ['NetworkError', 'TimeoutError', 'ValidationError', 'AuthenticationError', 'SystemError'];
    const severities: ErrorMetric['severity'][] = ['low', 'medium', 'high', 'critical'];
    
    for (let i = 0; i < 20; i++) {
      const timestamp = new Date(
        startDate.getTime() + 
        Math.random() * (endDate.getTime() - startDate.getTime())
      );
      
      errors.push({
        errorId: `error-${i}`,
        timestamp,
        agentId: `agent-${Math.floor(Math.random() * 10)}`,
        errorType: errorTypes[Math.floor(Math.random() * errorTypes.length)],
        message: `Error occurred during task execution: ${['Connection refused', 'Timeout exceeded', 'Invalid input', 'Unauthorized access', 'Memory limit exceeded'][Math.floor(Math.random() * 5)]}`,
        severity: severities[Math.floor(Math.random() * severities.length)],
        resolved: Math.random() > 0.3,
        resolutionTime: Math.random() > 0.3 ? Math.random() * 3600000 : undefined,
      });
    }
    
    return errors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Aggregate data by time periods
  aggregateByTimePeriod(
    data: MetricDataPoint[],
    period: 'hour' | 'day' | 'week' | 'month'
  ): MetricDataPoint[] {
    const grouped = groupBy(data, (point) => {
      const date = new Date(point.timestamp);
      switch (period) {
        case 'hour':
          return startOfHour(date).toISOString();
        case 'day':
          return startOfDay(date).toISOString();
        default:
          return startOfDay(date).toISOString();
      }
    });

    return Object.entries(grouped).map(([timestamp, points]) => ({
      timestamp: new Date(timestamp),
      value: mean(points.map(p => p.value)),
      metadata: {
        count: points.length,
        max: max(points.map(p => p.value)),
        min: min(points.map(p => p.value)),
      },
    }));
  }

  // Calculate cost projections
  calculateCostProjections(
    historicalCosts: CostBreakdown[],
    projectionDays: number = 30
  ): CostBreakdown[] {
    if (historicalCosts.length < 2) return [];
    
    const projections: CostBreakdown[] = [];
    const avgDailyGrowth = 1.02; // 2% daily growth assumption
    const lastCost = historicalCosts[historicalCosts.length - 1];
    
    for (let i = 1; i <= projectionDays; i++) {
      const projectedCost: CostBreakdown = {
        total: lastCost.total * Math.pow(avgDailyGrowth, i),
        compute: lastCost.compute * Math.pow(avgDailyGrowth, i),
        storage: lastCost.storage * Math.pow(avgDailyGrowth, i),
        network: lastCost.network * Math.pow(avgDailyGrowth, i),
        api: lastCost.api * Math.pow(avgDailyGrowth, i),
        period: 'daily',
        currency: lastCost.currency,
      };
      projections.push(projectedCost);
    }
    
    return projections;
  }

  // Export data to CSV
  exportToCSV(data: any[], filename: string): void {
    const csv = this.convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value.toString().includes(',') ? `"${value}"` : value;
      }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
  }

  // Start generating mock real-time data
  startMockDataGeneration(callback: (data: any) => void): void {
    this.mockDataInterval = setInterval(() => {
      const mockUpdate = {
        type: 'metric_update',
        data: {
          cpu: Math.random() * 100,
          memory: Math.random() * 100,
          activeTasks: Math.floor(Math.random() * 50),
          timestamp: new Date(),
        },
      };
      callback(mockUpdate);
    }, 5000);
  }

  // Stop mock data generation
  stopMockDataGeneration(): void {
    if (this.mockDataInterval) {
      clearInterval(this.mockDataInterval);
      this.mockDataInterval = null;
    }
  }

  // Initialize WebSocket listeners for real-time updates
  initializeWebSocketListeners(): void {
    // Listen for analytics updates
    websocketService.on('analytics:update', (data) => {
      this.handleAnalyticsUpdate(data);
    });

    // Listen for metrics updates
    websocketService.on('metrics:realtime', (data) => {
      this.handleMetricsUpdate(data);
    });

    // Listen for farm performance updates
    websocketService.on('farm:performance', (data) => {
      this.handleFarmPerformanceUpdate(data);
    });

    // Listen for agent efficiency updates
    websocketService.on('agent:efficiency', (data) => {
      this.handleAgentEfficiencyUpdate(data);
    });
  }

  // Handle analytics update from WebSocket
  private handleAnalyticsUpdate(data: any): void {
    // Notify all registered listeners
    this.realtimeListeners.forEach((callback, key) => {
      if (key.startsWith('analytics:')) {
        callback(data);
      }
    });
  }

  // Handle metrics update from WebSocket
  private handleMetricsUpdate(data: any): void {
    // Update cached metrics
    if (data.cpu !== undefined || data.memory !== undefined || data.gpu !== undefined) {
      this.claudeCodeMetrics = {
        ...this.claudeCodeMetrics,
        ...data
      };
    }
    
    // Notify listeners
    this.realtimeListeners.forEach((callback, key) => {
      if (key.startsWith('metrics:')) {
        callback(data);
      }
    });
  }

  // Handle farm performance update
  private handleFarmPerformanceUpdate(data: any): void {
    this.realtimeListeners.forEach((callback, key) => {
      if (key.startsWith('farm:')) {
        callback(data);
      }
    });
  }

  // Handle agent efficiency update
  private handleAgentEfficiencyUpdate(data: any): void {
    this.realtimeListeners.forEach((callback, key) => {
      if (key.startsWith('agent:')) {
        callback(data);
      }
    });
  }

  // Subscribe to real-time updates with a key
  subscribeToRealtimeUpdates(key: string, callback: (data: any) => void): void {
    this.realtimeListeners.set(key, callback);
  }

  // Get real-time Claude Code metrics from file system
  async getClaudeCodeMetricsFromFile(): Promise<any> {
    try {
      const response = await apiClient.get('/api/analytics/claude-file-metrics');
      if (response.data) {
        return response.data;
      }
    } catch (error) {
      console.warn('Failed to read Claude Code metrics file');
    }
    return null;
  }

  // Calculate harvest metrics
  calculateHarvestMetrics(farms: Farm[]): any {
    const totalYield = farms.reduce((acc, farm) => {
      const farmYield = farm.tasks?.filter(t => t.status === 'completed').length || 0;
      return acc + farmYield;
    }, 0);

    const qualityScore = farms.length > 0 
      ? Math.min(100, (farms.reduce((acc, farm) => {
          // Get health score from the health object, default to 80 if not available
          const healthScore = farm.health?.uptime || farm.health?.responseTime || 80;
          return acc + (typeof healthScore === 'number' ? healthScore : 80);
        }, 0) / farms.length))
      : 0;

    const efficiency = totalYield > 0 
      ? Math.min(100, (farms.filter(f => f.status === 'active').length / farms.length) * 100)
      : 0;

    return {
      totalYield,
      qualityScore: Math.round(qualityScore),
      efficiency: Math.round(efficiency)
    };
  }

  // Refresh analytics data
  async refreshData(): Promise<void> {
    try {
      // Fetch fresh Claude Code metrics
      await this.fetchClaudeCodeMetrics();
      
      // Notify all realtime listeners to refresh
      this.realtimeListeners.forEach((listener, key) => {
        listener({ type: 'refresh', timestamp: new Date() });
      });
      
      // Emit refresh event via websocket
      websocketService.emit('analytics:refresh', { timestamp: new Date() });
    } catch (error) {
      console.error('Failed to refresh analytics data:', error);
      throw error;
    }
  }

  // Initialize WebSocket analytics subscriptions
  initializeRealtimeSubscriptions(): void {
    if (this.websocketSubscribed) return;
    
    websocketService.on('analytics:update', (data: any) => {
      this.handleRealtimeUpdate(data);
    });

    websocketService.on('metrics:update', (data: any) => {
      this.handleRealtimeUpdate({ metrics: data });
    });

    websocketService.on('claude:metrics', (data: any) => {
      this.claudeCodeMetrics = data;
      this.notifyListeners('claude', data);
    });

    // Subscribe to analytics channel
    websocketService.emit('analytics:subscribe', { metrics: ['all'] });
    this.websocketSubscribed = true;
  }

  // Handle real-time updates from WebSocket
  private handleRealtimeUpdate(data: any): void {
    if (data.metrics) {
      this.notifyListeners('metrics', data.metrics);
    }
    if (data.costs) {
      this.notifyListeners('costs', data.costs);
    }
    if (data.efficiency) {
      this.notifyListeners('efficiency', data.efficiency);
    }
    if (data.resources) {
      this.notifyListeners('resources', data.resources);
    }
  }

  // Notify subscribed listeners
  private notifyListeners(type: string, data: any): void {
    this.realtimeListeners.forEach((callback, listenerType) => {
      if (listenerType === type || listenerType === 'all') {
        callback(data);
      }
    });
  }

  // Add listener for real-time updates
  addRealtimeListener(type: string, callback: (data: any) => void): string {
    const id = `${type}_${Date.now()}_${Math.random()}`;
    this.realtimeListeners.set(id, callback);
    return id;
  }

  // Remove listener
  removeRealtimeListener(id: string): void {
    this.realtimeListeners.delete(id);
  }

  // Unsubscribe from real-time updates
  unsubscribeFromRealtimeUpdates(key?: string): void {
    if (key) {
      this.realtimeListeners.delete(key);
    } else {
      this.unsubscribeFromAllRealtimeUpdates();
    }
  }

  // Unsubscribe from all WebSocket updates
  private unsubscribeFromAllRealtimeUpdates(): void {
    if (!this.websocketSubscribed) return;
    
    websocketService.emit('analytics:unsubscribe', { metrics: ['all'] });
    this.websocketSubscribed = false;
  }
}

export const analyticsService = new AnalyticsService();