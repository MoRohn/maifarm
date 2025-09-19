import { useState } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  Lightbulb, 
  RefreshCw, 
  ChevronRight,
  Target,
  AlertCircle,
  Info
} from 'lucide-react';
import { PredictiveInsight } from '@/types/reporting';

interface PredictiveInsightsProps {
  insights: PredictiveInsight[];
  onRefresh: () => Promise<void>;
}

export function PredictiveInsights({ insights, onRefresh }: PredictiveInsightsProps) {
  const [selectedInsight, setSelectedInsight] = useState<PredictiveInsight | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const filteredInsights = insights.filter(insight => {
    if (filterSeverity !== 'all' && insight.severity !== filterSeverity) return false;
    if (filterType !== 'all' && insight.type !== filterType) return false;
    return true;
  });

  const getInsightIcon = (type: PredictiveInsight['type']) => {
    switch (type) {
      case 'bottleneck':
        return <AlertTriangle className="h-5 w-5" />;
      case 'anomaly':
        return <AlertCircle className="h-5 w-5" />;
      case 'optimization':
        return <Lightbulb className="h-5 w-5" />;
      case 'forecast':
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: PredictiveInsight['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-500';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 border-orange-500';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-500';
      case 'low':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-500';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 border-gray-500';
    }
  };

  const insightCounts = insights.reduce((acc, insight) => {
    acc[insight.type] = (acc[insight.type] || 0) + 1;
    acc[insight.severity] = (acc[insight.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Predictive Insights</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            AI-powered analysis and recommendations
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-semibold text-red-600">{insightCounts.critical || 0}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Critical Issues</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-semibold text-orange-600">{insightCounts.high || 0}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">High Priority</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-semibold text-yellow-600">{insightCounts.medium || 0}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Medium Priority</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-semibold text-blue-600">{insightCounts.optimization || 0}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Optimizations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4 bg-white dark:bg-gray-800 rounded-lg p-4">
        <div>
          <label className="text-sm text-gray-500 dark:text-gray-400 mr-2">Severity:</label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-500 dark:text-gray-400 mr-2">Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="all">All</option>
            <option value="bottleneck">Bottlenecks</option>
            <option value="anomaly">Anomalies</option>
            <option value="optimization">Optimizations</option>
            <option value="forecast">Forecasts</option>
          </select>
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {filteredInsights.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No insights match your filters</p>
          </div>
        ) : (
          filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className={`bg-white dark:bg-gray-800 rounded-lg p-6 border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${getSeverityColor(insight.severity)}`}
              onClick={() => setSelectedInsight(insight)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className={`p-2 rounded-lg ${getSeverityColor(insight.severity)}`}>
                    {getInsightIcon(insight.type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-lg">{insight.title}</h4>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {insight.description}
                    </p>
                    
                    <div className="mt-3 flex items-center space-x-6 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Confidence:</span>
                        <span className="ml-2 font-medium">{(insight.prediction.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Timeframe:</span>
                        <span className="ml-2 font-medium">{insight.prediction.timeframe}</span>
                      </div>
                      {insight.impact && (
                        <div className="flex items-center space-x-4">
                          {insight.impact.performance !== undefined && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Performance:</span>
                              <span className={`ml-2 font-medium ${insight.impact.performance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {insight.impact.performance > 0 ? '+' : ''}{insight.impact.performance}%
                              </span>
                            </div>
                          )}
                          {insight.impact.cost !== undefined && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Cost:</span>
                              <span className={`ml-2 font-medium ${insight.impact.cost < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {insight.impact.cost > 0 ? '+' : ''}{insight.impact.cost}%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedInsight && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setSelectedInsight(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg ${getSeverityColor(selectedInsight.severity)}`}>
                    {getInsightIcon(selectedInsight.type)}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{selectedInsight.title}</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${getSeverityColor(selectedInsight.severity)}`}>
                      {selectedInsight.severity}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedInsight(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h4>
                  <p className="text-gray-600 dark:text-gray-400">{selectedInsight.description}</p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Prediction Details</h4>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Metric</p>
                        <p className="font-medium">{selectedInsight.prediction.metric}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Current Value</p>
                        <p className="font-medium">{selectedInsight.prediction.currentValue}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Predicted Value</p>
                        <p className="font-medium">{selectedInsight.prediction.predictedValue}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Confidence</p>
                        <p className="font-medium">{(selectedInsight.prediction.confidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Recommendations</h4>
                  <ul className="space-y-2">
                    {selectedInsight.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start">
                        <Target className="h-4 w-4 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-gray-600 dark:text-gray-400">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {selectedInsight.impact && (
                  <div>
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Expected Impact</h4>
                    <div className="flex items-center space-x-6">
                      {selectedInsight.impact.performance !== undefined && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Performance</p>
                          <p className={`text-2xl font-semibold ${selectedInsight.impact.performance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {selectedInsight.impact.performance > 0 ? '+' : ''}{selectedInsight.impact.performance}%
                          </p>
                        </div>
                      )}
                      {selectedInsight.impact.cost !== undefined && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Cost</p>
                          <p className={`text-2xl font-semibold ${selectedInsight.impact.cost < 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {selectedInsight.impact.cost > 0 ? '+' : ''}{selectedInsight.impact.cost}%
                          </p>
                        </div>
                      )}
                      {selectedInsight.impact.reliability !== undefined && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">Reliability</p>
                          <p className={`text-2xl font-semibold ${selectedInsight.impact.reliability > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {selectedInsight.impact.reliability > 0 ? '+' : ''}{selectedInsight.impact.reliability}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}