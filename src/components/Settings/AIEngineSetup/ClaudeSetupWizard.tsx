import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { FarmProgressBar } from './components/FarmProgressBar';
import { APIKeyValidator } from './components/APIKeyValidator';
import { useToast } from '@/hooks/useToast';

interface ClaudeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (apiKey: string) => void;
}

const SETUP_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: '👋',
    description: 'Get started'
  },
  {
    id: 'prepare',
    title: 'Prepare Soil',
    icon: '🌱',
    description: 'Get API key'
  },
  {
    id: 'plant',
    title: 'Plant Seeds',
    icon: '🌾',
    description: 'Enter key'
  },
  {
    id: 'harvest',
    title: 'First Harvest',
    icon: '🎃',
    description: 'Test connection'
  }
];

export const ClaudeSetupWizard: React.FC<ClaudeSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const handleValidateKey = async (): Promise<boolean> => {
    try {
      // For now, just do basic validation
      // Check if the key starts with sk- (typical for Anthropic keys)
      if (apiKey && (apiKey.startsWith('sk-') || apiKey.startsWith('anthropic-'))) {
        setIsValidated(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  };

  const handleComplete = async () => {
    if (isValidated) {
      try {
        // Save the API key using the apikeys endpoint
        const response = await fetch('/api/apikeys/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            apiKey,
            name: 'Claude API Key'
          })
        });
        
        if (response.ok) {
          showSuccess('🎉 Your Claude AI farm is ready for harvest!');
          onComplete(apiKey);
        } else {
          showError('Failed to save configuration');
        }
      } catch (error) {
        showError('Failed to complete setup');
      }
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-6"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, -5, 5, 0]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-6xl mx-auto"
            >
              🌾
            </motion.div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome to Your AI Farm!
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Let's set up Claude AI to help cultivate your digital harvest.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 max-w-lg mx-auto">
              <h3 className="font-medium text-amber-900 dark:text-amber-300 mb-2 text-sm">
                🚜 What Claude brings:
              </h3>
              <ul className="text-left space-y-1 text-amber-800 dark:text-amber-400 text-xs">
                <li className="flex items-start gap-2">
                  <span>🌱</span>
                  <span>Advanced code understanding</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🤝</span>
                  <span>Multi-agent support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>📚</span>
                  <span>200K token context</span>
                </li>
              </ul>
            </div>
          </motion.div>
        );

      case 1: // Prepare (Get API Key)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="text-6xl mx-auto mb-4"
              >
                🌻
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Prepare Your Field
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                First, we need to get your Claude API key from Anthropic
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-4">
                📋 How to get your API key:
              </h3>
              
              <ol className="space-y-4 text-blue-800 dark:text-blue-400">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </span>
                  <div>
                    <p>Visit the Anthropic Console</p>
                    <a 
                      href="https://console.anthropic.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      console.anthropic.com
                      <span>↗️</span>
                    </a>
                  </div>
                </li>
                
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  <p>Sign in or create an account</p>
                </li>
                
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-sm font-bold">
                    3
                  </span>
                  <p>Navigate to "API Keys" in the sidebar</p>
                </li>
                
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-sm font-bold">
                    4
                  </span>
                  <p>Click "Create Key" and copy your new API key</p>
                </li>
              </ol>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
                <span>💡</span>
                <span>
                  Keep your API key safe! It's like the key to your barn - 
                  don't share it with anyone you don't trust.
                </span>
              </p>
            </div>
          </motion.div>
        );

      case 2: // Plant (Enter API Key)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-6xl mx-auto mb-4"
              >
                🌾
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Plant Your Seeds
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Enter your Claude API key to connect your farm
              </p>
            </div>

            <APIKeyValidator
              provider="claude"
              value={apiKey}
              onChange={setApiKey}
              onValidate={handleValidateKey}
              placeholder="sk-ant-api03-..."
              helpText="Your API key starts with 'sk-ant-' and is kept securely encrypted"
              farmTheme={true}
            />

            {isValidated && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4"
              >
                <p className="text-green-800 dark:text-green-300 flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  Excellent! Your field is fertile and ready for planting!
                </p>
              </motion.div>
            )}
          </motion.div>
        );

      case 3: // Harvest (Test & Complete)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center"
          >
            <motion.div
              animate={{ 
                rotate: [0, -10, 10, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-8xl mx-auto mb-4"
            >
              🎃
            </motion.div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Your First Harvest!
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Congratulations! Your Claude AI farm is set up and ready to produce amazing results.
            </p>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-4">
                🌟 What's Next?
              </h3>
              <ul className="text-left space-y-3 text-green-800 dark:text-green-400">
                <li className="flex items-start gap-2">
                  <span>🚀</span>
                  <span>Create your first farm to start coding</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>👥</span>
                  <span>Launch multiple agents for complex tasks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>📊</span>
                  <span>Monitor your harvest in real-time</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🏚️</span>
                  <span>Store results in your digital barn</span>
                </li>
              </ul>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleComplete}
              className="mx-auto px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Start Farming! 🚜
            </motion.button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-400 to-orange-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <span className="text-3xl">🌾</span>
                Claude AI Setup Wizard
              </h1>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Progress Bar */}
            <FarmProgressBar
              currentStep={currentStep}
              totalSteps={SETUP_STEPS.length - 1}
              steps={SETUP_STEPS}
              variant="planting"
            />
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto min-h-0">
            {renderStepContent()}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                  ${currentStep === 0
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }
                `}
              >
                <ArrowLeftIcon className="w-5 h-5" />
                Back
              </button>

              <div className="flex items-center gap-2">
                {SETUP_STEPS.map((_, index) => (
                  <div
                    key={index}
                    className={`
                      w-2 h-2 rounded-full transition-all
                      ${index === currentStep
                        ? 'w-8 bg-orange-500'
                        : index < currentStep
                        ? 'bg-orange-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                      }
                    `}
                  />
                ))}
              </div>

              {currentStep < SETUP_STEPS.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(Math.min(SETUP_STEPS.length - 1, currentStep + 1))}
                  disabled={currentStep === 2 && !isValidated}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                    ${currentStep === 2 && !isValidated
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-lg hover:shadow-xl'
                    }
                  `}
                >
                  Next
                  <ArrowRightIcon className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Complete Setup
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};