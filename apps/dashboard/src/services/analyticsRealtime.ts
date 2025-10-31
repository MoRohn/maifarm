import { apiClient } from './apiClient';

export interface RealtimeMetrics {
  cpu: number;
  memory: number;
  gpu?: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  costs: {
    api: number;
    compute: number;
    storage: number;
    network: number;
    total: number;
  };
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksTotal: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  costPerTask: number;
  efficiency: number;
  lastActive: Date;
}

class AnalyticsRealtimeService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();

  async fetchRealtimeMetrics(timeRange: string = '24h'): Promise<RealtimeMetrics | null> {
    try {
      const [metricsRes, claudeRes, resourceRes] = await Promise.all([
        apiClient.get(`/analytics/metrics?timeRange=${timeRange}`),
        apiClient.get('/analytics/claude-metrics'),
        apiClient.get('/analytics/cpu-gpu')
      ]);

      const metrics = metricsRes.data?.data;
      const claudeMetrics = claudeRes.data?.data;
      const resourceMetrics = resourceRes.data?.data;

      if (!metrics && !claudeMetrics && !resourceMetrics) {
        return null;
      }

      // Combine all metrics into a unified format
      return {
        cpu: resourceMetrics?.cpu?.usage || claudeMetrics?.cpu || 0,
        memory: resourceMetrics?.memory?.percentage || claudeMetrics?.memory || 0,
        gpu: resourceMetrics?.gpu?.usage || claudeMetrics?.gpu || 0,
        activeAgents: claudeMetrics?.activeAgents || 0,
        totalTasks: claudeMetrics?.totalTasks || metrics?.taskCompletion?.totalTasks || 0,
        completedTasks: claudeMetrics?.completedTasks || metrics?.taskCompletion?.completedTasks || 0,
        failedTasks: claudeMetrics?.failedTasks || metrics?.taskCompletion?.failedTasks || 0,
        costs: {
          api: claudeMetrics?.costs?.api || metrics?.claudeCosts?.costBreakdown?.api || 0,
          compute: claudeMetrics?.costs?.compute || metrics?.claudeCosts?.costBreakdown?.compute || 0,
          storage: claudeMetrics?.costs?.storage || metrics?.claudeCosts?.costBreakdown?.storage || 0,
          network: claudeMetrics?.costs?.network || metrics?.claudeCosts?.costBreakdown?.network || 0,
          total: claudeMetrics?.costs?.total || metrics?.claudeCosts?.totalCost || 0
        }
      };
    } catch (error) {
      console.error('Failed to fetch realtime metrics:', error);
      return null;
    }
  }

  async fetchAgentEfficiency(timeRange: string = '24h'): Promise<AgentMetrics[]> {
    try {
      const response = await apiClient.get(`/analytics/agent-efficiency?timeRange=${timeRange}`);
      
      if (response.data?.data) {
        return response.data.data.map((agent: any) => ({
          agentId: agent.id,
          agentName: agent.name,
          tasksCompleted: agent.completed || 0,
          tasksTotal: agent.total || 0,
          successRate: agent.total > 0 ? (agent.completed / agent.total) * 100 : 0,
          averageResponseTime: agent.avg_time || 0,
          errorRate: agent.total > 0 ? (agent.failures / agent.total) * 100 : 0,
          costPerTask: 0, // Would need cost data integration
          efficiency: agent.total > 0 && agent.avg_time > 0
            ? (agent.completed / agent.avg_time) * (agent.completed / agent.total)
            : 0,
          lastActive: new Date()
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Failed to fetch agent efficiency:', error);
      return [];
    }
  }

  async fetchClaudeCoordinationMetrics(): Promise<any> {
    try {
      const response = await apiClient.get('/analytics/claude-file-metrics');
      return response.data?.data || null;
    } catch (error) {
      console.error('Failed to fetch Claude coordination metrics:', error);
      return null;
    }
  }

  startPolling(interval: number = 5000, callback: (metrics: RealtimeMetrics | null) => void) {
    this.stopPolling();
    
    // Initial fetch
    this.fetchRealtimeMetrics().then(callback);
    
    // Start polling
    this.pollingInterval = setInterval(async () => {
      const metrics = await this.fetchRealtimeMetrics();
      callback(metrics);
    }, interval);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  subscribe(event: string, callback: (data: any) => void) {
    this.listeners.set(event, callback);
  }

  unsubscribe(event: string) {
    this.listeners.delete(event);
  }

  handleWebSocketMessage(message: any) {
    if (message.type === 'metrics:update' && message.payload) {
      const callback = this.listeners.get('metrics:update');
      if (callback) {
        callback(message.payload);
      }
    }
  }

  // Helper to calculate costs
  calculateEstimatedCosts(activeAgents: number, apiCalls: number = 0): {
    hourly: string;
    daily: string;
    monthly: string;
  } {
    // Base costs per agent
    const computeCostPerAgentHour = 0.10;
    const storageCostPerAgentHour = 0.02;
    const networkCostPerAgentHour = 0.01;
    const apiCostPerCall = 0.002;
    
    const hourlyCost = 
      (activeAgents * (computeCostPerAgentHour + storageCostPerAgentHour + networkCostPerAgentHour)) +
      (apiCalls * apiCostPerCall / 60); // Convert API calls to hourly rate
    
    return {
      hourly: hourlyCost.toFixed(2),
      daily: (hourlyCost * 24).toFixed(2),
      monthly: (hourlyCost * 24 * 30).toFixed(2)
    };
  }
}

export const analyticsRealtimeService = new AnalyticsRealtimeService();