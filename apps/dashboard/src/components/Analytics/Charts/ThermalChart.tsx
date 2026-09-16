/**
 * Thermal Monitoring Chart Component
 *
 * Displays real-time thermal metrics including:
 * - Temperature line chart (CPU, GPU)
 * - Thermal pressure background coloring
 * - Fan speed indicator
 * - Throttling event markers
 */

import React, { useMemo, useEffect } from 'react';
import {
  useThermalStore,
  ThermalPressureLevel,
  THERMAL_PRESSURE_COLORS,
  getThermalStatusLabel,
  formatTemperature,
  getTemperatureColor
} from '@/store/thermalStore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { Thermometer, Fan, AlertTriangle, Activity, Cpu, Monitor } from 'lucide-react';

interface ThermalChartProps {
  height?: number;
  showLegend?: boolean;
  showThresholds?: boolean;
  timeRange?: '10m' | '30m' | '1h' | '6h';
}

export const ThermalChart: React.FC<ThermalChartProps> = ({
  height = 300,
  showLegend = true,
  showThresholds = true,
  timeRange = '10m'
}) => {
  const {
    currentMetrics,
    metricsHistory,
    thresholds,
    fetchCurrentMetrics,
    fetchHistory,
    autoRefresh,
    refreshInterval
  } = useThermalStore();

  // Fetch data on mount
  useEffect(() => {
    fetchCurrentMetrics();
    fetchHistory(200);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchCurrentMetrics();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Filter history based on time range
  const filteredHistory = useMemo(() => {
    const now = new Date();
    const rangeMs = {
      '10m': 10 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000
    }[timeRange];

    return metricsHistory
      .filter(entry => now.getTime() - new Date(entry.timestamp).getTime() < rangeMs)
      .map(entry => ({
        ...entry,
        time: new Date(entry.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        timestampMs: new Date(entry.timestamp).getTime()
      }));
  }, [metricsHistory, timeRange]);

  // Calculate temperature domain
  const tempDomain = useMemo(() => {
    const temps = filteredHistory
      .flatMap(h => [h.cpuTemperature, h.gpuTemperature])
      .filter((t): t is number => t !== null);

    if (temps.length === 0) return [30, 100];

    const min = Math.floor(Math.min(...temps) / 10) * 10;
    const max = Math.ceil(Math.max(...temps) / 10) * 10;

    return [Math.max(0, min - 10), Math.min(120, max + 10)];
  }, [filteredHistory]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</p>
        <div className="space-y-1">
          {data.cpuTemperature !== null && (
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-500" />
              <span className="text-sm">CPU: {formatTemperature(data.cpuTemperature)}</span>
            </div>
          )}
          {data.gpuTemperature !== null && (
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-500" />
              <span className="text-sm">GPU: {formatTemperature(data.gpuTemperature)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4" style={{ color: THERMAL_PRESSURE_COLORS[data.pressureLevel] }} />
            <span className="text-sm capitalize">{getThermalStatusLabel(data.pressureLevel)}</span>
          </div>
          {data.isThrottling && (
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">Throttling</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Current Status Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {/* Thermal Status Indicator */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: currentMetrics
                ? `${THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]}20`
                : '#6b728020',
              borderColor: currentMetrics
                ? THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]
                : '#6b7280',
              borderWidth: 1
            }}
          >
            <Thermometer
              className="w-4 h-4"
              style={{
                color: currentMetrics
                  ? THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]
                  : '#6b7280'
              }}
            />
            <span className="text-sm font-medium capitalize">
              {currentMetrics ? getThermalStatusLabel(currentMetrics.pressureLevel) : 'Loading...'}
            </span>
          </div>

          {/* CPU Temperature */}
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-500" />
            <span
              className="text-sm font-medium"
              style={{ color: getTemperatureColor(currentMetrics?.cpuTemperature ?? null) }}
            >
              {formatTemperature(currentMetrics?.cpuTemperature ?? null)}
            </span>
          </div>

          {/* GPU Temperature */}
          {currentMetrics?.gpuTemperature !== null && (
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-500" />
              <span
                className="text-sm font-medium"
                style={{ color: getTemperatureColor(currentMetrics?.gpuTemperature ?? null) }}
              >
                {formatTemperature(currentMetrics?.gpuTemperature ?? null)}
              </span>
            </div>
          )}

          {/* Fan Speed */}
          {currentMetrics?.fanSpeedPercent !== null && (
            <div className="flex items-center gap-2">
              <Fan
                className="w-4 h-4 text-gray-500"
                style={{
                  animation: currentMetrics.fanSpeedPercent > 0 ? 'spin 1s linear infinite' : 'none'
                }}
              />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {currentMetrics.fanSpeedPercent.toFixed(0)}%
              </span>
            </div>
          )}

          {/* Throttling Indicator */}
          {currentMetrics?.isThrottling && (
            <div className="flex items-center gap-2 text-red-500 animate-pulse">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">Throttling</span>
            </div>
          )}
        </div>

        {/* Chip Generation */}
        {currentMetrics?.chipGeneration && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Apple Silicon {currentMetrics.chipGeneration}
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={filteredHistory}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

          {/* Background areas for thermal pressure zones */}
          {showThresholds && thresholds && filteredHistory.length > 0 && (
            <>
              {/* Warning zone */}
              <ReferenceArea
                y1={thresholds.cpuWarning}
                y2={thresholds.cpuCritical}
                fill="#fef3c7"
                fillOpacity={0.3}
              />
              {/* Critical zone */}
              <ReferenceArea
                y1={thresholds.cpuCritical}
                y2={120}
                fill="#fee2e2"
                fillOpacity={0.3}
              />
            </>
          )}

          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            domain={tempDomain}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            unit="°C"
          />

          <Tooltip content={<CustomTooltip />} />

          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: 10 }}
              iconType="line"
            />
          )}

          {/* Threshold reference lines */}
          {showThresholds && thresholds && (
            <>
              <ReferenceLine
                y={thresholds.cpuWarning}
                stroke="#eab308"
                strokeDasharray="5 5"
                label={{ value: 'Warning', fill: '#eab308', fontSize: 10 }}
              />
              <ReferenceLine
                y={thresholds.cpuCritical}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{ value: 'Critical', fill: '#ef4444', fontSize: 10 }}
              />
            </>
          )}

          {/* Temperature lines */}
          <Line
            type="monotone"
            dataKey="cpuTemperature"
            name="CPU"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="gpuTemperature"
            name="GPU"
            stroke="#a855f7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Compact thermal status indicator for use in headers/toolbars
 */
export const ThermalStatusBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { currentMetrics, canLaunchFarm, fetchCurrentMetrics, autoRefresh, refreshInterval } = useThermalStore();

  // Fetch data on mount
  useEffect(() => {
    fetchCurrentMetrics();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchCurrentMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  if (!currentMetrics) return null;

  const color = THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel];
  const label = getThermalStatusLabel(currentMetrics.pressureLevel);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${className}`}
      style={{ backgroundColor: `${color}20`, color }}
      title={`Thermal: ${label}${currentMetrics.cpuTemperature ? ` (${formatTemperature(currentMetrics.cpuTemperature)})` : ''}`}
    >
      <Thermometer className="w-3 h-3" />
      <span className="capitalize">{label}</span>
      {currentMetrics.isThrottling && (
        <AlertTriangle className="w-3 h-3 animate-pulse" />
      )}
      {!canLaunchFarm && (
        <span className="text-red-500">!</span>
      )}
    </div>
  );
};

export default ThermalChart;
