import { Router } from 'express';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';
import { metricsCollector } from '../monitoring/metricsCollector';
import { prometheusExporter } from '../monitoring/prometheusExporter';

const router = Router();

// Initialize Prometheus metrics
collectDefaultMetrics({ prefix: 'maifarm_' });

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'maifarm_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const activeAgentsGauge = new Gauge({
  name: 'maifarm_active_agents',
  help: 'Number of currently active agents',
  labelNames: ['farm_id']
});

const taskCounter = new Counter({
  name: 'maifarm_tasks_total',
  help: 'Total number of tasks processed',
  labelNames: ['status', 'agent_id', 'farm_id']
});

const resourceUtilizationGauge = new Gauge({
  name: 'maifarm_resource_utilization',
  help: 'Resource utilization percentage',
  labelNames: ['resource_type', 'agent_id']
});

// Prometheus metrics endpoint
router.get('/api/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  }).catch(err => {
    res.status(500).end();
  });
});

// Current system metrics
router.get('/api/metrics/current', async (req, res) => {
  try {
    const metrics = await metricsCollector.getCurrentMetrics();
    res.json({
      timestamp: new Date(),
      system: {
        cpu: metrics.cpu,
        memory: metrics.memory,
        uptime: process.uptime()
      },
      farms: metrics.farms,
      agents: metrics.agents,
      tasks: metrics.tasks,
      websockets: metrics.websockets
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Historical metrics with time range
router.get('/api/metrics/history', async (req, res) => {
  try {
    const { start, end, interval = '5m' } = req.query;
    const startTime = start ? new Date(start as string) : new Date(Date.now() - 3600000); // 1 hour ago
    const endTime = end ? new Date(end as string) : new Date();
    
    const historicalMetrics = await metricsCollector.getHistoricalMetrics(
      startTime,
      endTime,
      interval as string
    );
    
    res.json({
      timeRange: { start: startTime, end: endTime },
      interval,
      data: historicalMetrics
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve historical metrics' });
  }
});

// Agent-specific metrics
router.get('/api/metrics/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const metrics = await metricsCollector.getAgentMetrics(agentId);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({
      agentId,
      timestamp: new Date(),
      metrics
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve agent metrics' });
  }
});

// Farm-specific metrics
router.get('/api/metrics/farms/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    const metrics = await metricsCollector.getFarmMetrics(farmId);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    
    res.json({
      farmId,
      timestamp: new Date(),
      metrics
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve farm metrics' });
  }
});

// Error tracking endpoint
router.post('/errors', async (req, res) => {
  try {
    const errorData = req.body;
    
    // Log the error for monitoring
    console.error('Client error reported:', errorData);
    
    // In a production environment, you would send this to a monitoring service
    // For now, we'll just acknowledge receipt
    res.json({ 
      status: 'received',
      timestamp: new Date(),
      errorId: Math.random().toString(36).substr(2, 9)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log error' });
  }
});

// Export metrics functions for use in middleware
export const monitoringMetrics = {
  httpRequestDuration,
  activeAgentsGauge,
  taskCounter,
  resourceUtilizationGauge
};

export default router;