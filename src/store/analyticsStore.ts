import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  AnalyticsState,
  AnalyticsOverview,
  TimeRange,
  TimeSeriesData,
  AgentPerformanceMetric,
  TaskCompletion,
  ErrorMetric,
  Prediction,
  Anomaly,
  Report,
  MetricUpdate,
  AggregatedMetrics,
  AnalyticsFilter,
} from '../types/analytics';

interface AnalyticsStore extends AnalyticsState {
  // Actions
  setOverview: (overview: AnalyticsOverview) => void;
  setMetrics: (metrics: AggregatedMetrics) => void;
  updateTimeSeriesData: (data: TimeSeriesData[]) => void;
  addTimeSeriesPoint: (seriesId: string, point: any) => void;
  updateAgentPerformance: (performance: AgentPerformanceMetric[]) => void;
  setAgentPerformance: (performance: AgentPerformanceMetric[]) => void;
  addTaskCompletion: (task: TaskCompletion) => void;
  setTaskCompletions: (tasks: TaskCompletion[]) => void;
  addError: (error: ErrorMetric) => void;
  addPrediction: (prediction: Prediction) => void;
  addAnomaly: (anomaly: Anomaly) => void;
  setReports: (reports: Report[]) => void;
  addReport: (report: Report) => void;
  updateReport: (reportId: string, updates: Partial<Report>) => void;
  deleteReport: (reportId: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setRefreshInterval: (interval: number) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  processMetricUpdate: (update: MetricUpdate) => void;
  fetchAnalytics: (filter?: AnalyticsFilter) => Promise<void>;
  updateFromWebSocket: (data: any) => void;
  clearAnalytics: () => void;
}

const initialState: AnalyticsState = {
  overview: null,
  metrics: null,
  timeSeriesData: [],
  agentPerformance: [],
  taskCompletions: [],
  errors: [],
  predictions: [],
  anomalies: [],
  reports: [],
  isLoading: false,
  error: null,
  selectedTimeRange: {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
    end: new Date(),
    preset: '24h',
  },
  refreshInterval: 30000, // 30 seconds
  lastUpdated: null,
};

export const useAnalyticsStore = create<AnalyticsStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setOverview: (overview) => set({ overview, lastUpdated: new Date() }),

        setMetrics: (metrics) => set({ metrics }),

        updateTimeSeriesData: (data) => set({ timeSeriesData: data }),

        addTimeSeriesPoint: (seriesId, point) =>
          set((state) => ({
            timeSeriesData: state.timeSeriesData.map((series) =>
              series.label === seriesId
                ? { ...series, data: [...series.data, point] }
                : series
            ),
          })),

        updateAgentPerformance: (performance) =>
          set({ agentPerformance: performance }),

        setAgentPerformance: (performance) =>
          set({ agentPerformance: performance }),

        addTaskCompletion: (task) =>
          set((state) => ({
            taskCompletions: [...state.taskCompletions, task],
            metrics: state.metrics
              ? {
                  ...state.metrics,
                  totalTasks: state.metrics.totalTasks + 1,
                  completedTasks:
                    task.status === 'completed'
                      ? state.metrics.completedTasks + 1
                      : state.metrics.completedTasks,
                  failedTasks:
                    task.status === 'failed'
                      ? state.metrics.failedTasks + 1
                      : state.metrics.failedTasks,
                }
              : state.metrics,
          })),

        setTaskCompletions: (tasks) =>
          set({ taskCompletions: tasks }),

        addError: (error) =>
          set((state) => ({
            errors: [...state.errors, error],
            metrics: state.metrics
              ? {
                  ...state.metrics,
                  errorRate:
                    (state.errors.length + 1) /
                    (state.metrics.totalTasks || 1),
                }
              : state.metrics,
          })),

        addPrediction: (prediction) =>
          set((state) => ({
            predictions: [...state.predictions, prediction],
          })),

        addAnomaly: (anomaly) =>
          set((state) => ({
            anomalies: [...state.anomalies, anomaly],
          })),

        setReports: (reports) => set({ reports }),

        addReport: (report) =>
          set((state) => ({
            reports: [...state.reports, report],
          })),

