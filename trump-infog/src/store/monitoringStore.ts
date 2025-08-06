import { create } from 'zustand';
import { 
  MonitoringState, 
  AgentStatus, 
  PipelineStage, 
  ConnectionState,
  LogEntry,
  Alert,
  MonitoringMetrics
} from '../types/monitoring';

interface MonitoringStore extends MonitoringState {
  // Connection actions
  setConnectionState: (state: Partial<ConnectionState>) => void;
  
  // Project actions
  setProjectStatus: (status: MonitoringState['project']['status']) => void;
  
  // Agent actions
  updateAgentStatus: (agentId: string, status: Partial<AgentStatus>) => void;
  removeAgent: (agentId: string) => void;
  
  // Pipeline actions
  updatePipelineStage: (stage: string, data: Partial<PipelineStage>) => void;
  resetPipeline: () => void;
  
  // Log actions
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  
  // Alert actions
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'resolved' | 'resolvedAt'>) => void;
  resolveAlert: (alertId: string) => void;
  clearAlerts: () => void;
  
  // Metrics actions
  updateMetrics: (metrics: Partial<MonitoringMetrics>) => void;
  
  // State management
  resetState: () => void;
}

const initialState: MonitoringState = {
  project: {
    id: '',
    name: 'Trump Infographic Generation',
    status: 'initializing',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    pipeline: {
      dataCollection: {
        name: 'Data Collection',
        status: 'pending',
        progress: 0
      },
      contentAnalysis: {
        name: 'Content Analysis',
        status: 'pending',
        progress: 0
      },
      designGeneration: {
        name: 'Design Generation',
        status: 'pending',
        progress: 0
      },
      outputAssembly: {
        name: 'Output Assembly',
        status: 'pending',
        progress: 0
      }
    },
    agents: []
  },
  agents: {
    agent_0: {
      agentId: 'agent_0',
      status: 'initializing',
      currentTask: 'Waiting to start',
      lastUpdate: new Date().toISOString()
    },
    agent_1: {
      agentId: 'agent_1',
      status: 'initializing',
      currentTask: 'Waiting to start',
      lastUpdate: new Date().toISOString()
    },
    agent_2: {
      agentId: 'agent_2',
      status: 'initializing',
      currentTask: 'Waiting to start',
      lastUpdate: new Date().toISOString()
    },
    agent_3: {
      agentId: 'agent_3',
      status: 'initializing',
      currentTask: 'Waiting to start',
      lastUpdate: new Date().toISOString()
    }
  },
  metrics: {
    agentHealth: {},
    pipelineMetrics: {
      stageDurations: {},
      queueDepth: 0,
      throughput: 0,
      successRate: 0,
      avgCompletionTime: 0
    },
    qualityMetrics: {
      dataAccuracy: 0,
      designQualityScore: 0,
      outputCompleteness: 0,
      validationPassRate: 0
    },
    systemMetrics: {
      totalConnections: 0,
      activeAgents: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      networkLatency: 0
    }
  },
  connectionState: {
    status: 'disconnected',
    reconnectAttempts: 0
  },
  logs: [],
  alerts: []
};

export const useMonitoringStore = create<MonitoringStore>((set, get) => ({
  ...initialState,

  // Connection actions
  setConnectionState: (connectionState) => set((state) => ({
    connectionState: { ...state.connectionState, ...connectionState }
  })),

  // Project actions
  setProjectStatus: (status) => set((state) => ({
    project: state.project ? {
      ...state.project,
      status,
      updated: new Date().toISOString()
    } : null
  })),

  // Agent actions
  updateAgentStatus: (agentId, status) => set((state) => ({
    agents: {
      ...state.agents,
      [agentId]: {
        ...state.agents[agentId],
        ...status,
        agentId
      }
    }
  })),

  removeAgent: (agentId) => set((state) => {
    const { [agentId]: removed, ...rest } = state.agents;
    return { agents: rest };
  }),

  // Pipeline actions
  updatePipelineStage: (stage, data) => set((state) => {
    if (!state.project) return state;
    
    const pipelineKey = stage.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    
    return {
      project: {
        ...state.project,
        pipeline: {
          ...state.project.pipeline,
          [pipelineKey]: {
            ...state.project.pipeline[pipelineKey as keyof typeof state.project.pipeline],
            ...data,
            ...(data.status === 'in_progress' && !data.startTime ? { startTime: new Date().toISOString() } : {})
          }
        },
        updated: new Date().toISOString()
      }
    };
  }),

  resetPipeline: () => set((state) => ({
    project: state.project ? {
      ...state.project,
      status: 'initializing',
      pipeline: initialState.project!.pipeline
    } : null
  })),

  // Log actions
  addLog: (log) => set((state) => ({
    logs: [
      {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...log
      },
      ...state.logs
    ].slice(0, 500) // Keep last 500 logs
  })),

  clearLogs: () => set({ logs: [] }),

  // Alert actions
  addAlert: (alert) => set((state) => ({
    alerts: [
      {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        resolved: false,
        ...alert
      },
      ...state.alerts
    ]
  })),

  resolveAlert: (alertId) => set((state) => ({
    alerts: state.alerts.map(alert =>
      alert.id === alertId
        ? { ...alert, resolved: true, resolvedAt: new Date().toISOString() }
        : alert
    )
  })),

  clearAlerts: () => set({ alerts: [] }),

  // Metrics actions
  updateMetrics: (metrics) => set((state) => ({
    metrics: {
      agentHealth: { ...state.metrics.agentHealth, ...metrics.agentHealth },
      pipelineMetrics: { ...state.metrics.pipelineMetrics, ...metrics.pipelineMetrics },
      qualityMetrics: { ...state.metrics.qualityMetrics, ...metrics.qualityMetrics },
      systemMetrics: { ...state.metrics.systemMetrics, ...metrics.systemMetrics }
    }
  })),

  // State management
  resetState: () => set(initialState),

  // Computed getters
  get state() {
    return get();
  },

  get projectStatus() {
    return get().project?.status || 'initializing';
  },

  get pipelineStages() {
    const project = get().project;
    if (!project) return {};
    
    return {
      data_collection: project.pipeline.dataCollection,
      content_analysis: project.pipeline.contentAnalysis,
      design_generation: project.pipeline.designGeneration,
      output_assembly: project.pipeline.outputAssembly
    };
  },

  get agentStates() {
    return get().agents;
  },

  get activeAlerts() {
    return get().alerts.filter(alert => !alert.resolved);
  }
}));