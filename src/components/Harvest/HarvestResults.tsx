import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  Tag,
  ChevronDown,
  ChevronRight,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, HarvestResult } from '../../types/harvest';
import { format } from 'date-fns';

interface HarvestResultsProps {
  harvest: Harvest;
  view: 'grid' | 'list';
}

export const HarvestResults: React.FC<HarvestResultsProps> = ({ harvest, view }) => {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  
  const toggleExpanded = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const groupedResults = harvest.results.reduce((acc, result) => {
    const key = result.agentName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(result);
    return acc;
  }, {} as Record<string, HarvestResult[]>);

  const ResultCard = ({ result }: { result: HarvestResult }) => {
    const isExpanded = expandedResults.has(result.id);
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={clsx(
          'bg-white dark:bg-gray-900 rounded-apple-lg',
          'border border-gray-200 dark:border-gray-800',
          'hover:shadow-apple-sm transition-all duration-200',
          view === 'grid' ? 'p-5' : 'p-4'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                {result.taskType}
              </h4>
              <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                <span className="flex items-center space-x-1">
                  <User className="w-3 h-3" />
                  <span>{result.agentName}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{result.processingTime}s</span>
                </span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => toggleExpanded(result.id)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>

        <p className={clsx(
          "text-sm text-gray-600 dark:text-gray-400",
          !isExpanded && "line-clamp-2"
        )}>
          {result.content}
        </p>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800"
            >
              {result.metadata && Object.keys(result.metadata).length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Metadata
                  </h5>
                  <div className="space-y-1">
                    {Object.entries(result.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                        <span className="text-gray-900 dark:text-white font-mono text-xs">
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {result.error && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-apple">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Error: {result.error}
                  </p>
                </div>
              )}
              
              <div className="mt-3 text-xs text-gray-500">
                Completed at {format(new Date(result.timestamp), 'h:mm:ss a')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  if (view === 'list') {
    return (
      <div className="space-y-3">
        {harvest.results.map(result => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedResults).map(([agentName, results]) => (
        <div key={agentName}>
          <div className="flex items-center space-x-2 mb-3">
            <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {agentName}
            </h3>
            <span className="text-xs text-gray-500">
              ({results.length} result{results.length !== 1 ? 's' : ''})
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(result => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};