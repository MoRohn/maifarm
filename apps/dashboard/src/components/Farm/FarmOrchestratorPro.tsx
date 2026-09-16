
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Play,
  Pause,
  RotateCw,
  Trash2,
  Settings,
  Upload,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader,
  Activity,
  Layers,
  GitBranch,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

// NOTE: These project types are assumed to exist in your codebase, as in the originals.
import { Farm, FarmConfig } from '@/types';
import { FarmSetupProgress, FarmTemplate } from '@/types/orchestration';
import { useFarmOrchestration } from '@/hooks/useFarmOrchestration';
import FarmTemplateSelector from './FarmTemplateSelector';
import FarmStatusMonitor from './FarmStatusMonitor';
import AgentPoolManager from './AgentPoolManager';

/**
 * Combined & professionalized orchestrator:
 * - Merges creation flow + setup progress (FarmOrchestrator) with advanced card/grid UX (FarmOrchestratorAdvanced).
 * - Fixes bugs (bad map vars, interval leaks), improves typing, and adds robust cleanup.
 * - Exposes optional callbacks to override server actions.
 */

// ---------------------------------------------
// Small helpers
// ---------------------------------------------
function humanError(e: unknown): string {
  if (typeof e === 'string') return e;
  try {
    if (e && typeof e === 'object' && 'message' in (e as any)) {
      return String((e as any).message ?? 'Unknown error');
    }
  } catch {}
  return 'Unknown error';
}

