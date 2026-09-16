import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  KeyIcon,
  TrashIcon,
  CloudIcon,
  ServerIcon,
  SparklesIcon,
  ArrowUpCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { ClaudeSetupWizard } from './ClaudeSetupWizard';
import { OpenAISetupWizard } from './OpenAISetupWizard';
import { GrokSetupWizard } from './GrokSetupWizard';
import { GptOssSetupWizard } from './GptOssSetupWizard';
import { LlamaLocalSetupWizard } from './LlamaLocalSetupWizard';
import { HardwareOptimizedSetup } from './HardwareOptimizedSetup';
import { AIEngineUpgradeWizard } from './AIEngineUpgradeWizard';
import type { EngineConfigResult } from './wizardTypes';
import { useAIEngineStore } from '@/store/aiEngineStore';
import { useToast } from '@/hooks/useToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useResponsive } from '@/hooks/useResponsive';

const ENGINE_CARDS = {
  'gpt-oss': {
    id: 'gpt-oss' as const,
    name: 'OpenAI OSS (Local)',
    description: 'Ships with MaiFarm by default. Runs OpenAI GPT-OSS 20B (21B params, 131K context) locally so you can start immediately.',
    icon: '🖥️',
    apiType: 'local',
    docsUrl: 'https://docs.maifarm.dev/engines/openai-oss',
    features: ['No API key required', 'Designed for 8–16GB RAM', 'Acts as the default engine'],
    isLocal: true,
  },
  claude: {
    id: 'claude' as const,
    name: 'Claude (Anthropic)',
    description: 'Claude Opus 4.5 - the most advanced AI with superior reasoning and extended thinking capabilities.',
    icon: '🧠',
    apiType: 'cloud',
    docsUrl: 'https://console.anthropic.com/',
    features: ['200K context window', 'Superior reasoning', 'Extended thinking', 'Computer use'],
    isLocal: false,
  },
  openai: {
    id: 'openai' as const,
    name: 'OpenAI GPT-4',
    description: 'GPT-4o and GPT-4o mini models for balanced quality and speed.',
    icon: '🤖',
    apiType: 'cloud',
    docsUrl: 'https://platform.openai.com/account/api-keys',
    features: ['Vision & JSON mode', 'Function calling', 'Multi-model support'],
    isLocal: false,
  },
  grok: {
    id: 'grok' as const,
    name: 'Grok (xAI)',
    description: 'xAI\'s Grok-2 model with real-time knowledge and fast responses.',
    icon: '⚡',
    apiType: 'cloud',
    docsUrl: 'https://console.x.ai/',
    features: ['128K context window', 'Real-time knowledge', 'Fast responses'],
    isLocal: false,
  },
  llama: {
    id: 'llama' as const,
    name: 'Llama Local',
    description: 'Bring the Llama2.5 coder models closer to your farm via Ollama or vLLM for fast, offline coding support.',
    icon: '🌾',
    apiType: 'local',
    docsUrl: 'https://docs.maifarm.dev/engines/llama-local',
    features: ['Coder-tuned responses', 'Works with Ollama', 'Supports 256K context windows'],
    isLocal: true,
  },
} as const;

type EngineCardId = keyof typeof ENGINE_CARDS;

type ApiKeyRecord = {
  id: string;
  service: string;
  name: string;
  key: string;
  permissions: string[];
  createdAt?: string;
  lastUsed?: string;
};

const SERVICE_ALIASES: Record<EngineCardId, string[]> = {
  'gpt-oss': [],
  claude: ['anthropic', 'claude'],
  openai: ['openai'],
  grok: ['grok', 'xai'],
  llama: ['llama'],
};

