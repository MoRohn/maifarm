/**
 * HarvestViewContent - Main content area for HarvestPage
 * Handles the view mode switching between workflow, terminal, and dashboard
 */

import React, { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Agent } from '@/types/agent';

// Lazy load heavy components for better performance
const HarvestTerminal = lazy(() => import('./HarvestTerminal'));
const HarvestWorkflow = lazy(() => import('./HarvestWorkflow'));
const HarvestDashboard = lazy(() => import('./HarvestDashboard'));

interface HarvestViewContentProps {
  viewMode: 'workflow' | 'terminal' | 'dashboard';
  farm: any;
  farmId: string;
  agents: Agent[];
  terminalContent: Record<number, string[]>;
  terminalSessions: any[];
  fetchTerminalContent: (farmId: string, agentId: number) => Promise<void>;
  harvestSessionId?: string;
  harvest?: any;
  isQuickTask?: boolean;
  coordinationAgents?: any[];
  artifacts?: any[];
  loadingArtifacts?: boolean;
  terminalViewMode?: 'grid' | 'stacked' | 'single';
  selectedAgent?: number | null;
  setTerminalViewMode?: (mode: 'grid' | 'stacked' | 'single') => void;
  setSelectedAgent?: (agentId: number | null) => void;
  theme?: string;
}

// Loading component for lazy loaded views
const ViewLoader: React.FC<{ viewName: string }> = ({ viewName }) => (
  <div className="flex items-center justify-center min-h-[400px]">
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4"
    >
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Loading {viewName}...
      </p>
    </motion.div>
  </div>
);

export const HarvestViewContent: React.FC<HarvestViewContentProps> = ({
  viewMode,
  farm,
  farmId,
  agents,
  terminalContent,
  terminalSessions,
  fetchTerminalContent,
  harvestSessionId,
  harvest,
  isQuickTask,
  coordinationAgents,
  artifacts,
  loadingArtifacts,
  terminalViewMode = 'grid',
  selectedAgent = null,
  setTerminalViewMode,
  setSelectedAgent,
  theme = 'matrix'
}) => {
  // Check if we should show workflow or terminal by default
  const shouldShowTerminal = farm?.status === 'running' ||
                            farm?.status === 'active' ||
                            farm?.status === 'harvesting';

  // Override view mode for certain farm statuses
  const effectiveViewMode = React.useMemo(() => {
    if (viewMode === 'workflow' && shouldShowTerminal && agents.length > 0) {
      // If workflow is selected but farm is running, show terminal instead
      return 'terminal';
    }
    return viewMode;
  }, [viewMode, shouldShowTerminal, agents.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex-1 bg-gray-50 dark:bg-gray-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <Suspense fallback={<ViewLoader viewName={effectiveViewMode} />}>
            {effectiveViewMode === 'terminal' && (
              <motion.div
                key="terminal"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <HarvestTerminal
                  farmId={farmId}
                  farm={farm}
                  agents={agents}
                  terminalContent={terminalContent}
                  terminalSessions={terminalSessions}
                  harvestSessionId={harvestSessionId}
                  fetchTerminalContent={fetchTerminalContent}
                  terminalViewMode={terminalViewMode}
                  selectedAgent={selectedAgent}
                  setTerminalViewMode={setTerminalViewMode}
                  setSelectedAgent={setSelectedAgent}
                  theme={theme}
                />
              </motion.div>
            )}

            {effectiveViewMode === 'workflow' && (
              <motion.div
                key="workflow"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <HarvestWorkflow
                  farmId={farmId}
                  agents={agents}
                  isQuickTask={isQuickTask}
                  coordinationAgents={coordinationAgents}
                />
              </motion.div>
            )}

            {effectiveViewMode === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <HarvestDashboard
                  harvest={harvest}
                  artifacts={artifacts}
                  loadingArtifacts={loadingArtifacts}
                />
              </motion.div>
            )}
          </Suspense>
        </AnimatePresence>

        {/* Empty State */}
        {!shouldShowTerminal && agents.length === 0 && effectiveViewMode === 'terminal' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Terminal Output Yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Terminal output will appear here once the farm starts running.
            </p>
          </motion.div>
        )}

        {/* Status Messages */}
        {farm?.status === 'preparing' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-blue-700 dark:text-blue-300">
                Preparing farm environment...
              </p>
            </div>
          </motion.div>
        )}

        {farm?.status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4"
          >
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700 dark:text-red-300">
                Farm failed to start. Please check the logs for more information.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};