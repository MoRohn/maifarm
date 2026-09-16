import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import { SafetyMonitor as SafetyMonitorType, BoundaryViolation } from '@/types/safety';
import { goWildSafety } from '@/services/goWildSafety';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface SafetyMonitorProps {
  sessionId: string;
  onEmergencyStop?: () => void;
  className?: string;
}

export const SafetyMonitor: React.FC<SafetyMonitorProps> = ({
  sessionId,
  onEmergencyStop,
  className
}) => {
  const [monitor, setMonitor] = useState<SafetyMonitorType | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'boundaries' | 'violations'>('overview');

  useEffect(() => {
    const interval = setInterval(() => {
      const currentMonitor = goWildSafety.getMonitor(sessionId);
      if (currentMonitor) {
        setMonitor(currentMonitor);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId]);

  if (!monitor) {
    return (
      <div className={clsx("bg-white dark:bg-gray-800 rounded-xl p-6", className)}>
        <div className="text-center text-gray-500 dark:text-gray-400">
          Initializing safety monitor...
        </div>
      </div>
    );
  }

  const getStatusColor = () => {
    switch (monitor.status) {
      case 'active': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      case 'terminated': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-500 bg-red-50 dark:bg-red-900/20';
    if (score >= 60) return 'text-orange-500 bg-orange-50 dark:bg-orange-900/20';
    if (score >= 40) return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    return 'text-green-500 bg-green-50 dark:bg-green-900/20';
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Status and Risk Score */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
            <Activity className={clsx("w-5 h-5", getStatusColor())} />
          </div>
          <div className={clsx("text-2xl font-bold capitalize", getStatusColor())}>
            {monitor.status}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Risk Score</span>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className={clsx("text-2xl font-bold rounded-lg px-3 py-1 inline-block", getRiskColor(monitor.riskScore))}>
            {monitor.riskScore}%
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Violations</span>
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {monitor.metrics.violationCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Warnings</span>
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {monitor.metrics.warningCount}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Auto Stops</span>
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {monitor.metrics.autoTerminations}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Rollbacks</span>
            <span className="text-lg font-medium text-gray-900 dark:text-white">
              {monitor.metrics.rollbackCount}
            </span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {monitor.recommendations.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Safety Recommendations
          </h4>
          {monitor.recommendations.map((rec) => (
            <div
              key={rec.id}
              className={clsx(
                "border rounded-lg p-3",
                rec.priority === 'high' && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
                rec.priority === 'medium' && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20",
                rec.priority === 'low' && "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
              )}
            >
              <div className="flex items-start space-x-2">
                <AlertCircle className={clsx(
                  "w-5 h-5 mt-0.5",
                  rec.priority === 'high' && "text-red-500",
                  rec.priority === 'medium' && "text-yellow-500",
                  rec.priority === 'low' && "text-blue-500"
                )} />
                <div className="flex-1">
                  <h5 className="font-medium text-gray-900 dark:text-white">
                    {rec.title}
                  </h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {rec.description}
                  </p>
                  <div className="flex gap-2 mt-2">
                    {rec.actions.map((action, idx) => (
                      <button
                        key={idx}
                        className="text-xs px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBoundaries = () => (
    <div className="space-y-4">
      {monitor.boundaries.map((boundary) => (
        <div
          key={boundary.id}
          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <Shield className={clsx(
                "w-5 h-5",
                boundary.enabled ? "text-green-500" : "text-gray-400"
              )} />
              <h4 className="font-medium text-gray-900 dark:text-white">
                {boundary.name}
              </h4>
            </div>
            <div className={clsx(
              "px-2 py-1 rounded text-xs font-medium",
              boundary.enabled 
                ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400"
            )}>
              {boundary.enabled ? 'Active' : 'Disabled'}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {Object.entries(boundary.config).map(([key, value]) => (
              value !== undefined && (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              )
            ))}
          </div>

          {boundary.violations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-red-600 dark:text-red-400">
                {boundary.violations.length} violation{boundary.violations.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderViolations = () => (
    <div className="space-y-3">
      {monitor.activeViolations.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p>No active violations</p>
        </div>
      ) : (
        monitor.activeViolations.map((violation) => (
          <div
            key={violation.id}
            className={clsx(
              "border rounded-lg p-4",
              violation.severity === 'critical' && "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20",
              violation.severity === 'high' && "border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20",
              violation.severity === 'medium' && "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20",
              violation.severity === 'low' && "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <AlertTriangle className={clsx(
                  "w-5 h-5 mt-0.5",
                  violation.severity === 'critical' && "text-red-600",
                  violation.severity === 'high' && "text-orange-600",
                  violation.severity === 'medium' && "text-yellow-600",
                  violation.severity === 'low' && "text-blue-600"
                )} />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {violation.type} Violation
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {violation.details.message}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatDistanceToNow(violation.timestamp, { addSuffix: true })}</span>
                    <span className="capitalize">Action: {violation.action}</span>
                  </div>
                </div>
              </div>
              {!violation.resolved && (
                <button
                  className="text-xs px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className={clsx("bg-white dark:bg-gray-800 rounded-xl shadow-lg", className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-burnt-100 dark:bg-burnt-900/20 rounded-lg">
              <Shield className="w-5 h-5 text-burnt-600 dark:text-burnt-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Safety Monitor
            </h3>
          </div>
          {monitor.status === 'critical' && onEmergencyStop && (
            <button
              onClick={onEmergencyStop}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
            >
              <XCircle className="w-4 h-4" />
              <span>Emergency Stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          {(['overview', 'boundaries', 'violations'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "px-6 py-3 text-sm font-medium capitalize transition-colors",
                activeTab === tab
                  ? "text-burnt-600 dark:text-burnt-400 border-b-2 border-burnt-600 dark:border-burnt-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'boundaries' && renderBoundaries()}
        {activeTab === 'violations' && renderViolations()}
      </div>
    </div>
  );
};