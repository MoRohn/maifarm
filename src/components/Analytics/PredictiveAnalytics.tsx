import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Brain,
  Clock,
  Target,
  Activity
} from 'lucide-react';
import { LineChart } from './Charts/LineChart';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { predictiveAnalyticsService } from '@/services/predictiveAnalytics';
import { Prediction, TimeRange } from '@/types/analytics';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface PredictiveAnalyticsProps {
  timeRange: TimeRange;
  onInsightGenerated?: (insight: string) => void;
}

export const PredictiveAnalytics: React.FC<PredictiveAnalyticsProps> = ({
  timeRange,
  onInsightGenerated
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<'performance' | 'resources' | 'costs'>('performance');
  const [confidence, setConfidence] = useState<number>(0);
  const [modelAccuracy, setModelAccuracy] = useState<number>(0);
  
  const {
    predictions,
    agentPerformance,
    timeSeriesData,
    addPrediction,
    anomalies
  } = useAnalyticsStore();

  useEffect(() => {
    generatePredictions();
  }, [timeRange, selectedMetric]);

  const generatePredictions = async () => {
    setIsGenerating(true);
    try {
      // Generate predictions based on historical data
      const historicalData = timeSeriesData.find(series => {
        switch (selectedMetric) {
          case 'performance':
            return series.label === 'Task Completion Rate';
          case 'resources':
            return series.label === 'CPU Usage';
          case 'costs':
            return series.label === 'Cost per Hour';
          default:
            return false;
        }
      });

      if (historicalData) {
        const prediction = await predictiveAnalyticsService.generatePrediction(
          historicalData,
          selectedMetric,
          timeRange.preset || 'custom'
        );
        
        addPrediction(prediction);
        setConfidence(prediction.confidence);
        setModelAccuracy(prediction.accuracy || 85);

        // Generate insight
        if (onInsightGenerated && prediction.insight) {
          onInsightGenerated(prediction.insight);
        }
      }
    } catch (error) {
      console.error('Failed to generate predictions:', error);
      toast.error('Failed to generate predictions');
    } finally {
      setIsGenerating(false);
    }
  };

  const getLatestPrediction = (): Prediction | null => {
    return predictions
      .filter(p => p.metric === selectedMetric)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  };

  const formatPredictionValue = (value: number): string => {
    switch (selectedMetric) {
      case 'performance':
        return `${value.toFixed(1)}%`;
      case 'resources':
        return `${value.toFixed(1)}%`;
      case 'costs':
        return `$${value.toFixed(2)}/hr`;
      default:
        return value.toFixed(2);
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      case 'stable':
        return <Activity className="w-5 h-5 text-blue-500" />;
    }
  };

  const latestPrediction = getLatestPrediction();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-purple-500" />
          <h3 className="text-lg font-semibold">Predictive Analytics</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          >
            <option value="performance">Performance</option>
            <option value="resources">Resources</option>
            <option value="costs">Costs</option>
          </select>
          <button
            onClick={generatePredictions}
            disabled={isGenerating}
            className="px-3 py-1 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? 'Generating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {latestPrediction && (
        <>
          {/* Prediction Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Predicted Value
                </span>
                {getTrendIcon(latestPrediction.trend)}
              </div>
              <div className="text-2xl font-bold">
                {formatPredictionValue(latestPrediction.predictedValue)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                in {latestPrediction.horizon} hours
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Model Confidence
                </span>
                <Target className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold">
                {(confidence * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Accuracy: {modelAccuracy.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Prediction Chart */}
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3">Forecast Visualization</h4>
            <LineChart
              data={[
                {
                  label: 'Historical',
                  data: timeSeriesData.find(s => s.label === 
                    (selectedMetric === 'performance' ? 'Task Completion Rate' :
                     selectedMetric === 'resources' ? 'CPU Usage' : 'Cost per Hour')
                  )?.data || [],
                  color: '#6B7280'
                },
                {
                  label: 'Predicted',
                  data: latestPrediction.forecastData || [],
                  color: '#8B5CF6',
                  isDashed: true
                }
              ]}
              height={200}
              showLegend={true}
              animate={true}
            />
          </div>

          {/* Key Insights */}
          {latestPrediction.insight && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm mb-1">Key Insight</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {latestPrediction.insight}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Anomaly Detection */}
          {anomalies.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-3">Detected Anomalies</h4>
              <div className="space-y-2">
                {anomalies.slice(0, 3).map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium">{anomaly.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDistanceToNow(anomaly.detectedAt, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      anomaly.severity === 'high' ? 'bg-red-100 text-red-700' :
                      anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {anomaly.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {latestPrediction.recommendations && latestPrediction.recommendations.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-3">Recommendations</h4>
              <ul className="space-y-2">
                {latestPrediction.recommendations.map((rec, index) => (
                  <li key={`recommendation-${index}-${rec.substring(0, 10)}`} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5 flex-shrink-0" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Last Updated */}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Last updated: {formatDistanceToNow(new Date(latestPrediction.timestamp), { addSuffix: true })}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next update in {Math.round(30 - (Date.now() - new Date(latestPrediction.timestamp).getTime()) / 1000)}s
            </span>
          </div>
        </>
      )}

      {!latestPrediction && !isGenerating && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No predictions available yet.</p>
          <p className="text-sm mt-1">Click refresh to generate predictions.</p>
        </div>
      )}
    </div>
  );
};