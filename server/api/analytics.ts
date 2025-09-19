import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { aiProviderService } from '../services/unified/aiProviderService';

// Create claudeCodeCoordinator facade
const claudeCodeCoordinator = {
  coordinateAgents: async (farmId: string) => aiProviderService.coordinateFarmAgents(farmId),
  getAgentStatus: (farmId: string, agentId: string) => aiProviderService.getAgentStatus(farmId, agentId)
};
import { metricsCollector } from '../monitoring/metricsCollector';
import { analyticsService } from '../gateway/services/AnalyticsService';
import { taskCountService } from '../services/taskCountService';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// Analytics modes tracking
interface AnalyticsModes {
  farmCreation: boolean;
  goWild: boolean;
  quickTask: boolean;
}

// CPU/GPU monitoring
interface ResourceMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  gpu?: {
    usage: number;
    memory: number;
    temperature?: number;
    name?: string;
  };
}

// Claude Code cost tracking
interface ClaudeCodeCosts {
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

// Agent efficiency metrics
interface AgentEfficiencyMetrics {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksTotal: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  costPerTask: number;
  efficiency: number; // Calculated as (tasksCompleted/totalTime) * successRate
  lastActive: Date;
}

// Task completion metrics
interface TaskCompletionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  averageCompletionTime: number;
  completionRate: number;
  trendsHourly: Array<{
    timestamp: Date;
    completed: number;
    failed: number;
    rate: number;
  }>;
}

// Helper function to get CPU metrics
function getCPUMetrics(): ResourceMetrics['cpu'] {
  const cpus = os.cpus();
  const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const totalTick = cpus.reduce((acc, cpu) => 
    acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
  );
  
  const usage = 100 - Math.floor(100 * totalIdle / totalTick);
  
  return {
    usage,
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    temperature: undefined // Would need platform-specific tools
  };
}

// Helper function to get memory metrics
function getMemoryMetrics(): ResourceMetrics['memory'] {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    total: totalMem,
    used: usedMem,
    free: freeMem,
    percentage: Math.round((usedMem / totalMem) * 100)
  };
}

