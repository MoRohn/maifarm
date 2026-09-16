import React from 'react';
import { motion } from 'framer-motion';
import { Zap, TrendingUp, Users, Clock } from 'lucide-react';
import { User, FarmMetrics } from '@/types';

interface HeroProps {
  user: User;
  metrics: {
    activeFarms: number;
    totalAgents: number;
    tasksCompleted: number;
    successRate: number;
  };
}

export function Hero({ user, metrics }: HeroProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const stats = [
    {
      icon: Zap,
      label: 'Active Farms',
      value: metrics.activeFarms,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      icon: Users,
      label: 'Total Agents',
      value: metrics.totalAgents,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      icon: Clock,
      label: 'Tasks Completed',
      value: metrics.tasksCompleted.toLocaleString(),
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    },
    {
      icon: TrendingUp,
      label: 'Success Rate',
      value: `${metrics.successRate}%`,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
    },
  ];

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-transparent to-blue-50 dark:from-primary-900/10 dark:to-blue-900/10 -z-10" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Greeting */}
          <h2 className="text-3xl sm:text-4xl font-bold mb-2">
            {getGreeting()}, {user.name}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Your AI agents are ready to collaborate and bring your ideas to life.
          </p>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card p-6 hover:scale-[1.02] transition-transform duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                      delay: index * 0.1 + 0.3 
                    }}
                  >
                    <span className="text-2xl font-bold">{stat.value}</span>
                  </motion.div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <button className="btn-primary">
              Create New Farm
            </button>
            <button className="btn-secondary">
              Browse Templates
            </button>
            <button className="px-4 py-2 text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
              View Documentation →
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}