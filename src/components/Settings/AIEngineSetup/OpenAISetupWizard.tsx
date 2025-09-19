import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { FarmProgressBar } from './components/FarmProgressBar';
import { APIKeyValidator } from './components/APIKeyValidator';
import { useToast } from '@/hooks/useToast';

interface OpenAISetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (apiKey: string, model: string) => void;
}

const SETUP_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: '🚜',
    description: 'Get started'
  },
  {
    id: 'farmsize',
    title: 'Farm Size',
    icon: '📏',
    description: 'Your needs'
  },
  {
    id: 'tractor',
    title: 'Choose Tractor',
    icon: '🚜',
    description: 'Select model'
  },
  {
    id: 'fuel',
    title: 'Add Fuel',
    icon: '⛽',
    description: 'API key'
  },
  {
    id: 'ignition',
    title: 'Start Engine',
    icon: '🔥',
    description: 'Test & complete'
  }
];

interface FarmSize {
  id: string;
  name: string;
  description: string;
  icon: string;
  recommendedModel: string;
  monthlyBudget: string;
}

const FARM_SIZES: FarmSize[] = [
  {
    id: 'hobby',
    name: 'Hobby Farm',
    description: 'Personal projects, learning, small tasks',
    icon: '🌱',
    recommendedModel: 'gpt-3.5-turbo',
    monthlyBudget: '$5-20'
  },
  {
    id: 'family',
    name: 'Family Farm',
    description: 'Regular development, medium complexity',
    icon: '🌾',
    recommendedModel: 'gpt-4',
    monthlyBudget: '$20-100'
  },
  {
    id: 'commercial',
    name: 'Commercial Farm',
    description: 'Production workloads, complex projects',
    icon: '🏭',
    recommendedModel: 'gpt-4-turbo-preview',
    monthlyBudget: '$100+'
  }
];

interface ModelOption {
  id: string;
  name: string;
  tractor: string;
  power: string;
  speed: string;
  capacity: string;
  cost: string;
  best_for: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    tractor: '🚜',
    power: '⭐⭐⭐',
    speed: '⚡⚡⚡⚡⚡',
    capacity: '16K tokens',
    cost: '$',
    best_for: 'Quick tasks, chat, simple coding'
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    tractor: '🚜🚜',
    power: '⭐⭐⭐⭐',
    speed: '⚡⚡⚡',
    capacity: '8K tokens',
    cost: '$$$',
    best_for: 'Complex reasoning, detailed analysis'
  },
  {
    id: 'gpt-4-turbo-preview',
    name: 'GPT-4 Turbo',
    tractor: '🚜🚜🚜',
    power: '⭐⭐⭐⭐⭐',
    speed: '⚡⚡⚡⚡',
    capacity: '128K tokens',
    cost: '$$',
    best_for: 'Large codebases, vision, best overall'
  }
];

