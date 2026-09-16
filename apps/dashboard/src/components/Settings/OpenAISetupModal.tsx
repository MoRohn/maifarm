import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XMarkIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  KeyIcon,
  CpuChipIcon,
  SparklesIcon,
  DocumentTextIcon,
  EyeIcon,
  CodeBracketIcon
} from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/useToast';

interface OpenAISetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: (apiKey: string, model: string) => void;
}

interface OpenAIModel {
  id: string;
  name: string;
  description: string;
  contextWindow: string;
  features: string[];
  recommended?: boolean;
}

const OPENAI_MODELS: OpenAIModel[] = [
  {
    id: 'gpt-4-turbo-preview',
    name: 'GPT-4 Turbo',
    description: 'Latest GPT-4 model with 128K context window',
    contextWindow: '128K tokens',
    features: ['Function calling', 'JSON mode', 'Vision capabilities', 'Advanced reasoning'],
    recommended: true
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'Standard GPT-4 model with 8K context',
    contextWindow: '8K tokens',
    features: ['Function calling', 'Advanced reasoning', 'High accuracy']
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and cost-effective model',
    contextWindow: '16K tokens',
    features: ['Function calling', 'JSON mode', 'Fast responses']
  }
];

export const OpenAISetupModal: React.FC<OpenAISetupModalProps> = ({
  isOpen,
  onClose,
  onSetupComplete
}) => {
  const [step, setStep] = useState<'info' | 'setup' | 'validation'>('info');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4-turbo-preview');
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    // Check if API key already exists
    checkExistingKey();
  }, []);

  const checkExistingKey = async () => {
    try {
      const response = await fetch('/api/providers/openai/status');
      const result = await response.json();
      if (result.success && result.data.configured) {
        setApiKey('sk-...***' + (result.data.keyPreview || ''));
        setSelectedModel(result.data.model || 'gpt-4-turbo-preview');
      }
    } catch (error) {
      console.error('Failed to check existing OpenAI configuration:', error);
    }
  };

  const validateApiKey = async () => {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      showError('Please enter a valid OpenAI API key (starts with sk-)');
      return;
    }

    setIsValidating(true);
    setValidationStatus('idle');

    try {
      const response = await fetch('/api/providers/openai/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey, 
          model: selectedModel 
        })
      });

      const result = await response.json();

      if (result.success) {
        setValidationStatus('success');
        setValidationMessage('API key validated successfully! Models are accessible.');
        showSuccess('OpenAI API key validated successfully');
        
        // Save configuration
        await saveConfiguration();
        
        setTimeout(() => {
          onSetupComplete(apiKey, selectedModel);
        }, 1500);
      } else {
        setValidationStatus('error');
        setValidationMessage(result.error || 'Invalid API key or insufficient permissions');
        showError(result.error || 'API key validation failed');
      }
    } catch (error) {
      setValidationStatus('error');
      setValidationMessage('Failed to validate API key. Please check your connection.');
      showError('Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      await fetch('/api/providers/openai/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: selectedModel,
          enabled: true
        })
      });
    } catch (error) {
      console.error('Failed to save OpenAI configuration:', error);
    }
  };

  const renderInfoStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <SparklesIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          OpenAI GPT-4 Integration
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enhance your AI farm with OpenAI's powerful GPT-4 models
        </p>
      </div>

      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">
          Key Benefits of OpenAI GPT-4:
        </h4>
        <div className="space-y-3">
          <div className="flex gap-3">
            <CodeBracketIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Function Calling</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Native support for structured function calls, perfect for tool-based agent workflows
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <DocumentTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">JSON Mode</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Guaranteed JSON output format for reliable structured data processing
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <EyeIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Vision Capabilities</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Analyze images, diagrams, and screenshots alongside text (GPT-4 Turbo)
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CpuChipIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Large Context Window</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Up to 128K tokens context window for processing extensive codebases
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex gap-3">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-blue-900 dark:text-blue-200 font-medium mb-1">
              Getting Started:
            </p>
            <ol className="text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Sign up at platform.openai.com if you don't have an account</li>
              <li>Navigate to API Keys section in your OpenAI dashboard</li>
              <li>Create a new API key and copy it</li>
              <li>Paste the key in the next step to complete setup</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            Open OpenAI Dashboard
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          </a>
          <button
            onClick={() => setStep('setup')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue Setup
          </button>
        </div>
      </div>
    </div>
  );

  const renderSetupStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <KeyIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Configure OpenAI API
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enter your API key and select your preferred model
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            OpenAI API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <EyeIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Your API key will be securely stored and encrypted
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Model
          </label>
          <div className="space-y-2">
            {OPENAI_MODELS.map((model) => (
              <div
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedModel === model.id
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {model.name}
                      </h4>
                      {model.recommended && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {model.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Context: {model.contextWindow}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {model.features.map((feature, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className={`w-5 h-5 rounded-full border-2 ${
                      selectedModel === model.id
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedModel === model.id && (
                        <CheckCircleIcon className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {validationStatus === 'success' && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="flex gap-3">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              {validationMessage}
            </p>
          </div>
        </div>
      )}

      {validationStatus === 'error' && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {validationMessage}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button
          onClick={() => setStep('info')}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={validateApiKey}
          disabled={!apiKey || isValidating}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isValidating ? 'Validating...' : 'Validate & Save'}
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                OpenAI GPT-4 Setup
              </h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              {step === 'info' && renderInfoStep()}
              {step === 'setup' && renderSetupStep()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};