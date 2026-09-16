/**
 * AI Engine Manager Component
 *
 * Professional, minimalist interface for managing AI engines with:
 * - Version display and upgrade checking
 * - Model selection
 * - Real-time configuration
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Settings,
  Download,
  Zap,
  Info,
  Shield,
  Cpu,
  Activity,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { aiEngineService } from '@/services/aiEngineService';
import { clsx } from 'clsx';

// ============================================================================
// Types
// ============================================================================

interface AIEngine {
  id: string;
  name: string;
  provider: 'claude' | 'openai' | 'llama' | 'ollama' | 'gemini';
  icon: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isActive: boolean;
  isConfigured: boolean;
  status: 'online' | 'offline' | 'error' | 'updating';
  models: AIModel[];
  selectedModel: string;
  capabilities: string[];
  stats: {
    tokensUsed: number;
    requestCount: number;
    avgResponseTime: number;
    successRate: number;
  };
}

interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  description: string;
  costPer1kTokens: number;
  capabilities: string[];
  isDefault: boolean;
  performance: 'fast' | 'balanced' | 'powerful';
}

// ============================================================================
// AI Engine Manager Component
// ============================================================================

export const AIEngineManager: React.FC = () => {
  const [engines, setEngines] = useState<AIEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedEngine, setExpandedEngine] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    loadEngines();
  }, []);

  const loadEngines = async () => {
    try {
      setLoading(true);
      const response = await aiEngineService.getEngineStatus();
      // Transform backend response to component's AIEngine format
      const transformedEngines: AIEngine[] = response.engines.map((e: any) => ({
        id: e.provider,
        name: e.provider.charAt(0).toUpperCase() + e.provider.slice(1),
        provider: e.provider,
        icon: e.provider,
        currentVersion: typeof e.version === 'object' ? e.version.current : e.version,
        latestVersion: typeof e.version === 'object' ? (e.version.latest || e.version.current) : e.version,
        hasUpdate: typeof e.version === 'object' ? (e.version.updateAvailable || false) : false,
        isActive: e.enabled && e.configured,
        isConfigured: e.configured,
        status: e.status === 'online' ? 'online' : 'offline',
        models: [], // Will be loaded separately if needed
        selectedModel: e.model,
        capabilities: [],
        stats: {
          tokensUsed: 0,
          requestCount: 0,
          avgResponseTime: 0,
          successRate: 100
        }
      }));
      setEngines(transformedEngines);
    } catch (error) {
      toast.error('Failed to load AI engines');
      console.error('Load engines error:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const providerIds: Array<'claude' | 'openai' | 'gpt-oss' | 'llama' | 'grok'> = ['claude', 'openai', 'llama', 'grok'];
      let updateCount = 0;

      for (const provider of providerIds) {
        try {
          const updateInfo = await aiEngineService.checkForUpdates(provider);
          if (updateInfo.updateAvailable) {
            updateCount++;
            setEngines(prev => prev.map(engine =>
              engine.id === provider
                ? {
                    ...engine,
                    latestVersion: updateInfo.latestVersion || engine.currentVersion,
                    hasUpdate: true
                  }
                : engine
            ));
          }
        } catch (e) {
          // Skip providers that fail
        }
      }

      if (updateCount > 0) {
        toast.success(`${updateCount} update${updateCount > 1 ? 's' : ''} available`);
      } else {
        toast.success('All engines are up to date');
      }
    } catch (error) {
      toast.error('Failed to check for updates');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const updateEngine = async (engineId: string) => {
    setUpdating(engineId);
    try {
      await aiEngineService.upgradeProvider(engineId as any);
      await loadEngines();
      toast.success('Engine updated successfully');
    } catch (error) {
      toast.error('Failed to update engine');
    } finally {
      setUpdating(null);
    }
  };

  const selectModel = async (engineId: string, modelId: string) => {
    try {
      await aiEngineService.changeModel(
        engineId as 'claude' | 'openai',
        modelId,
        true
      );
      setEngines(prev => prev.map(engine =>
        engine.id === engineId
          ? { ...engine, selectedModel: modelId }
          : engine
      ));
      toast.success('Model selected');
    } catch (error) {
      toast.error('Failed to select model');
    }
  };

  const toggleEngine = async (engineId: string) => {
    try {
      const engine = engines.find(e => e.id === engineId);
      if (!engine) return;

      // For now, we use setDefaultProvider to "enable" an engine
      // and there's no direct toggle - this is a simplified implementation
      if (!engine.isActive) {
        await aiEngineService.setDefaultProvider(engineId as any);
      }
      setEngines(prev => prev.map(e =>
        e.id === engineId
          ? { ...e, isActive: !e.isActive }
          : e
      ));
      toast.success(engine.isActive ? 'Engine disabled' : 'Engine enabled');
    } catch (error) {
      toast.error('Failed to toggle engine');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            AI Engines
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Configure and manage your AI model providers
          </p>
        </div>

        <button
          onClick={checkForUpdates}
          disabled={checkingUpdates}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
            'hover:bg-gray-50 dark:hover:bg-gray-750',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={clsx(
            'w-4 h-4',
            checkingUpdates && 'animate-spin'
          )} />
          <span className="text-sm font-medium">
            Check for Updates
          </span>
        </button>
      </div>

      {/* Engine Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {engines.map(engine => (
            <motion.div
              key={engine.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={clsx(
                'relative rounded-xl border overflow-hidden',
                'bg-white dark:bg-gray-800',
                'border-gray-200 dark:border-gray-700',
                engine.isActive && 'ring-2 ring-primary-500 ring-opacity-50',
                'transition-all duration-300'
              )}
            >
              {/* Engine Header */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      'bg-gradient-to-br',
                      engine.provider === 'claude' && 'from-purple-500 to-purple-600',
                      engine.provider === 'openai' && 'from-green-500 to-green-600',
                      engine.provider === 'llama' && 'from-blue-500 to-blue-600',
                      engine.provider === 'ollama' && 'from-orange-500 to-orange-600',
                      engine.provider === 'gemini' && 'from-red-500 to-red-600'
                    )}>
                      <Brain className="w-5 h-5 text-white" />
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {engine.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          v{engine.currentVersion}
                        </span>
                        {engine.hasUpdate && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <Download className="w-3 h-3" />
                            v{engine.latestVersion} available
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    {engine.status === 'online' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Online
                        </span>
                      </div>
                    )}
                    {engine.status === 'offline' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          Offline
                        </span>
                      </div>
                    )}
                    {engine.status === 'error' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        <span className="text-xs text-red-600 dark:text-red-400">
                          Error
                        </span>
                      </div>
                    )}
                    {engine.status === 'updating' && (
                      <div className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          Updating
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Model Selection */}
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Active Model
                  </label>
                  <select
                    value={engine.selectedModel}
                    onChange={(e) => selectModel(engine.id, e.target.value)}
                    disabled={!engine.isActive || engine.status !== 'online'}
                    className={clsx(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-gray-50 dark:bg-gray-900',
                      'border border-gray-200 dark:border-gray-700',
                      'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'transition-all duration-200'
                    )}
                  >
                    {engine.models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.contextWindow.toLocaleString()} tokens)
                      </option>
                    ))}
                  </select>

                  {/* Model Info */}
                  {engine.models.find(m => m.id === engine.selectedModel) && (
                    <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">
                          {engine.models.find(m => m.id === engine.selectedModel)?.description}
                        </span>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          engine.models.find(m => m.id === engine.selectedModel)?.performance === 'fast' &&
                            'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                          engine.models.find(m => m.id === engine.selectedModel)?.performance === 'balanced' &&
                            'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                          engine.models.find(m => m.id === engine.selectedModel)?.performance === 'powerful' &&
                            'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                        )}>
                          {engine.models.find(m => m.id === engine.selectedModel)?.performance}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Statistics */}
                {engine.isActive && engine.stats && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Requests
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {engine.stats.requestCount.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Success Rate
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {engine.stats.successRate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Avg Response
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {engine.stats.avgResponseTime.toFixed(0)}ms
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Tokens Used
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {(engine.stats.tokensUsed / 1000).toFixed(1)}K
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => toggleEngine(engine.id)}
                    className={clsx(
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                      'transition-all duration-200',
                      engine.isActive
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        : 'bg-primary-500 text-white hover:bg-primary-600'
                    )}
                  >
                    {engine.isActive ? 'Disable' : 'Enable'}
                  </button>

                  {engine.hasUpdate && (
                    <button
                      onClick={() => updateEngine(engine.id)}
                      disabled={updating === engine.id}
                      className={clsx(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                        'bg-gradient-to-r from-amber-500 to-amber-600 text-white',
                        'hover:from-amber-600 hover:to-amber-700',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-all duration-200'
                      )}
                    >
                      {updating === engine.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Updating...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Download className="w-3 h-3" />
                          Update
                        </span>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => setExpandedEngine(
                      expandedEngine === engine.id ? null : engine.id
                    )}
                    className={clsx(
                      'p-2 rounded-lg',
                      'bg-gray-100 dark:bg-gray-700',
                      'hover:bg-gray-200 dark:hover:bg-gray-600',
                      'transition-all duration-200'
                    )}
                  >
                    <ChevronDown className={clsx(
                      'w-4 h-4 transition-transform duration-200',
                      expandedEngine === engine.id && 'rotate-180'
                    )} />
                  </button>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {expandedEngine === engine.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Capabilities
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {engine.capabilities.map(cap => (
                              <span
                                key={cap}
                                className="px-2 py-1 rounded-md text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Available Models
                          </h4>
                          <div className="space-y-2">
                            {engine.models.map(model => (
                              <div
                                key={model.id}
                                className={clsx(
                                  'p-2 rounded-lg border',
                                  model.id === engine.selectedModel
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700'
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {model.name}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      ${model.costPer1kTokens}/1K tokens
                                    </div>
                                  </div>
                                  {model.id === engine.selectedModel && (
                                    <CheckCircle className="w-4 h-4 text-primary-500" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Summary Stats */}
      <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border border-primary-200 dark:border-primary-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                System Overview
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {engines.filter(e => e.isActive).length} of {engines.length} engines active
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total Requests
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {engines.reduce((acc, e) => acc + (e.stats?.requestCount || 0), 0).toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Avg Success Rate
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {(engines.reduce((acc, e) => acc + (e.stats?.successRate || 0), 0) / engines.length).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEngineManager;