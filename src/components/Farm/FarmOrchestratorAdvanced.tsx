import React, { useState } from 'react';
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
  Clock,
  Zap,
  Layers,
  GitBranch
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm, FarmConfig } from '../../types';
import { format } from 'date-fns';

interface FarmOrchestratorAdvancedProps {
  farms: Farm[];
  onCreateFarm: (config: FarmConfig) => void;
  onUpdateFarm: (farmId: string, config: Partial<FarmConfig>) => void;
  onDeleteFarm: (farmId: string) => void;
  onStartFarm: (farmId: string) => void;
  onPauseFarm: (farmId: string) => void;
  onRestartFarm: (farmId: string) => void;
  onExportConfig: (farmId: string) => void;
  onImportConfig: (config: string) => void;
  className?: string;
}

const FarmConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: FarmConfig) => void;
  initialConfig?: FarmConfig;
}> = ({ isOpen, onClose, onSave, initialConfig }) => {
  const [config, setConfig] = useState<FarmConfig>(initialConfig || {
    autoScale: true,
    maxAgents: 10,
    timeout: 300000,
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      backoffMultiplier: 2,
    },
  });

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
                onChange={(e) => setConfig({ ...config, maxAgents: parseInt(e.target.value) })}
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
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto Scale
              </label>
              <button
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
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
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

  const statusColors = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const typeIcons = {
    sequential: Layers,
    collaborative: GitBranch,
    autonomous: Zap,
  };

  const TypeIcon = typeIcons[farm.type];

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
              <span className={clsx(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                statusColors[farm.status as keyof typeof statusColors]
              )}>
                {farm.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {farm.description}
            </p>
          </div>
          <div className="flex items-center space-x-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onConfigure}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onExport}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Download className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClone}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
              >
                <Pause className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStart}
                className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
              >
                <Play className="w-4 h-4" />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRestart}
              className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-apple transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onDelete}
              className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-apple transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
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
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Retry Policy</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {farm.config.retryPolicy.enabled ? 'Enabled' : 'Disabled'}
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

export const FarmOrchestratorAdvanced: React.FC<FarmOrchestratorAdvancedProps> = ({
  farms,
  onCreateFarm,
  onUpdateFarm,
  onDeleteFarm,
  onStartFarm,
  onPauseFarm,
  onRestartFarm,
  onExportConfig,
  onImportConfig,
  className,
}) => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [filter, setFilter] = useState<'all' | Farm['status']>('all');

  const filteredFarms = filter === 'all' 
    ? farms 
    : farms.filter(farm => farm.status === filter);

  const filters = [
    { key: 'all', label: 'All Farms', count: farms.length },
    { key: 'active', label: 'Active', count: farms.filter(f => f.status === 'active').length },
    { key: 'paused', label: 'Paused', count: farms.filter(f => f.status === 'paused').length },
    { key: 'completed', label: 'Completed', count: farms.filter(f => f.status === 'completed').length },
    { key: 'failed', label: 'Failed', count: farms.filter(f => f.status === 'failed').length },
  ];

  return (
    <div className={clsx('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Farm Orchestrator
          </h3>
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
                  reader.onload = (e) => {
                    onImportConfig(e.target?.result as string);
                  };
                  reader.readAsText(file);
                }
              };
              input.click();
            }}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-apple hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowConfigModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Farm</span>
          </motion.button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={clsx(
              'px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
              filter === key
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            )}
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 text-xs">({count})</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredFarms.map(farm => (
            <FarmOrchestratorCard
              key={farm.id}
              farm={farm}
              onStart={() => onStartFarm(farm.id)}
              onPause={() => onPauseFarm(farm.id)}
              onRestart={() => onRestartFarm(farm.id)}
              onDelete={() => onDeleteFarm(farm.id)}
              onConfigure={() => {
                setSelectedFarm(farm);
                setShowConfigModal(true);
              }}
              onExport={() => onExportConfig(farm.id)}
              onClone={() => {
                const clonedConfig = { ...farm.config };
                onCreateFarm(clonedConfig);
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredFarms.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No farms found matching the current filter
          </p>
        </motion.div>
      )}

      <FarmConfigModal
        isOpen={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setSelectedFarm(null);
        }}
        onSave={(config) => {
          if (selectedFarm) {
            onUpdateFarm(selectedFarm.id, config);
          } else {
            onCreateFarm(config);
          }
        }}
        initialConfig={selectedFarm?.config}
      />
    </div>
  );
};