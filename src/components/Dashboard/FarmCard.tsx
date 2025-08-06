import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MoreVertical, 
  Pause, 
  Play, 
  RotateCw,
  Users,
  Activity,
  Clock,
  ChevronRight,
  Terminal,
  Package,
  Rocket,
  Bot,
  Cpu,
  StopCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { ClaudeCodeIntegration } from '../Farm/ClaudeCodeIntegration';
import { useHarvestStore } from '../../store/harvestStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { AIProviderStatus } from '../common/AIProviderStatus';
import { Tooltip } from '../ui/tooltip';

interface FarmCardProps {
  farm: Farm;
  className?: string;
}

export const FarmCard: React.FC<FarmCardProps> = ({ farm: rawFarm, className }) => {
  // Ensure farm has required properties
  if (!rawFarm || typeof rawFarm !== 'object') {
    console.error('FarmCard: Invalid farm prop', rawFarm);
    return null;
  }
  
  // Normalize farm data to ensure it has all required properties
  const farm = {
    ...rawFarm,
    agents: Array.isArray(rawFarm.agents) ? rawFarm.agents : [],
    status: rawFarm.status || 'unknown',
    metrics: {
      ...rawFarm.metrics,
      totalTasks: rawFarm.metrics?.totalTasks ?? 0,
      completedTasks: rawFarm.metrics?.completedTasks ?? 0,
      failedTasks: rawFarm.metrics?.failedTasks ?? 0,
      efficiency: rawFarm.metrics?.efficiency ?? 0
    }
  };
  
  const [showClaudeCode, setShowClaudeCode] = useState(false);
  const [isCreatingHarvest, setIsCreatingHarvest] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const navigate = useNavigate();
  const { createHarvest } = useHarvestStore();
  const { success: showSuccess, error: showError } = useToast();
  
  const handleCreateHarvest = async () => {
    setIsCreatingHarvest(true);
    try {
      const harvest = await createHarvest(farm.id, farm.name);
      if (harvest) {
        // Navigate to harvest view
        navigate(`/harvests/${harvest.id}`);
      }
    } catch (error) {
      console.error('Failed to create harvest:', error);
    } finally {
      setIsCreatingHarvest(false);
    }
  };

  const handleLaunchFarm = async () => {
    setIsLaunching(true);
    try {
      const response = await fetch(`/api/farms/${farm.id}/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          numberOfAgents: farm.config?.maxAgents || 3,
          collaborative: farm.config?.collaborative || false
        })
      });

      if (response.ok) {
        showSuccess('Farm launched successfully');
        // Navigate to harvest view to see terminals
        navigate(`/harvests/${farm.id}`);
      } else {
        throw new Error('Failed to launch farm');
      }
    } catch (error) {
      console.error('Failed to launch farm:', error);
      showError('Failed to launch farm');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStopFarm = async () => {
    try {
      const response = await fetch(`/api/farms/${farm.id}/stop`, {
        method: 'POST'
      });

      if (response.ok) {
        showSuccess('Farm stopped');
        // Refresh farm data
        window.location.reload();
      } else {
        throw new Error('Failed to stop farm');
      }
    } catch (error) {
      console.error('Failed to stop farm:', error);
      showError('Failed to stop farm');
    }
  };

  const handlePauseFarm = async () => {
    try {
      const response = await fetch(`/api/farms/${farm.id}/pause`, {
        method: 'POST'
      });

      if (response.ok) {
        showSuccess('Farm paused');
        // Refresh farm data
        window.location.reload();
      } else {
        throw new Error('Failed to pause farm');
      }
    } catch (error) {
      console.error('Failed to pause farm:', error);
      showError('Failed to pause farm');
    }
  };

  const handleResumeFarm = async () => {
    try {
      const response = await fetch(`/api/farms/${farm.id}/resume`, {
        method: 'POST'
      });

      if (response.ok) {
        showSuccess('Farm resumed');
        // Refresh farm data
        window.location.reload();
      } else {
        throw new Error('Failed to resume farm');
      }
    } catch (error) {
      console.error('Failed to resume farm:', error);
      showError('Failed to resume farm');
    }
  };

  const handleRestartFarm = async () => {
    try {
      // First stop the farm
      const stopResponse = await fetch(`/api/farms/${farm.id}/stop`, {
        method: 'POST'
      });

      if (!stopResponse.ok) {
        throw new Error('Failed to stop farm');
      }

      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Then launch it again
      const launchResponse = await fetch(`/api/farms/${farm.id}/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          numberOfAgents: farm.config?.maxAgents || 3,
          collaborative: farm.config?.collaborative || false
        })
      });

      if (launchResponse.ok) {
        showSuccess('Farm restarted successfully');
        // Navigate to harvest view
        navigate(`/harvests/${farm.id}`);
      } else {
        throw new Error('Failed to restart farm');
      }
    } catch (error) {
      console.error('Failed to restart farm:', error);
      showError('Failed to restart farm');
    }
  };

  const handleViewDetails = () => {
    // Navigate to the farm's harvest page
    navigate(`/harvests/${farm.id}`);
  };
  
  const statusColors = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    launching: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  } as const;

  const progressPercentage = farm.metrics.totalTasks > 0
    ? (farm.metrics.completedTasks / farm.metrics.totalTasks) * 100
    : 0;

  const isLaunchingStatus = farm.status === 'launching';

  return (
    <motion.div
      whileHover={!isLaunchingStatus ? { y: -4 } : {}}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple hover:shadow-apple-lg transition-all duration-300',
        'border border-gray-200 dark:border-gray-800',
        isLaunchingStatus && 'opacity-75 cursor-not-allowed',
        className
      )}
    >
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {farm.name}
            </h4>
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{(farm.agents || []).length} agents</span>
              </span>
              <span className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{farm.createdAt ? formatDistanceToNow(new Date(farm.createdAt), { addSuffix: true }) : 'Unknown'}</span>
              </span>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <MoreVertical className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Status Badge and Provider */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className={clsx(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              statusColors[farm.status]
            )}>
              {farm.status ? farm.status.charAt(0).toUpperCase() + farm.status.slice(1) : 'Unknown'}
            </span>
            {farm.provider && (
              <AIProviderStatus 
                provider={farm.provider} 
                status="active"
                size="sm"
                showLabel={false}
              />
            )}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {farm.metrics.efficiency || 0}% efficiency
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {Math.round(progressPercentage)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
            />
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.completedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.totalTasks - farm.metrics.completedTasks - farm.metrics.failedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.failedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
          </div>
        </div>

        {/* Active Agents Preview */}
        <div className="space-y-2">
          {farm.agents.slice(0, 2).map((agent) => (
            <div
              key={`agent-${farm.id}-${agent.id}`}
              className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-apple"
            >
              <div className="flex items-center space-x-2">
                <div className={clsx(
                  'w-2 h-2 rounded-full',
                  agent.status === 'working' ? 'bg-green-500' : 
                  agent.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                )} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {agent.name}
                </span>
              </div>
              {agent.currentTask && (
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                  {agent.currentTask}
                </span>
              )}
            </div>
          ))}
          {farm.agents.length > 2 && (
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
              +{farm.agents.length - 2} more agents
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800 rounded-b-apple-lg">
        {isLaunchingStatus ? (
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center space-x-2 text-yellow-600 dark:text-yellow-400">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Rocket className="w-5 h-5" />
              </motion.div>
              <span className="text-sm font-medium">Farm is launching...</span>
            </div>
          </div>
        ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!farm.config?.processId ? (
              <Tooltip content="Launch a new farm with AI agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLaunchFarm}
                  disabled={isLaunching}
                  className={clsx(
                    "p-2 rounded-apple transition-colors",
                    isLaunching
                      ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                      : "text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                  )}
                >
                  <Rocket className="w-4 h-4" />
                </motion.button>
              </Tooltip>
            ) : (farm.status === 'active' || farm.status === 'running') ? (
              <>
                <Tooltip content="Pause all agents in this farm">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handlePauseFarm}
                    className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-apple transition-colors"
                  >
                    <Pause className="w-4 h-4" />
                  </motion.button>
                </Tooltip>
                <Tooltip content="Stop and terminate this farm">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStopFarm}
                    className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-apple transition-colors"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                </Tooltip>
              </>
            ) : farm.status === 'paused' ? (
              <Tooltip content="Resume paused agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleResumeFarm}
                  className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
                >
                  <Play className="w-4 h-4" />
                </motion.button>
              </Tooltip>
            ) : (
              <Tooltip content="Start this farm">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLaunchFarm}
                  className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
                >
                  <Play className="w-4 h-4" />
                </motion.button>
              </Tooltip>
            )}
            <Tooltip content="Restart farm with fresh agents">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRestartFarm}
                className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-apple transition-colors"
              >
                <RotateCw className="w-4 h-4" />
              </motion.button>
            </Tooltip>
            <Tooltip content="Open Claude Code terminal integration">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowClaudeCode(true)}
                className="p-2 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-apple transition-colors"
              >
                <Terminal className="w-4 h-4" />
              </motion.button>
            </Tooltip>
            {farm.status === 'completed' && (
              <Tooltip content="Collect outputs from completed tasks">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreateHarvest}
                  disabled={isCreatingHarvest}
                  className={clsx(
                    "p-2 rounded-apple transition-colors",
                    isCreatingHarvest 
                      ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                      : "text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30"
                  )}
                >
                  <Package className="w-4 h-4" />
                </motion.button>
              </Tooltip>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleViewDetails}
            className="flex items-center space-x-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <span>View Details</span>
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
        )}
      </div>
      
      {/* Claude Code Integration Modal */}
      {showClaudeCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <ClaudeCodeIntegration 
                farm={farm} 
                onClose={() => setShowClaudeCode(false)} 
              />
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};