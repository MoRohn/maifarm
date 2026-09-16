/**
 * Context Window Monitor Component
 *
 * Displays real-time context window usage for farms and agents.
 * Provides visual indicators, automated compression controls, and
 * responsive design for all Apple devices (iMac, iPad, iPhone).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@services/apiClient';

// Types
interface ContextStats {
  sessionId: string;
  farmId: string;
  provider: 'claude' | 'llama' | 'openai';
  tokensUsed: number;
  maxTokens: number;
  utilization: number;
  status: 'healthy' | 'warning' | 'caution' | 'critical';
  messageCount: number;
  lastActivity: string;
  compressionEnabled: boolean;
  compressionCount: number;
}

interface ContextThresholds {
  WARNING: number;
  CAUTION: number;
  CRITICAL: number;
  COMPRESS: number;
}

interface FarmContextData {
  farmId: string;
  farmName: string;
  farmStatus: string;
  context: {
    tokensUsed: number;
    maxTokens: number;
    utilization: number;
    status: ContextStats['status'];
    provider: string;
    messageCount: number;
  };
}

interface ContextMonitorProps {
  farmId?: string;
  userId?: string;
  variant?: 'compact' | 'full' | 'inline';
  showControls?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onContextCritical?: (farmId: string) => void;
}

// Status colors with glassmorphism support
const statusConfig = {
  healthy: {
    color: 'rgb(34, 197, 94)',
    bgClass: 'bg-green-500/20',
    borderClass: 'border-green-500/40',
    textClass: 'text-green-400',
    label: 'Healthy',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    )
  },
  warning: {
    color: 'rgb(234, 179, 8)',
    bgClass: 'bg-yellow-500/20',
    borderClass: 'border-yellow-500/40',
    textClass: 'text-yellow-400',
    label: 'Warning',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  },
  caution: {
    color: 'rgb(249, 115, 22)',
    bgClass: 'bg-orange-500/20',
    borderClass: 'border-orange-500/40',
    textClass: 'text-orange-400',
    label: 'Caution',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  },
  critical: {
    color: 'rgb(239, 68, 68)',
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/40',
    textClass: 'text-red-400',
    label: 'Critical',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  }
};

// Circular gauge component
const ContextGauge: React.FC<{
  utilization: number;
  status: ContextStats['status'];
  size?: 'sm' | 'md' | 'lg';
}> = ({ utilization, status, size = 'md' }) => {
  const config = statusConfig[status];
  const sizeConfig = {
    sm: { diameter: 60, stroke: 6, fontSize: 'text-xs' },
    md: { diameter: 100, stroke: 8, fontSize: 'text-sm' },
    lg: { diameter: 140, stroke: 10, fontSize: 'text-lg' }
  }[size];

  const radius = (sizeConfig.diameter - sizeConfig.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (utilization * circumference);

  return (
    <div className="relative" style={{ width: sizeConfig.diameter, height: sizeConfig.diameter }}>
      <svg className="transform -rotate-90" width={sizeConfig.diameter} height={sizeConfig.diameter}>
        {/* Background circle */}
        <circle
          cx={sizeConfig.diameter / 2}
          cy={sizeConfig.diameter / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={sizeConfig.stroke}
        />
        {/* Progress circle */}
        <motion.circle
          cx={sizeConfig.diameter / 2}
          cy={sizeConfig.diameter / 2}
          r={radius}
          fill="transparent"
          stroke={config.color}
          strokeWidth={sizeConfig.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold ${sizeConfig.fontSize} ${config.textClass}`}>
          {Math.round(utilization * 100)}%
        </span>
      </div>
    </div>
  );
};

// Linear progress bar component
const ContextProgressBar: React.FC<{
  utilization: number;
  status: ContextStats['status'];
  showThresholds?: boolean;
  thresholds?: ContextThresholds;
}> = ({ utilization, status, showThresholds = false, thresholds }) => {
  const config = statusConfig[status];

  return (
    <div className="w-full">
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
        {/* Threshold markers */}
        {showThresholds && thresholds && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-yellow-400/50"
              style={{ left: `${thresholds.WARNING * 100}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-orange-400/50"
              style={{ left: `${thresholds.CAUTION * 100}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400/50"
              style={{ left: `${thresholds.CRITICAL * 100}%` }}
            />
          </>
        )}
        {/* Progress fill */}
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: config.color }}
          initial={{ width: 0 }}
          animate={{ width: `${utilization * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

// Token display formatter
const formatTokens = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
};

// Main component
export const ContextWindowMonitor: React.FC<ContextMonitorProps> = ({
  farmId,
  userId,
  variant = 'full',
  showControls = true,
  autoRefresh = true,
  refreshInterval = 5000,
  onContextCritical
}) => {
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [allFarms, setAllFarms] = useState<FarmContextData[]>([]);
  const [thresholds, setThresholds] = useState<ContextThresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [autoCompressionEnabled, setAutoCompressionEnabled] = useState(true);

  // Fetch context data
  const fetchContextData = useCallback(async () => {
    try {
      if (farmId) {
        // Fetch single farm context
        const response = await apiClient.get(`/api/context/${farmId}`);
        if (response.data.hasContext) {
          setStats(response.data.stats);
          setThresholds(response.data.thresholds);

          // Trigger callback if critical
          if (response.data.stats.status === 'critical' && onContextCritical) {
            onContextCritical(farmId);
          }
        } else {
          setStats(null);
        }
      } else if (userId) {
        // Fetch all farms for user
        const response = await apiClient.get(`/api/context/user/${userId}/all`);
        setAllFarms(response.data.farms || []);

        // Check for critical farms
        const criticalFarms = response.data.farms?.filter(
          (f: FarmContextData) => f.context.status === 'critical'
        );
        if (criticalFarms?.length > 0 && onContextCritical) {
          criticalFarms.forEach((f: FarmContextData) => onContextCritical(f.farmId));
        }
      }
      setError(null);
    } catch (err) {
      setError('Failed to load context data');
      console.error('Context fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [farmId, userId, onContextCritical]);

  // Auto-refresh effect
  useEffect(() => {
    fetchContextData();

    if (autoRefresh) {
      const interval = setInterval(fetchContextData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchContextData, autoRefresh, refreshInterval]);

  // Handle manual compression
  const handleCompress = async (targetFarmId: string, targetUtilization: number = 0.5) => {
    setCompressing(true);
    try {
      await apiClient.post(`/api/context/${targetFarmId}/compress`, {
        targetUtilization
      });
      await fetchContextData();
    } catch (err) {
      console.error('Compression error:', err);
    } finally {
      setCompressing(false);
    }
  };

  // Handle settings update
  const handleUpdateSettings = async (targetFarmId: string, settings: Record<string, any>) => {
    try {
      await apiClient.patch(`/api/context/${targetFarmId}/settings`, settings);
      await fetchContextData();
    } catch (err) {
      console.error('Settings update error:', err);
    }
  };

  // Compact variant (for inline display)
  if (variant === 'compact' && stats) {
    const config = statusConfig[stats.status];
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.bgClass} ${config.borderClass} border`}>
        <span className={config.textClass}>{config.icon}</span>
        <span className="text-white/80 text-sm">
          {formatTokens(stats.tokensUsed)} / {formatTokens(stats.maxTokens)}
        </span>
        <span className={`text-xs ${config.textClass}`}>
          ({Math.round(stats.utilization * 100)}%)
        </span>
      </div>
    );
  }

  // Inline variant (minimal)
  if (variant === 'inline' && stats) {
    return (
      <div className="flex items-center gap-2">
        <ContextProgressBar utilization={stats.utilization} status={stats.status} />
        <span className="text-white/60 text-xs whitespace-nowrap">
          {Math.round(stats.utilization * 100)}%
        </span>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-24 bg-white/10 rounded-lg" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="glass-card p-4 border border-red-500/30">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // No context data
  if (!stats && !allFarms.length) {
    return (
      <div className="glass-card p-4 text-center">
        <p className="text-white/40 text-sm">No active context sessions</p>
      </div>
    );
  }

  // Full single farm view
  if (farmId && stats) {
    const config = statusConfig[stats.status];

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Left: Gauge */}
          <div className="flex justify-center lg:justify-start">
            <ContextGauge
              utilization={stats.utilization}
              status={stats.status}
              size="lg"
            />
          </div>

          {/* Middle: Details */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className={config.textClass}>{config.icon}</span>
              <span className={`font-medium ${config.textClass}`}>{config.label}</span>
              <span className="text-white/40 text-sm capitalize">({stats.provider})</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Tokens Used</span>
                <span className="text-white font-mono">
                  {formatTokens(stats.tokensUsed)} / {formatTokens(stats.maxTokens)}
                </span>
              </div>

              <ContextProgressBar
                utilization={stats.utilization}
                status={stats.status}
                showThresholds={true}
                thresholds={thresholds || undefined}
              />

              <div className="flex justify-between text-sm">
                <span className="text-white/60">Messages</span>
                <span className="text-white">{stats.messageCount}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-white/60">Compressions</span>
                <span className="text-white">{stats.compressionCount}</span>
              </div>
            </div>
          </div>

          {/* Right: Controls */}
          {showControls && (
            <div className="flex flex-col gap-2 min-w-[140px]">
              <button
                onClick={() => handleCompress(farmId, 0.5)}
                disabled={compressing || stats.utilization < 0.5}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${stats.utilization >= 0.5
                    ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
              >
                {compressing ? 'Compressing...' : 'Compress 50%'}
              </button>

              <button
                onClick={() => handleCompress(farmId, 0.25)}
                disabled={compressing || stats.utilization < 0.3}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${stats.utilization >= 0.3
                    ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/40'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
              >
                Deep Compress
              </button>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                <span className="text-white/60 text-xs">Auto-compress</span>
                <button
                  onClick={() => {
                    const newValue = !autoCompressionEnabled;
                    setAutoCompressionEnabled(newValue);
                    handleUpdateSettings(farmId, { compressionEnabled: newValue });
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative
                    ${autoCompressionEnabled ? 'bg-green-500' : 'bg-white/20'}`}
                >
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
                    animate={{ left: autoCompressionEnabled ? '1.25rem' : '0.125rem' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Critical alert */}
        <AnimatePresence>
          {stats.status === 'critical' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-red-400 font-medium text-sm">Context Window Critical</p>
                  <p className="text-red-300/70 text-xs">
                    AI quality may degrade. Consider compressing or starting a new session.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Multi-farm view (when userId is provided)
  if (allFarms.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        {allFarms.map((farm) => {
          const config = statusConfig[farm.context.status];

          return (
            <motion.div
              key={farm.farmId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ContextGauge
                    utilization={farm.context.utilization}
                    status={farm.context.status}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{farm.farmName}</p>
                    <p className="text-white/40 text-xs capitalize">{farm.context.provider}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-white/80 text-sm">
                      {formatTokens(farm.context.tokensUsed)}
                    </p>
                    <p className="text-white/40 text-xs">
                      / {formatTokens(farm.context.maxTokens)}
                    </p>
                  </div>

                  <div className={`px-2 py-1 rounded-md ${config.bgClass} ${config.borderClass} border`}>
                    <span className={`text-xs font-medium ${config.textClass}`}>
                      {config.label}
                    </span>
                  </div>

                  {showControls && farm.context.utilization >= 0.5 && (
                    <button
                      onClick={() => handleCompress(farm.farmId, 0.5)}
                      disabled={compressing}
                      className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
                      title="Compress context"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    );
  }

  return null;
};

// Export for use in dashboard
export default ContextWindowMonitor;
