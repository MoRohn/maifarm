import React, { useEffect, useState } from 'react';
import {
  Lightbulb,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Filter,
  Brain
} from 'lucide-react';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { aiInsights } from '../../services/aiInsights';
import { Insight, InsightCategory, InsightPriority } from '../../types/analytics';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface InsightsSummaryProps {
  category?: InsightCategory;
  maxInsights?: number;
  onActionClick?: (action: string, insightId: string) => void;
}

export const InsightsSummary: React.FC<InsightsSummaryProps> = ({
  category,
  maxInsights = 5,
  onActionClick
}) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<InsightCategory | 'all'>(category || 'all');
  const [selectedPriority, setSelectedPriority] = useState<InsightPriority | 'all'>('all');
  
  const {
    metrics,
    agentPerformance,
    timeSeriesData,
    anomalies,
    predictions
  } = useAnalyticsStore();

  useEffect(() => {
    generateInsights();
  }, [metrics, agentPerformance]);

  const generateInsights = async () => {
    if (!metrics || agentPerformance.length === 0) return;

    setIsGenerating(true);
    try {
      const newInsights = await aiInsights.generateInsights({
        metrics,
        agentPerformance,
        timeSeriesData,
        anomalies,
        predictions
      });

      setInsights(newInsights);
    } catch (error) {
      console.error('Failed to generate insights:', error);
      toast.error('Failed to generate insights');
    } finally {
      setIsGenerating(false);
    }
  };

  const getCategoryIcon = (cat: InsightCategory) => {
    switch (cat) {
      case 'performance':
        return <TrendingUp className="w-4 h-4" />;
      case 'cost':
        return <DollarSign className="w-4 h-4" />;
      case 'optimization':
        return <Sparkles className="w-4 h-4" />;
      case 'anomaly':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (cat: InsightCategory) => {
    switch (cat) {
      case 'performance':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'cost':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'optimization':
        return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'anomaly':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getPriorityColor = (priority: InsightPriority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const filteredInsights = insights
    .filter(insight => selectedCategory === 'all' || insight.category === selectedCategory)
    .filter(insight => selectedPriority === 'all' || insight.priority === selectedPriority)
    .slice(0, maxInsights);

  const handleActionClick = (action: string, insightId: string) => {
    if (onActionClick) {
      onActionClick(action, insightId);
    } else {
      // Default action handling
      toast.success(`Action "${action}" initiated`);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-purple-500" />
          <h3 className="text-lg font-semibold">AI-Generated Insights</h3>
        </div>
        <button
          onClick={generateInsights}
          disabled={isGenerating}
          className="flex items-center gap-2 px-3 py-1 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          >
            <option value="all">All Categories</option>
            <option value="performance">Performance</option>
            <option value="cost">Cost</option>
            <option value="optimization">Optimization</option>
            <option value="anomaly">Anomaly</option>
          </select>
        </div>
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value as any)}
          className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
        >
          <option value="all">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Insights List */}
      {filteredInsights.length > 0 ? (
        <div className="space-y-4">
          {filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${getCategoryColor(insight.category)}`}>
                    {getCategoryIcon(insight.category)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm mb-1">{insight.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {insight.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${getPriorityColor(insight.priority)}`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {insight.priority}
                  </span>
                </div>
              </div>

              {/* Impact */}
              {insight.impact && (
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Impact:</span>
                  <span className={`font-medium ${
                    insight.impact.value > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {insight.impact.value > 0 ? '+' : ''}{insight.impact.value}% {insight.impact.metric}
                  </span>
                </div>
              )}

              {/* Evidence */}
              {insight.evidence && insight.evidence.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Based on:</p>
                  <div className="flex flex-wrap gap-2">
                    {insight.evidence.map((evidence, index) => (
                      <span
                        key={`evidence-${insight.id}-${index}`}
                        className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
                      >
                        {evidence}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {insight.suggestedActions && insight.suggestedActions.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  {insight.suggestedActions.map((action, index) => (
                    <button
                      key={`action-${insight.id}-${index}`}
                      onClick={() => handleActionClick(action, insight.id)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {action}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDistanceToNow(new Date(insight.generatedAt), { addSuffix: true })}
                </span>
                {insight.confidence && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Confidence: {(insight.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No insights available yet.</p>
          <p className="text-sm mt-1">
            {isGenerating ? 'Generating insights...' : 'Click refresh to generate insights.'}
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {insights.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">{insights.filter(i => i.category === 'performance').length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Performance</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{insights.filter(i => i.category === 'cost').length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Cost</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{insights.filter(i => i.category === 'optimization').length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Optimization</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{insights.filter(i => i.category === 'anomaly').length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Anomaly</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};