import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lightbulb, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Brain,
  Target,
  Shield
} from 'lucide-react';
import { clsx } from 'clsx';

export interface HarvestInsight {
  id: string;
  type: 'success' | 'improvement' | 'warning' | 'discovery';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  recommendations?: string[];
  metrics?: Record<string, any>;
  timestamp: Date;
}

interface HarvestInsightsPanelProps {
  insights: HarvestInsight[];
  className?: string;
  onInsightClick?: (insight: HarvestInsight) => void;
}

export const HarvestInsightsPanel: React.FC<HarvestInsightsPanelProps> = ({
  insights,
  className,
  onInsightClick
}) => {
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');

  const toggleInsight = (insightId: string) => {
    const newExpanded = new Set(expandedInsights);
    if (newExpanded.has(insightId)) {
      newExpanded.delete(insightId);
    } else {
      newExpanded.add(insightId);
    }
    setExpandedInsights(newExpanded);
  };

  const getInsightIcon = (type: HarvestInsight['type']) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'improvement':
        return TrendingUp;
      case 'warning':
        return AlertTriangle;
      case 'discovery':
        return Sparkles;
      default:
        return Info;
    }
  };

  const getInsightColor = (type: HarvestInsight['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'improvement':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'discovery':
        return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  const getImpactBadge = (impact: HarvestInsight['impact']) => {
    const colors = {
      high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    };
    return colors[impact];
  };

  const filteredInsights = filterType === 'all' 
    ? insights 
    : insights.filter(i => i.type === filterType);

  const insightCounts = {
    all: insights.length,
    success: insights.filter(i => i.type === 'success').length,
    improvement: insights.filter(i => i.type === 'improvement').length,
    warning: insights.filter(i => i.type === 'warning').length,
    discovery: insights.filter(i => i.type === 'discovery').length
  };

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-900 rounded-apple-lg shadow-sm',
      className
    )}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI-Powered Insights
            </h3>
          </div>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-primary-500"
          >
            <Lightbulb className="w-5 h-5" />
          </motion.div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-2 overflow-x-auto">
          {Object.entries(insightCounts).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={clsx(
                'px-3 py-1.5 rounded-apple text-sm font-medium transition-colors whitespace-nowrap',
                filterType === type
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              )}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-white dark:bg-gray-900">
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Insights List */}
      <div className="max-h-[600px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {filteredInsights.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center"
            >
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                No insights available for this filter
              </p>
            </motion.div>
          ) : (
            filteredInsights.map((insight, index) => {
              const Icon = getInsightIcon(insight.type);
              const isExpanded = expandedInsights.has(insight.id);
              
              return (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className={clsx(
                    'border-b border-gray-200 dark:border-gray-800 last:border-b-0',
                    'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
                  )}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => {
                      toggleInsight(insight.id);
                      onInsightClick?.(insight);
                    }}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={clsx(
                        'p-2 rounded-apple mt-0.5',
                        getInsightColor(insight.type)
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {insight.title}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {insight.description}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            <span className={clsx(
                              'px-2 py-0.5 text-xs rounded-full font-medium',
                              getImpactBadge(insight.impact)
                            )}>
                              {insight.impact} impact
                            </span>
                            <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="mt-3 overflow-hidden"
                            >
                              {/* Recommendations */}
                              {insight.recommendations && insight.recommendations.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Recommendations:
                                  </p>
                                  <ul className="space-y-1">
                                    {insight.recommendations.map((rec, idx) => (
                                      <li key={idx} className="flex items-start space-x-2">
                                        <Target className="w-3 h-3 text-primary-500 mt-0.5 flex-shrink-0" />
                                        <span className="text-xs text-gray-600 dark:text-gray-400">
                                          {rec}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Metrics */}
                              {insight.metrics && Object.keys(insight.metrics).length > 0 && (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Related Metrics:
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(insight.metrics).map(([key, value]) => (
                                      <div key={key} className="text-xs">
                                        <span className="text-gray-500 dark:text-gray-400">
                                          {key}:
                                        </span>
                                        <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                          {typeof value === 'number' ? value.toFixed(2) : value}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Timestamp */}
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                Generated: {new Date(insight.timestamp).toLocaleString()}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};