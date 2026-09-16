import React from 'react';
import { motion } from 'framer-motion';
import { 
  Lightbulb, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  Target,
  Award,
  Brain
} from 'lucide-react';
import { clsx } from 'clsx';

interface Insight {
  id: string;
  type: 'success' | 'warning' | 'info' | 'discovery';
  title: string;
  description: string;
  metric?: string;
  impact?: 'high' | 'medium' | 'low';
  timestamp: Date;
}

interface HarvestInsightsProps {
  insights: Insight[];
  className?: string;
}

export const HarvestInsights: React.FC<HarvestInsightsProps> = ({ insights, className }) => {
  const getInsightIcon = (type: Insight['type']) => {
    switch (type) {
      case 'success':
        return CheckCircle2;
      case 'warning':
        return AlertCircle;
      case 'discovery':
        return Lightbulb;
      default:
        return Brain;
    }
  };

  const getImpactColor = (impact?: Insight['impact']) => {
    switch (impact) {
      case 'high':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
      case 'low':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      default:
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  if (!insights || insights.length === 0) {
    return (
      <div className={clsx(
        'bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-8',
        'text-center',
        className
      )}>
        <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          Gathering insights from agent activities...
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={clsx('space-y-4', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-[var(--color-primary)]" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Harvest Insights
          </h2>
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {insights.length} key findings
        </span>
      </div>

      {/* Insights Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => {
          const Icon = getInsightIcon(insight.type);
          
          return (
            <motion.div
              key={insight.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              className={clsx(
                'bg-white dark:bg-gray-900 rounded-lg',
                'border border-gray-200 dark:border-gray-800',
                'p-5 cursor-pointer',
                'hover:shadow-lg hover:border-[var(--color-primary)]',
                'transition-all duration-200'
              )}
            >
              {/* Icon and Type */}
              <div className="flex items-start justify-between mb-3">
                <div className={clsx(
                  'p-2 rounded-lg',
                  insight.type === 'success' && 'bg-green-100 dark:bg-green-900/30',
                  insight.type === 'warning' && 'bg-yellow-100 dark:bg-yellow-900/30',
                  insight.type === 'discovery' && 'bg-purple-100 dark:bg-purple-900/30',
                  insight.type === 'info' && 'bg-blue-100 dark:bg-blue-900/30'
                )}>
                  <Icon className={clsx(
                    'w-5 h-5',
                    insight.type === 'success' && 'text-green-600 dark:text-green-400',
                    insight.type === 'warning' && 'text-yellow-600 dark:text-yellow-400',
                    insight.type === 'discovery' && 'text-purple-600 dark:text-purple-400',
                    insight.type === 'info' && 'text-blue-600 dark:text-blue-400'
                  )} />
                </div>
                {insight.impact && (
                  <span className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    getImpactColor(insight.impact)
                  )}>
                    {insight.impact} impact
                  </span>
                )}
              </div>

              {/* Content */}
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                {insight.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {insight.description}
              </p>

              {/* Metric */}
              {insight.metric && (
                <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <Target className="w-4 h-4 text-[var(--color-primary)]" />
                  <span className="text-sm font-medium text-[var(--color-primary)]">
                    {insight.metric}
                  </span>
                </div>
              )}

              {/* Timestamp */}
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                {new Date(insight.timestamp).toLocaleTimeString()}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Summary Card */}
      {insights.length > 3 && (
        <motion.div
          variants={itemVariants}
          className={clsx(
            'mt-6 p-4 rounded-lg',
            'bg-gradient-to-r from-[rgba(var(--color-primary-rgb),0.1)] to-transparent',
            'border border-[rgba(var(--color-primary-rgb),0.2)]'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 text-[var(--color-primary)]" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  Outstanding Performance
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {insights.filter(i => i.type === 'success').length} successful outcomes,{' '}
                  {insights.filter(i => i.type === 'discovery').length} new discoveries
                </p>
              </div>
            </div>
            <TrendingUp className="w-8 h-8 text-[var(--color-primary)] opacity-50" />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};