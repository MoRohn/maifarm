import { Server as SocketIOServer, Socket } from 'socket.io';
import { WebSocketEvent } from '../types/api';
import { 
  AgentEfficiencyMetrics, 
  TaskCompletionMetrics, 
  ClaudeCodeCosts, 
  ResourceMetrics 
} from '../api/analytics';
import * as os from 'os';
import * as fs from 'fs';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';

interface AnalyticsUpdateEvent {
  type: 'metrics' | 'costs' | 'efficiency' | 'resources';
  data: any;
  timestamp: Date;
}

export class AnalyticsWebSocketHandler {
  private updateInterval: NodeJS.Timeout | null = null;
  private subscribers: Map<string, Set<string>> = new Map();
  
  constructor(private io: SocketIOServer) {
    this.setupAnalyticsHandlers();
    this.startPeriodicUpdates();
  }
  
  private setupAnalyticsHandlers() {
    this.io.on('connection', (socket: Socket) => {
      // Handle analytics subscriptions
      socket.on('analytics:subscribe', (params: { metrics?: string[] }) => {
        const metricsToSubscribe = params.metrics || ['all'];
        
        metricsToSubscribe.forEach(metric => {
          socket.join(`analytics:${metric}`);
          
          if (!this.subscribers.has(metric)) {
            this.subscribers.set(metric, new Set());
          }
          this.subscribers.get(metric)!.add(socket.id);
        });
        
        // Send initial data
        this.sendInitialAnalytics(socket, metricsToSubscribe);
      });
      
      socket.on('analytics:unsubscribe', (params: { metrics?: string[] }) => {
        const metricsToUnsubscribe = params.metrics || ['all'];
        
        metricsToUnsubscribe.forEach(metric => {
          socket.leave(`analytics:${metric}`);
          this.subscribers.get(metric)?.delete(socket.id);
        });
      });
      
      // Handle specific metric requests
      socket.on('analytics:request', async (params: { metric: string; timeRange?: string }) => {
        const data = await this.getMetricData(params.metric, params.timeRange);
        socket.emit('analytics:response', {
          metric: params.metric,
          data,
          timestamp: new Date()
        });
      });
      
      socket.on('disconnect', () => {
        // Clean up subscriptions
        this.subscribers.forEach((sockets, metric) => {
          sockets.delete(socket.id);
        });
      });
    });
  }
  
  private async sendInitialAnalytics(socket: Socket, metrics: string[]) {
    for (const metric of metrics) {
      const data = await this.getMetricData(metric);
      socket.emit('analytics:initial', {
        metric,
        data,
        timestamp: new Date()
      });
    }
  }
  
  private async getMetricData(metric: string, timeRange: string = '24h'): Promise<any> {
    switch (metric) {
      case 'resources':
      case 'cpu-gpu':
        return this.getResourceMetrics();
        
      case 'costs':
        return this.getClaudeCodeCosts();
        
      case 'efficiency':
      case 'agent-efficiency':
        return this.getAgentEfficiency(timeRange);
        
      case 'tasks':
      case 'task-completion':
        return this.getTaskCompletion(timeRange);
        
      case 'harvest':
        return this.getHarvestAnalytics(timeRange);
        
      case 'all':
      default:
        return {
          resources: await this.getResourceMetrics(),
          costs: await this.getClaudeCodeCosts(),
          efficiency: await this.getAgentEfficiency(timeRange),
          tasks: await this.getTaskCompletion(timeRange),
          harvest: await this.getHarvestAnalytics(timeRange)
        };
    }
  }
  
