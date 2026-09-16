import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, ServerStackIcon, CloudIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/useToast';
import { SecureApiKeyInput } from './components/SecureApiKeyInput';
import { ModelSelector } from './components/ModelSelector';
import { ButtonLoadingState } from './components/WizardLoadingState';
import { ValidationIndicator } from './components/ValidationIndicator';
import {
  PROVIDER_COLORS,
  PROVIDER_MODELS,
  PROVIDER_DOCS,
  MODAL_SIZES,
  getSuccessMessage,
  ERROR_MESSAGES,
  INFO_MESSAGES,
  API_KEY_FORMATS,
  STORAGE_KEYS,
  LLAMA_DEPLOYMENT_HELP,
} from './wizardConstants';
import type { EngineConfigResult, ValidationResult, DeploymentType } from './wizardTypes';
import { invokeCallback } from './wizardTypes';
import { engineConfigService } from '@/services/engineConfigService';

interface LlamaLocalSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: ((config: { useLocal: boolean; apiKey?: string; model: string }) => void) | ((result: EngineConfigResult) => void);
}

export const LlamaLocalSetupWizard: React.FC<LlamaLocalSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const llamaModels = PROVIDER_MODELS.llama ?? [];
  const [deployment, setDeployment] = useState<DeploymentType>('local');
  const [model, setModel] = useState(llamaModels[0]?.id ?? '');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | undefined>();
  const [isValidating, setIsValidating] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const colors = PROVIDER_COLORS.llama;
  const models = llamaModels;
  const docs = PROVIDER_DOCS.llama ?? { apiKeys: '', models: '', quickstart: '' };
  const formatHint = API_KEY_FORMATS.llama ?? { prefix: [], description: '' };

  useEffect(() => {
    if (!isOpen) {
      setDeployment('local');
      setModel(llamaModels[0]?.id ?? '');
      setApiKey('');
      setIsSaving(false);
      setValidation(undefined);
      setIsValidating(false);
    } else {
      // Load saved preferences
      const savedModel = localStorage.getItem(STORAGE_KEYS.LLAMA_MODEL);
      const savedDeployment = localStorage.getItem(STORAGE_KEYS.LLAMA_DEPLOYMENT);
      if (savedModel) setModel(savedModel);
      if (savedDeployment) setDeployment(savedDeployment as DeploymentType);
    }
  }, [isOpen]);

  // Debounced API key validation (only for cloud deployment)
  useEffect(() => {
    if (deployment !== 'cloud' || !apiKey || apiKey.length < 10) {
      setValidation(undefined);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidating(true);
      const result = await engineConfigService.validateApiKey('llama', apiKey);
      setValidation(result);
      setIsValidating(false);
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [apiKey, deployment]);

  const handleComplete = async () => {
    // Validate cloud deployment requires API key
    if (deployment === 'cloud') {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        showError(ERROR_MESSAGES.API_KEY_REQUIRED('DashScope'));
        return;
      }

      // Check format before submitting
      if (!formatHint.prefix.some(prefix => trimmed.startsWith(prefix))) {
        showError(ERROR_MESSAGES.API_KEY_FORMAT('DashScope', formatHint.prefix.join(' or ')));
        return;
      }
    }

    setIsSaving(true);
    try {
      // Use new unified service
      const result = await engineConfigService.configure('llama', {
        apiKey: deployment === 'cloud' ? apiKey.trim() : undefined,
        model,
        config: {
          useLocal: deployment === 'local',
          deployment,
        },
      });

      // Save preferences
      localStorage.setItem(STORAGE_KEYS.LLAMA_MODEL, model);
      localStorage.setItem(STORAGE_KEYS.LLAMA_DEPLOYMENT, deployment);

      showSuccess(getSuccessMessage('Llama'));

      // Call onComplete with backward compatibility
      invokeCallback(onComplete, result);

      onClose();
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : ERROR_MESSAGES.SAVE_FAILED);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isSaving && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="llama-setup-title"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className={`w-full ${MODAL_SIZES.large} rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-6 dark:border-gray-700">
              <div>
                <h2 id="llama-setup-title" className="text-xl font-semibold text-gray-900 dark:text-white">
                  Configure Llama
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Run Meta's Llama 3.1 8B-Instruct locally with Ollama or vLLM.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Close dialog"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="grid gap-6 p-6 md:grid-cols-2">
              {/* Left Column: Deployment Type & API Key */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Deployment Type
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Choose how you want to run Llama 3.1 for your AI agents.
                  </p>
                </div>

                {/* Deployment Selection */}
                <div className="space-y-3">
                  <motion.button
                    type="button"
                    onClick={() => setDeployment('local')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                      deployment === 'local'
                        ? `border-${colors.primary} bg-${colors.primary}/10 text-${colors.primary} dark:border-${colors.primaryHover} dark:bg-${colors.primaryHover}/20 dark:text-${colors.textDark}`
                        : `border-gray-300 bg-white text-gray-800 hover:border-${colors.primary} hover:bg-${colors.primary}/5 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100`
                    }`}
                  >
                    <ServerStackIcon className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Local with Ollama</p>
                      <p className="text-xs opacity-80">Free, private, runs offline</p>
                    </div>
                  </motion.button>

                </div>

                {/* Local Setup Guide */}
                {deployment === 'local' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20"
                  >
                    <div className="flex items-start gap-2">
                      <ServerStackIcon className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="text-xs text-emerald-900 dark:text-emerald-100">
                        <p className="font-medium">Setup Requirements</p>
                        <ol className="mt-2 list-decimal space-y-1 pl-4">
                          <li>Install Ollama from ollama.com</li>
                          <li>Run: <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-800">ollama pull llama3.1:8b-instruct</code></li>
                          <li>Verify: <code className="rounded bg-emerald-100 px-1 dark:bg-emerald-800">ollama list</code></li>
                        </ol>
                        <p className="mt-2">
                          <a
                            href={docs.models}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline hover:no-underline"
                          >
                            View complete setup guide →
                          </a>
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Right Column: Model Selection */}
              <div>
                <ModelSelector
                  options={models}
                  value={model}
                  onChange={setModel}
                  label="Default Model"
                  description={INFO_MESSAGES.MODEL_CHANGEABLE}
                  colorScheme="emerald"
                  showFeatures
                  showContextWindow
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <a
                  href={docs.models}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-${colors.primary} hover:underline dark:text-${colors.textDark}`}
                >
                  View Llama setup guide →
                </a>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={isSaving}
                  className={`inline-flex items-center rounded-lg bg-${colors.primary} px-4 py-2 text-sm font-medium text-white transition hover:bg-${colors.primaryHover} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isSaving ? <ButtonLoadingState message="Saving..." /> : 'Complete Setup'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