        updateReport: (reportId, updates) =>
          set((state) => ({
            reports: state.reports.map((report) =>
              report.id === reportId ? { ...report, ...updates } : report
            ),
          })),

        deleteReport: (reportId) =>
          set((state) => ({
            reports: state.reports.filter((report) => report.id !== reportId),
          })),

        setTimeRange: (range) => set({ selectedTimeRange: range }),

        setRefreshInterval: (interval) => set({ refreshInterval: interval }),

        setLoading: (isLoading) => set({ isLoading }),

        setError: (error) => set({ error }),

        processMetricUpdate: (update) => {
          const state = get();
          switch (update.type) {
            case 'agent_performance':
              const updatedPerformance = state.agentPerformance.map((agent) =>
                agent.agentId === update.data.agentId
                  ? { ...agent, ...update.data }
                  : agent
              );
              
              // Add new agent if not exists
              if (!updatedPerformance.find(a => a.agentId === update.data.agentId)) {
                updatedPerformance.push(update.data);
              }
              
              set({ agentPerformance: updatedPerformance });
              break;

            case 'task_completion':
              get().addTaskCompletion(update.data);
              break;

            case 'resource_usage':
              // Update resource usage in metrics
              if (state.metrics) {
                set({
                  metrics: {
                    ...state.metrics,
                    resourceUtilization: update.data,
                  },
                });
              }
              break;

            case 'error':
              get().addError(update.data);
              break;

            case 'cost':
              // Update cost metrics
              if (state.metrics) {
                set({
                  metrics: {
                    ...state.metrics,
                    totalCost: update.data,
                  },
                });
              }
              break;
          }
        },

        fetchAnalytics: async (filter) => {
          set({ isLoading: true, error: null });
          try {
            // This would normally call the API
            // For now, we'll use mock data
            const mockOverview: AnalyticsOverview = {
              farmPerformance: [],
              resourceUsage: {
                cpu: 65,
                memory: 72,
                storage: 45,
                network: 38,
                timestamp: new Date()
              },
              harvestAnalytics: [],
              claudeCodeMetrics: {
                apiCalls: 1250,
                tokensUsed: 458000,
                costPerToken: 0.00002,
                totalCost: 9.16,
                averageLatency: 850,
                errorRate: 0.02,
                modelType: 'claude-3-opus',
                timestamp: new Date()
              },
              systemHealth: {
                uptime: 99.95,
                errorRate: 0.12,
                avgResponseTime: 145,
                activeConnections: 42,
                memoryUsage: 62.5,
                cpuUsage: 45.8,
                diskUsage: 38.2,
                networkLatency: 23,
                serviceStatus: {
                  api_server: 'healthy',
                  websocket: 'healthy',
                  database: 'healthy',
                  cache: 'healthy'
                }
              },
              costBreakdown: {
                total: 1250.50,
                compute: 650.25,
                storage: 125.30,
                network: 85.15,
                api: 389.80,
                period: 'daily',
                currency: 'USD'
              },
              agentEfficiency: [],
              taskCompletionRates: []
            };
            
            set({ 
              overview: mockOverview,
              isLoading: false,
              lastUpdated: new Date()
            });
          } catch (error) {
            set({ 
              error: error instanceof Error ? error.message : 'Failed to fetch analytics',
              isLoading: false 
            });
          }
        },

        updateFromWebSocket: (data) => {
          const state = get();
          
          // Update overview if provided
          if (data.overview) {
            set({ overview: data.overview, lastUpdated: new Date() });
          }
          
          // Update specific metrics
          if (data.metrics) {
            set({ metrics: data.metrics });
          }
          
          // Update time series data
          if (data.timeSeriesUpdate) {
            get().addTimeSeriesPoint(data.timeSeriesUpdate.series, data.timeSeriesUpdate.point);
          }
          
          // Process metric updates
          if (data.metricUpdate) {
            get().processMetricUpdate(data.metricUpdate);
          }
        },

        clearAnalytics: () => set(initialState),
      }),
      {
        name: 'analytics-storage',
        partialize: (state) => ({
          reports: state.reports,
          selectedTimeRange: state.selectedTimeRange,
          refreshInterval: state.refreshInterval,
        }),
      }
    )
  )
);