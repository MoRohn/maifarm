import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, X, Calendar, Users, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAnalyticsStore } from '@/store/analyticsStore';

export const AnalyticsFilters: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const handleApplyFilters = () => {
    // Apply filters logic here
    useAnalyticsStore.getState().fetchAnalytics({
      agents: selectedAgents,
      metrics: selectedMetrics,
      timeRange: dateRange.start && dateRange.end ? {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end)
      } : undefined
    });
    setIsOpen(false);
  };

  const handleReset = () => {
    setSelectedAgents([]);
    setSelectedMetrics([]);
    setDateRange({ start: '', end: '' });
  };

  const agents = [
    { id: 'agent-1', name: 'Code Reviewer Alpha' },
    { id: 'agent-2', name: 'Bug Hunter Beta' },
    { id: 'agent-3', name: 'Test Runner Gamma' },
    { id: 'agent-4', name: 'Feature Builder Delta' }
  ];

  const metrics = [
    { id: 'performance', name: 'Performance', icon: BarChart3 },
    { id: 'costs', name: 'Costs', icon: BarChart3 },
    { id: 'efficiency', name: 'Efficiency', icon: BarChart3 },
    { id: 'errors', name: 'Errors', icon: BarChart3 }
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative"
        title="Filters"
      >
        <Filter className="w-5 h-5" />
        {(selectedAgents.length > 0 || selectedMetrics.length > 0) && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Filter Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto"
            >
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Analytics Filters
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Date Range */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    <Calendar className="w-4 h-4" />
                    <span>Date Range</span>
                  </label>
                  <div className="space-y-2">
                    <input
                      type="datetime-local"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Start date"
                    />
                    <input
                      type="datetime-local"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="End date"
                    />
                  </div>
                </div>

                {/* Agents */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    <Users className="w-4 h-4" />
                    <span>Agents</span>
                  </label>
                  <div className="space-y-2">
                    {agents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(agent.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAgents([...selectedAgents, agent.id]);
                            } else {
                              setSelectedAgents(selectedAgents.filter(id => id !== agent.id));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {agent.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Metrics */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    <BarChart3 className="w-4 h-4" />
                    <span>Metrics</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {metrics.map((metric) => (
                      <label
                        key={metric.id}
                        className={clsx(
                          'flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all',
                          selectedMetrics.includes(metric.id)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMetrics.includes(metric.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMetrics([...selectedMetrics, metric.id]);
                            } else {
                              setSelectedMetrics(selectedMetrics.filter(id => id !== metric.id));
                            }
                          }}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">
                          {metric.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
                <div className="flex space-x-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleApplyFilters}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};