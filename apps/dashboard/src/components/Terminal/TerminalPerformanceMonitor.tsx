/**
 * Terminal Performance Monitor
 *
 * Real-time monitoring of terminal streaming performance
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, Database, TrendingUp, TrendingDown } from 'lucide-react';
import { advancedStreamEngine } from '@/services/AdvancedTerminalStreamEngine';

interface PerformanceData {
  totalStreams: number;
  activeStreams: number;
  pausedStreams: number;
  totalBufferSize: number;
  avgLatency: number;
  avgFPS: number;
}

export const TerminalPerformanceMonitor: React.FC<{
  className?: string;
  compact?: boolean;
}> = ({ className = '', compact = false }) => {
  const [stats, setStats] = useState<PerformanceData>({
    totalStreams: 0,
    activeStreams: 0,
    pausedStreams: 0,
    totalBufferSize: 0,
    avgLatency: 0,
    avgFPS: 0,
  });

  const [history, setHistory] = useState<{ time: number; fps: number; latency: number }[]>(
    []
  );

  useEffect(() => {
    const updateStats = () => {
      const currentStats = advancedStreamEngine.getStats();
      setStats(currentStats);

      // Update history for sparklines
      setHistory((prev) => {
        const newEntry = {
          time: Date.now(),
          fps: currentStats.avgFPS,
          latency: currentStats.avgLatency,
        };
        const updated = [...prev, newEntry];
        // Keep last 60 entries (1 minute at 1Hz)
        return updated.slice(-60);
      });
    };

    const interval = setInterval(updateStats, 1000);
    updateStats(); // Initial update

    return () => clearInterval(interval);
  }, []);

  // Get performance rating
  const getPerformanceRating = () => {
    if (stats.avgFPS >= 25 && stats.avgLatency < 100) return 'excellent';
    if (stats.avgFPS >= 15 && stats.avgLatency < 200) return 'good';
    if (stats.avgFPS >= 10 && stats.avgLatency < 500) return 'fair';
    return 'poor';
  };

  const rating = getPerformanceRating();

  const ratingColors = {
    excellent: 'text-green-400 bg-green-500/10 border-green-500/30',
    good: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    fair: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    poor: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  // Simple sparkline component
  const Sparkline: React.FC<{ data: number[]; height?: number; color?: string }> = ({
    data,
    height = 30,
    color = '#60a5fa',
  }) => {
    if (data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * 100;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg width="100%" height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center space-x-3 text-sm ${className}`}
      >
        <div className="flex items-center space-x-1">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-gray-400">{Math.round(stats.avgFPS)} FPS</span>
        </div>
        <div className="flex items-center space-x-1">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-gray-400">{Math.round(stats.avgLatency)}ms</span>
        </div>
        <div className="flex items-center space-x-1">
          <Database className="w-4 h-4 text-green-400" />
          <span className="text-gray-400">{stats.totalBufferSize}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center space-x-2">
          <Activity className="w-4 h-4" />
          <span>Performance Monitor</span>
        </h3>
        <div className={`px-2 py-1 rounded-full text-xs font-medium border ${ratingColors[rating]}`}>
          {rating.toUpperCase()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* FPS Metric */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Frame Rate</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-400 mb-1">
            {Math.round(stats.avgFPS)}
            <span className="text-sm text-gray-500 ml-1">FPS</span>
          </div>
          <div className="h-8 mt-2">
            <Sparkline data={history.map((h) => h.fps)} color="#60a5fa" />
          </div>
        </div>

        {/* Latency Metric */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Latency</span>
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div className="text-2xl font-bold text-yellow-400 mb-1">
            {Math.round(stats.avgLatency)}
            <span className="text-sm text-gray-500 ml-1">ms</span>
          </div>
          <div className="h-8 mt-2">
            <Sparkline data={history.map((h) => h.latency)} color="#fbbf24" />
          </div>
        </div>

        {/* Stream Stats */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Active Streams</span>
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-green-400">
            {stats.activeStreams}
            <span className="text-sm text-gray-500 ml-1">/ {stats.totalStreams}</span>
          </div>
          {stats.pausedStreams > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {stats.pausedStreams} paused
            </div>
          )}
        </div>

        {/* Buffer Stats */}
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Buffer Size</span>
            <Database className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400">
            {stats.totalBufferSize}
            <span className="text-sm text-gray-500 ml-1">frames</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {(stats.totalBufferSize / stats.activeStreams || 0).toFixed(1)} avg/stream
          </div>
        </div>
      </div>

      {/* Performance tips */}
      {rating === 'poor' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg"
        >
          <div className="flex items-start space-x-2">
            <TrendingDown className="w-4 h-4 text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-red-400 font-medium mb-1">
                Performance Issues Detected
              </p>
              <ul className="text-xs text-red-300/80 space-y-0.5">
                {stats.avgFPS < 10 && <li>• Low frame rate - consider reducing active streams</li>}
                {stats.avgLatency > 500 && <li>• High latency - check network connection</li>}
                {stats.totalBufferSize > 1000 && (
                  <li>• Large buffer size - streams may be falling behind</li>
                )}
              </ul>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