// Helper function to get Claude Code costs
async function getClaudeCodeCosts(): Promise<ClaudeCodeCosts> {
  try {
    // Read from Claude coordination file if available
    const coordinationFile = '/tmp/claude_coordination/active_agents.json';
    let activeAgentsData: any = {};
    
    if (fs.existsSync(coordinationFile)) {
      const data = fs.readFileSync(coordinationFile, 'utf-8');
      activeAgentsData = JSON.parse(data);
    }
    
    // Calculate costs based on API usage (mock data for now, real integration would use Claude API billing)
    const apiCostPerCall = 0.002; // $0.002 per API call (example)
    const computeCostPerMinute = 0.001; // $0.001 per minute (example)
    
    // Get cost data from database or calculate
    const costsResult = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(response_time) as avg_response_time,
        farm_id,
        agent_id,
        DATE(created_at) as date
      FROM tasks
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY farm_id, agent_id, DATE(created_at)
    `).catch(() => ({ rows: [] }));
    
    const costByAgent: { [key: string]: number } = {};
    const costByFarm: { [key: string]: number } = {};
    const dailyCosts: Array<{ date: string; cost: number; apiCalls: number }> = [];
    
    let totalApiCost = 0;
    let totalComputeCost = 0;
    
    costsResult.rows.forEach((row: any) => {
      const apiCost = (row.total_calls || 0) * apiCostPerCall;
      const computeCost = (row.avg_response_time || 0) * computeCostPerMinute / 60;
      const totalCost = apiCost + computeCost;
      
      if (row.agent_id) {
        costByAgent[row.agent_id] = (costByAgent[row.agent_id] || 0) + totalCost;
      }
      if (row.farm_id) {
        costByFarm[row.farm_id] = (costByFarm[row.farm_id] || 0) + totalCost;
      }
      
      totalApiCost += apiCost;
      totalComputeCost += computeCost;
    });
    
    // Add mock daily costs for visualization
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dailyCosts.push({
        date: date.toISOString().split('T')[0],
        cost: Math.random() * 10 + 5, // Mock data
        apiCalls: Math.floor(Math.random() * 1000 + 500)
      });
    }
    
    return {
      totalCost: totalApiCost + totalComputeCost,
      costByAgent,
      costByFarm,
      costBreakdown: {
        api: totalApiCost,
        compute: totalComputeCost,
        storage: totalApiCost * 0.1, // Mock 10% of API cost
        network: totalApiCost * 0.05 // Mock 5% of API cost
      },
      dailyCosts
    };
  } catch (error) {
    console.error('Error calculating Claude Code costs:', error);
    return {
      totalCost: 0,
      costByAgent: {},
      costByFarm: {},
      costBreakdown: { api: 0, compute: 0, storage: 0, network: 0 },
      dailyCosts: []
    };
  }
}

// GET /api/analytics/metrics - Get comprehensive analytics metrics
router.get('/metrics', apiRateLimits.read, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    // Get resource metrics
    const resourceMetrics: ResourceMetrics = {
      cpu: getCPUMetrics(),
      memory: getMemoryMetrics(),
      // GPU metrics would require specific libraries like nvidia-ml-py
    };
    
    // Get Claude Code costs
    const claudeCosts = await getClaudeCodeCosts();
    
    // Get agent efficiency metrics
    const agentResult = await db.query(`
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as tasks_completed,
        COUNT(t.id) as tasks_total,
        AVG(CASE WHEN t.status = 'completed' AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) * 1000 
          ELSE t.response_time END) as avg_response_time,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as errors,
        MAX(t.updated_at) as last_active
      FROM agents a
      LEFT JOIN tasks t ON a.id = t.agent_id
      WHERE t.created_at >= NOW() - INTERVAL '${timeRange}'
      GROUP BY a.id, a.name
    `).catch(() => ({ rows: [] }));
    
    const agentEfficiency: AgentEfficiencyMetrics[] = await Promise.all(
      agentResult.rows.map(async (row: any) => {
        // Get task count based on files created by this agent
        const farmId = row.farm_id;
        const agentIndex = row.config?.agentIndex || 0;
        const tasksCompleted = farmId 
          ? await taskCountService.countTasksForAgent(farmId, agentIndex)
          : parseInt(row.tasks_completed || 0);
        
        const tasksTotal = parseInt(row.tasks_total || tasksCompleted);
        const successRate = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;
        
        return {
          agentId: row.agent_id,
          agentName: row.agent_name,
          tasksCompleted,
          tasksTotal,
          successRate,
          averageResponseTime: parseFloat(row.avg_response_time || 0),
          errorRate: row.tasks_total > 0 ? (row.errors / row.tasks_total) * 100 : 0,
          costPerTask: claudeCosts.costByAgent[row.agent_id] 
            ? claudeCosts.costByAgent[row.agent_id] / (tasksCompleted || 1)
            : 0,
          efficiency: row.tasks_total > 0 && row.avg_response_time > 0
            ? (tasksCompleted / row.avg_response_time) * (tasksCompleted / tasksTotal)
            : 0,
          lastActive: new Date(row.last_active || Date.now())
        };
      })
    );
    
    // Get task completion metrics
    const taskResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        AVG(CASE WHEN status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 
          ELSE response_time END) as avg_completion_time
      FROM tasks
      WHERE created_at >= NOW() - INTERVAL '${timeRange}'
    `).catch(() => ({ rows: [{}] }));
    
    const taskRow = taskResult.rows[0] || {};
    const taskCompletion: TaskCompletionMetrics = {
      totalTasks: parseInt(taskRow.total || 0),
      completedTasks: parseInt(taskRow.completed || 0),
      failedTasks: parseInt(taskRow.failed || 0),
      pendingTasks: parseInt(taskRow.pending || 0),
      averageCompletionTime: parseFloat(taskRow.avg_completion_time || 0),
      completionRate: taskRow.total > 0 
        ? (taskRow.completed / taskRow.total) * 100 
        : 0,
      trendsHourly: [] // Would be populated with hourly data
    };
    
    // Get harvest analytics
    const harvestResult = await db.query(`
      SELECT 
        COUNT(*) as total_harvests,
        AVG(yield_value) as avg_yield,
        SUM(yield_value) as total_yield,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_harvests
      FROM harvests
      WHERE created_at >= NOW() - INTERVAL '${timeRange}'
    `).catch(() => ({ rows: [{}] }));
    
    const harvestData = harvestResult.rows[0] || {};
    
    const response: ApiResponse = {
      success: true,
      data: {
        resourceMetrics,
        claudeCosts,
        agentEfficiency,
        taskCompletion,
        harvestAnalytics: {
          totalHarvests: parseInt(harvestData.total_harvests || 0),
          averageYield: parseFloat(harvestData.avg_yield || 0),
          totalYield: parseFloat(harvestData.total_yield || 0),
          successRate: harvestData.total_harvests > 0
            ? (harvestData.successful_harvests / harvestData.total_harvests) * 100
            : 0
        },
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching analytics metrics:', error);
    
    // Return mock data if database is unavailable
    const response: ApiResponse = {
      success: true,
      data: {
        resourceMetrics: {
          cpu: getCPUMetrics(),
          memory: getMemoryMetrics()
        },
        claudeCosts: await getClaudeCodeCosts(),
        agentEfficiency: [],
        taskCompletion: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          pendingTasks: 0,
          averageCompletionTime: 0,
          completionRate: 0,
          trendsHourly: []
        },
        harvestAnalytics: {
          totalHarvests: 0,
          averageYield: 0,
          totalYield: 0,
          successRate: 0
        },
        timestamp: new Date()
      }
    };
    
    res.json(response);
  }
});