export const OpenAISetupWizard: React.FC<OpenAISetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFarmSize, setSelectedFarmSize] = useState<string>('family');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4-turbo-preview');
  const [apiKey, setApiKey] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const handleValidateKey = async (): Promise<boolean> => {
    try {
      // For now, just do basic validation
      // Check if the key starts with sk- (typical for OpenAI keys)
      if (apiKey && apiKey.startsWith('sk-')) {
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
        // Save the API key using the generic endpoint
        const response = await fetch('/api/apikeys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            service: 'openai',
            apiKey, 
            name: `OpenAI - ${selectedModel}`
          })
        });
        
        // Also save the model preference
        if (response.ok) {
          localStorage.setItem('openai_model', selectedModel);
          showSuccess('🎉 Your GPT tractor is fueled and ready to plow!');
          onComplete(apiKey, selectedModel);
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
                rotate: [0, -5, 5, 0],
                y: [0, -10, 0]
              }}
              transition={{ 
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-6xl mx-auto"
            >
              🚜
            </motion.div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Power Up Your Digital Tractor!
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              OpenAI's GPT models are powerful tractors for your code farm.
            </p>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">
                🌟 Why Choose GPT Tractors?
              </h3>
              <ul className="text-left space-y-2 text-green-800 dark:text-green-400">
                <li className="flex items-start gap-2">
                  <span>👁️</span>
                  <span>Vision capabilities - can "see" your screenshots</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>📊</span>
                  <span>Function calling for smart automations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>💬</span>
                  <span>Natural conversation flow</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🎯</span>
                  <span>JSON mode for structured outputs</span>
                </li>
              </ul>
            </div>
          </motion.div>
        );

      case 1: // Farm Size Assessment
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div className="text-6xl mx-auto mb-4">📏</motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                How Big Is Your Farm?
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Tell us about your coding needs so we can recommend the right tractor
              </p>
            </div>

            <div className="grid gap-4">
              {FARM_SIZES.map((size) => (
                <motion.button
                  key={size.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedFarmSize(size.id);
                    setSelectedModel(size.recommendedModel);
                  }}
                  className={`
                    p-6 rounded-xl border-2 transition-all text-left
                    ${selectedFarmSize === size.id
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-4xl">{size.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                        {size.name}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                        {size.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500 dark:text-gray-500">
                          💰 Budget: {size.monthlyBudget}/month
                        </span>
                        <span className="text-gray-500 dark:text-gray-500">
                          🚜 Recommended: {MODEL_OPTIONS.find(m => m.id === size.recommendedModel)?.name}
                        </span>
                      </div>
                    </div>
                    {selectedFarmSize === size.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-2xl"
                      >
                        ✅
                      </motion.div>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        );

      case 2: // Model Selection (Tractor Choice)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div 
                className="text-6xl mx-auto mb-4"
                animate={{ x: [-10, 10, -10] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                🚜
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Choose Your Tractor Model
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Each tractor has different power and capabilities
              </p>
            </div>

            <div className="space-y-4">
              {MODEL_OPTIONS.map((model) => (
                <motion.button
                  key={model.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedModel(model.id)}
                  className={`
                    w-full p-4 rounded-xl border-2 transition-all
                    ${selectedModel === model.id
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{model.tractor}</span>
                      <div className="text-left">
                        <h3 className="font-bold text-gray-900 dark:text-white">
                          {model.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {model.best_for}
                        </p>
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-2xl"
                      >
                        ✅
                      </motion.div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Power</div>
                      <div>{model.power}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Speed</div>
                      <div>{model.speed}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Capacity</div>
                      <div className="text-xs">{model.capacity}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Cost</div>
                      <div>{model.cost}</div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {selectedModel === 'gpt-4-turbo-preview' && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <p className="text-sm text-purple-800 dark:text-purple-300 flex items-start gap-2">
                  <span>👑</span>
                  <span>
                    <strong>Best Choice!</strong> GPT-4 Turbo offers the best balance of 
                    power, speed, and cost. Perfect for most farming operations!
                  </span>
                </p>
              </div>
            )}
          </motion.div>
        );

      case 3: // API Key (Fuel)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-6xl mx-auto mb-4"
              >
                ⛽
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Fuel Up Your Tractor
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Add your OpenAI API key to power your {MODEL_OPTIONS.find(m => m.id === selectedModel)?.name} tractor
              </p>
            </div>

            <APIKeyValidator
              provider="openai"
              value={apiKey}
              onChange={setApiKey}
              onValidate={handleValidateKey}
              placeholder="sk-..."
              helpText="Your API key is encrypted and never shared"
              farmTheme={true}
            />

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-4">
                ⛽ How to get your fuel (API key):
              </h3>
              
              <ol className="space-y-3 text-blue-800 dark:text-blue-400 text-sm">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  <div>
                    Visit <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" 
                      className="underline hover:text-blue-600">platform.openai.com</a>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>Navigate to API keys section</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <span>Create a new secret key</span>
                </li>
              </ol>
            </div>

            {isValidated && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4"
              >
                <p className="text-green-800 dark:text-green-300 flex items-center gap-2">
                  <span className="text-2xl">⛽</span>
                  Tank is full! Your tractor is ready to roll!
                </p>
              </motion.div>
            )}
          </motion.div>
        );

      case 4: // Complete (Start Engine)
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center"
          >
            <motion.div
              animate={{ 
                rotate: [0, 360],
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
              className="text-8xl mx-auto mb-4"
            >
              🔥
            </motion.div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Engine Started!
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Your {MODEL_OPTIONS.find(m => m.id === selectedModel)?.name} tractor is 
              warmed up and ready to plow through any coding challenge!
            </p>

            <div className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-4">
                🚜 Your Tractor Setup:
              </h3>
              <div className="space-y-2 text-left text-green-800 dark:text-green-400">
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="font-semibold">{MODEL_OPTIONS.find(m => m.id === selectedModel)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Power:</span>
                  <span>{MODEL_OPTIONS.find(m => m.id === selectedModel)?.power}</span>
                </div>
                <div className="flex justify-between">
                  <span>Field Capacity:</span>
                  <span>{MODEL_OPTIONS.find(m => m.id === selectedModel)?.capacity}</span>
                </div>
                <div className="flex justify-between">
                  <span>Farm Type:</span>
                  <span className="capitalize">{selectedFarmSize} Farm</span>
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleComplete}
              className="mx-auto px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Start Plowing! 🌾
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
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <span className="text-3xl">🚜</span>
                OpenAI GPT Setup Wizard
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
              variant="growing"
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
                        ? 'w-8 bg-green-500'
                        : index < currentStep
                        ? 'bg-green-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                      }
                    `}
                  />
                ))}
              </div>

              {currentStep < SETUP_STEPS.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(Math.min(SETUP_STEPS.length - 1, currentStep + 1))}
                  disabled={currentStep === 3 && !isValidated}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                    ${currentStep === 3 && !isValidated
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl'
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