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
  FarmYieldMetrics,
} from '@/types/analytics';
import { unifiedMetricsService } from '@/services/unifiedMetricsService';
import { ExtendedMetrics, MetricUpdateEvent } from '@/types/metrics';

interface AnalyticsStore extends AnalyticsState {
  // Actions
  setOverview: (overview: AnalyticsOverview) => void;
  setMetrics: (metrics: AggregatedMetrics) => void;
  setFarmYieldMetrics: (metrics: FarmYieldMetrics) => void;
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
  farmYieldMetrics: null,
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

        setFarmYieldMetrics: (metrics) => set({ farmYieldMetrics: metrics }),

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
            // Fetch metrics from unified service
            const metrics = await unifiedMetricsService.fetchMetrics();
            const dashboardMetrics = unifiedMetricsService.getDashboardMetrics();
            
            // Convert unified metrics to analytics overview format
            const overview: AnalyticsOverview = {
              farmPerformance: dashboardMetrics.farms.map(farm => ({
                farmId: farm.farmId,
                farmName: farm.farmName,
                status: farm.status,
                activeAgents: farm.activeAgents,
                completedTasks: farm.completedTasks,
                successRate: farm.successRate,
                cpuUsage: farm.cpuUsage,
                memoryUsage: farm.memoryUsage,
                uptime: farm.uptime,
                lastActivity: farm.lastUpdated
              })),
              resourceUsage: {
                cpu: metrics.cpuUsage,
                memory: metrics.memoryUsage,
                storage: metrics.diskUsage,
                network: metrics.networkUsage,
                timestamp: metrics.timestamp
              },
              harvestAnalytics: [],
              claudeCodeMetrics: {
                apiCalls: Math.round(metrics.throughput * 100),
                tokensUsed: Math.round(metrics.totalCost * 50000),
                costPerToken: 0.00002,
                totalCost: metrics.apiCost,
                averageLatency: metrics.avgResponseTime,
                errorRate: metrics.errorRate / 100,
                modelType: 'claude-3-opus',
                timestamp: metrics.timestamp
              },
              systemHealth: {
                uptime: metrics.uptime,
                errorRate: metrics.errorRate,
                avgResponseTime: metrics.avgResponseTime,
                activeConnections: metrics.activeAgents,
                memoryUsage: metrics.memoryUsage,
                cpuUsage: metrics.cpuUsage,
                diskUsage: metrics.diskUsage,
                networkLatency: 23,
                serviceStatus: {
                  api_server: 'healthy',
                  websocket: 'healthy',
                  database: 'healthy',
                  cache: 'healthy'
                }
              },
              costBreakdown: {
                total: metrics.totalCost,
                compute: metrics.computeCost,
                storage: metrics.storageCost,
                network: 0,
                api: metrics.apiCost,
                period: 'daily',
                currency: 'USD'
              },
              agentEfficiency: dashboardMetrics.agents.map(agent => ({
                agentId: agent.agentId,
                agentName: agent.agentName,
                tasksCompleted: agent.tasksCompleted,
                successRate: agent.successRate,
                avgResponseTime: agent.avgResponseTime,
                resourceUsage: {
                  cpu: agent.cpuUsage,
                  memory: agent.memoryUsage
                },
                status: agent.status,
                lastActivity: agent.lastActivity
              })),
              taskCompletionRates: []
            };
            
            // Update aggregated metrics from unified service
            const aggregatedMetrics: AggregatedMetrics = {
              totalFarms: metrics.totalFarms,
              activeFarms: metrics.activeFarms,
              totalAgents: metrics.uniqueAgents,
              activeAgents: metrics.activeAgents,
              totalTasks: metrics.totalTasks,
              completedTasks: metrics.completedTasks,
              failedTasks: metrics.failedTasks,
              successRate: metrics.successRate,
              errorRate: metrics.errorRate,
              avgResponseTime: metrics.avgResponseTime,
              throughput: metrics.throughput,
              resourceUtilization: {
                cpu: metrics.cpuUsage,
                memory: metrics.memoryUsage,
                storage: metrics.diskUsage,
                network: metrics.networkUsage,
                timestamp: new Date()
              },
              totalCost: {
                total: metrics.totalCost,
                compute: metrics.computeCost,
                storage: metrics.storageCost,
                network: 0,
                api: metrics.apiCost,
                period: 'hourly' as const,
                currency: 'USD'
              },
              predictions: [],
              anomalies: []
            };
            
            set({ 
              overview,
              metrics: aggregatedMetrics,
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
          
          // Handle unified metrics update event
          if (data.type === 'metrics:update' || data.metrics) {
            // Let unified metrics service handle the update
            unifiedMetricsService.handleWebSocketUpdate(data as MetricUpdateEvent);
            
            // Fetch updated metrics from unified service
            const metrics = unifiedMetricsService.getMetrics();
            const dashboardMetrics = unifiedMetricsService.getDashboardMetrics();
            
            // Update aggregated metrics
            const aggregatedMetrics: AggregatedMetrics = {
              totalFarms: metrics.totalFarms,
              activeFarms: metrics.activeFarms,
              totalAgents: metrics.uniqueAgents,
              activeAgents: metrics.activeAgents,
              totalTasks: metrics.totalTasks,
              completedTasks: metrics.completedTasks,
              failedTasks: metrics.failedTasks,
              successRate: metrics.successRate,
              errorRate: metrics.errorRate,
              avgResponseTime: metrics.avgResponseTime,
              throughput: metrics.throughput,
              resourceUtilization: {
                cpu: metrics.cpuUsage,
                memory: metrics.memoryUsage,
                storage: metrics.diskUsage,
                network: metrics.networkUsage,
                timestamp: new Date()
              },
              totalCost: {
                total: metrics.totalCost,
                compute: metrics.computeCost,
                storage: metrics.storageCost,
                network: 0,
                api: metrics.apiCost,
                period: 'hourly' as const,
                currency: 'USD'
              },
              predictions: state.predictions || [],
              anomalies: state.anomalies || []
            };
            
            set({ metrics: aggregatedMetrics, lastUpdated: new Date() });
          }
          
          // Update overview if provided
          if (data.overview) {
            set({ overview: data.overview, lastUpdated: new Date() });
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