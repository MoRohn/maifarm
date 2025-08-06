import { Router } from 'express';
import { monitoringMetrics } from './monitoring';

const router = Router();

interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

interface AggregatedMetrics {
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

// Get current metrics snapshot
router.get('/api/metrics/current', async (req, res) => {
  try {
    const currentMetrics = {
      timestamp: new Date(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      application: {
        activeAgents: monitoringMetrics.activeAgentsGauge.hashMap,
        httpRequests: {
          duration: monitoringMetrics.httpRequestDuration.hashMap,
          count: monitoringMetrics.httpRequestDuration.sum
        },
        tasks: monitoringMetrics.taskCounter.hashMap,
        resources: monitoringMetrics.resourceUtilizationGauge.hashMap
      }
    };

    res.json(currentMetrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve current metrics' });
  }
});

// Get metrics for specific time range
router.get('/api/metrics/range', async (req, res) => {
  try {
    const { 
      metric,
      start,
      end,
      step = '1m',
      labels
    } = req.query;

    if (!metric || !start || !end) {
      return res.status(400).json({ 
        error: 'Missing required parameters: metric, start, end' 
      });
    }

    const startTime = new Date(start as string);
    const endTime = new Date(end as string);

    // In production, this would query time-series database
    const timeSeriesData = generateMockTimeSeriesData(
      metric as string,
      startTime,
      endTime,
      step as string,
      labels as Record<string, string>
    );

    res.json({
      metric,
      timeRange: { start: startTime, end: endTime },
      step,
      data: timeSeriesData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve metric range' });
  }
});

// Get aggregated metrics
router.get('/api/metrics/aggregate', async (req, res) => {
  try {
    const {
      metric,
      start,
      end,
      aggregation = 'avg',
      groupBy
    } = req.query;

    if (!metric || !start || !end) {
      return res.status(400).json({ 
        error: 'Missing required parameters: metric, start, end' 
      });
    }

    const startTime = new Date(start as string);
    const endTime = new Date(end as string);

    // In production, this would perform actual aggregation
    const aggregatedData = performMetricAggregation(
      metric as string,
      startTime,
      endTime,
      aggregation as string,
      groupBy as string
    );

    res.json({
      metric,
      timeRange: { start: startTime, end: endTime },
      aggregation,
      groupBy,
      data: aggregatedData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate metrics' });
  }
});

// Get available metrics
router.get('/api/metrics/catalog', (req, res) => {
  try {
    const catalog = [
      {
        name: 'maifarm_http_request_duration_seconds',
        type: 'histogram',
        help: 'Duration of HTTP requests in seconds',
        labels: ['method', 'route', 'status']
      },
      {
        name: 'maifarm_active_agents',
        type: 'gauge',
        help: 'Number of currently active agents',
        labels: ['farm_id']
      },
      {
        name: 'maifarm_tasks_total',
        type: 'counter',
        help: 'Total number of tasks processed',
        labels: ['status', 'agent_id', 'farm_id']
      },
      {
        name: 'maifarm_resource_utilization',
        type: 'gauge',
        help: 'Resource utilization percentage',
        labels: ['resource_type', 'agent_id']
      },
      {
        name: 'maifarm_websocket_connections',
        type: 'gauge',
        help: 'Number of active WebSocket connections'
      },
      {
        name: 'maifarm_farm_efficiency',
        type: 'gauge',
        help: 'Farm efficiency percentage',
        labels: ['farm_id']
      },
      {
        name: 'maifarm_agent_response_time',
        type: 'histogram',
        help: 'Agent response time in milliseconds',
        labels: ['agent_id', 'task_type']
      }
    ];

    res.json({ metrics: catalog });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve metrics catalog' });
  }
});

// Compare metrics
router.post('/api/metrics/compare', async (req, res) => {
  try {
    const {
      metrics,
      timeRanges,
      aggregation = 'avg'
    } = req.body;

    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'Invalid metrics array' });
    }

    if (!timeRanges || !Array.isArray(timeRanges) || timeRanges.length === 0) {
      return res.status(400).json({ error: 'Invalid time ranges array' });
    }

    const comparisonData = await compareMetrics(metrics, timeRanges, aggregation);

    res.json({
      metrics,
      timeRanges,
      aggregation,
      comparison: comparisonData
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compare metrics' });
  }
});

// Get metric forecast
router.get('/api/metrics/forecast', async (req, res) => {
  try {
    const {
      metric,
      duration = '1h',
      method = 'linear'
    } = req.query;

    if (!metric) {
      return res.status(400).json({ error: 'Missing required parameter: metric' });
    }

    // In production, this would use time-series forecasting
    const forecast = generateMetricForecast(
      metric as string,
      duration as string,
      method as string
    );

    res.json({
      metric,
      duration,
      method,
      forecast
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate metric forecast' });
  }
});

// Helper functions
function generateMockTimeSeriesData(
  metric: string,
  start: Date,
  end: Date,
  step: string,
  labels?: Record<string, string>
): MetricPoint[] {
  const points: MetricPoint[] = [];
  const stepMs = parseStepToMs(step);
  let current = start.getTime();

  while (current <= end.getTime()) {
    points.push({
      timestamp: new Date(current),
      value: Math.random() * 100,
      labels
    });
    current += stepMs;
  }

  return points;
}

function parseStepToMs(step: string): number {
  const match = step.match(/^(\d+)([smhd])$/);
  if (!match) return 60000; // Default to 1 minute

  const [, value, unit] = match;
  const num = parseInt(value);

  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60000;
    case 'h': return num * 3600000;
    case 'd': return num * 86400000;
    default: return 60000;
  }
}

function performMetricAggregation(
  metric: string,
  start: Date,
  end: Date,
  aggregation: string,
  groupBy?: string
): any {
  // Mock aggregated data
  return {
    value: Math.random() * 100,
    aggregation,
    samples: Math.floor(Math.random() * 1000)
  };
}

async function compareMetrics(
  metrics: string[],
  timeRanges: Array<{ start: string; end: string }>,
  aggregation: string
): Promise<any> {
  // Mock comparison data
  const results: any = {};

  metrics.forEach(metric => {
    results[metric] = timeRanges.map(range => ({
      timeRange: range,
      value: Math.random() * 100,
      change: (Math.random() - 0.5) * 20
    }));
  });

  return results;
}

function generateMetricForecast(
  metric: string,
  duration: string,
  method: string
): any {
  // Mock forecast data
  const durationMs = parseStepToMs(duration);
  const points = Math.floor(durationMs / 60000); // 1 point per minute
  const forecast: MetricPoint[] = [];
  const now = Date.now();

  for (let i = 0; i < points; i++) {
    forecast.push({
      timestamp: new Date(now + i * 60000),
      value: Math.random() * 100 + 50
    });
  }

  return {
    points: forecast,
    confidence: {
      lower: forecast.map(p => ({ ...p, value: p.value * 0.8 })),
      upper: forecast.map(p => ({ ...p, value: p.value * 1.2 }))
    }
  };
}

export default router;