// ---------------------------------------------
// Config Modal (from Advanced, cleaned and TS-safe)
// ---------------------------------------------
const FarmConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: FarmConfig) => void;
  initialConfig?: FarmConfig;
}> = ({ isOpen, onClose, onSave, initialConfig }) => {
  const [config, setConfig] = useState<FarmConfig>(
    initialConfig || {
      autoScale: true,
      maxAgents: 10,
      timeout: 300000,
      retryPolicy: {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2,
      },
    }
  );

  useEffect(() => {
    if (initialConfig) setConfig(initialConfig);
  }, [initialConfig]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Farm Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Agents
              </label>
              <input
                type="number"
                value={config.maxAgents}
                onChange={(e) => setConfig({ ...config, maxAgents: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Timeout (ms)
              </label>
              <input
                type="number"
                value={config.timeout}
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto Scale
              </label>
              <button
                type="button"
                onClick={() => setConfig({ ...config, autoScale: !config.autoScale })}
                className={clsx(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  config.autoScale ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    config.autoScale ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="pt-4 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(config);
                  onClose();
                }}
                className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ---------------------------------------------
// Card (from Advanced, cleaned and TS-safe)
// ---------------------------------------------
const FarmOrchestratorCard: React.FC<{
  farm: Farm;
  onStart: () => void;
  onPause: () => void;
  onRestart: () => void;
  onDelete: () => void;
  onConfigure: () => void;
  onExport: () => void;
  onClone: () => void;
}> = ({ farm, onStart, onPause, onRestart, onDelete, onConfigure, onExport, onClone }) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusColors: Record<Farm['status'], string> = {
    idle: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    launching: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    harvesting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    terminated: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  };

  const typeIcons: Record<NonNullable<Farm['type']>, React.ComponentType<{ className?: string }>> = {
    sequential: Layers,
    collaborative: GitBranch,
    autonomous: Zap,
  };
  const TypeIcon = farm.type ? typeIcons[farm.type] : Activity;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple hover:shadow-apple-lg transition-all duration-300 border border-gray-200 dark:border-gray-800"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <TypeIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {farm.name}
              </h4>
              <span
                className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  statusColors[farm.status]
                )}
              >
                {farm.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{farm.description}</p>
          </div>
          <div className="flex items-center space-x-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onConfigure}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Configure farm"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onExport}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Export configuration"
            >
              <Download className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClone}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clone farm"
            >
              <Copy className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.agents.length}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Agents</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.config.maxAgents}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Max Agents</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.config.autoScale ? 'On' : 'Off'}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Auto Scale</div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-2">
            {farm.status === 'active' ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onPause}
                className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-apple transition-colors"
                aria-label="Pause farm"
              >
                <Pause className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStart}
                className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
                aria-label="Start farm"
              >
                <Play className="w-4 h-4" />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRestart}
              className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-apple transition-colors"
              aria-label="Restart farm"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onDelete}
              className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-apple transition-colors"
              aria-label="Delete farm"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            {showDetails ? 'Hide' : 'View'} Details
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Created</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {format(farm.createdAt, 'PPp')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-sm text-gray-900 dark:text-white capitalize">{farm.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Auto Scale</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {farm.config.autoScale ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Timeout</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {(farm.config.timeout || 0) / 1000}s
                  </dd>
                </div>
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ---------------------------------------------
// Props for the combined component
// ---------------------------------------------
export interface FarmOrchestratorProProps {
  onFarmCreated?: (farmId: string) => void;
  onCreateFarmConfig?: (config: FarmConfig) => Promise<void> | void;
  onUpdateFarmConfig?: (farmId: string, config: Partial<FarmConfig>) => Promise<void> | void;
  onDeleteFarm?: (farmId: string) => Promise<void> | void;
  onStartFarm?: (farmId: string) => Promise<void> | void;
  onPauseFarm?: (farmId: string) => Promise<void> | void;
  onRestartFarm?: (farmId: string) => Promise<void> | void;
  onExportConfig?: (farmId: string) => Promise<void> | void;
  onImportConfig?: (configText: string) => Promise<void> | void;
  className?: string;
}

// ---------------------------------------------
// Main combined component
// ---------------------------------------------
const FarmOrchestratorPro: React.FC<FarmOrchestratorProProps> = ({
  onFarmCreated,
  onCreateFarmConfig,
  onUpdateFarmConfig,
  onDeleteFarm,
  onStartFarm,
  onPauseFarm,
  onRestartFarm,
  onExportConfig,
  onImportConfig,
  className = '',
}) => {
  const {
    templates,
    farms,
    createFarm,
    getSetupProgress,
    loading,
    error,
    // Optionally, your hook might also expose server actions below; if so, use them instead of defaults.
  } = useFarmOrchestration();

  const [selectedTemplate, setSelectedTemplate] = useState<FarmTemplate | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmDescription, setFarmDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [setupProgress, setSetupProgress] = useState<FarmSetupProgress | null>(null);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);

  // Polling management
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, []);

  // When setup completes, transition to active farm view
  useEffect(() => {
    if (setupProgress && setupProgress.status === 'ready') {
      setIsCreating(false);
      setActiveFarmId(setupProgress.farmId);
      onFarmCreated?.(setupProgress.farmId);
      setSetupProgress(null);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [setupProgress, onFarmCreated]);

  // ---------------------------------------------
  // Server action defaults (used if no props provided)
  // ---------------------------------------------
  const doStart = useCallback(async (farmId: string) => {
    if (onStartFarm) return onStartFarm(farmId);
    try { await fetch(`/api/farms/${encodeURIComponent(farmId)}/start`, { method: 'POST' }); } catch {}
  }, [onStartFarm]);

  const doPause = useCallback(async (farmId: string) => {
    if (onPauseFarm) return onPauseFarm(farmId);
    try { await fetch(`/api/farms/${encodeURIComponent(farmId)}/pause`, { method: 'POST' }); } catch {}
  }, [onPauseFarm]);

  const doRestart = useCallback(async (farmId: string) => {
    if (onRestartFarm) return onRestartFarm(farmId);
    try { await fetch(`/api/farms/${encodeURIComponent(farmId)}/restart`, { method: 'POST' }); } catch {}
  }, [onRestartFarm]);

  const doDelete = useCallback(async (farmId: string) => {
    if (onDeleteFarm) return onDeleteFarm(farmId);
    try { await fetch(`/api/farms/${encodeURIComponent(farmId)}`, { method: 'DELETE' }); } catch {}
  }, [onDeleteFarm]);

  const doExport = useCallback(async (farmId: string) => {
    if (onExportConfig) return onExportConfig(farmId);
    try {
      const r = await fetch(`/api/farms/${encodeURIComponent(farmId)}/export`);
      const data = await r.text();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `farm_${farmId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, [onExportConfig]);

  const doImport = useCallback(async (text: string) => {
    if (onImportConfig) return onImportConfig(text);
    // Default: try to post to server for import
    try { await fetch('/api/farms/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text }); } catch {}
  }, [onImportConfig]);

  const doCreateFromConfig = useCallback(async (config: FarmConfig) => {
    if (onCreateFarmConfig) return onCreateFarmConfig(config);
    // Fallback: simple POST; adapt as needed
    try { await fetch('/api/farms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); } catch {}
  }, [onCreateFarmConfig]);

  const doUpdateConfig = useCallback(async (farmId: string, config: Partial<FarmConfig>) => {
    if (onUpdateFarmConfig) return onUpdateFarmConfig(farmId, config);
    try { await fetch(`/api/farms/${encodeURIComponent(farmId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); } catch {}
  }, [onUpdateFarmConfig]);

  // ---------------------------------------------
  // Create Farm flow (from simple orchestrator, fixed)
  // ---------------------------------------------
  const handleCreateFarm = useCallback(async () => {
    if (!farmName.trim()) {
      // Prefer inline UI feedback to alert()
      // eslint-disable-next-line no-alert
      alert('Please enter a farm name');
      return;
    }

    setIsCreating(true);
    try {
      const progress = await createFarm({
        name: farmName.trim(),
        description: farmDescription.trim(),
        templateId: selectedTemplate?.id,
        autoStart: true,
      });
      setSetupProgress(progress);

      // Start polling
      if (pollRef.current) window.clearInterval(pollRef.current);
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        try {
          const updated = await getSetupProgress(progress.farmId);
          if (updated) {
            setSetupProgress(updated);
            if (updated.status === 'ready' || updated.status === 'failed') {
              if (pollRef.current) window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
          // Hard stop after 5 minutes
          if (Date.now() - startedAt > 5 * 60 * 1000) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch (e) {
          // Stop on error to avoid runaway loops
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          console.error('Polling error:', e);
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to create farm:', err);
      setIsCreating(false);
    }
  }, [createFarm, farmDescription, farmName, getSetupProgress, selectedTemplate]);

  // ---------------------------------------------
  // UI Renderers
  // ---------------------------------------------
  const renderSetupProgress = useCallback(() => {
    if (!setupProgress) return null;

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'completed':
          return <CheckCircle className="h-5 w-5 text-green-500" />;
        case 'active':
          return <Loader className="h-5 w-5 text-blue-500 animate-spin" />;
        case 'failed':
          return <AlertCircle className="h-5 w-5 text-red-500" />;
        default:
          return <div className="h-5 w-5 rounded-full bg-gray-300" />;
      }
    };

    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Farm Setup Progress</h3>

        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
            <span>{setupProgress.currentStep}</span>
            <span>{Math.round(setupProgress.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${setupProgress.progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {setupProgress.steps.map((step, index) => (
            <div key={index} className="flex items-center space-x-3">
              {getStatusIcon(step.status)}
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{step.name}</span>
                  {step.status === 'active' && (
                    <span className="text-xs text-gray-500">{step.progress}%</span>
                  )}
                </div>
                {step.error && <p className="text-xs text-red-500 mt-1">{step.error}</p>}
              </div>
            </div>
          ))}
        </div>

        {setupProgress.status === 'failed' && setupProgress.error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300">{setupProgress.error}</p>
          </div>
        )}
      </div>
    );
  }, [setupProgress]);

  const renderFarmCreation = useCallback(() => {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Create New Farm</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Farm Name
              </label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="My AI Farm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={farmDescription}
                onChange={(e) => setFarmDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                rows={3}
                placeholder="Describe your farm's purpose..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Farm Template
              </label>
              <FarmTemplateSelector
                templates={templates}
                selectedTemplate={selectedTemplate}
                onSelectTemplate={setSelectedTemplate}
              />
            </div>

            <button
              onClick={handleCreateFarm}
              disabled={isCreating || !farmName.trim()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Creating Farm...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Create Farm</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }, [farmName, farmDescription, handleCreateFarm, isCreating, selectedTemplate, templates]);

  const renderActiveFarm = useCallback(() => {
    if (!activeFarmId) return null;
    const farm = farms.find((f) => f.id === activeFarmId);
    if (!farm) return null;

    return (
      <div className="space-y-6">
        <FarmStatusMonitor farm={farm} />
        <AgentPoolManager farm={farm} />
      </div>
    );
  }, [activeFarmId, farms]);

  // ---------------------------------------------
  // Top toolbar (import & new farm)
  // ---------------------------------------------
  const Toolbar = useMemo(() => {
    return (
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Farm Orchestrator</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage your AI farm ecosystem with advanced orchestration
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json,.yaml,.yml';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const txt = (ev.target?.result as string) || '';
                    await doImport(txt);
                  };
                  reader.readAsText(file);
                }
              };
              input.click();
            }}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-apple hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            aria-label="Import farm configuration"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowConfigModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
            aria-label="New farm"
          >
            <Plus className="w-4 h-4" />
            <span>New Farm</span>
          </motion.button>
        </div>
      </div>
    );
  }, [doImport]);

  // ---------------------------------------------
  // Filter & grid
  // ---------------------------------------------
  const [filter, setFilter] = useState<'all' | Farm['status']>('all');
  const filteredFarms = useMemo(
    () => (filter === 'all' ? farms : farms.filter((f) => f.status === filter)),
    [filter, farms]
  );

  const filters = useMemo(
    () => [
      { key: 'all', label: 'All Farms', count: farms.length },
      { key: 'active', label: 'Active', count: farms.filter((f) => f.status === 'active').length },
      { key: 'paused', label: 'Paused', count: farms.filter((f) => f.status === 'paused').length },
      { key: 'completed', label: 'Completed', count: farms.filter((f) => f.status === 'completed').length },
      { key: 'failed', label: 'Failed', count: farms.filter((f) => f.status === 'failed').length },
    ],
    [farms]
  );

  // ---------------------------------------------
  // Render
  // ---------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('max-w-6xl mx-auto space-y-6', className)}>
      {/* Creation flow / progress */}
      {isCreating && setupProgress ? renderSetupProgress() : activeFarmId ? renderActiveFarm() : renderFarmCreation()}

      {/* Grid management */}
      {Toolbar}
      <div className="flex items-center space-x-2">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={clsx(
              'px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
              filter === (key as any)
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            )}
          >
            {label}
            {count > 0 && <span className="ml-1.5 text-xs">({count})</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredFarms.map((farm) => (
            <FarmOrchestratorCard
              key={farm.id}
              farm={farm}
              onStart={() => doStart(farm.id)}
              onPause={() => doPause(farm.id)}
              onRestart={() => doRestart(farm.id)}
              onDelete={() => doDelete(farm.id)}
              onConfigure={() => {
                setSelectedFarm(farm);
                setShowConfigModal(true);
              }}
              onExport={() => doExport(farm.id)}
              onClone={() => {
                const clonedConfig = { ...farm.config };
                doCreateFromConfig(clonedConfig);
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredFarms.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No farms found matching the current filter</p>
        </motion.div>
      )}

      {/* Config modal */}
      <FarmConfigModal
        isOpen={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setSelectedFarm(null);
        }}
        onSave={(config) => {
          if (selectedFarm) {
            doUpdateConfig(selectedFarm.id, config);
          } else {
            doCreateFromConfig(config);
          }
        }}
        initialConfig={selectedFarm?.config}
      />
    </div>
  );
};

export default FarmOrchestratorPro;
