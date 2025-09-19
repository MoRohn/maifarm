import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const metricsRegistry = new Registry();

// Enable default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: metricsRegistry, prefix: 'maifarm_' });

// Custom metrics for MaiFarm

// Counters
export const farmsCreatedTotal = new Counter({
  name: 'maifarm_farms_created_total',
  help: 'Total number of farms created',
  labelNames: ['type', 'mode'],
  registers: [metricsRegistry]
});

export const agentsSpawnedTotal = new Counter({
  name: 'maifarm_agents_spawned_total',
  help: 'Total number of agents spawned',
  labelNames: ['farm_id', 'agent_type'],
  registers: [metricsRegistry]
});

export const tasksCompletedTotal = new Counter({
  name: 'maifarm_tasks_completed_total',
  help: 'Total number of tasks completed',
  labelNames: ['farm_id', 'agent_id', 'task_type', 'status'],
  registers: [metricsRegistry]
});

export const apiRequestsTotal = new Counter({
  name: 'maifarm_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [metricsRegistry]
});

export const websocketEventsTotal = new Counter({
  name: 'maifarm_websocket_events_total',
  help: 'Total number of WebSocket events',
  labelNames: ['event_type', 'direction'],
  registers: [metricsRegistry]
});

// Gauges
export const activeFarmsGauge = new Gauge({
  name: 'maifarm_active_farms',
  help: 'Number of currently active farms',
  labelNames: ['status'],
  registers: [metricsRegistry]
});

export const activeAgentsGauge = new Gauge({
  name: 'maifarm_active_agents',
  help: 'Number of currently active agents',
  labelNames: ['farm_id', 'status'],
  registers: [metricsRegistry]
});

export const connectedClientsGauge = new Gauge({
  name: 'maifarm_connected_clients',
  help: 'Number of connected WebSocket clients',
  registers: [metricsRegistry]
});

export const systemResourcesGauge = new Gauge({
  name: 'maifarm_system_resources',
  help: 'System resource utilization',
  labelNames: ['resource_type', 'unit'],
  registers: [metricsRegistry]
});

export const farmEfficiencyGauge = new Gauge({
  name: 'maifarm_farm_efficiency_percent',
  help: 'Farm efficiency percentage',
  labelNames: ['farm_id'],
  registers: [metricsRegistry]
});

