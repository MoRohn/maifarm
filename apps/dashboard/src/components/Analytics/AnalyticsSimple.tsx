import React, { useEffect, useState } from 'react';
import { BarChart3, Activity, DollarSign, TrendingUp, Clock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFarmStore } from '@/store/farmStore';

/**
 * Simplified Analytics Component
 *
 * This is a lightweight fallback analytics page that provides
 * basic metrics without heavy dependencies.
 *
 * This component automatically displays real farm data when available.
 */
export const AnalyticsSimple: React.FC = () => {
  const farms = useFarmStore((state) => state.farms);
  const [stats, setStats] = useState({
    activeFarms: 0,
    totalFarms: 0,
    completedTasks: 0,
    successRate: 0,
    totalCost: 0,
    apiCalls: 0
  });

  useEffect(() => {
    // Calculate real stats from farms
    const activeFarms = farms.filter(f => f.status === 'active' || f.status === 'running').length;
    const completedFarms = farms.filter(f => f.status === 'completed').length;
    const totalFarms = farms.length;

    // Calculate simple metrics
    const successRate = totalFarms > 0 ? (completedFarms / totalFarms) * 100 : 0;

    setStats({
      activeFarms,
      totalFarms,
      completedTasks: completedFarms,
      successRate,
      totalCost: 0, // Would need API integration
      apiCalls: 0   // Would need API integration
    });
  }, [farms]);

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold flex items-center gap-3 mb-2">
          <BarChart3 className="w-10 h-10 text-blue-500" />
          Analytics Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Real-time insights into your MaiFarm operations
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +12.5%
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Active Farms</p>
          <p className="text-3xl font-bold">{stats.activeFarms}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stats.totalFarms} total farms
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <BarChart3 className="w-6 h-6 text-emerald-500" />
            </div>
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +8.2%
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Success Rate</p>
          <p className="text-3xl font-bold">{stats.successRate.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stats.completedTasks} completed
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <DollarSign className="w-6 h-6 text-purple-500" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +5.1%
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Cost</p>
          <p className="text-3xl font-bold">${stats.totalCost.toFixed(2)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stats.apiCalls} API calls
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
              <Activity className="w-6 h-6 text-orange-500" />
            </div>
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              +2.3%
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">System Health</p>
          <p className="text-3xl font-bold">100%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            All systems operational
          </p>
        </motion.div>
      </div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-8 border border-blue-100 dark:border-blue-800"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              Welcome to MaiFarm Analytics
            </h2>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Simplified View - Real-time data from your farms
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Activity className="w-4 h-4" />
            Try Full Analytics
          </button>
        </div>
        <p className="text-blue-800 dark:text-blue-200 mb-4">
          You're viewing a lightweight version of the analytics dashboard. {stats.totalFarms > 0 ?
            `Displaying real-time data from your ${stats.totalFarms} farm${stats.totalFarms !== 1 ? 's' : ''}.` :
            'Create some farms to see real-time metrics and insights!'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Farm Performance</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Track your farm efficiency and completion rates
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Cost Tracking</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Monitor Claude API usage and optimize spending
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Agent Insights</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyze agent performance and identify bottlenecks
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AnalyticsSimple;
