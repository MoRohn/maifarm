/**
 * HarvestHeader - Extracted header component for HarvestPage
 * Handles the top navigation bar with farm info, view mode toggle, and status
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  Command,
  Monitor,
  Cpu,
  Users,
  Layers,
  LayoutDashboard
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { cn } from '@/styles/premium-design-system';

interface HarvestHeaderProps {
  farm: any;
  activeAgentCount: number;
  timeElapsed: string;
  isRunning: boolean;
  isQuickTask: boolean;
  viewMode: 'workflow' | 'terminal' | 'dashboard';
  setViewMode: (mode: 'workflow' | 'terminal' | 'dashboard') => void;
  activeFarms: any[];
  selectedFarmId?: string;
  farmId?: string;
  setSelectedFarmId: (id: string) => void;
}

export const HarvestHeader: React.FC<HarvestHeaderProps> = ({
  farm,
  activeAgentCount,
  timeElapsed,
  isRunning,
  isQuickTask,
  viewMode,
  setViewMode,
  activeFarms,
  selectedFarmId,
  farmId,
  setSelectedFarmId
}) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="sticky top-16 z-40 backdrop-blur-2xl bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 overflow-hidden">
        <div className="flex items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            {/* Premium Back Button with Glass Effect */}
            <Tooltip content="Back to Dashboard" position="bottom">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/dashboard')}
                className="p-2.5 backdrop-blur-xl bg-gray-50/80 hover:bg-gray-50/90 dark:bg-gray-800/80 dark:hover:bg-gray-800/90 rounded-2xl transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl"
                aria-label="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </motion.button>
            </Tooltip>

            {/* Professional Farm Info with Glass */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                className="relative flex-shrink-0"
              >
                <div className="p-2.5 sm:p-3 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <Command className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" />
                </div>
                {/* Status dot */}
                <div className={cn(
                  'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white dark:border-gray-900 shadow-lg',
                  farm.status === 'active' || farm.status === 'running' ? 'bg-emerald-500' :
                  farm.status === 'harvesting' ? 'bg-blue-500' :
                  farm.status === 'completed' ? 'bg-gray-400' :
                  'bg-amber-500',
                  (farm.status === 'active' || farm.status === 'running') && 'animate-pulse'
                )} />
              </motion.div>

              <div className="min-w-0 flex-1">
                <motion.h1
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white tracking-tight truncate"
                >
                  {farm.name}
                </motion.h1>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap"
                >
                  {/* Professional Metadata */}
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {farm.config?.orchestratorType === 'xenosync' ? 'XenoSync' : 'MaiFarmer'}
                    </span>
                  </div>

                  {activeAgentCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {activeAgentCount} Agents
                      </span>
                    </div>
                  )}
                  {(isRunning || timeElapsed) && (
                    <>
                      <div className="flex items-center space-x-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        <Clock className={`w-3.5 h-3.5 ${!isRunning ? 'text-green-600' : ''}`} />
                        <span className="font-mono font-medium">
                          {timeElapsed}
                          {!isRunning && farm?.status === 'completed' && (
                            <span className="text-green-600 ml-1">(Final)</span>
                          )}
                          {isRunning && farm?.config?.timeout && farm.config.timeout > 0 && (
                            <span className="text-gray-500 dark:text-gray-500">
                              {' / '}
                              {(() => {
                                // Quick Tasks have timeout in milliseconds, regular farms in seconds
                                const isQuick = isQuickTask || farm.metadata?.isQuickTask || farm.config?.quickTask;
                                const timeoutValue = isQuick
                                  ? Math.floor(farm.config.timeout / 1000) // Convert ms to seconds for Quick Tasks
                                  : farm.config.timeout; // Regular farms already in seconds

                                if (timeoutValue < 60) {
                                  return `${timeoutValue}s`;
                                } else if (timeoutValue < 3600) {
                                  return `${Math.floor(timeoutValue / 60)}m`;
                                } else if (timeoutValue === 3600) {
                                  return '1hr';
                                } else if (timeoutValue < 86400) {
                                  return `${Math.floor(timeoutValue / 3600)}hr`;
                                } else {
                                  return `${Math.floor(timeoutValue / 86400)}d`;
                                }
                              })()}
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            </div>

          </div>

          {/* Farm Selector - Hidden on small screens, shown on lg+ */}
          {activeFarms.length > 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="relative hidden lg:block flex-shrink-0"
            >
              <select
                value={selectedFarmId || farmId}
                onChange={(e) => {
                  setSelectedFarmId(e.target.value);
                  navigate(`/harvest/${e.target.value}`);
                }}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-sm hover:shadow-md appearance-none pr-8 max-w-[200px] truncate"
              >
                {activeFarms.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.status})
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </motion.div>
          )}

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Professional View Mode Toggle with Glass Effect */}
            <div className="flex items-center backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <Tooltip content="Terminal output" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setViewMode('terminal')}
                  className={cn(
                    'px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 flex items-center gap-1.5 sm:gap-2',
                    viewMode === 'terminal'
                      ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Terminal</span>
                </motion.button>
              </Tooltip>

              <Tooltip content="Workflow visualization" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setViewMode('workflow')}
                  className={cn(
                    'px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 flex items-center gap-1.5 sm:gap-2',
                    viewMode === 'workflow'
                      ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Workflow</span>
                </motion.button>
              </Tooltip>

              <Tooltip content="Harvest results" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setViewMode('dashboard')}
                  className={cn(
                    'px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-300 flex items-center gap-1.5 sm:gap-2',
                    viewMode === 'dashboard'
                      ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Dashboard</span>
                </motion.button>
              </Tooltip>
            </div>


            {/* Status badge with Apple glass styling */}
            <motion.div
              className={cn(
                'px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center backdrop-blur-xl border shadow-lg',
                farm.status === 'active' || farm.status === 'running'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 border-emerald-500/30' :
                farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching'
                  ? 'bg-amber-500/20 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400 border-amber-500/30' :
                farm.status === 'harvesting'
                  ? 'bg-blue-500/20 text-blue-700 dark:bg-blue-500/30 dark:text-blue-400 border-blue-500/30' :
                farm.status === 'completed'
                  ? 'bg-gray-500/20 text-gray-700 dark:bg-gray-500/30 dark:text-gray-400 border-gray-500/30' :
                  'bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-400 border-red-500/30'
              )}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <motion.div
                  className={cn(
                    'w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full',
                    farm.status === 'active' || farm.status === 'running' ? 'bg-green-500' :
                    farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching' ? 'bg-amber-500' :
                    farm.status === 'harvesting' ? 'bg-blue-500' :
                    farm.status === 'completed' ? 'bg-gray-500' :
                    'bg-red-500'
                  )}
                  animate={
                    (farm.status === 'active' || farm.status === 'running')
                      ? { opacity: [1, 0.5, 1] }
                      : {}
                  }
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="capitalize font-medium">{farm.status}</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 dark:to-gray-900/30 pointer-events-none" />
    </motion.div>
  );
};