// Histograms
export const taskDurationHistogram = new Histogram({
  name: 'maifarm_task_duration_seconds',
  help: 'Task completion duration in seconds',
  labelNames: ['farm_id', 'agent_id', 'task_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry]
});

export const apiResponseTimeHistogram = new Histogram({
  name: 'maifarm_api_response_time_seconds',
  help: 'API response time in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry]
});

export const websocketMessageSizeHistogram = new Histogram({
  name: 'maifarm_websocket_message_size_bytes',
  help: 'WebSocket message size in bytes',
  labelNames: ['event_type', 'direction'],
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [metricsRegistry]
});

// Summaries
export const farmLifecycleSummary = new Summary({
  name: 'maifarm_farm_lifecycle_duration_seconds',
  help: 'Farm lifecycle duration from creation to termination',
  labelNames: ['farm_type', 'termination_reason'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [metricsRegistry]
});

export const agentPerformanceSummary = new Summary({
  name: 'maifarm_agent_performance_score',
  help: 'Agent performance score based on task completion',
  labelNames: ['agent_id', 'agent_type'],
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [metricsRegistry]
});

// Helper functions for metric collection
export function recordFarmCreation(type: string, mode: string) {
  farmsCreatedTotal.inc({ type, mode });
}

export function recordAgentSpawned(farmId: string, agentType: string) {
  agentsSpawnedTotal.inc({ farm_id: farmId, agent_type: agentType });
}

export function recordTaskCompletion(farmId: string, agentId: string, taskType: string, status: string, duration: number) {
  tasksCompletedTotal.inc({ farm_id: farmId, agent_id: agentId, task_type: taskType, status });
  if (status === 'success') {
    taskDurationHistogram.observe({ farm_id: farmId, agent_id: agentId, task_type: taskType }, duration);
  }
}

export function recordApiRequest(method: string, endpoint: string, statusCode: number, responseTime: number) {
  apiRequestsTotal.inc({ method, endpoint, status_code: statusCode.toString() });
  apiResponseTimeHistogram.observe({ method, endpoint }, responseTime);
}

export function recordWebSocketEvent(eventType: string, direction: 'in' | 'out', messageSize?: number) {
  websocketEventsTotal.inc({ event_type: eventType, direction });
  if (messageSize !== undefined) {
    websocketMessageSizeHistogram.observe({ event_type: eventType, direction }, messageSize);
  }
}

export function updateActiveFarms(farms: Map<string, any>) {
  const statusCounts = new Map<string, number>();
  
  farms.forEach(farm => {
    const status = farm.status || 'unknown';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  
  // Reset all gauges first
  activeFarmsGauge.reset();
  
  statusCounts.forEach((count, status) => {
    activeFarmsGauge.set({ status }, count);
  });
}

export function updateActiveAgents(agents: Map<string, any>) {
  const agentsByFarmAndStatus = new Map<string, Map<string, number>>();
  
  agents.forEach(agent => {
    const farmId = agent.farmId || 'unknown';
    const status = agent.status || 'unknown';
    
    if (!agentsByFarmAndStatus.has(farmId)) {
      agentsByFarmAndStatus.set(farmId, new Map());
    }
    
    const farmAgents = agentsByFarmAndStatus.get(farmId)!;
    farmAgents.set(status, (farmAgents.get(status) || 0) + 1);
  });
  
  // Reset all gauges first
  activeAgentsGauge.reset();
  
  agentsByFarmAndStatus.forEach((statusCounts, farmId) => {
    statusCounts.forEach((count, status) => {
      activeAgentsGauge.set({ farm_id: farmId, status }, count);
    });
  });
}

export function updateConnectedClients(count: number) {
  connectedClientsGauge.set(count);
}

export function updateSystemResources(cpuPercent: number, memoryPercent: number, diskPercent: number) {
  systemResourcesGauge.set({ resource_type: 'cpu', unit: 'percent' }, cpuPercent);
  systemResourcesGauge.set({ resource_type: 'memory', unit: 'percent' }, memoryPercent);
  systemResourcesGauge.set({ resource_type: 'disk', unit: 'percent' }, diskPercent);
}

export function updateFarmEfficiency(farmId: string, efficiency: number) {
  farmEfficiencyGauge.set({ farm_id: farmId }, efficiency);
}

export function recordFarmLifecycle(farmType: string, terminationReason: string, durationSeconds: number) {
  farmLifecycleSummary.observe({ farm_type: farmType, termination_reason: terminationReason }, durationSeconds);
}

export function recordAgentPerformance(agentId: string, agentType: string, performanceScore: number) {
  agentPerformanceSummary.observe({ agent_id: agentId, agent_type: agentType }, performanceScore);
}

// Middleware for Express to track HTTP requests
export function httpMetricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    recordApiRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
  });

  next();
}

// Export as metricsCollector object for compatibility
export const metricsCollector = {
  getCurrentMetrics: () => ({
    farms: activeFarmsGauge.get(),
    agents: activeAgentsGauge.get(),
    clients: connectedClientsGauge.get(),
    resources: systemResourcesGauge.get()
  }),
  recordFarmCreation,
  recordAgentSpawned,
  recordTaskCompletion,
  recordApiRequest,
  recordWebSocketEvent,
  updateActiveFarms,
  updateActiveAgents,
  updateConnectedClients,
  updateSystemResources,
  updateFarmEfficiency,
  recordFarmLifecycle,
  recordAgentPerformance
};