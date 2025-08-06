import { Request, Response } from 'express';
import { metricsRegistry } from './metricsCollector.js';
import * as os from 'os';
import {
  updateSystemResources,
  updateActiveFarms,
  updateActiveAgents,
  updateConnectedClients,
  updateFarmEfficiency
} from './metricsCollector.js';

// System resource monitoring
async function collectSystemMetrics() {
  try {
    // CPU usage calculation
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
    
    // Disk usage (simplified - would need proper implementation for production)
    const diskUsage = 50; // Placeholder - implement actual disk usage calculation
    
    updateSystemResources(cpuUsage, memoryUsage, diskUsage);
  } catch (error) {
    console.error('Error collecting system metrics:', error);
  }
}

// Update metrics based on current application state
export function updateApplicationMetrics(farms: Map<string, any>, agents: Map<string, any>, connectedClients: number) {
  // Update farm metrics
  updateActiveFarms(farms);
  
  // Update agent metrics
  updateActiveAgents(agents);
  
  // Update connected clients
  updateConnectedClients(connectedClients);
  
  // Update farm efficiency metrics
  farms.forEach((farm, farmId) => {
    if (farm.metrics && farm.metrics.efficiency !== undefined) {
      updateFarmEfficiency(farmId, farm.metrics.efficiency);
    }
  });
}

// Prometheus metrics endpoint handler
export async function metricsHandler(req: Request, res: Response) {
  try {
    // Collect latest system metrics
    await collectSystemMetrics();
    
    // Set appropriate headers
    res.set('Content-Type', metricsRegistry.contentType);
    
    // Return metrics in Prometheus format
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
}

// Additional metric endpoints for specific data

// Farm-specific metrics
export async function farmMetricsHandler(req: Request, res: Response) {
  try {
    const farmId = req.params.farmId;
    const metrics = await metricsRegistry.getSingleMetricAsString('maifarm_farm_efficiency_percent');
    
    res.json({
      farmId,
      metrics: metrics || 'No metrics available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting farm metrics:', error);
    res.status(500).json({ error: 'Failed to get farm metrics' });
  }
}

// Agent performance metrics
export async function agentMetricsHandler(req: Request, res: Response) {
  try {
    const agentId = req.params.agentId;
    const performanceMetrics = await metricsRegistry.getSingleMetricAsString('maifarm_agent_performance_score');
    const taskMetrics = await metricsRegistry.getSingleMetricAsString('maifarm_task_duration_seconds');
    
    res.json({
      agentId,
      performance: performanceMetrics || 'No performance data',
      taskDurations: taskMetrics || 'No task duration data',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting agent metrics:', error);
    res.status(500).json({ error: 'Failed to get agent metrics' });
  }
}

// System health metrics
export async function systemMetricsHandler(req: Request, res: Response) {
  try {
    const cpuMetrics = await metricsRegistry.getSingleMetricAsString('maifarm_system_resources');
    const defaultMetrics = await metricsRegistry.metrics();
    
    res.json({
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length
      },
      metrics: {
        custom: cpuMetrics || 'No custom metrics',
        default: defaultMetrics.includes('process_cpu_seconds_total')
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system metrics:', error);
    res.status(500).json({ error: 'Failed to get system metrics' });
  }
}

// Start periodic metric collection
let metricsInterval: NodeJS.Timeout | null = null;

export function startMetricsCollection(
  farms: Map<string, any>,
  agents: Map<string, any>,
  getConnectedClients: () => number
) {
  // Stop any existing interval
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
  
  // Collect metrics every 15 seconds
  metricsInterval = setInterval(() => {
    collectSystemMetrics();
    updateApplicationMetrics(farms, agents, getConnectedClients());
  }, 15000);
  
  // Initial collection
  collectSystemMetrics();
  updateApplicationMetrics(farms, agents, getConnectedClients());
}

export function stopMetricsCollection() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}