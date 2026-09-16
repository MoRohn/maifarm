/**
 * Thermal Monitoring Store
 *
 * Zustand store for managing thermal monitoring state in the MaiFarm dashboard.
 * Tracks thermal pressure, temperature, alerts, and auto-adjustment events.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { apiClient } from '@/services/apiClient';

// Thermal pressure levels matching backend
export enum ThermalPressureLevel {
  NOMINAL = 0,
  MODERATE = 1,
  HEAVY = 2,
  TRAPPING = 3,
  SLEEPING = 4
}

export const THERMAL_PRESSURE_LABELS: Record<ThermalPressureLevel, string> = {
  [ThermalPressureLevel.NOMINAL]: 'nominal',
  [ThermalPressureLevel.MODERATE]: 'moderate',
  [ThermalPressureLevel.HEAVY]: 'heavy',
  [ThermalPressureLevel.TRAPPING]: 'trapping',
  [ThermalPressureLevel.SLEEPING]: 'sleeping'
};

export const THERMAL_PRESSURE_COLORS: Record<ThermalPressureLevel, string> = {
  [ThermalPressureLevel.NOMINAL]: '#22c55e',   // green-500
  [ThermalPressureLevel.MODERATE]: '#eab308',   // yellow-500
  [ThermalPressureLevel.HEAVY]: '#f97316',      // orange-500
  [ThermalPressureLevel.TRAPPING]: '#ef4444',   // red-500
  [ThermalPressureLevel.SLEEPING]: '#dc2626'    // red-600
};

export interface ThermalMetrics {
  timestamp: Date;
  pressureLevel: ThermalPressureLevel;
  pressureLabel: string;
  cpuTemperature: number | null;
  gpuTemperature: number | null;
  systemTemperature: number | null;
  fanSpeed: number | null;
  fanSpeedPercent: number | null;
  isThrottling: boolean;
  chipGeneration: string | null;
}

export interface ThermalAlert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  pressureLevel: ThermalPressureLevel;
  message: string;
  action: string | null;
  acknowledged: boolean;
}

export interface ThermalThresholds {
  cpuWarning: number;
  cpuCritical: number;
  gpuWarning: number;
  gpuCritical: number;
  reduceAgentsAt: ThermalPressureLevel;
  pauseFarmsAt: ThermalPressureLevel;
  emergencyStopAt: ThermalPressureLevel;
}

export interface ThermalStats {
  timeWindow: string;
  samples: number;
  temperature: {
    cpu: { average: number | null; max: number | null; min: number | null };
    gpu: { average: number | null; max: number | null };
  };
  pressure: { average: number; max: number; maxLabel: string };
  throttling: { events: number; estimatedDurationSeconds: number; estimatedDurationMinutes: number };
  alerts: { total: number; critical: number; emergency: number };
  farmActions: Record<string, number>;
}

export interface ThermalHistoryEntry {
  timestamp: Date;
  pressureLevel: ThermalPressureLevel;
  pressureLabel: string;
  cpuTemperature: number | null;
  gpuTemperature: number | null;
  isThrottling: boolean;
}

interface ThermalState {
  // Current metrics
  currentMetrics: ThermalMetrics | null;
  metricsHistory: ThermalHistoryEntry[];

  // Alerts
  activeAlerts: ThermalAlert[];
  alertHistory: ThermalAlert[];

  // Thresholds
  thresholds: ThermalThresholds | null;

  // Statistics
  stats: ThermalStats | null;

  // Farm launch status
  canLaunchFarm: boolean;
  launchBlockReason: string | null;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Settings
  autoRefresh: boolean;
  refreshInterval: number;
  showAlerts: boolean;

  // Last update
  lastUpdated: Date | null;
}

interface ThermalActions {
  // Data fetching
  fetchCurrentMetrics: () => Promise<void>;
  fetchHistory: (limit?: number) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchThresholds: () => Promise<void>;
  fetchStats: (timeWindow?: string) => Promise<void>;
  fetchCanLaunch: () => Promise<void>;

  // Real-time updates
  updateMetrics: (metrics: ThermalMetrics) => void;
  addAlert: (alert: ThermalAlert) => void;
  acknowledgeAlert: (alertId: string) => Promise<void>;

  // Threshold management
  updateThresholds: (thresholds: Partial<ThermalThresholds>) => Promise<void>;

  // Settings
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setShowAlerts: (show: boolean) => void;

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearHistory: () => void;
}

const initialState: ThermalState = {
  currentMetrics: null,
  metricsHistory: [],
  activeAlerts: [],
  alertHistory: [],
  thresholds: null,
  stats: null,
  canLaunchFarm: true,
  launchBlockReason: null,
  isLoading: false,
  error: null,
  autoRefresh: true,
  refreshInterval: 5000,
  showAlerts: true,
  lastUpdated: null
};

export const useThermalStore = create<ThermalState & ThermalActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        fetchCurrentMetrics: async () => {
          try {
            set({ isLoading: true, error: null });
            const response = await apiClient.get('/thermal/metrics');

            if (response.data?.success && response.data?.data) {
              const { current, canLaunchFarm, thresholds } = response.data.data;

              if (current) {
                const metrics: ThermalMetrics = {
                  ...current,
                  timestamp: new Date(current.timestamp)
                };

                set({
                  currentMetrics: metrics,
                  canLaunchFarm: canLaunchFarm?.allowed ?? true,
                  launchBlockReason: canLaunchFarm?.reason || null,
                  thresholds: thresholds || get().thresholds,
                  lastUpdated: new Date()
                });

                // Add to history
                get().updateMetrics(metrics);
              }
            }
          } catch (error) {
            set({ error: 'Failed to fetch thermal metrics' });
          } finally {
            set({ isLoading: false });
          }
        },

        fetchHistory: async (limit = 100) => {
          try {
            const response = await apiClient.get(`/thermal/history?limit=${limit}`);

            if (response.data?.success && response.data?.data) {
              const history: ThermalHistoryEntry[] = response.data.data.map((entry: any) => ({
                ...entry,
                timestamp: new Date(entry.timestamp)
              }));

              set({ metricsHistory: history });
            }
          } catch (error) {
            console.error('Failed to fetch thermal history:', error);
          }
        },

        fetchAlerts: async () => {
          try {
            const response = await apiClient.get('/thermal/alerts');

            if (response.data?.success && response.data?.data) {
              const alerts: ThermalAlert[] = response.data.data.map((alert: any) => ({
                ...alert,
                timestamp: new Date(alert.timestamp)
              }));

              set({ activeAlerts: alerts.filter(a => !a.acknowledged) });
            }
          } catch (error) {
            console.error('Failed to fetch thermal alerts:', error);
          }
        },

        fetchThresholds: async () => {
          try {
            const response = await apiClient.get('/thermal/thresholds');

            if (response.data?.success && response.data?.data) {
              set({ thresholds: response.data.data });
            }
          } catch (error) {
            console.error('Failed to fetch thermal thresholds:', error);
          }
        },

        fetchStats: async (timeWindow = '24h') => {
          try {
            const response = await apiClient.get(`/thermal/stats?window=${timeWindow}`);

            if (response.data?.success && response.data?.data) {
              set({ stats: response.data.data });
            }
          } catch (error) {
            console.error('Failed to fetch thermal stats:', error);
          }
        },

        fetchCanLaunch: async () => {
          try {
            const response = await apiClient.get('/thermal/can-launch');

            if (response.data?.success && response.data?.data) {
              set({
                canLaunchFarm: response.data.data.allowed,
                launchBlockReason: response.data.data.reason || null
              });
            }
          } catch (error) {
            console.error('Failed to check launch conditions:', error);
          }
        },

        updateMetrics: (metrics: ThermalMetrics) => {
          set(state => {
            const newEntry: ThermalHistoryEntry = {
              timestamp: metrics.timestamp,
              pressureLevel: metrics.pressureLevel,
              pressureLabel: metrics.pressureLabel,
              cpuTemperature: metrics.cpuTemperature,
              gpuTemperature: metrics.gpuTemperature,
              isThrottling: metrics.isThrottling
            };

            // Keep last 200 entries for charting
            const history = [...state.metricsHistory, newEntry].slice(-200);

            return {
              currentMetrics: metrics,
              metricsHistory: history,
              lastUpdated: new Date()
            };
          });
        },

        addAlert: (alert: ThermalAlert) => {
          set(state => {
            // Avoid duplicate alerts
            if (state.activeAlerts.some(a => a.id === alert.id)) {
              return state;
            }

            return {
              activeAlerts: [alert, ...state.activeAlerts].slice(0, 50),
              alertHistory: [alert, ...state.alertHistory].slice(0, 200)
            };
          });
        },

        acknowledgeAlert: async (alertId: string) => {
          try {
            await apiClient.post(`/thermal/alerts/${alertId}/acknowledge`);

            set(state => ({
              activeAlerts: state.activeAlerts.filter(a => a.id !== alertId),
              alertHistory: state.alertHistory.map(a =>
                a.id === alertId ? { ...a, acknowledged: true } : a
              )
            }));
          } catch (error) {
            console.error('Failed to acknowledge alert:', error);
          }
        },

        updateThresholds: async (newThresholds: Partial<ThermalThresholds>) => {
          try {
            const response = await apiClient.put('/thermal/thresholds', newThresholds);

            if (response.data?.success && response.data?.data) {
              set({ thresholds: response.data.data });
            }
          } catch (error) {
            console.error('Failed to update thresholds:', error);
            throw error;
          }
        },

        setAutoRefresh: (enabled: boolean) => {
          set({ autoRefresh: enabled });
        },

        setRefreshInterval: (interval: number) => {
          set({ refreshInterval: interval });
        },

        setShowAlerts: (show: boolean) => {
          set({ showAlerts: show });
        },

        setLoading: (loading: boolean) => {
          set({ isLoading: loading });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        clearHistory: () => {
          set({ metricsHistory: [], alertHistory: [] });
        }
      }),
      {
        name: 'thermal-storage',
        partialize: (state) => ({
          autoRefresh: state.autoRefresh,
          refreshInterval: state.refreshInterval,
          showAlerts: state.showAlerts,
          thresholds: state.thresholds
        })
      }
    )
  )
);

// Utility functions
export function getThermalStatusColor(pressureLevel: ThermalPressureLevel): string {
  return THERMAL_PRESSURE_COLORS[pressureLevel] || THERMAL_PRESSURE_COLORS[ThermalPressureLevel.NOMINAL];
}

export function getThermalStatusLabel(pressureLevel: ThermalPressureLevel): string {
  return THERMAL_PRESSURE_LABELS[pressureLevel] || 'unknown';
}

export function getTemperatureColor(temp: number | null): string {
  if (temp === null) return '#6b7280'; // gray-500
  if (temp < 60) return '#22c55e'; // green-500
  if (temp < 75) return '#eab308'; // yellow-500
  if (temp < 90) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

export function formatTemperature(temp: number | null): string {
  if (temp === null) return '--°C';
  return `${temp.toFixed(1)}°C`;
}