// GET /api/analytics/farm-yield - Get farm yield metrics
router.get('/farm-yield', apiRateLimits.read, async (req, res) => {
  try {
    const { start, end } = req.query;
    const timeRange = start && end 
      ? { start: new Date(start as string), end: new Date(end as string) }
      : undefined;
    
    const yieldMetrics = await analyticsService.getFarmYieldMetrics(timeRange);
    
    const response: ApiResponse = {
      success: true,
      data: yieldMetrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching farm yield metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch farm yield metrics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/costs - Get detailed Claude Code cost analytics
router.get('/costs', apiRateLimits.read, async (req, res) => {
  try {
    const costs = await getClaudeCodeCosts();
    
    const response: ApiResponse = {
      success: true,
      data: costs
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching cost analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch cost analytics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/agent-efficiency - Get agent efficiency metrics
router.get('/agent-efficiency', apiRateLimits.read, async (req, res) => {
  try {
    const { timeRange = '24h', sortBy = 'efficiency' } = req.query;
    
    const result = await db.query(`
      SELECT 
        a.id,
        a.name,
        a.type,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
        COUNT(t.id) as total,
        AVG(CASE WHEN t.status = 'completed' THEN t.response_time END) as avg_time,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failures
      FROM agents a
      LEFT JOIN tasks t ON a.id = t.agent_id
      WHERE t.created_at >= NOW() - INTERVAL '${timeRange}'
      GROUP BY a.id, a.name, a.type
      ORDER BY ${sortBy === 'efficiency' ? '(completed::float / NULLIF(total, 0))' : sortBy} DESC
    `).catch(() => ({ rows: [] }));
    
    const response: ApiResponse = {
      success: true,
      data: result.rows
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching agent efficiency:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch agent efficiency metrics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/cpu-gpu - Get real-time CPU/GPU metrics
router.get('/cpu-gpu', apiRateLimits.read, async (req, res) => {
  try {
    const metrics: ResourceMetrics = {
      cpu: getCPUMetrics(),
      memory: getMemoryMetrics(),
      // GPU metrics would require nvidia-smi or similar
    };
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching CPU/GPU metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch CPU/GPU metrics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/claude-metrics - Get Claude Code metrics from coordination file
router.get('/claude-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const claudeCoordPath = '/tmp/claude_coordination/active_agents.json';
    let claudeMetrics = null;
    
    // Try to read Claude Code coordination file
    if (fs.existsSync(claudeCoordPath)) {
      try {
        const data = fs.readFileSync(claudeCoordPath, 'utf-8');
        const agents = JSON.parse(data);
        
        // Calculate metrics from active agents
        claudeMetrics = {
          activeAgents: agents.length,
          totalTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_completed || 0), 0),
          completedTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_completed || 0), 0),
          failedTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_failed || 0), 0),
          cpu: getCPUMetrics().usage,
          memory: getMemoryMetrics().percentage,
          gpu: 0, // Would need GPU monitoring library
          apiCalls: agents.reduce((sum: number, agent: any) => sum + (agent.api_calls || 100), 0),
          costs: {
            compute: agents.length * 0.10, // Example: $0.10 per agent per hour
            storage: agents.length * 0.02,
            network: agents.length * 0.01,
            api: agents.reduce((sum: number, agent: any) => sum + (agent.api_calls || 100), 0) * 0.01
          }
        };
      } catch (error) {
        console.warn('Failed to parse Claude coordination file:', error);
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: claudeMetrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Claude metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch Claude metrics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/claude-file-metrics - Alternative endpoint for file-based metrics
router.get('/claude-file-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const metricsPath = '/tmp/claude_coordination/metrics.json';
    let metrics = null;
    
    if (fs.existsSync(metricsPath)) {
      try {
        const data = fs.readFileSync(metricsPath, 'utf-8');
        metrics = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to parse metrics file:', error);
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching file metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch file metrics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/farm-creation - Analytics for Farm Creation mode
router.get('/farm-creation', apiRateLimits.read, async (req, res) => {
  try {
    const farmCreationMetrics = await analyticsService.getFarmCreationMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        totalCreated: farmCreationMetrics.totalFarms || 0,
        successRate: farmCreationMetrics.successRate || 0,
        averageCreationTime: farmCreationMetrics.avgCreationTime || 0,
        failureReasons: farmCreationMetrics.failureReasons || {},
        recentFarms: farmCreationMetrics.recentFarms || [],
        creationTrend: farmCreationMetrics.trend || []
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching farm creation analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch farm creation analytics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/go-wild - Analytics for Go Wild mode
router.get('/go-wild', apiRateLimits.read, async (req, res) => {
  try {
    const goWildMetrics = await analyticsService.getGoWildMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        sessionsStarted: goWildMetrics.sessions || 0,
        averageSessionDuration: goWildMetrics.avgDuration || 0,
        tasksGenerated: goWildMetrics.tasksGenerated || 0,
        creativityScore: goWildMetrics.creativityScore || 0,
        explorationDepth: goWildMetrics.explorationDepth || 0,
        discoveries: goWildMetrics.discoveries || [],
        boundaries: goWildMetrics.boundaries || {}
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Go Wild analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch Go Wild analytics'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/quick-task - Analytics for Quick Task mode
router.get('/quick-task', apiRateLimits.read, async (req, res) => {
  try {
    const quickTaskMetrics = await analyticsService.getQuickTaskMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        tasksCompleted: quickTaskMetrics.completed || 0,
        averageCompletionTime: quickTaskMetrics.avgTime || 0,
        taskTypes: quickTaskMetrics.taskTypes || {},
        successRate: quickTaskMetrics.successRate || 0,
        popularTasks: quickTaskMetrics.popularTasks || [],
        performanceScore: quickTaskMetrics.performanceScore || 0
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Quick Task analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch Quick Task analytics'
    };
    
    res.status(500).json(response);
  }
});

// POST /api/analytics/track - Track analytics events
router.post('/track', apiRateLimits.write, async (req, res) => {
  try {
    const { type, category, data } = req.body;
    
    await analyticsService.trackEvent({
      type,
      category,
      data,
      timestamp: new Date(),
      userId: req.user?.id || 'anonymous'
    });
    
    const response: ApiResponse = {
      success: true,
      message: 'Event tracked successfully'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error tracking analytics event:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to track event'
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/standardized-tasks - Get standardized task metrics
router.get('/standardized-tasks', apiRateLimits.read, async (req, res) => {
  try {
    const metrics = await analyticsService.getStandardizedTaskMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting standardized task metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get standardized task metrics'
    };
    
    res.status(500).json(response);
  }
});

export { router as analyticsRouter, AgentEfficiencyMetrics, TaskCompletionMetrics, ClaudeCodeCosts, ResourceMetrics };