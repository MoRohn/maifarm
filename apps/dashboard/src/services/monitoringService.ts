import { 
  MonitoringData, 
  AgentMonitoringData, 
  ResourceMetrics,
  CommunicationGraph,
  ErrorPrediction,
  MonitoringControl,
  MonitoringAlert,
  TimeSeriesData
} from '@/types/monitoring';
import { websocketService } from './websocket';

class MonitoringService {
  private monitoringData: Map<string, MonitoringData> = new Map();
  private updateCallbacks: Map<string, Set<(data: MonitoringData) => void>> = new Map();
  private alertCallbacks: Set<(alert: MonitoringAlert) => void> = new Set();
  private predictionInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupWebSocketHandlers();
    this.startPredictionEngine();
  }

  private setupWebSocketHandlers() {
    // Handle agent updates
    websocketService.on('agent_update', (message) => {
      const agentData = message.payload as AgentMonitoringData;
      this.updateAgentData(agentData);
    });

    // Handle resource metrics
    websocketService.on('resource_metrics', (message) => {
      const metrics = message.payload as ResourceMetrics;
      this.updateResourceMetrics(metrics);
    });

    // Handle monitoring alerts
    websocketService.on('monitoring_alert', (message) => {
      const alert = message.payload as MonitoringAlert;
      this.handleAlert(alert);
    });

    // Handle communication events
    websocketService.on('communication_event', (message) => {
      this.updateCommunicationGraph(message.payload);
    });
  }

  private startPredictionEngine() {
    // Run predictions every 30 seconds
    this.predictionInterval = setInterval(() => {
      this.runPredictions();
    }, 30000);
  }

  private runPredictions() {
    this.monitoringData.forEach((data, farmId) => {
      const predictions = this.generatePredictions(data);
      this.updatePredictions(farmId, predictions);
      
      // Check for critical predictions
      predictions.forEach(prediction => {
        if (prediction.probability > 0.8) {
          this.createPredictionAlert(farmId, prediction);
        }
      });
    });
  }

  private generatePredictions(data: MonitoringData): ErrorPrediction[] {
    const predictions: ErrorPrediction[] = [];

    data.agents.forEach(agent => {
      // Resource exhaustion prediction
      const resourcePrediction = this.predictResourceExhaustion(agent);
      if (resourcePrediction) predictions.push(resourcePrediction);

      // Task failure prediction
      const taskPrediction = this.predictTaskFailure(agent);
      if (taskPrediction) predictions.push(taskPrediction);

      // Communication breakdown prediction
      const commPrediction = this.predictCommunicationBreakdown(agent, data.communication);
      if (commPrediction) predictions.push(commPrediction);
    });

    return predictions;
  }

  private predictResourceExhaustion(agent: AgentMonitoringData): ErrorPrediction | null {
    const { cpu, memory } = this.analyzeResourceTrends(agent.resourceHistory);
    
    if (cpu.trend === 'increasing' && cpu.projectedMax > 90) {
      return {
        agentId: agent.id,
        type: 'resource_exhaustion',
        probability: cpu.projectedMax / 100,
        estimatedTimeToError: cpu.timeToMax,
        confidence: 0.85,
        suggestedActions: [
          {
            id: '1',
            type: 'throttle',
            description: 'Reduce agent workload',
            impact: 'medium',
            automated: true
          },
          {
            id: '2',
            type: 'scale',
            description: 'Add additional agent to distribute load',
            impact: 'low',
            automated: false
          }
        ]
      };
    }

    if (memory.trend === 'increasing' && memory.projectedMax > 85) {
      return {
        agentId: agent.id,
        type: 'resource_exhaustion',
        probability: memory.projectedMax / 100,
        estimatedTimeToError: memory.timeToMax,
        confidence: 0.8,
        suggestedActions: [
          {
            id: '1',
            type: 'restart',
            description: 'Restart agent to clear memory',
            impact: 'medium',
            automated: true
          }
        ]
      };
    }

    return null;
  }

  private predictTaskFailure(agent: AgentMonitoringData): ErrorPrediction | null {
    const recentTasks = agent.taskHistory.slice(-10);
    const failureRate = recentTasks.filter(t => t.status === 'failed').length / recentTasks.length;
    
    if (failureRate > 0.3) {
      const avgFailureInterval = this.calculateAverageFailureInterval(agent.taskHistory);
      
      return {
        agentId: agent.id,
        type: 'task_failure',
        probability: Math.min(failureRate * 2, 0.95),
        estimatedTimeToError: avgFailureInterval,
        confidence: 0.75,
        suggestedActions: [
          {
            id: '1',
            type: 'investigate',
            description: 'Review recent error logs',
            impact: 'low',
            automated: false
          },
          {
            id: '2',
            type: 'restart',
            description: 'Restart agent with fresh state',
            impact: 'medium',
            automated: true
          }
        ]
      };
    }

    return null;
  }

  private predictCommunicationBreakdown(
    agent: AgentMonitoringData, 
    graph: CommunicationGraph
  ): ErrorPrediction | null {
    const agentEdges = graph.edges.filter(e => 
      e.source === agent.id || e.target === agent.id
    );
    
    const avgLatency = agentEdges.reduce((sum, e) => sum + e.latency, 0) / agentEdges.length;
    const highLatencyEdges = agentEdges.filter(e => e.latency > 1000).length;
    
    if (avgLatency > 500 || highLatencyEdges > agentEdges.length * 0.3) {
      return {
        agentId: agent.id,
        type: 'communication_breakdown',
        probability: Math.min(avgLatency / 1000, 0.9),
        estimatedTimeToError: 300, // 5 minutes
        confidence: 0.7,
        suggestedActions: [
          {
            id: '1',
            type: 'investigate',
            description: 'Check network connectivity',
            impact: 'low',
            automated: false
          },
          {
            id: '2',
            type: 'migrate',
            description: 'Move agent to different node',
            impact: 'high',
            automated: false
          }
        ]
      };
    }

    return null;
  }

  private analyzeResourceTrends(history: {
    cpu: TimeSeriesData[];
    memory: TimeSeriesData[];
  }) {
    const analyzeTrend = (data: TimeSeriesData[]) => {
      if (data.length < 5) return { trend: 'stable' as const, projectedMax: 0, timeToMax: 0 };
      
      const recent = data.slice(-10);
      const values = recent.map(d => d.value);
      const avgGrowth = values.reduce((sum, val, i) => {
        if (i === 0) return sum;
        return sum + (val - values[i - 1]);
      }, 0) / (values.length - 1);
      
      const currentValue = values[values.length - 1];
      const growthRate = avgGrowth / currentValue;
      
      let trend: 'increasing' | 'stable' | 'decreasing';
      if (growthRate > 0.05) trend = 'increasing';
      else if (growthRate < -0.05) trend = 'decreasing';
      else trend = 'stable';
      
      const projectedMax = currentValue + (avgGrowth * 20); // Project 20 time units ahead
      const timeToMax = trend === 'increasing' ? (100 - currentValue) / avgGrowth : Infinity;
      
      return { trend, projectedMax, timeToMax };
    };

    return {
      cpu: analyzeTrend(history.cpu),
      memory: analyzeTrend(history.memory)
    };
  }

  private calculateAverageFailureInterval(tasks: any[]): number {
    const failures = tasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => task.status === 'failed');
    
    if (failures.length < 2) return 3600; // Default to 1 hour
    
    const intervals = failures.slice(1).map((failure, i) => {
      const prevFailure = failures[i];
      return failure.index - prevFailure.index;
    });
    
    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length * 60; // Convert to seconds
  }

  private updateAgentData(agentData: AgentMonitoringData) {
    const farmId = this.getFarmIdForAgent(agentData.id);
    if (!farmId) return;

    const monitoring = this.monitoringData.get(farmId) || this.createEmptyMonitoringData();
    const agentIndex = monitoring.agents.findIndex(a => a.id === agentData.id);
    
    if (agentIndex >= 0) {
      monitoring.agents[agentIndex] = agentData;
    } else {
      monitoring.agents.push(agentData);
    }
    
    monitoring.timestamp = new Date();
    this.monitoringData.set(farmId, monitoring);
    this.notifyUpdates(farmId, monitoring);
  }

  private updateResourceMetrics(metrics: ResourceMetrics) {
    // Update resource metrics for all farms
    this.monitoringData.forEach((data, farmId) => {
      data.resources = metrics;
      data.timestamp = new Date();
      this.notifyUpdates(farmId, data);
    });
  }

  private updateCommunicationGraph(graphData: any) {
    // Update communication graph
    this.monitoringData.forEach((data, farmId) => {
      data.communication = this.processCommunicationData(graphData);
      this.notifyUpdates(farmId, data);
    });
  }

  private updatePredictions(farmId: string, predictions: ErrorPrediction[]) {
    const data = this.monitoringData.get(farmId);
    if (!data) return;
    
    data.predictions = predictions;
    this.notifyUpdates(farmId, data);
  }

  private createPredictionAlert(farmId: string, prediction: ErrorPrediction) {
    const alert: MonitoringAlert = {
      id: `alert-${Date.now()}`,
      severity: prediction.probability > 0.9 ? 'critical' : 'warning',
      type: 'prediction',
      title: `${prediction.type.replace('_', ' ')} predicted`,
      message: `Agent ${prediction.agentId} has ${Math.round(prediction.probability * 100)}% chance of ${prediction.type} in ${Math.round(prediction.estimatedTimeToError / 60)} minutes`,
      agentId: prediction.agentId,
      farmId,
      timestamp: new Date(),
      acknowledged: false,
      suggestedActions: prediction.suggestedActions
    };
    
    this.handleAlert(alert);
  }

  private handleAlert(alert: MonitoringAlert) {
    this.alertCallbacks.forEach(callback => callback(alert));
    
    // Store alert in monitoring data
    const data = this.monitoringData.get(alert.farmId || '');
    if (data) {
      if (!data.alerts) data.alerts = [];
      data.alerts.push(alert);
      this.notifyUpdates(alert.farmId!, data);
    }
  }

  private processCommunicationData(rawData: any): CommunicationGraph {
    // Process raw communication data into graph format
    return {
      nodes: rawData.nodes || [],
      edges: rawData.edges || [],
      clusters: rawData.clusters || []
    };
  }

  private createEmptyMonitoringData(): MonitoringData {
    return {
      agents: [],
      resources: {
        overall: { cpu: 0, memory: 0, network: 0, timestamp: new Date() },
        byAgent: new Map(),
        predictions: {
          cpuTrend: 'stable',
          memoryTrend: 'stable',
          estimatedTimeToLimit: null
        }
      },
      communication: {
        nodes: [],
        edges: [],
        clusters: []
      },
      predictions: [],
      timestamp: new Date()
    };
  }

  private getFarmIdForAgent(agentId: string): string | null {
    // In a real implementation, this would look up the farm ID
    // For now, return a default
    return 'default-farm';
  }

  private notifyUpdates(farmId: string, data: MonitoringData) {
    const callbacks = this.updateCallbacks.get(farmId);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Public API
  public subscribeToFarm(farmId: string, callback: (data: MonitoringData) => void): () => void {
    if (!this.updateCallbacks.has(farmId)) {
      this.updateCallbacks.set(farmId, new Set());
    }
    
    this.updateCallbacks.get(farmId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.updateCallbacks.get(farmId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.updateCallbacks.delete(farmId);
        }
      }
    };
  }

  public subscribeToAlerts(callback: (alert: MonitoringAlert) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  public sendControl(control: MonitoringControl) {
    websocketService.emit('monitoring_control', control);
  }

  public acknowledgeAlert(alertId: string) {
    websocketService.emit('acknowledge_alert', { alertId });
  }

  public getMonitoringData(farmId: string): MonitoringData | null {
    return this.monitoringData.get(farmId) || null;
  }

  public dispose() {
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
    }
    this.updateCallbacks.clear();
    this.alertCallbacks.clear();
    this.monitoringData.clear();
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();