/**
 * ConfidenzGauge - Visual confidence score display
 *
 * Displays the current confidence level with:
 * - Circular gauge with percentage
 * - Color coding (green/yellow/red)
 * - Trend indicator
 * - Tooltip with details
 *
 * @author Blerbz
 * @license MIT
 */

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface ConfidenzGaugeProps {
  score: number;
  level?: 'high' | 'medium' | 'low';
  trend?: 'improving' | 'declining' | 'stable';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const ConfidenzGauge: React.FC<ConfidenzGaugeProps> = ({
  score,
  level,
  trend = 'stable',
  size = 'md',
  showLabel = true,
  className = '',
}) => {
  // Determine level from score if not provided
  const computedLevel = level || (score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low');

  // Size mappings
  const sizeMap = {
    sm: { container: 'w-12 h-12', stroke: 4, fontSize: 'text-xs', iconSize: 12 },
    md: { container: 'w-20 h-20', stroke: 6, fontSize: 'text-sm', iconSize: 16 },
    lg: { container: 'w-28 h-28', stroke: 8, fontSize: 'text-base', iconSize: 20 },
  };

  const sizeConfig = sizeMap[size];

  // Color mappings
  const colorMap = {
    high: {
      stroke: '#22c55e', // green-500
      bg: 'bg-green-500/10',
      text: 'text-green-500',
      glow: 'shadow-green-500/20',
    },
    medium: {
      stroke: '#eab308', // yellow-500
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-500',
      glow: 'shadow-yellow-500/20',
    },
    low: {
      stroke: '#ef4444', // red-500
      bg: 'bg-red-500/10',
      text: 'text-red-500',
      glow: 'shadow-red-500/20',
    },
  };

  const colorConfig = colorMap[computedLevel];

  // Calculate SVG parameters
  const { circumference, offset } = useMemo(() => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const normalizedScore = Math.max(0, Math.min(99, score));
    const offset = circumference - (normalizedScore / 100) * circumference;
    return { circumference, offset };
  }, [score]);

  // Trend icon
  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const trendColor =
    trend === 'improving'
      ? 'text-green-400'
      : trend === 'declining'
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Circular Gauge */}
      <div
        className={`relative ${sizeConfig.container} ${colorConfig.glow} rounded-full shadow-lg`}
        title={`Confidence: ${score}% (${computedLevel})`}
      >
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth={sizeConfig.stroke}
            className="text-gray-700/30"
          />
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke={colorConfig.stroke}
            strokeWidth={sizeConfig.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${sizeConfig.fontSize} ${colorConfig.text}`}>
            {score}%
          </span>
          {size !== 'sm' && (
            <TrendIcon className={`${trendColor} mt-0.5`} size={sizeConfig.iconSize - 4} />
          )}
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="mt-2 flex items-center gap-1">
          <span className={`text-xs uppercase tracking-wider ${colorConfig.text}`}>
            {computedLevel}
          </span>
          <Info size={12} className="text-gray-500 cursor-help" />
        </div>
      )}
    </div>
  );
};

/**
 * Compact inline confidence display
 */
interface ConfidenzBadgeProps {
  score: number;
  className?: string;
}

export const ConfidenzBadge: React.FC<ConfidenzBadgeProps> = ({ score, className = '' }) => {
  const level = score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low';

  const colorMap = {
    high: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[level]} ${className}`}
      title={`Confidence: ${score}%`}
    >
      {score}%
    </span>
  );
};

/**
 * Full confidence metrics card
 */
interface ConfidenzMetricsCardProps {
  farmId: string;
  currentScore: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  trend: 'improving' | 'declining' | 'stable';
  scoreCount: number;
  className?: string;
}

export const ConfidenzMetricsCard: React.FC<ConfidenzMetricsCardProps> = ({
  currentScore,
  averageScore,
  minScore,
  maxScore,
  trend,
  scoreCount,
  className = '',
}) => {
  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const trendLabel = trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable';
  const trendColor =
    trend === 'improving'
      ? 'text-green-400'
      : trend === 'declining'
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className={`glass-card p-4 rounded-lg ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-1">Confidence</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{currentScore}%</span>
            <span className={`flex items-center gap-1 text-sm ${trendColor}`}>
              <TrendIcon size={14} />
              {trendLabel}
            </span>
          </div>
        </div>
        <ConfidenzGauge score={currentScore} trend={trend} size="sm" showLabel={false} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-white">{averageScore}%</div>
          <div className="text-xs text-gray-500">Avg</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-green-400">{maxScore}%</div>
          <div className="text-xs text-gray-500">Max</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-red-400">{minScore}%</div>
          <div className="text-xs text-gray-500">Min</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-300">{scoreCount}</div>
          <div className="text-xs text-gray-500">Samples</div>
        </div>
      </div>
    </div>
  );
};

export default ConfidenzGauge;
