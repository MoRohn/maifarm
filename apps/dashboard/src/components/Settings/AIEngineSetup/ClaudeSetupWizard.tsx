import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
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
} from './wizardConstants';
import type { EngineConfigResult, ValidationResult } from './wizardTypes';
import { invokeCallback } from './wizardTypes';
import { engineConfigService } from '@/services/engineConfigService';

interface ClaudeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: ((apiKey: string, model: string) => void) | ((result: EngineConfigResult) => void);
}

export const ClaudeSetupWizard: React.FC<ClaudeSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [apiKey, setApiKey] = useState('');
  const claudeModels = PROVIDER_MODELS.claude ?? [];
  const [model, setModel] = useState(claudeModels[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | undefined>();
  const [isValidating, setIsValidating] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const colors = PROVIDER_COLORS.claude;
  const models = claudeModels;
  const docs = PROVIDER_DOCS.claude ?? { apiKeys: '', models: '', quickstart: '' };
  const formatHint = API_KEY_FORMATS.claude ?? { prefix: [], description: '' };

  useEffect(() => {
    if (!isOpen) {
      setApiKey('');
      setModel(claudeModels[0]?.id ?? '');
      setIsSaving(false);
      setValidation(undefined);
      setIsValidating(false);
    } else {
      // Load saved model preference
      const savedModel = localStorage.getItem(STORAGE_KEYS.CLAUDE_MODEL);
      if (savedModel) {
        setModel(savedModel);
      }
    }
  }, [isOpen]);

  // Debounced API key validation with proper cleanup
  useEffect(() => {
    if (!apiKey || apiKey.length < 10) {
      setValidation(undefined);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await engineConfigService.validateApiKey('claude', apiKey);
        if (!cancelled) {
          setValidation(result);
          setIsValidating(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Validation error:', error);
          setValidation({ valid: false, message: 'Validation failed' });
          setIsValidating(false);
        }
      }
    }, 1000); // 1 second debounce

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      setIsValidating(false);
    };
  }, [apiKey]);

  const handleComplete = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      showError(ERROR_MESSAGES.API_KEY_REQUIRED('Claude'));
      return;
    }

    // Check format before submitting
    if (!formatHint.prefix.some(prefix => trimmed.startsWith(prefix))) {
      showError(ERROR_MESSAGES.API_KEY_FORMAT('Claude', formatHint.prefix.join(' or ')));
      return;
    }

    setIsSaving(true);
    try {
      // Use new unified service
      const result = await engineConfigService.configure('claude', {
        apiKey: trimmed,
        model,
      });

      // Save model preference
      localStorage.setItem(STORAGE_KEYS.CLAUDE_MODEL, model);

      showSuccess(getSuccessMessage('Claude'));

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
            aria-labelledby="claude-setup-title"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className={`w-full ${MODAL_SIZES.large} rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-6 dark:border-gray-700">
              <div>
                <h2 id="claude-setup-title" className="text-xl font-semibold text-gray-900 dark:text-white">
                  Configure Claude
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Connect your Anthropic account to power your AI agents with Claude.
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
              {/* Left Column: API Key */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    API Key
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatHint.description}
                  </p>
                </div>

                <SecureApiKeyInput
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder="sk-ant-..."
                  label=""
                  helperText={INFO_MESSAGES.API_KEY_SECURE}
                  autoFocus
                />

                {/* Validation Indicator */}
                <ValidationIndicator
                  validation={validation}
                  isValidating={isValidating}
                  showDetails={validation?.valid}
                  size="sm"
                />

                {/* Documentation Link */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                  <div className="flex items-start gap-2">
                    <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                    <div className="text-xs text-blue-900 dark:text-blue-100">
                      <p className="font-medium">Need an API key?</p>
                      <p className="mt-1">
                        Generate one from the{' '}
                        <a
                          href={docs.apiKeys}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline hover:no-underline"
                        >
                          Anthropic Console
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Model Selection */}
              <div>
                <ModelSelector
                  options={models}
                  value={model}
                  onChange={setModel}
                  label="Default Model"
                  description={INFO_MESSAGES.MODEL_CHANGEABLE}
                  colorScheme="purple"
                  showFeatures
                  showContextWindow
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <a
                  href={docs.quickstart}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-${colors.primary} hover:underline dark:text-${colors.textDark}`}
                >
                  View Claude setup guide →
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
                  disabled={isSaving || !apiKey.trim() || (validation !== undefined && !validation.valid)}
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