  private getResourceMetrics(): ResourceMetrics {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce((acc, cpu) => 
      acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
    );
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu: {
        usage: 100 - Math.floor(100 * totalIdle / totalTick),
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        temperature: undefined
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: Math.round((usedMem / totalMem) * 100)
      }
    };
  }
  
  private async getClaudeCodeCosts(): Promise<ClaudeCodeCosts> {
    try {
      // Read from Claude coordination file
      const coordinationFile = pathConfig.getPath('ACTIVE_AGENTS_FILE');
      let activeAgentsData: any = {};
      
      if (fs.existsSync(coordinationFile)) {
        const data = fs.readFileSync(coordinationFile, 'utf-8');
        activeAgentsData = JSON.parse(data);
      }
      
      // Calculate mock costs for visualization
      const apiCostPerCall = 0.002;
      const computeCostPerMinute = 0.001;
      
      // Generate daily costs for the last 30 days
      const dailyCosts: Array<{ date: string; cost: number; apiCalls: number }> = [];
      const today = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        // Simulate varying costs throughout the month
        const baseCost = 5 + Math.sin(i / 5) * 3;
        const variation = Math.random() * 5;
        
        dailyCosts.push({
          date: date.toISOString().split('T')[0],
          cost: baseCost + variation,
          apiCalls: Math.floor(500 + Math.random() * 500 + Math.sin(i / 3) * 200)
        });
      }
      
      const totalCost = dailyCosts.reduce((sum, day) => sum + day.cost, 0);
      
      return {
        totalCost,
        costByAgent: Object.keys(activeAgentsData).reduce((acc, agentId) => {
          acc[agentId] = totalCost / Object.keys(activeAgentsData).length;
          return acc;
        }, {} as { [key: string]: number }),
        costByFarm: {},
        costBreakdown: {
          api: totalCost * 0.6,
          compute: totalCost * 0.25,
          storage: totalCost * 0.1,
          network: totalCost * 0.05
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
  
  private async getAgentEfficiency(timeRange: string): Promise<AgentEfficiencyMetrics[]> {
    try {
      const result = await db.query(`
        SELECT 
          a.id as agent_id,
          a.name as agent_name,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as tasks_completed,
          COUNT(t.id) as tasks_total,
          AVG(CASE WHEN t.status = 'completed' AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) * 1000 
            ELSE t.response_time END) as avg_response_time,
          COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as errors
        FROM agents a
        LEFT JOIN tasks t ON a.id = t.agent_id
        WHERE t.created_at >= NOW() - INTERVAL '${timeRange}'
        GROUP BY a.id, a.name
        LIMIT 20
      `);
      
      return result.rows.map((row: any) => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        tasksCompleted: parseInt(row.tasks_completed || 0),
        tasksTotal: parseInt(row.tasks_total || 0),
        successRate: row.tasks_total > 0 ? (row.tasks_completed / row.tasks_total) * 100 : 0,
        averageResponseTime: parseFloat(row.avg_response_time || 0),
        errorRate: row.tasks_total > 0 ? (row.errors / row.tasks_total) * 100 : 0,
        costPerTask: Math.random() * 0.5 + 0.1, // Mock cost
        efficiency: row.tasks_total > 0 && row.avg_response_time > 0
          ? (row.tasks_completed / row.avg_response_time) * (row.tasks_completed / row.tasks_total)
          : 0,
        lastActive: new Date()
      }));
    } catch (error) {
      // Return mock data if database is unavailable
      return Array.from({ length: 5 }, (_, i) => ({
        agentId: `agent-${i + 1}`,
        agentName: `Agent ${i + 1}`,
        tasksCompleted: Math.floor(Math.random() * 100 + 50),
        tasksTotal: Math.floor(Math.random() * 150 + 100),
        successRate: 75 + Math.random() * 20,
        averageResponseTime: Math.random() * 10 + 2,
        errorRate: Math.random() * 10,
        costPerTask: Math.random() * 0.5 + 0.1,
        efficiency: Math.random() * 0.9 + 0.1,
        lastActive: new Date()
      }));
    }
  }
  
  private async getTaskCompletion(timeRange: string): Promise<TaskCompletionMetrics> {
    try {
      const result = await db.query(`
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
      `);
      
      const row = result.rows[0] || {};
      
      // Generate hourly trends
      const trendsHourly = Array.from({ length: 24 }, (_, i) => {
        const hour = new Date();
        hour.setHours(hour.getHours() - (23 - i));
        
        return {
          timestamp: hour,
          completed: Math.floor(Math.random() * 20 + 10),
          failed: Math.floor(Math.random() * 5),
          rate: 70 + Math.random() * 25
        };
      });
      
      return {
        totalTasks: parseInt(row.total || 0),
        completedTasks: parseInt(row.completed || 0),
        failedTasks: parseInt(row.failed || 0),
        pendingTasks: parseInt(row.pending || 0),
        averageCompletionTime: parseFloat(row.avg_completion_time || 0),
        completionRate: row.total > 0 ? (row.completed / row.total) * 100 : 0,
        trendsHourly
      };
    } catch (error) {
      // Return mock data if database is unavailable
      return {
        totalTasks: 500,
        completedTasks: 425,
        failedTasks: 50,
        pendingTasks: 25,
        averageCompletionTime: 5.5,
        completionRate: 85,
        trendsHourly: Array.from({ length: 24 }, (_, i) => {
          const hour = new Date();
          hour.setHours(hour.getHours() - (23 - i));
          
          return {
            timestamp: hour,
            completed: Math.floor(Math.random() * 20 + 10),
            failed: Math.floor(Math.random() * 5),
            rate: 70 + Math.random() * 25
          };
        })
      };
    }
  }
  
  private async getHarvestAnalytics(timeRange: string): Promise<any> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_harvests,
          AVG(yield_value) as avg_yield,
          SUM(yield_value) as total_yield,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_harvests
        FROM harvests
        WHERE created_at >= NOW() - INTERVAL '${timeRange}'
      `);
      
      const row = result.rows[0] || {};
      
      return {
        totalHarvests: parseInt(row.total_harvests || 0),
        averageYield: parseFloat(row.avg_yield || 0),
        totalYield: parseFloat(row.total_yield || 0),
        successRate: row.total_harvests > 0
          ? (row.successful_harvests / row.total_harvests) * 100
          : 0,
        byFarmType: {
          'data-processing': Math.random() * 100 + 50,
          'content-generation': Math.random() * 100 + 50,
          'code-review': Math.random() * 100 + 50,
          'research': Math.random() * 100 + 50
        }
      };
    } catch (error) {
      // Return mock data if database is unavailable
      return {
        totalHarvests: 150,
        averageYield: 75.5,
        totalYield: 11325,
        successRate: 92.5,
        byFarmType: {
          'data-processing': 85,
          'content-generation': 72,
          'code-review': 93,
          'research': 68
        }
      };
    }
  }
  
  private startPeriodicUpdates() {
    // Send updates every 5 seconds
    this.updateInterval = setInterval(async () => {
      // Update resource metrics (most frequent)
      const resourceMetrics = this.getResourceMetrics();
      this.io.to('analytics:resources').emit('analytics:update', {
        type: 'resources',
        data: resourceMetrics,
        timestamp: new Date()
      });
      
      // Update task completion every 10 seconds
      if (Date.now() % 10000 < 5000) {
        const taskMetrics = await this.getTaskCompletion('1h');
        this.io.to('analytics:tasks').emit('analytics:update', {
          type: 'tasks',
          data: taskMetrics,
          timestamp: new Date()
        });
      }
      
      // Update agent efficiency every 15 seconds
      if (Date.now() % 15000 < 5000) {
        const efficiencyMetrics = await this.getAgentEfficiency('1h');
        this.io.to('analytics:efficiency').emit('analytics:update', {
          type: 'efficiency',
          data: efficiencyMetrics,
          timestamp: new Date()
        });
      }
      
      // Update costs every 30 seconds
      if (Date.now() % 30000 < 5000) {
        const costsMetrics = await this.getClaudeCodeCosts();
        this.io.to('analytics:costs').emit('analytics:update', {
          type: 'costs',
          data: costsMetrics,
          timestamp: new Date()
        });
      }
      
      // Broadcast to 'all' subscribers
      this.io.to('analytics:all').emit('analytics:heartbeat', {
        timestamp: new Date(),
        subscribers: this.subscribers.size
      });
    }, 5000);
  }
  
  public stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  // Method to trigger immediate update for specific metric
  public async triggerUpdate(metric: string) {
    const data = await this.getMetricData(metric);
    this.io.to(`analytics:${metric}`).emit('analytics:update', {
      type: metric,
      data,
      timestamp: new Date()
    });
  }
}

export default AnalyticsWebSocketHandler;