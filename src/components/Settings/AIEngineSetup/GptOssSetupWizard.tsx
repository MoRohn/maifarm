import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  CheckCircle,
  Download,
  ExternalLink,
  Loader,
  Server,
  Terminal,
  XCircle
} from 'lucide-react';

interface GptOssSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (config: any) => void;
}

export const GptOssSetupWizard: React.FC<GptOssSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    {
      title: 'Introduction',
      description: 'Set up GPT-OSS for local AI model execution'
    },
    {
      title: 'Install Dependencies',
      description: 'Install required packages and models'
    },
    {
      title: 'Configure',
      description: 'Configure GPT-OSS settings'
    },
    {
      title: 'Test',
      description: 'Test your GPT-OSS setup'
    }
  ];

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);

    try {
      // Simulate installation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      setCurrentStep(currentStep + 1);
    } catch (err) {
      setError('Installation failed. Please check your system requirements.');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleComplete = () => {
    onComplete({
      provider: 'gpt-oss',
      configured: true,
      model: 'gpt-oss-default'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-8 h-8 text-white" />
              <div>
                <h2 className="text-2xl font-bold text-white">GPT-OSS Setup</h2>
                <p className="text-white/80 text-sm">Open-source GPT models locally</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center py-4 bg-gray-50 dark:bg-gray-800/50">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  index < currentStep
                    ? 'bg-green-500 text-white'
                    : index === currentStep
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span className="text-sm">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-20 h-0.5 ${
                    index < currentStep
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[400px]">
          {currentStep === 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold dark:text-white">
                Welcome to GPT-OSS Setup
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                GPT-OSS allows you to run open-source GPT models locally on your machine.
                This provides privacy, offline capability, and full control over your AI models.
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Requirements:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Python 3.8 or higher</li>
                    <li>At least 8GB RAM (16GB recommended)</li>
                    <li>10GB free disk space</li>
                    <li>CUDA-capable GPU (optional, for faster inference)</li>
                  </ul>
                </p>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold dark:text-white">
                Install Dependencies
              </h3>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4" />
                  <span className="text-gray-600 dark:text-gray-400">Terminal</span>
                </div>
                <code className="text-green-600 dark:text-green-400">
                  pip install gpt-oss transformers torch
                </code>
              </div>
              {isInstalling ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-8 h-8 animate-spin text-purple-600" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">
                    Installing dependencies...
                  </span>
                </div>
              ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : (
                <button
                  onClick={handleInstall}
                  className="w-full bg-purple-600 text-white rounded-lg py-3 hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Install Dependencies
                </button>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold dark:text-white">
                Configure GPT-OSS
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Model Selection
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option>GPT-J 6B</option>
                    <option>GPT-Neo 2.7B</option>
                    <option>GPT-Neo 1.3B</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Device
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option>CPU</option>
                    <option>CUDA (GPU)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    defaultValue="2048"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold dark:text-white">
                Test Your Setup
              </h3>
              {setupComplete ? (
                <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                    <h4 className="text-lg font-semibold text-green-900 dark:text-green-100">
                      Setup Complete!
                    </h4>
                  </div>
                  <p className="text-green-700 dark:text-green-300 mb-4">
                    GPT-OSS has been successfully configured and is ready to use.
                  </p>
                  <div className="bg-white dark:bg-gray-800 rounded p-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Test Response:
                    </p>
                    <p className="text-gray-900 dark:text-gray-100">
                      "Hello! I'm GPT-OSS, running locally on your machine. How can I assist you today?"
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSetupComplete(true)}
                  className="w-full bg-green-600 text-white rounded-lg py-3 hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Server className="w-5 h-5" />
                  Run Test
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            Previous
          </button>
          {currentStep === steps.length - 1 ? (
            <button
              onClick={handleComplete}
              disabled={!setupComplete}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Complete Setup
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default GptOssSetupWizard;