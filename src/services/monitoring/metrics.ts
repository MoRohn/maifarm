import { Agent, Farm } from '../../types';
import { 
  MonitoringData, 
  TimeSeriesData, 
  ResourceHistory,
  TaskEvent,
  ErrorPrediction,
  CommunicationNode,
  CommunicationEdge
} from '../../types/monitoring';
import { prometheusExporter } from './prometheus';

interface MetricsBuffer {
  cpu: TimeSeriesData[];
  memory: TimeSeriesData[];
  network: TimeSeriesData[];
  disk: TimeSeriesData[];
}

export class MetricsCollector {
  private metricsBuffers: Map<string, MetricsBuffer> = new Map();
  private readonly maxBufferSize = 1000; // Keep last 1000 data points
  private readonly collectionInterval = 5000; // Collect every 5 seconds
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.startCollection();
  }

  private startCollection() {
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
    }, this.collectionInterval);
  }

  stopCollection() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Collect metrics for an agent
  collectAgentMetrics(agent: Agent, taskEvent?: TaskEvent) {
    const agentKey = `agent_${agent.id}`;
    
    if (!this.metricsBuffers.has(agentKey)) {
      this.metricsBuffers.set(agentKey, {
        cpu: [],
        memory: [],
        network: [],
        disk: []
      });
    }

    const buffer = this.metricsBuffers.get(agentKey)!;
    const now = new Date();

    // Add current metrics to buffer
    this.addToBuffer(buffer.cpu, { value: agent.cpu, timestamp: now });
    this.addToBuffer(buffer.memory, { value: agent.memory, timestamp: now });
    
    // Simulate network and disk metrics (in real implementation, these would come from actual monitoring)
    this.addToBuffer(buffer.network, { 
      value: Math.random() * 100, 
      timestamp: now 
    });
    this.addToBuffer(buffer.disk, { 
      value: Math.random() * 50 + 20, 
      timestamp: now 
    });

    // Update Prometheus metrics
    prometheusExporter.updateAgentMetrics(agent, taskEvent ? {
      completed: taskEvent.status === 'completed' ? 1 : 0,
      failed: taskEvent.status === 'failed' ? 1 : 0,
      duration: taskEvent.duration
    } : undefined);
  }

  // Collect metrics for a farm
  collectFarmMetrics(farms: Farm[]) {
    farms.forEach(farm => {
      const farmKey = `farm_${farm.id}`;
      
      if (!this.metricsBuffers.has(farmKey)) {
        this.metricsBuffers.set(farmKey, {
          cpu: [],
          memory: [],
          network: [],
          disk: []
        });
      }

      const buffer = this.metricsBuffers.get(farmKey)!;
      const now = new Date();

      // Aggregate agent metrics for the farm
      const avgCpu = farm.agents.reduce((sum, agent) => sum + agent.cpu, 0) / farm.agents.length || 0;
      const avgMemory = farm.agents.reduce((sum, agent) => sum + agent.memory, 0) / farm.agents.length || 0;

      this.addToBuffer(buffer.cpu, { value: avgCpu, timestamp: now });
      this.addToBuffer(buffer.memory, { value: avgMemory, timestamp: now });
    });

    // Update Prometheus metrics
    prometheusExporter.updateFarmMetrics(farms);
  }

  // Collect system-wide metrics
  private collectSystemMetrics() {
    const systemKey = 'system';
    
    if (!this.metricsBuffers.has(systemKey)) {
      this.metricsBuffers.set(systemKey, {
        cpu: [],
        memory: [],
        network: [],
        disk: []
      });
    }

    const buffer = this.metricsBuffers.get(systemKey)!;
    const now = new Date();

    // Simulate system metrics (in real implementation, these would come from actual monitoring)
    this.addToBuffer(buffer.cpu, { 
      value: Math.random() * 30 + 40, // 40-70% CPU
      timestamp: now 
    });
    this.addToBuffer(buffer.memory, { 
      value: Math.random() * 20 + 50, // 50-70% Memory
      timestamp: now 
    });
    this.addToBuffer(buffer.network, { 
      value: Math.random() * 1000, // 0-1000 Mbps
      timestamp: now 
    });
    this.addToBuffer(buffer.disk, { 
      value: Math.random() * 10 + 30, // 30-40% Disk
      timestamp: now 
    });
  }

  // Add data point to buffer with size limit
  private addToBuffer(buffer: TimeSeriesData[], data: TimeSeriesData) {
    buffer.push(data);
    
    // Remove old data points if buffer is too large
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  // Get resource history for an entity (agent/farm/system)
  getResourceHistory(entityId: string): ResourceHistory {
    const key = entityId.startsWith('agent_') ? entityId : 
                entityId.startsWith('farm_') ? entityId : 
                'system';
    
    const buffer = this.metricsBuffers.get(key) || {
      cpu: [],
      memory: [],
      network: [],
      disk: []
    };

    return {
      cpu: [...buffer.cpu],
      memory: [...buffer.memory],
      network: [...buffer.network],
      disk: [...buffer.disk]
    };
  }

  // Get latest metrics snapshot
  getLatestMetrics(entityId: string): { cpu: number; memory: number; network: number; disk: number } | null {
    const history = this.getResourceHistory(entityId);
    
    const getLatest = (data: TimeSeriesData[]) => 
      data.length > 0 ? data[data.length - 1].value : 0;

    return {
      cpu: getLatest(history.cpu),
      memory: getLatest(history.memory),
      network: getLatest(history.network),
      disk: getLatest(history.disk)
    };
  }

  // Calculate resource trends
  calculateResourceTrends(entityId: string, windowSize: number = 10): {
    cpuTrend: 'increasing' | 'stable' | 'decreasing';
    memoryTrend: 'increasing' | 'stable' | 'decreasing';
  } {
    const history = this.getResourceHistory(entityId);
    
    const calculateTrend = (data: TimeSeriesData[]): 'increasing' | 'stable' | 'decreasing' => {
      if (data.length < windowSize) return 'stable';
      
      const recent = data.slice(-windowSize);
      const firstHalf = recent.slice(0, windowSize / 2);
      const secondHalf = recent.slice(windowSize / 2);
      
      const avgFirst = firstHalf.reduce((sum, d) => sum + d.value, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, d) => sum + d.value, 0) / secondHalf.length;
      
      const diff = avgSecond - avgFirst;
      const threshold = 5; // 5% change threshold
      
      if (diff > threshold) return 'increasing';
      if (diff < -threshold) return 'decreasing';
      return 'stable';
    };

    return {
      cpuTrend: calculateTrend(history.cpu),
      memoryTrend: calculateTrend(history.memory)
    };
  }

  // Generate error predictions based on metrics
  generateErrorPredictions(agents: Agent[]): ErrorPrediction[] {
    const predictions: ErrorPrediction[] = [];

    agents.forEach(agent => {
      const metrics = this.getLatestMetrics(`agent_${agent.id}`);
      const trends = this.calculateResourceTrends(`agent_${agent.id}`);
      
      if (!metrics) return;

      // Predict resource exhaustion
      if (metrics.cpu > 85 && trends.cpuTrend === 'increasing') {
        predictions.push({
          agentId: agent.id,
          type: 'resource_exhaustion',
          probability: Math.min(0.9, metrics.cpu / 100),
          estimatedTimeToError: (100 - metrics.cpu) * 60, // Rough estimate in seconds
          suggestedActions: [
            {
              id: `scale_${agent.id}`,
              type: 'scale',
              description: 'Scale down agent workload',
              impact: 'medium',
              automated: true
            },
            {
              id: `investigate_${agent.id}`,
              type: 'investigate',
              description: 'Investigate high CPU usage',
              impact: 'low',
              automated: false
            }
          ],
          confidence: 0.8
        });
      }

      // Predict memory issues
      if (metrics.memory > 80 && trends.memoryTrend === 'increasing') {
        predictions.push({
          agentId: agent.id,
          type: 'resource_exhaustion',
          probability: Math.min(0.85, metrics.memory / 100),
          estimatedTimeToError: (100 - metrics.memory) * 120, // Rough estimate in seconds
          suggestedActions: [
            {
              id: `restart_${agent.id}`,
              type: 'restart',
              description: 'Restart agent to clear memory',
              impact: 'high',
              automated: true
            }
          ],
          confidence: 0.75
        });
      }

      // Predict task failure based on error patterns
      if (agent.status === 'error') {
        predictions.push({
          agentId: agent.id,
          type: 'task_failure',
          probability: 0.7,
          estimatedTimeToError: 0, // Already in error state
          suggestedActions: [
            {
              id: `retry_${agent.id}`,
              type: 'restart',
              description: 'Retry failed task',
              impact: 'medium',
              automated: true
            }
          ],
          confidence: 0.9
        });
      }
    });

    return predictions;
  }

  // Generate communication graph data
  generateCommunicationGraph(agents: Agent[]): { nodes: CommunicationNode[]; edges: CommunicationEdge[] } {
    const nodes: CommunicationNode[] = agents.map((agent, index) => ({
      id: agent.id,
      agentId: agent.id,
      label: agent.name,
      type: 'agent',
      position: {
        x: Math.cos(2 * Math.PI * index / agents.length) * 100,
        y: Math.sin(2 * Math.PI * index / agents.length) * 100,
        z: Math.random() * 50
      },
      activity: agent.status === 'working' ? 0.8 : 0.2,
      status: agent.status === 'error' ? 'error' : 
              agent.status === 'working' ? 'active' : 'idle'
    }));

    // Generate synthetic edges based on agent collaboration patterns
    const edges: CommunicationEdge[] = [];
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        // Create edges between agents that might collaborate
        if (Math.random() > 0.6) {
          edges.push({
            id: `edge_${agents[i].id}_${agents[j].id}`,
            source: agents[i].id,
            target: agents[j].id,
            weight: Math.random() * 100,
            latency: Math.random() * 50 + 10,
            type: Math.random() > 0.5 ? 'sync' : 'async',
            active: agents[i].status === 'working' && agents[j].status === 'working'
          });
        }
      }
    }

    return { nodes, edges };
  }

  // Clear metrics for an entity
  clearMetrics(entityId: string) {
    this.metricsBuffers.delete(entityId);
  }

  // Clear all metrics
  clearAllMetrics() {
    this.metricsBuffers.clear();
  }

  // Export metrics for analysis
  exportMetrics(entityId?: string): Record<string, MetricsBuffer> {
    if (entityId) {
      const buffer = this.metricsBuffers.get(entityId);
      return buffer ? { [entityId]: buffer } : {};
    }
    return Object.fromEntries(this.metricsBuffers);
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();