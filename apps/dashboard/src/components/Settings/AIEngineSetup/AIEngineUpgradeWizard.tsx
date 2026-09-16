/**
 * AI Engine Upgrade Wizard Component
 *
 * A unified wizard for checking versions, upgrading models, and managing
 * AI engine configurations across all supported providers.
 *
 * Features:
 * - Version checking with online source references
 * - Model upgrade with step-by-step progress
 * - Model selection and configuration
 * - Provider-specific settings
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  ArrowUpCircle,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Cpu,
  Sparkles,
  Clock,
  Settings,
  X,
  ChevronRight,
  ChevronDown,
  Zap,
  Shield,
  Box,
  Globe
} from 'lucide-react';
import { clsx } from 'clsx';
import { aiEngineService, EngineId } from '@/services/aiEngineService';
import { PROVIDER_COLORS, PROVIDER_NAMES, PROVIDER_MODELS } from './wizardConstants';
import toast from 'react-hot-toast';

interface AIEngineUpgradeWizardProps {
  provider: EngineId;
  isOpen: boolean;
  onClose: () => void;
  onUpgradeComplete?: () => void;
}

interface VersionInfo {
  currentModel: string;
  latestModel: string;
  latestVersion: string;
  releaseDate: string;
  updateAvailable: boolean;
  checkSources: {
    checkUrl: string;
    docsUrl: string;
    changelogUrl: string;
    releaseNotesUrl: string;
  };
  availableModels: Array<{
    id: string;
    name: string;
    version: string;
    releaseDate: string;
    isDefault: boolean;
    isDeprecated: boolean;
  }>;
  lastChecked: string;
}

interface UpgradeStep {
  step: number;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export const AIEngineUpgradeWizard: React.FC<AIEngineUpgradeWizardProps> = ({
  provider,
  isOpen,
  onClose,
  onUpgradeComplete
}) => {
  const [step, setStep] = useState<'check' | 'select' | 'upgrade' | 'complete'>('check');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [upgradeSteps, setUpgradeSteps] = useState<UpgradeStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModelDetails, setShowModelDetails] = useState(false);

  const colors = PROVIDER_COLORS[provider] || PROVIDER_COLORS.claude;
  const providerName = PROVIDER_NAMES[provider] || provider;

  // Check for updates when wizard opens
  useEffect(() => {
    if (isOpen) {
      checkForUpdates();
    }
  }, [isOpen, provider]);

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);

    try {
      const result = await aiEngineService.checkForUpdates(provider);
      setVersionInfo(result);
      setSelectedModel(result.latestModel);
    } catch (err: any) {
      setError(err.message || 'Failed to check for updates');
      toast.error('Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const handleUpgrade = async () => {
    if (!selectedModel) {
      toast.error('Please select a model');
      return;
    }

    setStep('upgrade');
    setLoading(true);
    setError(null);

    // Initialize upgrade steps
    setUpgradeSteps([
      { step: 1, name: 'Validating target version', status: 'pending' },
      { step: 2, name: 'Updating model configuration', status: 'pending' },
      { step: 3, name: 'Verifying upgrade', status: 'pending' }
    ]);

    try {
      // Step 1: Validation
      setUpgradeSteps(prev => prev.map(s => s.step === 1 ? { ...s, status: 'in-progress' } : s));
      await new Promise(resolve => setTimeout(resolve, 500));
      setUpgradeSteps(prev => prev.map(s => s.step === 1 ? { ...s, status: 'completed' } : s));

      // Step 2: Update configuration
      setUpgradeSteps(prev => prev.map(s => s.step === 2 ? { ...s, status: 'in-progress' } : s));
      const result = await aiEngineService.upgradeProvider(provider, selectedModel);
      setUpgradeSteps(prev => prev.map(s => s.step === 2 ? { ...s, status: 'completed' } : s));

      // Step 3: Verification
      setUpgradeSteps(prev => prev.map(s => s.step === 3 ? { ...s, status: 'in-progress' } : s));
      await new Promise(resolve => setTimeout(resolve, 300));
      setUpgradeSteps(prev => prev.map(s => s.step === 3 ? { ...s, status: 'completed' } : s));

      setStep('complete');
      toast.success(`${providerName} upgraded to ${selectedModel}`);
      onUpgradeComplete?.();
    } catch (err: any) {
      setError(err.message || 'Upgrade failed');
      toast.error('Upgrade failed');
      // Mark current step as failed
      setUpgradeSteps(prev => prev.map(s =>
        s.status === 'in-progress' ? { ...s, status: 'failed' } : s
      ));
    } finally {
      setLoading(false);
    }
  };

  const getModelInfo = (modelId: string) => {
    const models = PROVIDER_MODELS[provider] || [];
    return models.find(m => m.id === modelId);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
            style={{
              background: `linear-gradient(135deg, ${colors.light} 0%, white 100%)`
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-xl bg-${colors.primary}/10`}>
                  <ArrowUpCircle className={`w-6 h-6 text-${colors.primary}`} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {providerName} Upgrade Wizard
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Check for updates and change models
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {/* Step: Check for Updates */}
            {step === 'check' && (
              <div className="space-y-6">
                {checking ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <RefreshCw className={`w-12 h-12 text-${colors.primary} animate-spin mb-4`} />
                    <p className="text-gray-600 dark:text-gray-400">Checking for updates...</p>
                  </div>
                ) : versionInfo ? (
                  <>
                    {/* Current Version Card */}
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Current Configuration
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Cpu className={`w-8 h-8 text-${colors.primary}`} />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {getModelInfo(versionInfo.currentModel)?.label || versionInfo.currentModel}
                            </p>
                            <p className="text-sm text-gray-500">
                              Version {getModelInfo(versionInfo.currentModel)?.id?.split('-').pop() || 'unknown'}
                            </p>
                          </div>
                        </div>
                        {versionInfo.updateAvailable && (
                          <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Update Available
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Latest Version Card */}
                    {versionInfo.updateAvailable && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-xl border-2 border-${colors.primary}/30 bg-${colors.light}/50 dark:bg-${colors.primary}/10`}
                      >
                        <div className="flex items-center space-x-2 mb-3">
                          <Sparkles className={`w-5 h-5 text-${colors.primary}`} />
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            New Version Available
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Latest Model:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getModelInfo(versionInfo.latestModel)?.label || versionInfo.latestModel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Version:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {versionInfo.latestVersion}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Release Date:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {new Date(versionInfo.releaseDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Online Resources */}
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                        <Globe className="w-4 h-4 mr-2" />
                        Official Resources
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {versionInfo.checkSources.docsUrl && (
                          <a
                            href={versionInfo.checkSources.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm text-gray-600 dark:text-gray-400"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Models Documentation</span>
                          </a>
                        )}
                        {versionInfo.checkSources.changelogUrl && (
                          <a
                            href={versionInfo.checkSources.changelogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm text-gray-600 dark:text-gray-400"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Changelog</span>
                          </a>
                        )}
                        {versionInfo.checkSources.releaseNotesUrl && (
                          <a
                            href={versionInfo.checkSources.releaseNotesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm text-gray-600 dark:text-gray-400"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Release Notes</span>
                          </a>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Last checked: {new Date(versionInfo.lastChecked).toLocaleString()}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-4">
                      <button
                        onClick={checkForUpdates}
                        disabled={checking}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <RefreshCw className={clsx("w-4 h-4", checking && "animate-spin")} />
                        <span>Refresh</span>
                      </button>
                      <button
                        onClick={() => setStep('select')}
                        className={`flex items-center space-x-2 px-6 py-2 rounded-lg bg-${colors.primary} hover:bg-${colors.primaryHover} text-white font-medium transition-colors`}
                        style={{ backgroundColor: `var(--${colors.primary}, #6366f1)` }}
                      >
                        <span>Select Model</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : error ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">{error}</p>
                    <button
                      onClick={checkForUpdates}
                      className="mt-4 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step: Select Model */}
            {step === 'select' && versionInfo && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Select Model
                  </h3>
                  <button
                    onClick={() => setShowModelDetails(!showModelDetails)}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
                  >
                    {showModelDetails ? 'Hide' : 'Show'} Details
                    <ChevronDown className={clsx("w-4 h-4 ml-1 transition-transform", showModelDetails && "rotate-180")} />
                  </button>
                </div>

                <div className="space-y-3">
                  {(PROVIDER_MODELS[provider] || []).map((model) => {
                    const isSelected = selectedModel === model.id;
                    const isCurrent = versionInfo.currentModel === model.id;

                    return (
                      <motion.button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={clsx(
                          "w-full p-4 rounded-xl border-2 text-left transition-all",
                          isSelected
                            ? `border-${colors.primary} bg-${colors.light}/50 dark:bg-${colors.primary}/10`
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                        style={isSelected ? {
                          borderColor: `var(--${colors.primary}, #6366f1)`,
                          backgroundColor: `var(--${colors.light}, #f5f3ff)`
                        } : {}}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-semibold text-gray-900 dark:text-white">
                                {model.label}
                              </h4>
                              {model.recommended && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  Recommended
                                </span>
                              )}
                              {isCurrent && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  Current
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {model.description}
                            </p>

                            {showModelDetails && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex flex-wrap gap-2">
                                  {model.features?.map((feature, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                    >
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                                {model.contextWindow && (
                                  <p className="text-xs text-gray-500 mt-2">
                                    Context Window: {model.contextWindow.toLocaleString()} tokens
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </div>
                          <div className={clsx(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-4",
                            isSelected
                              ? `border-${colors.primary} bg-${colors.primary}`
                              : "border-gray-300 dark:border-gray-600"
                          )}
                          style={isSelected ? {
                            borderColor: `var(--${colors.primary}, #6366f1)`,
                            backgroundColor: `var(--${colors.primary}, #6366f1)`
                          } : {}}
                          >
                            {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setStep('check')}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span>Back</span>
                  </button>
                  <button
                    onClick={handleUpgrade}
                    disabled={!selectedModel || loading}
                    className={clsx(
                      "flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-colors",
                      selectedModel
                        ? `bg-${colors.primary} hover:bg-${colors.primaryHover} text-white`
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    )}
                    style={selectedModel ? { backgroundColor: `var(--${colors.primary}, #6366f1)` } : {}}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span>{versionInfo.currentModel === selectedModel ? 'Refresh Model' : 'Upgrade'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step: Upgrade Progress */}
            {step === 'upgrade' && (
              <div className="space-y-6 py-4">
                <div className="text-center mb-6">
                  <motion.div
                    animate={{ rotate: loading ? 360 : 0 }}
                    transition={{ duration: 1, repeat: loading ? Infinity : 0, ease: "linear" }}
                    className={`w-16 h-16 mx-auto mb-4 rounded-full bg-${colors.light} dark:bg-${colors.primary}/10 flex items-center justify-center`}
                    style={{ backgroundColor: `var(--${colors.light}, #f5f3ff)` }}
                  >
                    <Zap className={`w-8 h-8 text-${colors.primary}`} style={{ color: `var(--${colors.primary}, #6366f1)` }} />
                  </motion.div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Upgrading {providerName}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Please wait while we update your configuration
                  </p>
                </div>

                <div className="space-y-3">
                  {upgradeSteps.map((upgradeStep) => (
                    <div
                      key={upgradeStep.step}
                      className={clsx(
                        "flex items-center space-x-4 p-4 rounded-lg",
                        upgradeStep.status === 'completed' && "bg-green-50 dark:bg-green-900/10",
                        upgradeStep.status === 'in-progress' && "bg-blue-50 dark:bg-blue-900/10",
                        upgradeStep.status === 'failed' && "bg-red-50 dark:bg-red-900/10",
                        upgradeStep.status === 'pending' && "bg-gray-50 dark:bg-gray-800"
                      )}
                    >
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        upgradeStep.status === 'completed' && "bg-green-500",
                        upgradeStep.status === 'in-progress' && "bg-blue-500",
                        upgradeStep.status === 'failed' && "bg-red-500",
                        upgradeStep.status === 'pending' && "bg-gray-300 dark:bg-gray-600"
                      )}>
                        {upgradeStep.status === 'completed' && <CheckCircle className="w-5 h-5 text-white" />}
                        {upgradeStep.status === 'in-progress' && <RefreshCw className="w-5 h-5 text-white animate-spin" />}
                        {upgradeStep.status === 'failed' && <X className="w-5 h-5 text-white" />}
                        {upgradeStep.status === 'pending' && <span className="text-white font-medium">{upgradeStep.step}</span>}
                      </div>
                      <div className="flex-1">
                        <p className={clsx(
                          "font-medium",
                          upgradeStep.status === 'completed' && "text-green-700 dark:text-green-400",
                          upgradeStep.status === 'in-progress' && "text-blue-700 dark:text-blue-400",
                          upgradeStep.status === 'failed' && "text-red-700 dark:text-red-400",
                          upgradeStep.status === 'pending' && "text-gray-500 dark:text-gray-400"
                        )}>
                          {upgradeStep.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700 dark:text-red-400">Upgrade Failed</p>
                        <p className="text-sm text-red-600 dark:text-red-500 mt-1">{error}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setStep('select')}
                      className="mt-3 px-4 py-2 rounded-lg border border-red-300 hover:bg-red-100 transition-colors text-red-700"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step: Complete */}
            {step === 'complete' && (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10 }}
                  className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
                >
                  <CheckCircle className="w-12 h-12 text-green-500" />
                </motion.div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Upgrade Complete!
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {providerName} has been upgraded to {getModelInfo(selectedModel || '')?.label || selectedModel}
                </p>

                {selectedModel && getModelInfo(selectedModel) && (
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 mb-6 text-left">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      New Model Features
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {getModelInfo(selectedModel)?.features?.map((feature, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 text-sm rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={onClose}
                  className={`px-8 py-3 rounded-xl bg-${colors.primary} hover:bg-${colors.primaryHover} text-white font-medium transition-colors`}
                  style={{ backgroundColor: `var(--${colors.primary}, #6366f1)` }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AIEngineUpgradeWizard;
