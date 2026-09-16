/**
 * ConfidencePanel - Real-time confidence display for farms
 *
 * Displays confidence metrics from the inference-confidenz plugin
 * with real-time updates via WebSocket.
 *
 * @author Blerbz
 * @license MIT
 */

import React, { useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Users, Gauge } from 'lucide-react';
import { useConfidenceScore, useConfidenceDisplay } from '@/hooks/useConfidenceScore';

interface ConfidencePanelProps {
  farmId: string;
  compact?: boolean;
  showAgents?: boolean;
}

/**
 * ConfidencePanel - Full confidence panel with agent details
 */
const ConfidencePanel: React.FC<ConfidencePanelProps> = ({
  farmId,
  compact = false,
  showAgents = true,
}) => {
  const {
    confidence,
    agents,
    averageScore,
    trend,
    overallLevel,
    isLoading,
    isSubscribed,
    error,
    getLevelColor,
    formatScore,
    getTrendIcon,
  } = useConfidenceScore({ farmId, autoSubscribe: true });

  const trendIcon = useMemo(() => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  }, [trend]);

  const levelStyles = useMemo(() => {
    switch (overallLevel) {
      case 'high':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          text: 'text-green-700 dark:text-green-300',
          ring: 'ring-green-500',
        };
      case 'medium':
        return {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
          text: 'text-amber-700 dark:text-amber-300',
          ring: 'ring-amber-500',
        };
      case 'low':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-300',
          ring: 'ring-red-500',
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          text: 'text-gray-700 dark:text-gray-300',
          ring: 'ring-gray-500',
        };
    }
  }, [overallLevel]);

  if (isLoading && !confidence) {
    return (
      <div className={`rounded-lg border ${levelStyles.border} ${levelStyles.bg} p-4 animate-pulse`}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Compact view for inline display
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full ${levelStyles.bg} ${levelStyles.border} border`}>
        <Gauge className={`h-4 w-4 ${levelStyles.text}`} />
        <span className={`text-sm font-medium ${levelStyles.text}`}>
          {formatScore(averageScore)}
        </span>
        {trendIcon}
        {!isSubscribed && (
          <span className="text-xs text-gray-400">(offline)</span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${levelStyles.border} ${levelStyles.bg} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Activity className={`h-5 w-5 ${levelStyles.text}`} />
          <h3 className={`font-semibold ${levelStyles.text}`}>Confidence</h3>
        </div>
        <div className="flex items-center space-x-2">
          {isSubscribed ? (
            <span className="flex items-center text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse"></span>
              Live
            </span>
          ) : (
            <span className="text-xs text-gray-400">Offline</span>
          )}
        </div>
      </div>

      {/* Main Score */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className={`text-4xl font-bold ${levelStyles.text}`}>
            {formatScore(averageScore)}
          </div>
          <div className="flex items-center space-x-1 mt-1">
            {trendIcon}
            <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {trend}
            </span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${levelStyles.text} ${levelStyles.bg} border ${levelStyles.border}`}>
          {overallLevel.charAt(0).toUpperCase() + overallLevel.slice(1)}
        </div>
      </div>

      {/* Min/Max Range */}
      {confidence && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
          <span>Min: {formatScore(confidence.aggregate.min)}</span>
          <span>Max: {formatScore(confidence.aggregate.max)}</span>
        </div>
      )}

      {/* Agent List */}
      {showAgents && agents.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <div className="flex items-center space-x-2 mb-3">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Agent Confidence ({agents.length})
            </span>
          </div>
          <div className="space-y-2">
            {agents.map((agent) => (
              <AgentConfidenceRow
                key={agent.id}
                name={agent.name}
                score={agent.score}
                level={agent.level}
                shouldAutoContinue={agent.shouldAutoContinue}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * AgentConfidenceRow - Individual agent confidence display
 */
interface AgentConfidenceRowProps {
  name: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  shouldAutoContinue: boolean;
}

const AgentConfidenceRow: React.FC<AgentConfidenceRowProps> = ({
  name,
  score,
  level,
  shouldAutoContinue,
}) => {
  const barColor = useMemo(() => {
    switch (level) {
      case 'high':
        return 'bg-green-500';
      case 'medium':
        return 'bg-amber-500';
      case 'low':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  }, [level]);

  return (
    <div className="flex items-center space-x-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {name}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {score}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, score)}%` }}
          />
        </div>
      </div>
      {!shouldAutoContinue && (
        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 rounded">
          Paused
        </span>
      )}
    </div>
  );
};

/**
 * ConfidenceBadge - Simple badge for displaying confidence inline
 */
export const ConfidenceBadge: React.FC<{ farmId: string }> = ({ farmId }) => {
  const { scoreText, levelColor, trendIcon, isLoading } = useConfidenceDisplay(farmId);

  if (isLoading) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-500">
        --
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
    >
      <span>{scoreText}</span>
      <span>{trendIcon}</span>
    </span>
  );
};

export default ConfidencePanel;
