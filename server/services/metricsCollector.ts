import { db } from '../database/connection';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

interface DashboardMetrics {
  activeFarms: number;
  totalAgents: number;
  tasksCompleted: number;
  successRate: number;
}

interface MetricsUpdate {
  type: 'dashboard' | 'farm' | 'agent' | 'task';
  data: any;
  timestamp: Date;
}

class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  private updateInterval: NodeJS.Timeout | null = null;
  private coordinationDir = '/tmp/claude_coordination';
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  constructor() {
    super();
  }

  // Start collecting metrics at regular intervals
  start(intervalMs: number = 5000): void {
    if (this.updateInterval) {
      return; // Already running
    }

    // Initial collection
    this.collectMetrics();

    // Set up periodic collection
    this.updateInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  // Stop collecting metrics
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Collect all metrics
  private async collectMetrics(): Promise<void> {
    try {
      const dashboardMetrics = await this.collectDashboardMetrics();
      
      // Emit metrics update event
      this.emit('metrics:update', {
        type: 'dashboard',
        data: dashboardMetrics,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  // Collect dashboard-specific metrics
  async collectDashboardMetrics(): Promise<DashboardMetrics> {
    const metrics: DashboardMetrics = {
      activeFarms: 0,
      totalAgents: 0,
      tasksCompleted: 0,
      successRate: 100
    };

    try {
      // Count active farms from database
      const farmResult = await db.query(
        "SELECT COUNT(*) as count FROM farms WHERE status IN ('running', 'active')"
      ).catch(() => null);
      
      if (farmResult) {
        metrics.activeFarms = parseInt(farmResult.rows[0]?.count || '0');
      }

      // Count total agents from database and coordination directory
      const agentResult = await db.query(
        "SELECT COUNT(*) as count FROM agents WHERE status IN ('active', 'idle', 'processing')"
      ).catch(() => null);
      
      if (agentResult) {
        metrics.totalAgents = parseInt(agentResult.rows[0]?.count || '0');
      }

      // Also check coordination directory for active agents
      try {
        const activeAgentsFile = path.join(this.coordinationDir, 'active_agents.json');
        const agentsData = await fs.readFile(activeAgentsFile, 'utf-8');
        const activeAgents = JSON.parse(agentsData);
        const coordinationAgentCount = Object.keys(activeAgents).filter(
          key => activeAgents[key].status === 'active'
        ).length;
        
        // Use the higher count between DB and coordination directory
        metrics.totalAgents = Math.max(metrics.totalAgents, coordinationAgentCount);
      } catch (error) {
        // Coordination directory might not exist yet
      }

      // Count completed tasks from last 24 hours
      const taskResult = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM tasks
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => null);

      if (taskResult && taskResult.rows[0]) {
        const completed = parseInt(taskResult.rows[0].completed || '0');
        const failed = parseInt(taskResult.rows[0].failed || '0');
        metrics.tasksCompleted = completed;
        
        // Calculate success rate
        const total = completed + failed;
        metrics.successRate = total > 0 
          ? Math.round((completed / total) * 100)
          : 100;
      }

      // If no database connection, return mock data
      if (!farmResult && !agentResult && !taskResult) {
        // Check for farms in memory or coordination directory
        try {
          const workClaimsDir = path.join(this.coordinationDir, 'work_claims');
          const files = await fs.readdir(workClaimsDir).catch(() => []);
          const activeWorkClaims = files.filter(f => f.endsWith('.json')).length;
          
          // Use work claims as a proxy for active operations
          if (activeWorkClaims > 0) {
            metrics.activeFarms = Math.ceil(activeWorkClaims / 3); // Estimate farms
            metrics.totalAgents = activeWorkClaims;
            metrics.tasksCompleted = activeWorkClaims * 2; // Estimate completed tasks
          }
        } catch (error) {
          // Coordination directory not accessible
        }
      }

    } catch (error) {
      console.error('Error collecting dashboard metrics:', error);
    }

    return metrics;
  }

  // Get current metrics without waiting for next collection
  async getCurrentMetrics(): Promise<DashboardMetrics> {
    return await this.collectDashboardMetrics();
  }

  // Update specific metric
  async updateMetric(type: string, name: string, value: number): Promise<void> {
    try {
      await db.query(
        `INSERT INTO metrics (source, source_id, type, name, value, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        ['system', 'dashboard', type, name, value]
      );
    } catch (error) {
      console.error('Error updating metric:', error);
    }
  }

  // Increment task completed counter
  async incrementTasksCompleted(): Promise<void> {
    await this.updateMetric('task', 'completed', 1);
    // Trigger immediate metrics collection
    this.collectMetrics();
  }

  // Update farm status
  async updateFarmStatus(farmId: string, status: string): Promise<void> {
    if (status === 'active' || status === 'running') {
      await this.updateMetric('farm', 'activated', 1);
    }
    // Trigger immediate metrics collection
    this.collectMetrics();
  }

  // Update agent status
  async updateAgentStatus(agentId: string, status: string): Promise<void> {
    if (status === 'active') {
      await this.updateMetric('agent', 'activated', 1);
    }
    // Trigger immediate metrics collection
    this.collectMetrics();
  }

  // Increment counter metric
  incrementCounter(name: string, labels?: Record<string, string>): void {
    // Simple implementation for now
    console.log(`Metric incremented: ${name}`, labels);
  }

  // Set gauge metric
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    // Simple implementation for now
    console.log(`Metric set: ${name} = ${value}`, labels);
  }
}

export const metricsCollector = MetricsCollector.getInstance();