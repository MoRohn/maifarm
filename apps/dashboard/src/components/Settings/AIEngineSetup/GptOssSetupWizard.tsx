import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, CheckCircleIcon, ServerIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/useToast';
import { ButtonLoadingState } from './components/WizardLoadingState';
import {
  PROVIDER_COLORS,
  MODAL_SIZES,
  getSuccessMessage,
  ERROR_MESSAGES,
  GPT_OSS_INSTALL_STEPS,
  PROVIDER_DOCS,
} from './wizardConstants';
import type { EngineConfigResult } from './wizardTypes';
import { invokeCallback } from './wizardTypes';
import { engineConfigService } from '@/services/engineConfigService';

interface GptOssSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: ((config: { configured: boolean }) => void) | ((result: EngineConfigResult) => void);
}

export const GptOssSetupWizard: React.FC<GptOssSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const colors = PROVIDER_COLORS['gpt-oss'];
  const docs = PROVIDER_DOCS['gpt-oss'] ?? { apiKeys: '', models: '', quickstart: '' };

  useEffect(() => {
    if (!isOpen) {
      setAcknowledged(false);
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleComplete = async () => {
    if (!acknowledged) {
      showError(ERROR_MESSAGES.ACKNOWLEDGMENT_REQUIRED);
      return;
    }

    setIsSaving(true);
    try {
      // Use new unified service
      const result = await engineConfigService.configure('gpt-oss', {
        config: { acknowledged: true },
      });

      showSuccess(getSuccessMessage('GPT-OSS'));

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
            aria-labelledby="gpt-oss-setup-title"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className={`w-full ${MODAL_SIZES.medium} rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-6 dark:border-gray-700">
              <div>
                <h2 id="gpt-oss-setup-title" className="text-xl font-semibold text-gray-900 dark:text-white">
                  GPT-OSS Local Engine
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Your local AI engine is ready to power agents with OpenAI GPT-OSS 20B.
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
            <div className="space-y-6 p-6">
              {/* Pre-installed Notice */}
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/10">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-green-600 dark:text-green-400" />
                  <div className="text-sm text-green-900 dark:text-green-100">
                    <p className="font-semibold">Already Installed & Ready</p>
                    <p className="mt-1 text-xs opacity-90">
                      GPT-OSS ships with MaiFarm by default. No API key or external service required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  What You Get
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <ServerIcon className="h-4 w-4 text-purple-500" />
                      Local Model
                    </div>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      OpenAI GPT-OSS 20B (21B params, 131K context)
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <CheckCircleIcon className="h-4 w-4 text-purple-500" />
                      No API Costs
                    </div>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Unlimited usage at no cost
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <CheckCircleIcon className="h-4 w-4 text-purple-500" />
                      Privacy First
                    </div>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Data never leaves your machine
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <CheckCircleIcon className="h-4 w-4 text-purple-500" />
                      Works Offline
                    </div>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      No internet connection needed
                    </p>
                  </div>
                </div>
              </div>

              {/* System Requirements */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex items-start gap-2">
                  <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="text-xs text-blue-900 dark:text-blue-100">
                    <p className="font-medium">Recommended System</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 opacity-90">
                      <li>8GB RAM minimum (16GB recommended)</li>
                      <li>4GB free disk space</li>
                      <li>Modern CPU (ARM or x86)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Acknowledgment Checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm transition hover:border-purple-300 hover:bg-purple-50/40 cursor-pointer dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-purple-400 dark:hover:bg-purple-900/10">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>
                  I understand GPT-OSS is already installed and ready to use as my default AI engine.
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {docs.models && (
                  <a
                    href={docs.models}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-${colors.primary} hover:underline dark:text-${colors.textDark}`}
                  >
                    Learn more about GPT-OSS →
                  </a>
                )}
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
                  disabled={isSaving || !acknowledged}
                  className={`inline-flex items-center rounded-lg bg-${colors.primary} px-4 py-2 text-sm font-medium text-white transition hover:bg-${colors.primaryHover} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isSaving ? <ButtonLoadingState message="Activating..." /> : 'Activate GPT-OSS'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
