import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sprout,
  Droplets,
  Sun,
  Leaf,
  Package,
  ChevronRight,
  Pause,
  Play,
  MoreHorizontal,
  Activity,
  Clock,
  Zap,
  TrendingUp,
  Users,
  Cpu,
  Sparkles,
  Rocket,
  Bot,
  Brain
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm } from '@/types';
import { getAgentsFromFarm, getAgentCount } from '@/utils/farmHelpers';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';

interface FarmCardProps {
  farm: Farm;
  className?: string;
}

export const FarmCard: React.FC<FarmCardProps> = ({ farm, className }) => {
  const navigate = useNavigate();
  const { success: showSuccess } = useToast();
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

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'active':
      case 'running':
        return {
          badge: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 dark:from-green-500/30 dark:to-emerald-500/30 border border-green-500/30',
          glow: 'shadow-green-500/20',
          icon: 'text-green-500',
          pulse: true
        };
      case 'idle':
        return {
          badge: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 dark:from-blue-500/30 dark:to-cyan-500/30 border border-blue-500/30',
          glow: 'shadow-blue-500/20',
          icon: 'text-blue-500',
          pulse: false
        };
      case 'harvesting':
        return {
          badge: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 dark:from-amber-500/30 dark:to-orange-500/30 border border-amber-500/30',
          glow: 'shadow-amber-500/20',
          icon: 'text-amber-500',
          pulse: true
        };
      case 'completed':
        return {
          badge: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 dark:from-purple-500/30 dark:to-pink-500/30 border border-purple-500/30',
          glow: 'shadow-purple-500/20',
          icon: 'text-purple-500',
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

  const getIcon = () => {
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
    switch (farm.type) {
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

  const handleViewFarm = () => {
    navigate(`/harvest/${farm.id}`);
  };

  const handleToggleStatus = () => {
    // Toggle between active and paused
    const currentStatus = farm.status || 'idle';
    showSuccess(currentStatus === 'active' ? 'Farm paused' : 'Farm resumed');
    setShowMenu(false);
  };

  const agentCount = getAgentCount(farm);
  const agents = getAgentsFromFarm(farm);
  const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'working').length;
  
  const statusColors = getStatusColor(farm.status);
  const completionRate = farm.metrics && farm.metrics.totalTasks > 0 
    ? Math.round((farm.metrics.completedTasks / farm.metrics.totalTasks) * 100)
    : farm.status === 'completed' ? 100 : farm.status === 'active' || farm.status === 'running' ? 45 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={clsx(
        "relative group cursor-pointer",
        className
      )}
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
          className={clsx(
            "absolute inset-0 rounded-2xl blur-xl",
            statusColors.glow
          )}
        />
      )}
      
      {/* Main Card */}
      <div
        className={clsx(
          "relative overflow-hidden rounded-2xl",
          "bg-gradient-to-br from-gray-900/90 to-gray-800/90 dark:from-gray-800/90 dark:to-gray-900/90",
          "backdrop-blur-xl border border-gray-700/50 dark:border-gray-600/50",
          "shadow-2xl hover:shadow-3xl transition-all duration-500",
          isHovered && "border-gray-600/70 dark:border-gray-500/70"
        )}
        onClick={handleViewFarm}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnits">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        
        <div className="relative p-6 z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <motion.div 
                className={clsx(
                  "p-3 rounded-xl bg-gradient-to-br",
                  "from-gray-700/50 to-gray-800/50",
                  "border border-gray-600/50",
                  "shadow-lg",
                  statusColors.icon
                )}
                animate={isHovered ? { rotate: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.5 }}
              >
                {getIcon()}
              </motion.div>
              <div>
                <h3 className="font-bold text-lg text-white">
                  {farm.name}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <p className="text-xs text-gray-500">
                    {farm.createdAt 
                      ? formatDistanceToNow(farm.createdAt instanceof Date ? farm.createdAt : new Date(farm.createdAt), { addSuffix: true })
                      : 'Just now'}
                  </p>
                </div>
              </div>
            </div>
          
            {/* Menu button */}
            <div className="relative">
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-gray-700/30 hover:bg-gray-700/50 transition-colors backdrop-blur-sm border border-gray-600/30"
              >
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </motion.button>
            
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 mt-2 w-48 bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-700/50 z-50 overflow-hidden"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus();
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-700/50 flex items-center space-x-2 text-gray-200 transition-colors"
                    >
                      {(farm.status === 'active' || farm.status === 'running') ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause Farm</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Resume Farm</span>
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>
        </div>

          {/* Description */}
          {farm.description && (
            <p className="text-sm text-gray-400 mb-4 line-clamp-2 leading-relaxed">
              {farm.description}
            </p>
          )}

          {/* Status and Metrics Row */}
          <div className="flex items-center justify-between mb-4">
            <motion.div
              animate={statusColors.pulse ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider",
                statusColors.badge,
                "backdrop-blur-sm"
              )}
            >
              <div className="flex items-center space-x-1.5">
                {statusColors.pulse && (
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-current"
                  />
                )}
                <span>{farm.status ? farm.status.charAt(0).toUpperCase() + farm.status.slice(1) : 'Idle'}</span>
              </div>
            </motion.div>
            
            {/* Metrics badges */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-gray-700/30 backdrop-blur-sm border border-gray-600/30">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-gray-300">{activeAgents}/{agentCount}</span>
              </div>
              
              {(farm.status === 'active' || farm.status === 'running') && (
                <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-gray-700/30 backdrop-blur-sm border border-gray-600/30">
                  <Activity className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs font-medium text-gray-300">Live</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Section */}
          <div className="mb-5">
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
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${statusColors.icon === 'text-green-500' ? '#10b981' : statusColors.icon === 'text-blue-500' ? '#3b82f6' : statusColors.icon === 'text-amber-500' ? '#f59e0b' : '#8b5cf6'} 0%, ${statusColors.icon === 'text-green-500' ? '#34d399' : statusColors.icon === 'text-blue-500' ? '#60a5fa' : statusColors.icon === 'text-amber-500' ? '#fbbf24' : '#a78bfa'} 100%)`
                }}
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
          
          {/* Additional Stats Grid */}
          {farm.metrics && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
                <div className="text-xs text-gray-500 mb-1">Tasks</div>
                <div className="text-sm font-bold text-gray-300">
                  {farm.metrics.completedTasks || 0}/{farm.metrics.totalTasks || 0}
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
                <div className="text-xs text-gray-500 mb-1">Efficiency</div>
                <div className="text-sm font-bold text-gray-300">
                  {farm.metrics.efficiency || 0}%
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-gray-700/20 backdrop-blur-sm border border-gray-600/20">
                <div className="text-xs text-gray-500 mb-1">CPU</div>
                <div className="text-sm font-bold text-gray-300">
                  {farm.metrics.resourceUtilization?.cpu || 0}%
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <motion.button
            onClick={handleViewFarm}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              "w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl",
              "bg-gradient-to-r",
              statusColors.icon === 'text-green-500' ? "from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600" :
              statusColors.icon === 'text-blue-500' ? "from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600" :
              statusColors.icon === 'text-amber-500' ? "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600" :
              statusColors.icon === 'text-purple-500' ? "from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600" :
              "from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800",
              "text-white font-bold shadow-lg",
              "transition-all duration-300",
              "group relative overflow-hidden"
            )}
          >
            {/* Button shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12"
              animate={isHovered ? {
                x: ['100%', '-100%']
              } : {}}
              transition={{
                duration: 0.75,
                ease: 'easeInOut'
              }}
            />
            <span className="relative flex items-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>View Details</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </motion.button>
          
          {/* Agent Avatars Row */}
          {agentCount > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex -space-x-2">
                {agents.slice(0, 5).map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 border-2 border-gray-800 flex items-center justify-center relative group"
                    style={{ zIndex: agents.length - index }}
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
        </div>
      </div>
    </motion.div>
  );
};