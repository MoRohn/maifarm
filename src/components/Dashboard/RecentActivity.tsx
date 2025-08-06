import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'farm_created' | 'farm_completed' | 'agent_error' | 'farm_paused' | 'agent_started';
  title: string;
  description: string;
  timestamp: Date;
  farmId?: string;
  agentId?: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
  limit?: number;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ 
  activities = [],
  limit = 5 
}) => {
  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'farm_created':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'farm_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'agent_error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'farm_paused':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'agent_started':
        return <Clock className="w-4 h-4 text-purple-500" />;
    }
  };

  const recentActivities = activities.slice(0, limit);

  if (recentActivities.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Activity
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No recent activity to display
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
    >
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5" />
        Recent Activity
      </h3>
      
      <div className="space-y-3">
        {recentActivities.map((activity, index) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="mt-1">
              {getActivityIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {activity.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {activity.description}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {activity.timestamp ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) : 'Unknown time'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};