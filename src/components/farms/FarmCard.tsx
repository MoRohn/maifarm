import React from 'react';
import { motion } from 'framer-motion';
import { Farm, Agent } from '@/types';
import { Activity, Users, Clock, MoreVertical, Pause, Play, Trash2 } from 'lucide-react';

interface FarmCardProps {
  farm: Farm;
  onClick?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onDelete?: () => void;
}

export function FarmCard({ farm, onClick, onPause, onResume, onDelete }: FarmCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  
  const getStatusColor = (status: Farm['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    }
  };

  const getTypeIcon = (type: Farm['type']) => {
    switch (type) {
      case 'sequential':
        return '→';
      case 'collaborative':
        return '⇄';
      case 'autonomous':
        return '✦';
    }
  };

  const activeAgents = farm.agents.filter(a => a.status === 'working').length;
  const completionRate = farm.metrics.totalTasks > 0 
    ? Math.round((farm.metrics.completedTasks / farm.metrics.totalTasks) * 100)
    : 0;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="card p-6 cursor-pointer relative group"
      onClick={onClick}
    >
      {/* Status indicator */}
      <div className="absolute top-4 right-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(farm.status)}`}>
          {farm.status}
        </span>
      </div>

      {/* Farm type icon */}
      <div className="mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
          {getTypeIcon(farm.type)}
        </div>
      </div>

      {/* Content */}
      <h3 className="text-lg font-semibold mb-2 pr-16">{farm.name}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
        {farm.description}
      </p>

      {/* Metrics */}
      <div className="space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
            <span>Progress</span>
            <span>{completionRate}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <span>{activeAgents}/{farm.agents.length}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 text-gray-500" />
            <span>{farm.metrics.efficiency}%</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span>{new Date(farm.updatedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Agent avatars */}
      <div className="mt-4 flex -space-x-2">
        {farm.agents.slice(0, 4).map((agent, index) => (
          <div
            key={agent.id}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 border-2 border-white dark:border-gray-900 flex items-center justify-center"
            style={{ zIndex: farm.agents.length - index }}
          >
            <span className="text-white text-xs font-medium">
              {agent.name.charAt(0).toUpperCase()}
            </span>
          </div>
        ))}
        {farm.agents.length > 4 && (
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900 flex items-center justify-center">
            <span className="text-xs font-medium">+{farm.agents.length - 4}</span>
          </div>
        )}
      </div>

      {/* Action menu */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bottom-full right-0 mb-2 w-40 card shadow-lg"
            >
              {farm.status === 'active' && onPause && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPause();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause Farm</span>
                </button>
              )}
              {farm.status === 'paused' && onResume && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  <span>Resume Farm</span>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Farm</span>
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}