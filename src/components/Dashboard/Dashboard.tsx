import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Plus, 
  Grid3x3, 
  History, 
  Settings,
  Bell,
  User,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmCard } from './FarmCard';
import { StatsCard } from './StatsCard';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFarmStore } from '../../store/farmStore';
import { useUserStore } from '../../store/userStore';

interface DashboardProps {
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ className }) => {
  const [greeting, setGreeting] = useState('');
  const { user } = useUserStore();
  const { activeFarms, recentFarms, stats } = useFarmStore();
  const { isConnected } = useWebSocket();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  return (
    <div className={clsx('min-h-screen bg-gray-50 dark:bg-gray-950', className)}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-apple flex items-center justify-center"
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <motion.h1 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="text-xl font-semibold text-gray-900 dark:text-white"
              >
                MaiFarm
              </motion.h1>
            </div>

            {/* Right side actions */}
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={clsx(
                  'flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium',
                  isConnected 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                )}
              >
                <div className={clsx(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                )} />
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </motion.div>

              {/* Credit Balance */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-apple"
              >
                <TrendingUp className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.credits || 0} Credits
                </span>
              </motion.div>

              {/* Notifications */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <Bell className="w-5 h-5" />
                {user?.notifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {user.notifications}
                  </span>
                )}
              </motion.button>

              {/* User Avatar */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"
              >
                <User className="w-5 h-5 text-white" />
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {greeting}, {user?.name || 'Agent'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your AI farm ecosystem is ready to cultivate new solutions
          </p>
        </motion.section>

        {/* Stats Grid */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <StatsCard
            title="Active Farms"
            value={stats.activeFarms}
            icon={Activity}
            trend="+12%"
            color="primary"
          />
          <StatsCard
            title="Total Agents"
            value={stats.totalAgents}
            icon={Grid3x3}
            trend="+8%"
            color="green"
          />
          <StatsCard
            title="Tasks Completed"
            value={stats.tasksCompleted}
            icon={CheckCircle2}
            trend="+23%"
            color="blue"
          />
          <StatsCard
            title="Success Rate"
            value={`${stats.successRate}%`}
            icon={TrendingUp}
            trend="+5%"
            color="purple"
          />
        </motion.section>

        {/* Quick Actions */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <QuickActions />
        </motion.section>

        {/* Active Farms */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Active Farms
            </h3>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Farm</span>
            </motion.button>
          </div>

          {activeFarms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {activeFarms.map((farm, index) => (
                  <motion.div
                    key={farm.id}
                    {...fadeIn}
                    transition={{ delay: 0.1 * index }}
                  >
                    <FarmCard farm={farm} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              {...fadeIn}
              className="bg-white dark:bg-gray-900 rounded-apple-lg p-8 text-center border border-gray-200 dark:border-gray-800"
            >
              <Grid3x3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No active farms
              </h4>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Start your first farm to see it here
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
              >
                Create Your First Farm
              </motion.button>
            </motion.div>
          )}
        </motion.section>

        {/* Recent Activity */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h3>
          <RecentActivity activities={recentFarms} />
        </motion.section>
      </main>
    </div>
  );
};