export const AIEngineSetupHub: React.FC = () => {
  const { engines, fetchEngineStatus, setDefaultProvider, loading, error, defaultProvider } = useAIEngineStore();
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [activeWizard, setActiveWizard] = useState<EngineCardId | null>(null);
  const [upgradeWizard, setUpgradeWizard] = useState<EngineCardId | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [settingDefault, setSettingDefault] = useState<EngineCardId | null>(null);
  const [expandedCard, setExpandedCard] = useState<EngineCardId | null>(null);
  const { success: showSuccess, error: showError } = useToast();
  const hasLoadedRef = React.useRef(false);

  const enginesById = useMemo(() => {
    const map = new Map<EngineCardId, (typeof engines)[number]>();
    engines.forEach((engine) => {
      const provider = engine.provider as EngineCardId;
      if (provider in ENGINE_CARDS) {
        map.set(provider, engine);
      }
    });
    return map;
  }, [engines]);

  const keyedApiKeys = useMemo(() => {
    const map = new Map<string, ApiKeyRecord>();
    apiKeys.forEach((record) => {
      map.set(record.service.toLowerCase(), record);
    });
    return map;
  }, [apiKeys]);

  const loadApiKeys = useCallback(async () => {
    const response = await fetch('/api/apikeys');
    if (!response.ok) {
      throw new Error('Failed to load API keys');
    }
    const data = await response.json();
    setApiKeys(Array.isArray(data.keys) ? data.keys : []);
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchEngineStatus(), loadApiKeys()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to refresh AI engine data';
      showError(message);
    } finally {
      setRefreshing(false);
    }
  }, [fetchEngineStatus, loadApiKeys, showError]);

  // Load data once on mount, prevent infinite loop
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      refreshData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getKeyRecord = (engineId: EngineCardId) => {
    const aliases = SERVICE_ALIASES[engineId];
    return aliases
      .map((alias) => keyedApiKeys.get(alias))
      .find((record): record is ApiKeyRecord => Boolean(record));
  };

  const handleDeleteKey = async (engineId: EngineCardId) => {
    const record = getKeyRecord(engineId);
    if (!record) {
      showError('No stored API key to remove.');
      return;
    }

    const confirmed = window.confirm('Remove the stored API key? Agents will no longer use this provider.');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/apikeys/${record.id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete API key');
      }
      showSuccess('API key removed');
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete API key';
      showError(message);
    }
  };

  /**
   * Handle setting default provider
   */
  const handleSetDefault = async (engineId: EngineCardId) => {
    setSettingDefault(engineId);

    try {
      await setDefaultProvider(engineId);
      showSuccess(`${ENGINE_CARDS[engineId].name} is now the default AI engine`);
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set default provider';
      showError(message);
    } finally {
      setSettingDefault(null);
    }
  };

  /**
   * Handle wizard completion with new standardized result type
   * Supports both legacy and modern callback signatures via invokeCallback helper
   */
  const handleWizardComplete = async (result: EngineConfigResult) => {
    // Log configuration result for debugging
    console.log(`[AIEngineSetupHub] ${result.provider} configured:`, {
      configured: result.configured,
      model: result.model,
      hasApiKey: Boolean(result.apiKey),
    });

    setActiveWizard(null);
    await refreshData();

    // Show confirmation and auto-refresh page to display updated state
    if (result.configured) {
      showSuccess(`${result.provider} is now configured and ready to use. Refreshing...`);

      // Auto-refresh page after 1.5 seconds to show confirmation
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const renderStatusBadge = ({ configured, isLocal }: { configured: boolean; isLocal?: boolean }) => {
    if (configured) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircleIcon className="h-4 w-4" />
          {isLocal ? 'Ready' : 'Configured'}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <ExclamationCircleIcon className="h-4 w-4" />
        {isLocal ? 'Setup required' : 'Not configured'}
      </span>
    );
  };

  const cards = Object.values(ENGINE_CARDS);

  return (
    <div className="space-y-4 sm:space-y-6 pb-safe">
      {/* Header - Responsive */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">AI Engine Configuration</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            {isMobile
              ? 'Configure your AI providers'
              : 'Connect your Anthropic or OpenAI account so MaiFarm can run agents on your infrastructure.'}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshData}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 touch-manipulation w-full sm:w-auto"
        >
          <ArrowPathIcon className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </div>

      {/* Current Default Engine Display - Responsive */}
      {defaultProvider && (
        <div className="rounded-2xl sm:rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-purple-700 dark:from-purple-900/20 dark:to-pink-900/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-purple-500 text-xl sm:text-2xl flex-shrink-0">
                {ENGINE_CARDS[defaultProvider]?.icon || '🔧'}
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  Current Default AI Engine
                </div>
                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                  {ENGINE_CARDS[defaultProvider]?.name || defaultProvider}
                </div>
              </div>
            </div>
            <span className="inline-flex items-center justify-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white self-start sm:self-auto">
              <CheckCircleIcon className="h-5 w-5" />
              Active
            </span>
          </div>
        </div>
      )}

      {/* Hardware-Optimized Setup Section */}
      <ErrorBoundary
        fallbackTitle="Hardware Detection Error"
        fallbackMessage="Unable to detect hardware capabilities. You can still configure AI engines manually below."
      >
        <HardwareOptimizedSetup />
      </ErrorBoundary>

      {(loading || refreshing) && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Checking provider status…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        {cards.map((card) => {
          const engineStatus = enginesById.get(card.id);
          const keyRecord = getKeyRecord(card.id);
          const configured = engineStatus
            ? engineStatus.isLocal
              ? engineStatus.enabled
              : Boolean(engineStatus.hasApiKey || keyRecord)
            : Boolean(keyRecord);

          const isLocal = card.isLocal ?? false;
          const isDefault = defaultProvider === card.id;
          const showKeyRecord = !isLocal && keyRecord;
          const primaryButtonLabel = isLocal
            ? configured
              ? 'Update'
              : 'Setup'
            : configured
              ? 'Reconfigure'
              : 'Configure';
          const isExpanded = expandedCard === card.id;
          const hasSecondaryActions = configured && (!isLocal || !isDefault);

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
            >
              <div className="flex flex-1 flex-col gap-3 sm:gap-4 p-4 sm:p-6">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <span className="text-2xl sm:text-3xl flex-shrink-0" aria-hidden>{card.icon}</span>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">{card.name}</h2>
                      <div className="mt-0.5 sm:mt-1 flex items-center gap-1 sm:gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {isLocal ? <ServerIcon className="h-3 w-3 sm:h-4 sm:w-4" /> : <CloudIcon className="h-3 w-3 sm:h-4 sm:w-4" />}
                        <span>{isLocal ? 'Local' : 'Cloud'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        Default
                      </span>
                    )}
                    {renderStatusBadge({ configured, isLocal })}
                  </div>
                </div>

                {/* Description - Hidden on mobile when card is collapsed */}
                <p className={`text-xs sm:text-sm text-gray-600 dark:text-gray-300 ${isMobile && !isExpanded ? 'line-clamp-2' : ''}`}>
                  {card.description}
                </p>

                {/* Features - Collapsible on mobile */}
                <AnimatePresence>
                  {(!isMobile || isExpanded) && (
                    <motion.ul
                      initial={isMobile ? { height: 0, opacity: 0 } : false}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={isMobile ? { height: 0, opacity: 0 } : undefined}
                      className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 overflow-hidden"
                    >
                      {card.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <SparklesIcon className="mt-0.5 h-3 w-3 sm:h-4 sm:w-4 text-purple-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>

                {/* Engine Status - Collapsible on mobile */}
                <AnimatePresence>
                  {engineStatus && (!isMobile || isExpanded) && (
                    <motion.dl
                      initial={isMobile ? { height: 0, opacity: 0 } : false}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={isMobile ? { height: 0, opacity: 0 } : undefined}
                      className="grid grid-cols-2 gap-2 sm:gap-3 rounded-xl bg-gray-50 p-3 sm:p-4 text-xs text-gray-500 dark:bg-gray-900/50 dark:text-gray-400 overflow-hidden"
                    >
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">Model</dt>
                        <dd className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">{engineStatus.model || 'Not set'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">Context</dt>
                        <dd className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                          {engineStatus.contextWindow ? `${(engineStatus.contextWindow / 1000).toFixed(0)}K` : '—'}
                        </dd>
                      </div>
                    </motion.dl>
                  )}
                </AnimatePresence>

                {/* API Key Record - Collapsible on mobile */}
                <AnimatePresence>
                  {showKeyRecord && keyRecord && (!isMobile || isExpanded) && (
                    <motion.div
                      initial={isMobile ? { height: 0, opacity: 0 } : false}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={isMobile ? { height: 0, opacity: 0 } : undefined}
                      className="rounded-xl border border-green-200 bg-green-50 p-3 sm:p-4 text-xs sm:text-sm text-green-900 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <KeyIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>{keyRecord.name || 'API key'} configured</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Mobile Expand Button */}
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setExpandedCard(isExpanded ? null : card.id)}
                    className="flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 py-1 touch-manipulation"
                  >
                    <span>{isExpanded ? 'Show less' : 'Show more'}</span>
                    <ChevronDownIcon className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {/* Action Buttons - Responsive Layout */}
              <div className="border-t border-gray-200 bg-gray-50 p-3 sm:p-4 dark:border-gray-700 dark:bg-gray-900/70">
                {/* Mobile: Stacked button layout */}
                {isMobile ? (
                  <div className="flex flex-col gap-2">
                    {/* Primary Action Button - Always visible */}
                    <button
                      type="button"
                      onClick={() => setActiveWizard(card.id)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-purple-700 touch-manipulation"
                    >
                      {primaryButtonLabel}
                    </button>

                    {/* Secondary Actions - Expandable */}
                    {hasSecondaryActions && (
                      <div className="grid grid-cols-2 gap-2">
                        {configured && (
                          <button
                            type="button"
                            onClick={() => setUpgradeWizard(card.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-green-200 px-3 py-2.5 text-xs font-medium text-green-600 transition hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/30 touch-manipulation"
                          >
                            <ArrowUpCircleIcon className="h-4 w-4" />
                            Upgrade
                          </button>
                        )}
                        {configured && !isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(card.id)}
                            disabled={settingDefault === card.id}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30 touch-manipulation"
                          >
                            {settingDefault === card.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Default
                              </>
                            )}
                          </button>
                        )}
                        {configured && !isLocal && keyRecord && (
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(card.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30 touch-manipulation col-span-2"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Remove Key
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Desktop/Tablet: Horizontal button layout */
                  <div className="flex items-center justify-between gap-3">
                    <div className="hidden text-xs text-gray-500 dark:text-gray-400 lg:block">
                      {card.docsUrl ? (
                        <>
                          Need help?{' '}
                          <a href={card.docsUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                            View guide
                          </a>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                      {configured && !isLocal && keyRecord && (
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(card.id)}
                          className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-red-200 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          <TrashIcon className="h-4 w-4" />
                          <span className="hidden sm:inline">Remove key</span>
                        </button>
                      )}
                      {configured && (
                        <button
                          type="button"
                          onClick={() => setUpgradeWizard(card.id)}
                          className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-green-200 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-green-600 transition hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/30"
                        >
                          <ArrowUpCircleIcon className="h-4 w-4" />
                          Upgrade
                        </button>
                      )}
                      {configured && !isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(card.id)}
                          disabled={settingDefault === card.id}
                          className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-blue-200 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-blue-600 transition hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
                        >
                          {settingDefault === card.id ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircleIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">Set as</span> Default
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveWizard(card.id)}
                        className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-purple-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white transition hover:bg-purple-700"
                      >
                        {primaryButtonLabel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Wizard Modals - Now using standardized EngineConfigResult */}
      <ErrorBoundary fallbackTitle="Claude Configuration Error" fallbackMessage="There was an error configuring Claude. Please try again.">
        <ClaudeSetupWizard
          isOpen={activeWizard === 'claude'}
          onClose={() => setActiveWizard(null)}
          onComplete={handleWizardComplete}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="OpenAI Configuration Error" fallbackMessage="There was an error configuring OpenAI. Please try again.">
        <OpenAISetupWizard
          isOpen={activeWizard === 'openai'}
          onClose={() => setActiveWizard(null)}
          onComplete={handleWizardComplete}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Grok Configuration Error" fallbackMessage="There was an error configuring Grok. Please try again.">
        <GrokSetupWizard
          isOpen={activeWizard === 'grok'}
          onClose={() => setActiveWizard(null)}
          onComplete={handleWizardComplete}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="GPT-OSS Configuration Error" fallbackMessage="There was an error configuring GPT-OSS. Please try again.">
        <GptOssSetupWizard
          isOpen={activeWizard === 'gpt-oss'}
          onClose={() => setActiveWizard(null)}
          onComplete={handleWizardComplete}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Llama Configuration Error" fallbackMessage="There was an error configuring Llama. Please try again.">
        <LlamaLocalSetupWizard
          isOpen={activeWizard === 'llama'}
          onClose={() => setActiveWizard(null)}
          onComplete={handleWizardComplete}
        />
      </ErrorBoundary>

      {/* AI Engine Upgrade Wizard - Unified for all providers */}
      {upgradeWizard && (
        <ErrorBoundary fallbackTitle="Upgrade Wizard Error" fallbackMessage="There was an error with the upgrade wizard. Please try again.">
          <AIEngineUpgradeWizard
            provider={upgradeWizard}
            isOpen={true}
            onClose={() => setUpgradeWizard(null)}
            onUpgradeComplete={refreshData}
          />
        </ErrorBoundary>
      )}
    </div>
  );
};

export default AIEngineSetupHub;
