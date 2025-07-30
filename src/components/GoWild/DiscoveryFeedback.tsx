import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LightBulbIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';

interface Discovery {
  id: string;
  timestamp: Date;
  type: 'insight' | 'solution' | 'optimization' | 'pattern' | 'warning';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'breakthrough';
  code?: string;
  relatedFiles?: string[];
  confidence: number; // 0-100
  agentId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'implemented';
}

interface DiscoveryFeedbackProps {
  discoveries: Discovery[];
  onAccept: (discoveryId: string) => void;
  onReject: (discoveryId: string) => void;
  onImplement: (discoveryId: string) => void;
  isExploring: boolean;
}

const typeConfig = {
  insight: {
    icon: LightBulbIcon,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Insight'
  },
  solution: {
    icon: CheckCircleIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Solution'
  },
  optimization: {
    icon: ArrowPathIcon,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Optimization'
  },
  pattern: {
    icon: CodeBracketIcon,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Pattern'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Warning'
  }
};

const impactColors = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-purple-500',
  breakthrough: 'text-red-500'
};

export const DiscoveryFeedback: React.FC<DiscoveryFeedbackProps> = ({
  discoveries,
  onAccept,
  onReject,
  onImplement,
  isExploring
}) => {
  const [filter, setFilter] = useState<Discovery['type'] | 'all'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'impact' | 'confidence'>('time');
  const [expandedDiscoveries, setExpandedDiscoveries] = useState<Set<string>>(new Set());

  const toggleExpanded = (discoveryId: string) => {
    setExpandedDiscoveries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(discoveryId)) {
        newSet.delete(discoveryId);
      } else {
        newSet.add(discoveryId);
      }
      return newSet;
    });
  };

  const filteredDiscoveries = discoveries
    .filter(d => filter === 'all' || d.type === filter)
    .sort((a, b) => {
      switch (sortBy) {
        case 'time':
          return b.timestamp.getTime() - a.timestamp.getTime();
        case 'impact':
          const impactOrder = { low: 0, medium: 1, high: 2, breakthrough: 3 };
          return impactOrder[b.impact] - impactOrder[a.impact];
        case 'confidence':
          return b.confidence - a.confidence;
        default:
          return 0;
      }
    });

  const stats = {
    total: discoveries.length,
    pending: discoveries.filter(d => d.status === 'pending').length,
    accepted: discoveries.filter(d => d.status === 'accepted').length,
    implemented: discoveries.filter(d => d.status === 'implemented').length,
    breakthrough: discoveries.filter(d => d.impact === 'breakthrough').length
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Discovery Feedback
          </h3>
          {isExploring && (
            <div className="flex items-center space-x-2">
              <div className="animate-pulse w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Actively exploring...
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{stats.implemented}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Implemented</p>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{stats.breakthrough}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Breakthroughs</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                filter === 'all' 
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {Object.entries(typeConfig).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setFilter(type as Discovery['type'])}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === type
                    ? `${config.bgColor} ${config.color}`
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="time">Latest First</option>
            <option value="impact">Highest Impact</option>
            <option value="confidence">Most Confident</option>
          </select>
        </div>
      </div>

      {/* Discoveries List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        <AnimatePresence>
          {filteredDiscoveries.map((discovery) => {
            const typeInfo = typeConfig[discovery.type];
            const Icon = typeInfo.icon;
            const isExpanded = expandedDiscoveries.has(discovery.id);

            return (
              <motion.div
                key={discovery.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`
                  border rounded-xl p-4 transition-all duration-200
                  ${discovery.status === 'pending' 
                    ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10'
                    : 'border-gray-200 dark:border-gray-700'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={`p-2 rounded-lg ${typeInfo.bgColor}`}>
                      <Icon className={`w-5 h-5 ${typeInfo.color}`} />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {discovery.title}
                        </h4>
                        <span className={`text-xs font-medium ${impactColors[discovery.impact]}`}>
                          {discovery.impact.toUpperCase()}
                        </span>
                        {discovery.impact === 'breakthrough' && (
                          <StarIcon className="w-4 h-4 text-yellow-500" />
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {discovery.description}
                      </p>

                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>{new Date(discovery.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>Confidence: {discovery.confidence}%</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>Agent: {discovery.agentId}</span>
                        </div>
                      </div>

                      {/* Expandable Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 space-y-3 overflow-hidden"
                          >
                            {discovery.code && (
                              <div>
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Suggested Code:
                                </p>
                                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                  <code>{discovery.code}</code>
                                </pre>
                              </div>
                            )}
                            
                            {discovery.relatedFiles && discovery.relatedFiles.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Related Files:
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {discovery.relatedFiles.map((file, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
                                    >
                                      {file}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Actions */}
                      {discovery.status === 'pending' && (
                        <div className="flex items-center space-x-2 mt-3">
                          <button
                            onClick={() => onAccept(discovery.id)}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg
                                     hover:bg-green-700 transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => onReject(discovery.id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg
                                     hover:bg-red-700 transition-colors"
                          >
                            Reject
                          </button>
                          {discovery.status === 'accepted' && (
                            <button
                              onClick={() => onImplement(discovery.id)}
                              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg
                                       hover:bg-indigo-700 transition-colors"
                            >
                              Implement
                            </button>
                          )}
                        </div>
                      )}

                      {/* Status Badge */}
                      {discovery.status !== 'pending' && (
                        <div className="mt-3">
                          <span className={`
                            text-xs px-2 py-1 rounded-full
                            ${discovery.status === 'accepted' ? 'bg-blue-100 text-blue-700' : ''}
                            ${discovery.status === 'rejected' ? 'bg-red-100 text-red-700' : ''}
                            ${discovery.status === 'implemented' ? 'bg-green-100 text-green-700' : ''}
                          `}>
                            {discovery.status.charAt(0).toUpperCase() + discovery.status.slice(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpanded(discovery.id)}
                    className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {(discovery.code || discovery.relatedFiles) && (
                      <DocumentTextIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredDiscoveries.length === 0 && (
          <div className="text-center py-12">
            <LightBulbIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {isExploring ? 'Exploring for discoveries...' : 'No discoveries yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};