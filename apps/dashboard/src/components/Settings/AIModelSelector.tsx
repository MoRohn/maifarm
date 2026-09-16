/**
 * AI Model Selector Component
 * Allows users to view available AI models and change the active model for each provider
 *
 * Features:
 * - Display all available models for Claude and OpenAI
 * - Filter models by capabilities, cost, and context window
 * - Show current active model with visual indicator
 * - Change model with compatibility validation
 * - Display model specifications and pricing
 * - Cost comparison between models
 * - Performance profiles and recommendations
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  SparklesIcon,
  CpuChipIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckIcon,
  XMarkIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  LockClosedIcon,
  EyeIcon,
  CodeBracketIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/useToast';
import { useAIEngineStore } from '@/store/aiEngineStore';
import { Tooltip } from '../common/Tooltip';
import type { AIModelInfo, ModelChangeResponse } from '@/services/aiEngineService';

interface AIModelSelectorProps {
  provider: 'claude' | 'openai';
  onModelChanged?: (model: AIModelInfo) => void;
}

type FilterCapability = 'all' | 'vision' | 'function-calling' | 'json-mode' | 'streaming';
type SortBy = 'name' | 'cost' | 'context' | 'releaseDate';

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  provider,
  onModelChanged
}) => {
  const { success: showSuccess, error: showError } = useToast();
  const {
    availableModels,
    currentModels,
    isLoading,
    error,
    fetchAvailableModels,
    changeModel
  } = useAIEngineStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCapability, setSelectedCapability] = useState<FilterCapability>('all');
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [changeResult, setChangeResult] = useState<ModelChangeResponse | null>(null);

  // Fetch models on mount
  useEffect(() => {
    fetchAvailableModels(provider, {
      includeDeprecated
    });
  }, [provider, includeDeprecated, fetchAvailableModels]);

  // Get models for this provider
  const providerModels = availableModels.get(provider) || [];
  const currentModel = currentModels.get(provider);

  // Filter and sort models
  const filteredModels = providerModels
    .filter(model => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          model.displayName.toLowerCase().includes(query) ||
          model.id.toLowerCase().includes(query) ||
          model.description?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .filter(model => {
      // Capability filter
      if (selectedCapability !== 'all') {
        return model.capabilities?.includes(selectedCapability as any);
      }
      return true;
    })
    .sort((a, b) => {
      // Sort
      switch (sortBy) {
        case 'cost':
          return (a.costPer1kPromptTokens + a.costPer1kCompletionTokens) -
                 (b.costPer1kPromptTokens + b.costPer1kCompletionTokens);
        case 'context':
          return b.contextWindow - a.contextWindow;
        case 'releaseDate':
          return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
        case 'name':
        default:
          return a.displayName.localeCompare(b.displayName);
      }
    });

  const handleChangeModel = async (modelId: string) => {
    setIsChanging(true);
    setChangeResult(null);

    try {
      const result = await changeModel({
        provider,
        modelId,
        validateCompatibility: true
      });

      setChangeResult(result);

      if (result.success) {
        showSuccess(`✅ Model changed to ${result.newModel}`);
        const changedModel = providerModels.find(m => m.id === modelId);
        if (changedModel && onModelChanged) {
          onModelChanged(changedModel);
        }

        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            showError(`⚠️ ${warning}`);
          });
        }
      } else {
        showError('Failed to change model');
      }
    } catch (error: any) {
      showError(error.message || 'Failed to change model');
    } finally {
      setIsChanging(false);
    }
  };

  const getCapabilityIcon = (capability: string) => {
    const icons: Record<string, JSX.Element> = {
      'vision': <EyeIcon className="w-3.5 h-3.5" />,
      'function-calling': <CodeBracketIcon className="w-3.5 h-3.5" />,
      'json-mode': <CodeBracketIcon className="w-3.5 h-3.5" />,
      'streaming': <BoltIcon className="w-3.5 h-3.5" />,
      'text-generation': <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />,
      'code-generation': <CodeBracketIcon className="w-3.5 h-3.5" />
    };
    return icons[capability] || <CheckIcon className="w-3.5 h-3.5" />;
  };

  const getSpeedBadge = (speed: string) => {
    const badges: Record<string, { className: string; label: string }> = {
      fast: { className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: '⚡ Fast' },
      medium: { className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: '⚡ Medium' },
      slow: { className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: '🐌 Slower' }
    };
    return badges[speed] || badges.medium;
  };

  const getQualityBadge = (quality: string) => {
    const badges: Record<string, { className: string; label: string }> = {
      standard: { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: '⭐ Standard' },
      high: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: '⭐⭐ High' },
      premium: { className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', label: '⭐⭐⭐ Premium' }
    };
    return badges[quality] || badges.standard;
  };

  const getCostBadge = (costEfficiency: string) => {
    const badges: Record<string, { className: string; label: string }> = {
      budget: { className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: '💰 Budget' },
      balanced: { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: '💰💰 Balanced' },
      premium: { className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: '💰💰💰 Premium' }
    };
    return badges[costEfficiency] || badges.balanced;
  };

  if (error) {
    return (
      <div className="p-6 text-center">
        <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Provider Info */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl">
            <CpuChipIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {provider === 'claude' ? 'Claude Models' : 'OpenAI Models'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {filteredModels.length} models available
            </p>
          </div>
        </div>

        {currentModel && (
          <Tooltip content="Current active model">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Active: {currentModel}
              </span>
            </div>
          </Tooltip>
        )}
      </motion.div>

      {/* Search and Filters */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models by name, ID, or description..."
            className="
              w-full pl-10 pr-4 py-3
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              rounded-xl
              text-gray-900 dark:text-white
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
              transition-all duration-200
            "
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="
              flex items-center gap-2 px-4 py-2
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              rounded-xl
              text-sm font-medium text-gray-700 dark:text-gray-300
              hover:bg-gray-50 dark:hover:bg-gray-700
              transition-colors duration-200
            "
          >
            <FunnelIcon className="w-4 h-4" />
            Filters
            {showFilters ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={includeDeprecated}
                onChange={(e) => setIncludeDeprecated(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show deprecated models
            </label>
          </div>
        </div>

        {/* Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="
                p-4 space-y-4
                bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900
                border border-gray-200 dark:border-gray-700
                rounded-xl
              "
            >
              {/* Capability Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filter by Capability
                </label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'vision', 'function-calling', 'json-mode', 'streaming'].map((cap) => (
                    <button
                      key={cap}
                      onClick={() => setSelectedCapability(cap as FilterCapability)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium
                        transition-all duration-200
                        ${selectedCapability === cap
                          ? 'bg-blue-500 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      {cap === 'all' ? 'All Capabilities' : cap.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sort By
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'name', label: 'Name' },
                    { value: 'cost', label: 'Cost (Low to High)' },
                    { value: 'context', label: 'Context Window (Large to Small)' },
                    { value: 'releaseDate', label: 'Release Date (Newest)' }
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => setSortBy(sort.value as SortBy)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium
                        transition-all duration-200
                        ${sortBy === sort.value
                          ? 'bg-purple-500 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      {sort.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Model Cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
          />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading models...</p>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <InformationCircleIcon className="w-16 h-16 text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">No models found</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Try adjusting your filters or search query
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredModels.map((model, index) => {
            const isActive = currentModel === model.id;
            const isExpanded = expandedModel === model.id;

            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  relative rounded-xl border overflow-hidden
                  transition-all duration-200
                  ${isActive
                    ? 'border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 shadow-lg'
                    : model.isDeprecated
                    ? 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md'
                  }
                `}
              >
                <div className="p-4">
                  {/* Model Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                          {model.displayName}
                        </h4>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                            <CheckIcon className="w-3 h-3" />
                            Active
                          </span>
                        )}
                        {model.isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded-full">
                            <SparklesIcon className="w-3 h-3" />
                            Recommended
                          </span>
                        )}
                        {model.isDeprecated && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500 text-white text-xs font-medium rounded-full">
                            <ExclamationTriangleIcon className="w-3 h-3" />
                            Deprecated
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {model.description || model.id}
                      </p>

                      {/* Quick Stats */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                        <Tooltip content="Context Window">
                          <div className="flex items-center gap-1">
                            <CpuChipIcon className="w-3.5 h-3.5" />
                            {(model.contextWindow / 1000).toFixed(0)}K context
                          </div>
                        </Tooltip>
                        <Tooltip content="Cost per 1K input tokens">
                          <div className="flex items-center gap-1">
                            <CurrencyDollarIcon className="w-3.5 h-3.5" />
                            ${model.costPer1kPromptTokens.toFixed(2)} / ${model.costPer1kCompletionTokens.toFixed(2)}
                          </div>
                        </Tooltip>
                        <Tooltip content="Release Date">
                          <div className="flex items-center gap-1">
                            <ClockIcon className="w-3.5 h-3.5" />
                            {new Date(model.releaseDate).toLocaleDateString()}
                          </div>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                        className="
                          p-2 rounded-lg
                          text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                          hover:bg-gray-100 dark:hover:bg-gray-700
                          transition-colors
                        "
                      >
                        {isExpanded ? (
                          <ChevronUpIcon className="w-5 h-5" />
                        ) : (
                          <ChevronDownIcon className="w-5 h-5" />
                        )}
                      </button>

                      {!isActive && !model.isDeprecated && (
                        <Tooltip content="Switch to this model">
                          <button
                            onClick={() => handleChangeModel(model.id)}
                            disabled={isChanging}
                            className="
                              px-4 py-2 rounded-lg
                              bg-gradient-to-r from-blue-500 to-blue-600
                              hover:from-blue-600 hover:to-blue-700
                              text-white text-sm font-medium
                              disabled:opacity-50 disabled:cursor-not-allowed
                              shadow-md hover:shadow-lg
                              transition-all duration-200
                            "
                          >
                            {isChanging ? 'Switching...' : 'Use This Model'}
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-4"
                      >
                        {/* Performance Profile */}
                        {model.performanceProfile && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              Performance Profile
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getSpeedBadge(model.performanceProfile.speed).className}`}>
                                {getSpeedBadge(model.performanceProfile.speed).label}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getQualityBadge(model.performanceProfile.quality).className}`}>
                                {getQualityBadge(model.performanceProfile.quality).label}
                              </span>
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getCostBadge(model.performanceProfile.costEfficiency).className}`}>
                                {getCostBadge(model.performanceProfile.costEfficiency).label}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Capabilities */}
                        {model.capabilities && model.capabilities.length > 0 && (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              Capabilities
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {model.capabilities.map((cap) => (
                                <span
                                  key={cap}
                                  className="
                                    inline-flex items-center gap-1.5 px-2.5 py-1
                                    bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30
                                    text-purple-700 dark:text-purple-400
                                    border border-purple-200 dark:border-purple-800
                                    text-xs font-medium rounded-full
                                  "
                                >
                                  {getCapabilityIcon(cap)}
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Technical Specs */}
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Technical Specifications
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens</div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                {model.maxTokens.toLocaleString()}
                              </div>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Context Window</div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                {(model.contextWindow / 1000).toFixed(0)}K
                              </div>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Input Cost</div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                ${model.costPer1kPromptTokens}/1K
                              </div>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Output Cost</div>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                ${model.costPer1kCompletionTokens}/1K
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Deprecation Warning */}
                        {model.isDeprecated && (
                          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <ExclamationTriangleIcon className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <div className="text-sm font-medium text-orange-900 dark:text-orange-300 mb-1">
                                  This model is deprecated
                                </div>
                                {model.deprecationDate && (
                                  <div className="text-xs text-orange-700 dark:text-orange-400">
                                    Deprecated on: {new Date(model.deprecationDate).toLocaleDateString()}
                                  </div>
                                )}
                                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                  Please consider switching to a newer model for continued support.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Change Result Modal */}
      <AnimatePresence>
        {changeResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setChangeResult(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="
                w-full max-w-md p-6
                bg-white dark:bg-gray-800
                rounded-2xl shadow-2xl
                border border-gray-200 dark:border-gray-700
              "
            >
              <div className="text-center">
                {changeResult.success ? (
                  <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                ) : (
                  <XMarkIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
                )}

                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {changeResult.success ? 'Model Changed!' : 'Change Failed'}
                </h3>

                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {changeResult.success
                    ? `Successfully switched from ${changeResult.previousModel} to ${changeResult.newModel}`
                    : 'Failed to change model. Please try again.'}
                </p>

                {changeResult.compatibilityIssues && changeResult.compatibilityIssues.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {changeResult.compatibilityIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`
                          p-3 rounded-lg text-left text-sm
                          ${issue.type === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
                          }
                        `}
                      >
                        <div className="font-medium mb-1">{issue.feature}</div>
                        <div className="text-xs">{issue.message}</div>
                        {issue.resolution && (
                          <div className="text-xs mt-1 opacity-80">
                            Resolution: {issue.resolution}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setChangeResult(null)}
                  className="
                    w-full px-4 py-2 rounded-xl
                    bg-gradient-to-r from-blue-500 to-blue-600
                    hover:from-blue-600 hover:to-blue-700
                    text-white font-medium
                    shadow-md hover:shadow-lg
                    transition-all duration-200
                  "
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
