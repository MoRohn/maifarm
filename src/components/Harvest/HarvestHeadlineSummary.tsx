import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  TrendingUp,
  Award,
  Target,
  Cpu,
  GitBranch,
  Layers,
  MessageSquare
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, HarvestInsight } from '../../types/harvest';

interface HarvestHeadlineSummaryProps {
  harvest: Harvest;
}

export const HarvestHeadlineSummary: React.FC<HarvestHeadlineSummaryProps> = ({ harvest }) => {
  // Extract key headlines from harvest data
  const headlines = [
    {
      icon: Zap,
      category: 'Performance',
      headline: `${harvest.summary.efficiency}% Efficiency Achieved`,
      subheadline: `Completed ${harvest.summary.completedTasks} tasks in ${Math.floor(harvest.summary.duration / 60)} minutes`,
      impact: 'high' as const,
      color: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30'
    },
    {
      icon: Target,
      category: 'Success Rate',
      headline: `${Math.round((harvest.summary.completedTasks / harvest.summary.totalTasks) * 100)}% Task Completion`,
      subheadline: harvest.summary.failedTasks === 0 
        ? 'Perfect execution with zero failures' 
        : `Only ${harvest.summary.failedTasks} tasks encountered issues`,
      impact: harvest.summary.failedTasks === 0 ? 'high' : 'medium' as const,
      color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
    },
    {
      icon: Award,
      category: 'Quality',
      headline: `${harvest.quality.overallScore}% Quality Score`,
      subheadline: `Excellence in ${Object.entries(harvest.quality)
        .filter(([key, value]) => key !== 'overallScore' && value > 90)
        .map(([key]) => key)
        .join(', ')}`,
      impact: harvest.quality.overallScore > 85 ? 'high' : 'medium' as const,
      color: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30'
    },
    {
      icon: Cpu,
      category: 'Agent Collaboration',
      headline: `${new Set(harvest.results.map(r => r.agentId)).size} Agents Coordinated`,
      subheadline: `Parallel processing with ${
        harvest.results.filter(r => r.success).length
      } successful operations`,
      impact: 'medium' as const,
      color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30'
    }
  ];

  // Extract top insights as headlines
  const topInsights = harvest.insights
    .filter(i => i.importance === 'critical' || i.importance === 'high')
    .slice(0, 3)
    .map(insight => ({
      icon: getInsightIcon(insight.type),
      category: insight.type.charAt(0).toUpperCase() + insight.type.slice(1),
      headline: insight.title,
      subheadline: insight.description,
      impact: insight.importance as 'high' | 'medium' | 'low',
      color: getInsightColor(insight.type)
    }));

  const allHeadlines = [...headlines, ...topInsights];

  function getInsightIcon(type: HarvestInsight['type']) {
    switch (type) {
      case 'discovery': return GitBranch;
      case 'pattern': return Layers;
      case 'recommendation': return MessageSquare;
      default: return TrendingUp;
    }
  }

  function getInsightColor(type: HarvestInsight['type']) {
    switch (type) {
      case 'discovery': return 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30';
      case 'pattern': return 'text-pink-600 bg-pink-100 dark:text-pink-400 dark:bg-pink-900/30';
      case 'recommendation': return 'text-teal-600 bg-teal-100 dark:text-teal-400 dark:bg-teal-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  }

  return (
    <div className="space-y-6">
      {/* Main Headlines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allHeadlines.slice(0, 4).map((headline, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={clsx(
              'relative overflow-hidden rounded-apple-lg p-6 border',
              headline.impact === 'high' 
                ? 'border-gray-300 dark:border-gray-700 shadow-apple-sm' 
                : 'border-gray-200 dark:border-gray-800'
            )}
          >
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
              <div className="relative w-full h-full">
                <headline.icon className="w-full h-full" />
              </div>
            </div>

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3">
                <div className={clsx('p-2 rounded-apple', headline.color)}>
                  <headline.icon className="w-5 h-5" />
                </div>
                {headline.impact === 'high' && (
                  <span className="px-2 py-1 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold rounded-full">
                    KEY RESULT
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  {headline.category}
                </p>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                  {headline.headline}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {headline.subheadline}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Additional Insights */}
      {allHeadlines.length > 4 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4"
        >
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Additional Key Findings
          </h4>
          <div className="space-y-2">
            {allHeadlines.slice(4).map((headline, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 text-sm"
              >
                <headline.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  {headline.headline}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Bottom Summary Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-apple-lg p-4"
      >
        <div className="flex items-center justify-around text-center">
          <div>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {harvest.artifacts.length}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">
              Artifacts Created
            </p>
          </div>
          <div className="w-px h-12 bg-primary-300 dark:bg-primary-700" />
          <div>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {harvest.insights.length}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">
              Key Insights
            </p>
          </div>
          <div className="w-px h-12 bg-primary-300 dark:bg-primary-700" />
          <div>
            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {Math.round(harvest.summary.completedTasks / (harvest.summary.duration / 60))}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">
              Tasks/Minute
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};