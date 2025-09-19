import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  TrendingUp, 
  Brain,
  Clock,
  Shield,
  PlayCircle,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { ErrorPrediction as ErrorPredictionType, SuggestedAction } from '@/types/monitoring';
import { toast } from 'react-hot-toast';

interface ErrorPredictionProps {
  predictions: ErrorPredictionType[];
  onActionExecute: (_agentId: string, _action: SuggestedAction) => void;
  className?: string;
}

export const ErrorPrediction: React.FC<ErrorPredictionProps> = ({ 
  predictions, 
  onActionExecute,
  className 
}) => {
  const [expandedPredictions, setExpandedPredictions] = useState<Set<string>>(new Set());
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());

  const toggleExpanded = (predictionId: string) => {
    const newExpanded = new Set(expandedPredictions);
    if (newExpanded.has(predictionId)) {
      newExpanded.delete(predictionId);
    } else {
      newExpanded.add(predictionId);
    }
    setExpandedPredictions(newExpanded);
  };

  const handleActionExecute = async (prediction: ErrorPredictionType, action: SuggestedAction) => {
    const actionId = `${prediction.agentId}-${action.id}`;
    setExecutingActions(prev => new Set(prev).add(actionId));

    try {
      await onActionExecute(prediction.agentId, action);
      toast.success(`${action.type} action executed successfully`);
    } catch (error) {
      toast.error(`Failed to execute ${action.type} action`);
    } finally {
      setExecutingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(actionId);
        return newSet;
      });
    }
  };

  const sortedPredictions = [...predictions].sort((a, b) => b.probability - a.probability);
  const criticalPredictions = sortedPredictions.filter(p => p.probability > 0.8);
  const warningPredictions = sortedPredictions.filter(p => p.probability > 0.5 && p.probability <= 0.8);

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-500/20 rounded-apple">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI Error Predictions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Proactive issue detection and resolution
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {criticalPredictions.length} critical
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {warningPredictions.length} warnings
            </span>
          </div>
        </div>
      </div>

      {/* Predictions List */}
      <div className="space-y-4">
        <AnimatePresence>
          {sortedPredictions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <Shield className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No issues predicted. All systems operating normally.
              </p>
            </motion.div>
          ) : (
            sortedPredictions.map((prediction) => (
              <PredictionCard
                key={`${prediction.agentId}-${prediction.type}`}
                prediction={prediction}
                isExpanded={expandedPredictions.has(`${prediction.agentId}-${prediction.type}`)}
                onToggle={() => toggleExpanded(`${prediction.agentId}-${prediction.type}`)}
                onActionExecute={(action) => handleActionExecute(prediction, action)}
                isExecuting={(actionId) => executingActions.has(`${prediction.agentId}-${actionId}`)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

interface PredictionCardProps {
  prediction: ErrorPredictionType;
  isExpanded: boolean;
  onToggle: () => void;
  onActionExecute: (action: SuggestedAction) => void;
  isExecuting: (actionId: string) => boolean;
}

const PredictionCard: React.FC<PredictionCardProps> = ({ 
  prediction, 
  isExpanded, 
  onToggle,
  onActionExecute,
  isExecuting
}) => {
  const severity = prediction.probability > 0.8 ? 'critical' : 
                   prediction.probability > 0.5 ? 'warning' : 'info';
  
  const severityConfig = {
    critical: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    }
  };

  const config = severityConfig[severity];
  const TypeIcon = getTypeIcon(prediction.type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={clsx(
        'rounded-apple-lg border transition-all duration-300',
        config.bg,
        config.border,
        'hover:shadow-apple'
      )}
    >
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className={clsx('p-2 rounded-apple', config.bg)}>
              <TypeIcon className={clsx('w-5 h-5', config.icon)} />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {formatPredictionType(prediction.type)}
                </h4>
                <span className={clsx(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  config.badge
                )}>
                  {Math.round(prediction.probability * 100)}% probability
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Agent: {prediction.agentId} • ETA: {formatTime(prediction.estimatedTimeToError)}
              </p>
            </div>
          </div>
          
          <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-400">Risk Level</span>
            <span className={clsx('font-medium', config.icon)}>
              {Math.round(prediction.probability * 100)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${prediction.probability * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={clsx(
                'h-full',
                severity === 'critical' ? 'bg-gradient-to-r from-red-400 to-red-600' :
                severity === 'warning' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                'bg-gradient-to-r from-blue-400 to-blue-600'
              )}
            />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-200 dark:border-gray-700"
          >
            <div className="p-4 space-y-4">
              {/* Confidence Score */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  AI Confidence
                </span>
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={clsx(
                          'w-2 h-8 rounded-full',
                          i < Math.round(prediction.confidence * 5)
                            ? 'bg-gradient-to-t from-purple-400 to-purple-600'
                            : 'bg-gray-300 dark:bg-gray-700'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {Math.round(prediction.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Suggested Actions */}
              <div>
                <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Suggested Actions
                </h5>
                <div className="space-y-2">
                  {prediction.suggestedActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onExecute={() => onActionExecute(action)}
                      isExecuting={isExecuting(action.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface ActionCardProps {
  action: SuggestedAction;
  onExecute: () => void;
  isExecuting: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({ action, onExecute, isExecuting }) => {
  const ActionIcon = getActionIcon(action.type);
  const impactColors = {
    low: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    high: 'text-red-600 dark:text-red-400'
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
      <div className="flex items-center space-x-3">
        <ActionIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {action.description}
          </p>
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Impact: <span className={impactColors[action.impact]}>{action.impact}</span>
            </span>
            {action.automated && (
              <span className="flex items-center space-x-1 text-purple-600 dark:text-purple-400">
                <Zap className="w-3 h-3" />
                <span>Automated</span>
              </span>
            )}
          </div>
        </div>
      </div>
      
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onExecute}
        disabled={isExecuting}
        className={clsx(
          'px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
          'bg-primary-500 text-white hover:bg-primary-600',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'flex items-center space-x-1'
        )}
      >
        {isExecuting ? (
          <>
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Executing...</span>
          </>
        ) : (
          <>
            <PlayCircle className="w-3 h-3" />
            <span>Execute</span>
          </>
        )}
      </motion.button>
    </div>
  );
};

// Helper functions
function getTypeIcon(type: string) {
  switch (type) {
    case 'resource_exhaustion': return TrendingUp;
    case 'task_failure': return XCircle;
    case 'communication_breakdown': return AlertTriangle;
    case 'deadlock': return Shield;
    default: return AlertTriangle;
  }
}

function getActionIcon(type: string) {
  switch (type) {
    case 'restart': return RefreshCw;
    case 'scale': return TrendingUp;
    case 'throttle': return Shield;
    case 'migrate': return PlayCircle;
    default: return Zap;
  }
}

function formatPredictionType(type: string): string {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}