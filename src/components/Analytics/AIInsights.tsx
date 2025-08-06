import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Zap,
  DollarSign,
  Users,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  Target,
  AlertCircle
} from 'lucide-react';
import { aiInsightsService, AIInsight } from '../../services/aiInsightsService';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { useFarmStore } from '../../store/farmStore';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface AIInsightsProps {
  onInsightApplied?: (insight: AIInsight) => void;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ onInsightApplied }) => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<AIInsight | null>(null);
  const [filter, setFilter] = useState<{
    type?: AIInsight['type'];
    category?: AIInsight['category'];
    severity?: AIInsight['severity'];
  }>({});
  const [showFeedback, setShowFeedback] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');

  const { metrics, agentPerformance, timeSeriesData } = useAnalyticsStore();
  const farms = useFarmStore((state) => state.farms);

  useEffect(() => {
    generateInsights();
    const interval = setInterval(generateInsights, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [farms, metrics]);

  const generateInsights = async () => {
    if (!metrics) return;
    
    setIsGenerating(true);
    try {
      const newInsights = await aiInsightsService.analyzeSystem(
        farms,
        metrics,
        agentPerformance,
        timeSeriesData
      );
      
      const filteredInsights = aiInsightsService.getInsights(filter);
      setInsights(filteredInsights.slice(0, 10)); // Show top 10 insights
    } catch (error) {
      console.error('Failed to generate insights:', error);
      toast.error('Failed to generate AI insights');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyInsight = async (insight: AIInsight) => {
    const success = aiInsightsService.applyInsight(insight.id);
    if (success) {
      toast.success('Insight applied successfully');
      if (onInsightApplied) {
        onInsightApplied(insight);
      }
      generateInsights(); // Refresh insights
    } else {
      toast.error('Failed to apply insight');
    }
  };

  const handleFeedback = (insightId: string, helpful: boolean) => {
    aiInsightsService.provideFeedback(insightId, helpful, feedbackComment);
    toast.success('Thank you for your feedback!');
    setShowFeedback(null);
    setFeedbackComment('');
    generateInsights();
  };

  const getSeverityColor = (severity: AIInsight['severity']) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      case 'high': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'low': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
    }
  };

  const getTypeIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'optimization': return <Zap className="w-5 h-5" />;
      case 'anomaly': return <AlertTriangle className="w-5 h-5" />;
      case 'trend': return <TrendingUp className="w-5 h-5" />;
      case 'recommendation': return <Brain className="w-5 h-5" />;
      case 'alert': return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getCategoryIcon = (category: AIInsight['category']) => {
    switch (category) {
      case 'performance': return <Target className="w-4 h-4" />;
      case 'cost': return <DollarSign className="w-4 h-4" />;
      case 'reliability': return <CheckCircle className="w-4 h-4" />;
      case 'scaling': return <TrendingUp className="w-4 h-4" />;
      case 'collaboration': return <Users className="w-4 h-4" />;
    }
  };

  const stats = aiInsightsService.getInsightStatistics();

  return (
    <div className="space-y-6">
      {/* Header with Statistics */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Brain className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">AI-Driven Insights</h2>
              <p className="text-white/80">Intelligent optimization recommendations</p>
            </div>
          </div>
          <button
            onClick={generateInsights}
            disabled={isGenerating}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl 
                     transition-colors flex items-center gap-2 font-medium"
          >
            {isGenerating ? (
              <>
                <Sparkles className="w-4 h-4 animate-pulse" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Refresh Insights
              </>
            )}
          </button>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <div className="text-3xl font-bold">{stats.total}</div>
            <div className="text-sm text-white/70">Total Insights</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <div className="text-3xl font-bold">{stats.applied}</div>
            <div className="text-sm text-white/70">Applied</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <div className="text-3xl font-bold">
              {(stats.helpfulRate * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-white/70">Helpful Rate</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <div className="text-3xl font-bold">
              {Object.values(stats.bySeverity).filter((_, i) => i > 1).reduce((a, b) => a + b, 0)}
            </div>
            <div className="text-sm text-white/70">High Priority</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filter.type || ''}
          onChange={(e) => setFilter({ ...filter, type: e.target.value as any || undefined })}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                   bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">All Types</option>
          <option value="optimization">Optimization</option>
          <option value="anomaly">Anomaly</option>
          <option value="trend">Trend</option>
          <option value="recommendation">Recommendation</option>
          <option value="alert">Alert</option>
        </select>

        <select
          value={filter.category || ''}
          onChange={(e) => setFilter({ ...filter, category: e.target.value as any || undefined })}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                   bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">All Categories</option>
          <option value="performance">Performance</option>
          <option value="cost">Cost</option>
          <option value="reliability">Reliability</option>
          <option value="scaling">Scaling</option>
          <option value="collaboration">Collaboration</option>
        </select>

        <select
          value={filter.severity || ''}
          onChange={(e) => setFilter({ ...filter, severity: e.target.value as any || undefined })}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                   bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        <AnimatePresence>
          {insights.map((insight) => (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 
                       dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Insight Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setSelectedInsight(selectedInsight?.id === insight.id ? null : insight)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${getSeverityColor(insight.severity)}`}>
                      {getTypeIcon(insight.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{insight.title}</h3>
                        {insight.applied && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 
                                       dark:bg-green-900/20 dark:text-green-400 
                                       text-xs rounded-full">
                            Applied
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">
                        {insight.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          {getCategoryIcon(insight.category)}
                          {insight.category}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(insight.createdAt, { addSuffix: true })}
                        </span>
                        <span>
                          Confidence: {(insight.analysis.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      selectedInsight?.id === insight.id ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Expanded Content */}
              <AnimatePresence>
                {selectedInsight?.id === insight.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-4 space-y-4">
                      {/* Action Items */}
                      <div>
                        <h4 className="font-medium mb-2">Recommended Actions</h4>
                        <div className="space-y-2">
                          {insight.actionItems.map((action, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 p-3 bg-gray-50 
                                       dark:bg-gray-750 rounded-lg"
                            >
                              <div className={`mt-0.5 ${
                                action.automated ? 'text-green-500' : 'text-blue-500'
                              }`}>
                                {action.automated ? (
                                  <Zap className="w-4 h-4" />
                                ) : (
                                  <Users className="w-4 h-4" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-sm">{action.action}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Impact: {action.estimatedImpact} • Priority: {action.priority}
                                  {action.automated && ' • Automated'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Analysis Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Data Points
                          </div>
                          <div className="text-lg font-semibold">
                            {insight.analysis.dataPoints}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Impact Score
                          </div>
                          <div className="text-lg font-semibold">
                            {(insight.analysis.impactScore * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Timeframe
                          </div>
                          <div className="text-lg font-semibold">
                            {insight.analysis.timeframe}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Confidence
                          </div>
                          <div className="text-lg font-semibold">
                            {(insight.analysis.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-4 border-t 
                                    border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          {!insight.applied && (
                            <button
                              onClick={() => handleApplyInsight(insight)}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg 
                                       hover:bg-blue-600 transition-colors flex items-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Apply Insight
                            </button>
                          )}
                          {showFeedback !== insight.id ? (
                            <button
                              onClick={() => setShowFeedback(insight.id)}
                              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg 
                                       hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors 
                                       flex items-center gap-2"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Feedback
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={feedbackComment}
                                onChange={(e) => setFeedbackComment(e.target.value)}
                                placeholder="Optional comment..."
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 
                                         rounded-lg bg-white dark:bg-gray-700 text-sm"
                              />
                              <button
                                onClick={() => handleFeedback(insight.id, true)}
                                className="p-2 bg-green-100 dark:bg-green-900/20 text-green-600 
                                         dark:text-green-400 rounded-lg hover:bg-green-200 
                                         dark:hover:bg-green-900/30 transition-colors"
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleFeedback(insight.id, false)}
                                className="p-2 bg-red-100 dark:bg-red-900/20 text-red-600 
                                         dark:text-red-400 rounded-lg hover:bg-red-200 
                                         dark:hover:bg-red-900/30 transition-colors"
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setShowFeedback(null);
                                  setFeedbackComment('');
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        {insight.feedback && (
                          <div className="text-sm text-gray-500">
                            Feedback: {insight.feedback.helpful ? '👍' : '👎'}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {insights.length === 0 && !isGenerating && (
          <div className="text-center py-12">
            <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No insights available. Click "Refresh Insights" to generate new recommendations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};