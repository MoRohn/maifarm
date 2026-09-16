/**
 * Thermal Alert Panel Component
 *
 * Displays thermal alerts, warnings, and provides controls
 * for thermal monitoring settings.
 */

import React, { useEffect, useState } from 'react';
import {
  useThermalStore,
  ThermalPressureLevel,
  THERMAL_PRESSURE_COLORS,
  getThermalStatusLabel,
  formatTemperature,
  ThermalAlert,
  ThermalThresholds
} from '@/store/thermalStore';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Settings,
  Thermometer,
  X,
  Activity,
  Pause,
  Play,
  RefreshCw,
  Sliders
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ThermalAlertPanelProps {
  compact?: boolean;
  showSettings?: boolean;
  maxAlerts?: number;
}

const SEVERITY_CONFIG = {
  info: {
    icon: AlertCircle,
    color: '#3b82f6',
    bgColor: '#eff6ff',
    darkBgColor: '#1e3a5f'
  },
  warning: {
    icon: AlertTriangle,
    color: '#eab308',
    bgColor: '#fefce8',
    darkBgColor: '#422006'
  },
  critical: {
    icon: AlertOctagon,
    color: '#f97316',
    bgColor: '#fff7ed',
    darkBgColor: '#431407'
  },
  emergency: {
    icon: AlertOctagon,
    color: '#ef4444',
    bgColor: '#fef2f2',
    darkBgColor: '#450a0a'
  }
};

export const ThermalAlertPanel: React.FC<ThermalAlertPanelProps> = ({
  compact = false,
  showSettings = true,
  maxAlerts = 5
}) => {
  const {
    activeAlerts,
    currentMetrics,
    canLaunchFarm,
    launchBlockReason,
    stats,
    thresholds,
    fetchAlerts,
    fetchStats,
    acknowledgeAlert,
    updateThresholds,
    showAlerts,
    setShowAlerts,
    autoRefresh,
    setAutoRefresh
  } = useThermalStore();

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [localThresholds, setLocalThresholds] = useState<Partial<ThermalThresholds>>({});
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts();
    fetchStats('24h');
  }, []);

  // Update local thresholds when store thresholds change
  useEffect(() => {
    if (thresholds) {
      setLocalThresholds(thresholds);
    }
  }, [thresholds]);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      toast.success('Alert acknowledged');
    } catch {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleSaveThresholds = async () => {
    try {
      await updateThresholds(localThresholds);
      toast.success('Thresholds saved');
      setShowSettingsPanel(false);
    } catch {
      toast.error('Failed to save thresholds');
    }
  };

  const displayedAlerts = isExpanded ? activeAlerts : activeAlerts.slice(0, maxAlerts);

  if (compact) {
    // Compact mode - just show count and status
    return (
      <div className="flex items-center gap-3">
        {/* Current thermal status */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded text-sm"
          style={{
            backgroundColor: currentMetrics
              ? `${THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]}15`
              : undefined
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
          <span className="capitalize">
            {currentMetrics ? getThermalStatusLabel(currentMetrics.pressureLevel) : '--'}
          </span>
          {currentMetrics?.cpuTemperature && (
            <span className="text-gray-500">
              ({formatTemperature(currentMetrics.cpuTemperature)})
            </span>
          )}
        </div>

        {/* Alert count */}
        {activeAlerts.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">{activeAlerts.length}</span>
          </div>
        )}

        {/* Launch blocked indicator */}
        {!canLaunchFarm && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
            title={launchBlockReason || 'Farm launch blocked'}
          >
            <Pause className="w-4 h-4" />
            <span className="text-sm">Launch Blocked</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{
              backgroundColor: currentMetrics
                ? `${THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]}15`
                : '#6b728015'
            }}
          >
            <Thermometer
              className="w-5 h-5"
              style={{
                color: currentMetrics
                  ? THERMAL_PRESSURE_COLORS[currentMetrics.pressureLevel]
                  : '#6b7280'
              }}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Thermal Monitoring</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {currentMetrics
                ? `${getThermalStatusLabel(currentMetrics.pressureLevel).charAt(0).toUpperCase() + getThermalStatusLabel(currentMetrics.pressureLevel).slice(1)} - ${formatTemperature(currentMetrics.cpuTemperature)}`
                : 'Loading...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}
            title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </button>

          {/* Alerts toggle */}
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className={`p-2 rounded-lg transition-colors ${
              showAlerts
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
            }`}
            title={showAlerts ? 'Alerts enabled' : 'Alerts disabled'}
          >
            {showAlerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          {/* Settings */}
          {showSettings && (
            <button
              onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              className={`p-2 rounded-lg transition-colors ${
                showSettingsPanel
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
              }`}
              title="Threshold settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettingsPanel && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Temperature Thresholds
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">CPU Warning (°C)</label>
              <input
                type="number"
                value={localThresholds.cpuWarning || 80}
                onChange={(e) => setLocalThresholds({ ...localThresholds, cpuWarning: parseInt(e.target.value) })}
                className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CPU Critical (°C)</label>
              <input
                type="number"
                value={localThresholds.cpuCritical || 95}
                onChange={(e) => setLocalThresholds({ ...localThresholds, cpuCritical: parseInt(e.target.value) })}
                className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">GPU Warning (°C)</label>
              <input
                type="number"
                value={localThresholds.gpuWarning || 85}
                onChange={(e) => setLocalThresholds({ ...localThresholds, gpuWarning: parseInt(e.target.value) })}
                className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">GPU Critical (°C)</label>
              <input
                type="number"
                value={localThresholds.gpuCritical || 100}
                onChange={(e) => setLocalThresholds({ ...localThresholds, gpuCritical: parseInt(e.target.value) })}
                className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowSettingsPanel(false)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveThresholds}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Launch Status Warning */}
      {!canLaunchFarm && (
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-3">
            <Pause className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-200">Farm Launch Blocked</p>
              <p className="text-sm text-orange-600 dark:text-orange-400">
                {launchBlockReason || 'System conditions prevent launching new farms'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="p-4 grid grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.temperature.cpu.max?.toFixed(0) ?? '--'}°C
            </p>
            <p className="text-xs text-gray-500">Max CPU (24h)</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.throttling.events}
            </p>
            <p className="text-xs text-gray-500">Throttle Events</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.throttling.estimatedDurationMinutes}m
            </p>
            <p className="text-xs text-gray-500">Throttle Time</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.alerts.total}
            </p>
            <p className="text-xs text-gray-500">Alerts (24h)</p>
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Active Alerts
            {activeAlerts.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                {activeAlerts.length}
              </span>
            )}
          </h4>
          {activeAlerts.length > maxAlerts && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              {isExpanded ? (
                <>Show less <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Show all ({activeAlerts.length}) <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>

        {activeAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Check className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active thermal alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedAlerts.map((alert) => {
              const config = SEVERITY_CONFIG[alert.severity];
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border transition-all"
                  style={{
                    backgroundColor: config.bgColor,
                    borderColor: `${config.color}30`
                  }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: config.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded uppercase"
                        style={{ backgroundColor: `${config.color}20`, color: config.color }}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: config.color }}>
                      {alert.message}
                    </p>
                    {alert.action && (
                      <p className="text-xs text-gray-500 mt-1">
                        Action: {alert.action.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="p-1 hover:bg-white/50 rounded transition-colors"
                    title="Acknowledge"
                  >
                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThermalAlertPanel;
