import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Farm, Agent } from '@/types';
import { getAgentsFromFarm, getAgentCount } from '@/utils/farmHelpers';
import { 
  Activity, 
  Users, 
  Clock, 
  MoreVertical, 
  Pause, 
  Play, 
  Trash2,
  TrendingUp,
  Cpu,
  Sparkles,
  ChevronRight,
  Zap,
  Rocket,
  Bot,
  Brain,
  Leaf,
  Sun,
  Droplets,
  Sprout
} from 'lucide-react';

interface FarmCardProps {
  farm: Farm;
  onClick?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onDelete?: () => void;
}

export function FarmCard({ farm, onClick, onPause, onResume, onDelete }: FarmCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  
  useEffect(() => {
    if ((farm.status === 'active' || farm.status === 'running') && !pulseAnimation) {
      setPulseAnimation(true);
    } else if (farm.status !== 'active' && farm.status !== 'running') {
      setPulseAnimation(false);
    }
  }, [farm.status]);
  
  const getStatusColor = (status: Farm['status']) => {
    switch (status) {
      case 'active':
      case 'running':
        return {
          badge: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 dark:from-green-500/30 dark:to-emerald-500/30 border border-green-500/30',
          glow: 'shadow-green-500/20',
          icon: 'text-green-500',
          pulse: true
        };
      case 'paused':
        return {
          badge: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 dark:from-yellow-500/30 dark:to-amber-500/30 border border-yellow-500/30',
          glow: 'shadow-yellow-500/20',
          icon: 'text-yellow-500',
          pulse: false
        };
      case 'completed':
        return {
          badge: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 dark:from-blue-500/30 dark:to-cyan-500/30 border border-blue-500/30',
          glow: 'shadow-blue-500/20',
          icon: 'text-blue-500',
          pulse: false
        };
      case 'failed':
        return {
          badge: 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 dark:from-red-500/30 dark:to-rose-500/30 border border-red-500/30',
          glow: 'shadow-red-500/20',
          icon: 'text-red-500',
          pulse: false
        };
      default:
        return {
          badge: 'bg-gray-500/10 text-gray-400 border border-gray-500/30',
          glow: 'shadow-gray-500/20',
          icon: 'text-gray-500',
          pulse: false
        };
    }
  };

  const getTypeIcon = (type: Farm['type']) => {
    const iconClass = "w-5 h-5";
    
    // Special icons for specific farm names/types
    if (farm.name?.toLowerCase().includes('gowild')) {
      return <Rocket className={iconClass} />;
    }
    if (farm.name?.toLowerCase().includes('quick')) {
      return <Zap className={iconClass} />;
    }
    if (farm.name?.toLowerCase().includes('ai') || farm.name?.toLowerCase().includes('claude')) {
      return <Brain className={iconClass} />;
    }
    
    // Default icons by type
    switch (type) {
      case 'sequential':
        return <Leaf className={iconClass} />;
      case 'collaborative':
        return <Users className={iconClass} />;
      case 'autonomous':
        return <Bot className={iconClass} />;
      default:
        return <Sprout className={iconClass} />;
    }
  };

  const agents = getAgentsFromFarm(farm);
  const activeAgents = agents.filter(a => a.status === 'working' || a.status === 'active').length;
  const agentCount = getAgentCount(farm);
  const statusColors = getStatusColor(farm.status);
  const completionRate = farm.metrics && farm.metrics.totalTasks > 0 
    ? Math.round((farm.metrics.completedTasks / farm.metrics.totalTasks) * 100)
    : farm.status === 'completed' ? 100 : farm.status === 'active' ? 45 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative group cursor-pointer"
    >
      {/* Glow effect for active status */}
      {statusColors.pulse && (
        <motion.div
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className={`absolute inset-0 rounded-2xl blur-xl ${statusColors.glow}`}
        />
      )}
      
      {/* Main Card */}
      <div
        className={`
          relative overflow-hidden rounded-2xl
          bg-gradient-to-br from-gray-900/90 to-gray-800/90 
          dark:from-gray-800/90 dark:to-gray-900/90
          backdrop-blur-xl border border-gray-700/50 dark:border-gray-600/50
          shadow-2xl hover:shadow-3xl transition-all duration-500
          ${isHovered ? 'border-gray-600/70 dark:border-gray-500/70' : ''}
        `}
        onClick={onClick}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
        </div>
        
        <div className="relative p-6 z-10">
          {/* Header with Status */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <motion.div 
                className={`
                  p-3 rounded-xl bg-gradient-to-br
                  from-gray-700/50 to-gray-800/50
                  border border-gray-600/50
                  shadow-lg ${statusColors.icon}
                `}
                animate={isHovered ? { rotate: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.5 }}
              >
                {getTypeIcon(farm.type)}
              </motion.div>
              <div>
                <h3 className="font-bold text-lg text-white">
                  {farm.name}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <p className="text-xs text-gray-500">
                    {new Date(farm.updatedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Status Badge */}
            <motion.div
              animate={statusColors.pulse ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider
                ${statusColors.badge} backdrop-blur-sm
              `}
            >
              <div className="flex items-center space-x-1.5">
                {statusColors.pulse && (
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-current"
                  />
                )}
                <span>{farm.status}</span>
              </div>
            </motion.div>
          </div>

          {/* Description */}
          {farm.description && (
            <p className="text-sm text-gray-400 mb-4 line-clamp-2 leading-relaxed">
              {farm.description}
            </p>
          )}

          {/* Progress Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-medium text-gray-400">Progress</span>
              </div>
              <span className="text-xs font-bold text-gray-300">{completionRate}%</span>
            </div>
            <div className="relative h-2 bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionRate}%` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
              >
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{
                    x: ['-100%', '200%']
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear'
                  }}
                />
              </motion.div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
              <div className="flex items-center justify-center space-x-1 text-gray-500 mb-1">
                <Users className="w-3 h-3" />
                <span className="text-xs">Agents</span>
              </div>
              <div className="text-sm font-bold text-gray-300">
                {activeAgents}/{agentCount}
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
              <div className="flex items-center justify-center space-x-1 text-gray-500 mb-1">
                <Activity className="w-3 h-3" />
                <span className="text-xs">Efficiency</span>
              </div>
              <div className="text-sm font-bold text-gray-300">
                {farm.metrics?.efficiency || 0}%
              </div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
              <div className="flex items-center justify-center space-x-1 text-gray-500 mb-1">
                <Cpu className="w-3 h-3" />
                <span className="text-xs">CPU</span>
              </div>
              <div className="text-sm font-bold text-gray-300">
                {farm.metrics?.resourceUtilization?.cpu || 0}%
              </div>
            </div>
          </div>

          {/* Agent Avatars */}
          {agentCount > 0 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex -space-x-2">
                {agents.slice(0, 5).map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 border-2 border-gray-800 flex items-center justify-center relative"
                    style={{ zIndex: agentCount - index }}
                  >
                    <span className="text-white text-xs font-bold">
                      {agent.name ? agent.name.charAt(0).toUpperCase() : 'A'}
                    </span>
                    {(agent.status === 'active' || agent.status === 'working') && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-gray-800 animate-pulse" />
                    )}
                  </motion.div>
                ))}
                {agentCount > 5 && (
                  <div className="w-8 h-8 rounded-full bg-gray-700/50 backdrop-blur-sm border-2 border-gray-800 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-400">+{agentCount - 5}</span>
                  </div>
                )}
              </div>
              
              {farm.type && (
                <div className="px-2 py-1 rounded-lg bg-gray-700/30 backdrop-blur-sm border border-gray-600/30">
                  <span className="text-xs font-medium text-gray-400 capitalize">{farm.type}</span>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between">
            {/* View Details Button */}
            <motion.button
              onClick={onClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`
                flex-1 mr-2 flex items-center justify-center space-x-2 px-4 py-3 rounded-xl
                bg-gradient-to-r ${statusColors.icon === 'text-green-500' ? 'from-green-500 to-emerald-500' : 'from-blue-500 to-cyan-500'}
                text-white font-bold shadow-lg
                transition-all duration-300
                group relative overflow-hidden
              `}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12"
                animate={isHovered ? { x: ['100%', '-100%'] } : {}}
                transition={{ duration: 0.75, ease: 'easeInOut' }}
              />
              <span className="relative flex items-center space-x-2">
                <Sparkles className="w-4 h-4" />
                <span>View</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>
            
            {/* Action Menu */}
            <div className="relative">
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-3 rounded-xl bg-gray-700/30 hover:bg-gray-700/50 transition-colors backdrop-blur-sm border border-gray-600/30"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </motion.button>

              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute bottom-full right-0 mb-2 w-48 bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-700/50 z-50 overflow-hidden"
                  >
                    {(farm.status === 'active' || farm.status === 'running') && onPause && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPause();
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-3 text-sm hover:bg-gray-700/50 text-gray-200 transition-colors"
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
                        className="w-full flex items-center space-x-2 px-4 py-3 text-sm hover:bg-gray-700/50 text-gray-200 transition-colors"
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
                        className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Farm</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}