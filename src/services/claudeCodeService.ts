import axios from 'axios';
import { Farm } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4567/api';

export interface ClaudeCodeCosts {
  totalCost: number;
  costByAgent: { [agentId: string]: number };
  costByFarm: { [farmId: string]: number };
  costBreakdown: {
    api: number;
    compute: number;
    storage: number;
    network: number;
  };
  dailyCosts: Array<{
    date: string;
    cost: number;
    apiCalls: number;
  }>;
}

export interface ClaudeCodeMetrics {
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageResponseTime: number;
  totalCost: number;
  costPerTask: number;
  efficiency: number;
}

export interface ClaudeCodeFarmConfig {
  prompt: string;
  steps?: string[];
  collaborative?: boolean;
}

export interface ClaudeCodeFarmStatus {
  farm?: {
    id: string;
    name: string;
    status: string;
    agents: number;
    sessionName?: string;
  };
  agents: Array<{
    id: string;
    status: string;
    currentTask?: string;
    lastActivity?: Date;
  }>;
  tmuxInfo?: {
    sessionName: string;
    active: boolean;
    panes?: Array<{
      index: number;
      command: string;
    }>;
  };
  coordination?: {
    activeAgents: any[];
    workClaims: any[];
    completedWork: string[];
  };
}

class ClaudeCodeService {
  private getHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  /**
   * Create a Claude Code agent farm
   */
  async createClaudeCodeFarm(farmId: string, config: ClaudeCodeFarmConfig): Promise<{
    farmId: string;
    claudeFarmId: string;
    sessionName: string;
    status: string;
  }> {
    try {
      const response = await axios.post(
        `${API_BASE}/farms/${farmId}/claude-code`,
        config,
        { headers: this.getHeaders() }
      );

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create Claude Code farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  /**
   * Get Claude Code farm status
   */
  async getClaudeCodeFarmStatus(farmId: string): Promise<ClaudeCodeFarmStatus> {
    try {
      const response = await axios.get(
        `${API_BASE}/farms/${farmId}/claude-code/status`,
        { headers: this.getHeaders() }
      );

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get Claude Code farm status');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  /**
   * Start a farm with Claude Code agents
   */
  async startFarmWithClaudeCode(farm: Farm, config?: ClaudeCodeFarmConfig): Promise<{
    farmId: string;
    claudeFarmId: string;
    sessionName: string;
  }> {
    // First create the Claude Code farm
    const claudeFarmConfig: ClaudeCodeFarmConfig = {
      prompt: config?.prompt || farm.config.yaml || 'Help with development tasks',
      steps: config?.steps,
      collaborative: config?.collaborative || false
    };

    const result = await this.createClaudeCodeFarm(farm.id, claudeFarmConfig);

    // Then start the farm
    await axios.post(
      `${API_BASE}/farms/${farm.id}/start`,
      {},
      { headers: this.getHeaders() }
    );

    return result;
  }

  /**
   * Generate tmux attach command for manual monitoring
   */
  getTmuxAttachCommand(sessionName: string): string {
    return `tmux attach-session -t ${sessionName}`;
  }

  /**
   * Parse coordination data for display
   */
  parseCoordinationData(coordination: ClaudeCodeFarmStatus['coordination']) {
    if (!coordination) return null;

    const workClaimsByAgent = coordination.workClaims.reduce((acc, claim) => {
      const agentId = claim.agent;
      if (!acc[agentId]) acc[agentId] = [];
      acc[agentId].push(claim);
      return acc;
    }, {} as Record<string, any[]>);

    const completedByAgent = coordination.completedWork.reduce((acc, work) => {
      const [, agentId] = work.split(' | ');
      if (!acc[agentId]) acc[agentId] = 0;
      acc[agentId]++;
      return acc;
    }, {} as Record<string, number>);

    return {
      activeAgentCount: coordination.activeAgents.length,
      totalWorkClaims: coordination.workClaims.length,
      totalCompleted: coordination.completedWork.length,
      workClaimsByAgent,
      completedByAgent
    };
  }

  /**
   * Get Claude Code cost analytics
   */
  async getCostAnalytics(timeRange: string = '30d'): Promise<ClaudeCodeCosts> {
    try {
      const response = await axios.get(
        `${API_BASE}/analytics/costs`,
        { 
          headers: this.getHeaders(),
          params: { timeRange }
        }
      );

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch cost analytics');
      }
    } catch (error: any) {
      console.error('Error fetching Claude Code costs:', error);
      
      // Return mock data for development
      const mockDailyCosts = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        
        return {
          date: date.toISOString().split('T')[0],
          cost: Math.random() * 10 + 5,
          apiCalls: Math.floor(Math.random() * 1000 + 500)
        };
      });
      
      const totalCost = mockDailyCosts.reduce((sum, day) => sum + day.cost, 0);
      
      return {
        totalCost,
        costByAgent: {},
        costByFarm: {},
        costBreakdown: {
          api: totalCost * 0.6,
          compute: totalCost * 0.25,
          storage: totalCost * 0.1,
          network: totalCost * 0.05
        },
        dailyCosts: mockDailyCosts
      };
    }
  }

  /**
   * Get aggregated Claude Code metrics
   */
  async getMetrics(): Promise<ClaudeCodeMetrics> {
    try {
      const response = await axios.get(
        `${API_BASE}/analytics/metrics`,
        { 
          headers: this.getHeaders(),
          params: { timeRange: '24h' }
        }
      );

      if (response.data.success) {
        const data = response.data.data;
        return {
          activeAgents: data.agentEfficiency?.length || 0,
          totalTasks: data.taskCompletion?.totalTasks || 0,
          completedTasks: data.taskCompletion?.completedTasks || 0,
          failedTasks: data.taskCompletion?.failedTasks || 0,
          averageResponseTime: data.taskCompletion?.averageCompletionTime || 0,
          totalCost: data.claudeCosts?.totalCost || 0,
          costPerTask: data.taskCompletion?.totalTasks > 0 
            ? (data.claudeCosts?.totalCost || 0) / data.taskCompletion.totalTasks 
            : 0,
          efficiency: data.taskCompletion?.completionRate || 0
        };
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch metrics');
      }
    } catch (error: any) {
      console.error('Error fetching Claude Code metrics:', error);
      
      // Return default metrics
      return {
        activeAgents: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageResponseTime: 0,
        totalCost: 0,
        costPerTask: 0,
        efficiency: 0
      };
    }
  }

  /**
   * Calculate estimated costs for a task
   */
  estimateCost(taskType: string, estimatedDuration: number): number {
    const costPerMinute = 0.001; // $0.001 per minute
    const apiCostPerCall = 0.002; // $0.002 per API call
    
    const baseCost = estimatedDuration * costPerMinute;
    const apiCalls = Math.ceil(estimatedDuration / 5); // Estimate 1 API call every 5 minutes
    const apiCost = apiCalls * apiCostPerCall;
    
    // Add multipliers based on task type
    const multipliers: { [key: string]: number } = {
      'data-processing': 1.2,
      'content-generation': 1.5,
      'code-review': 1.3,
      'research': 1.8,
      'default': 1.0
    };
    
    const multiplier = multipliers[taskType] || multipliers.default;
    
    return (baseCost + apiCost) * multiplier;
  }
}

export const claudeCodeService = new ClaudeCodeService();