import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle,
  Info,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Filter,
  Activity,
  Zap,
  Target,
  BarChart2
} from 'lucide-react';
import { HarvestInsight } from '@/types/harvest';

interface InsightsPanelProps {
  insights: HarvestInsight[];
  onInsightClick?: (insight: HarvestInsight) => void;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ 
  insights, 
  onInsightClick 
}) => {
  const [selectedImportance, setSelectedImportance] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());

  const getInsightIcon = (type: HarvestInsight['type']) => {
    switch (type) {
      case 'discovery':
        return <Sparkles className="w-5 h-5" />;
      case 'pattern':
        return <Activity className="w-5 h-5" />;
      case 'recommendation':
        return <Lightbulb className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'summary':
        return <BarChart2 className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getImportanceStyle = (importance: HarvestInsight['importance']) => {
    switch (importance) {
      case 'critical':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400'
        };
      case 'high':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-400',
          border: 'border-orange-200 dark:border-orange-800',
          icon: 'text-orange-600 dark:text-orange-400'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-700 dark:text-yellow-400',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400'
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-gray-900/30',
          text: 'text-gray-700 dark:text-gray-400',
          border: 'border-gray-200 dark:border-gray-800',
          icon: 'text-gray-600 dark:text-gray-400'
        };
    }
  };

  const filteredInsights = insights.filter(insight => {
    if (selectedImportance !== 'all' && insight.importance !== selectedImportance) {
      return false;
    }
    if (selectedType !== 'all' && insight.type !== selectedType) {
      return false;
    }
    return true;
  });

  const toggleExpanded = (insightId: string) => {
    const newExpanded = new Set(expandedInsights);
    if (newExpanded.has(insightId)) {
      newExpanded.delete(insightId);
    } else {
      newExpanded.add(insightId);
    }
    setExpandedInsights(newExpanded);
  };

  // Group insights by type for summary
  const insightsByType = insights.reduce((acc, insight) => {
    if (!acc[insight.type]) acc[insight.type] = 0;
    acc[insight.type]++;
    return acc;
  }, {} as Record<string, number>);

  const criticalCount = insights.filter(i => i.importance === 'critical').length;
  const highCount = insights.filter(i => i.importance === 'high').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white"
        >
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-5 h-5 opacity-80" />
            <span className="text-2xl font-bold">{insights.length}</span>
          </div>
          <p className="text-sm opacity-90">Total Insights</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-red-500 to-orange-500 rounded-xl p-4 text-white"
        >
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-5 h-5 opacity-80" />
            <span className="text-2xl font-bold">{criticalCount}</span>
          </div>
          <p className="text-sm opacity-90">Critical</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-yellow-500 to-amber-500 rounded-xl p-4 text-white"
        >
          <div className="flex items-center justify-between mb-2">
            <Target className="w-5 h-5 opacity-80" />
            <span className="text-2xl font-bold">{highCount}</span>
          </div>
          <p className="text-sm opacity-90">High Priority</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-4 text-white"
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 opacity-80" />
            <span className="text-2xl font-bold">
              {insightsByType.recommendation || 0}
            </span>
          </div>
          <p className="text-sm opacity-90">Recommendations</p>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        
        <select
          value={selectedImportance}
          onChange={(e) => setSelectedImportance(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          <option value="all">All Importance</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          <option value="all">All Types</option>
          <option value="discovery">Discovery</option>
          <option value="pattern">Pattern</option>
          <option value="recommendation">Recommendation</option>
          <option value="warning">Warning</option>
          <option value="summary">Summary</option>
        </select>

        <div className="ml-auto text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredInsights.length} of {insights.length} insights
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredInsights.map((insight, index) => {
            const style = getImportanceStyle(insight.importance);
            const isExpanded = expandedInsights.has(insight.id);

            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className={`bg-white dark:bg-gray-900 rounded-xl border ${style.border} overflow-hidden hover:shadow-lg transition-all`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => onInsightClick ? onInsightClick(insight) : toggleExpanded(insight.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${style.bg} ${style.icon}`}>
                      {getInsightIcon(insight.type)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {insight.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            {insight.importance}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(insight.id);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {insight.description}
                      </p>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800"
                          >
                            {insight.source.agentName && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 mb-2">
                                <span>Source:</span>
                                <span className="font-medium">{insight.source.agentName}</span>
                              </div>
                            )}
                            
                            {insight.relatedResults.length > 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-500">
                                <span>Related to {insight.relatedResults.length} results</span>
                              </div>
                            )}

                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                              {new Date(insight.timestamp).toLocaleString()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredInsights.length === 0 && (
        <div className="text-center py-12">
          <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No insights match your filters
          </p>
        </div>
      )}
    </div>
  );
};