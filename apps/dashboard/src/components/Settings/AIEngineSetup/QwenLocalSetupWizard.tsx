import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowRightIcon, ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { FarmProgressBar } from './components/FarmProgressBar';
import { APIKeyValidator } from './components/APIKeyValidator';
import { useToast } from '@/hooks/useToast';

interface QwenLocalSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (config: { useLocal: boolean; apiKey?: string; model: string }) => void;
}

const SETUP_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: '🌻',
    description: 'Get started'
  },
  {
    id: 'choose',
    title: 'Choose Path',
    icon: '🛤️',
    description: 'Local or cloud'
  },
  {
    id: 'setup',
    title: 'Plant Garden',
    icon: '🌱',
    description: 'Install Qwen'
  },
  {
    id: 'configure',
    title: 'Water Seeds',
    icon: '💧',
    description: 'Configure'
  },
  {
    id: 'bloom',
    title: 'Watch Bloom',
    icon: '🌸',
    description: 'Test & complete'
  }
];

const LOCAL_MODELS = [
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen2.5 Coder 7B',
    icon: '🌱',
    size: '4.5 GB',
    speed: '⚡⚡⚡⚡⚡',
    memory: '8 GB RAM',
    description: 'Perfect for home gardens - fast and efficient'
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'Qwen2.5 Coder 14B',
    icon: '🌿',
    size: '8.9 GB',
    speed: '⚡⚡⚡⚡',
    memory: '16 GB RAM',
    description: 'Balanced growth - great for most projects'
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen2.5 Coder 32B',
    icon: '🌳',
    size: '19 GB',
    speed: '⚡⚡⚡',
    memory: '32 GB RAM',
    description: 'Full orchard - maximum capability'
  }
];

export const QwenLocalSetupWizard: React.FC<QwenLocalSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [deploymentChoice, setDeploymentChoice] = useState<'local' | 'cloud'>('local');
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder:7b');
  const [apiKey, setApiKey] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'installed' | 'not-installed'>('checking');
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    if (currentStep === 2 && deploymentChoice === 'local') {
      checkOllamaStatus();
    }
  }, [currentStep, deploymentChoice]);

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/version');
      if (response.ok) {
        setOllamaStatus('installed');
      } else {
        setOllamaStatus('not-installed');
      }
    } catch (error) {
      setOllamaStatus('not-installed');
    }
  };

  const handleValidateKey = async (): Promise<boolean> => {
    if (deploymentChoice === 'local') {
      // For local, check if Ollama is running
      try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
          setIsValidated(true);
          return true;
        }
      } catch (error) {
        console.error('Ollama not accessible:', error);
      }
      return false;
    } else {
      // For cloud, validate DashScope API key
      try {
        const response = await fetch('/api/providers/qwen/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
        
        const result = await response.json();
        if (result.success) {
          setIsValidated(true);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Validation error:', error);
        return false;
      }
    }
  };

  const handleComplete = async () => {
    if (deploymentChoice === 'local' || isValidated) {
      try {
        const config = {
          useLocal: deploymentChoice === 'local',
          apiKey: deploymentChoice === 'cloud' ? apiKey : undefined,
          model: selectedModel
        };

        const response = await fetch('/api/providers/qwen/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        
        if (response.ok) {
          showSuccess('🌸 Your Qwen garden is blooming beautifully!');
          onComplete(config);
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
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-6xl mx-auto"
            >
              🌻
            </motion.div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Grow Your Own AI Garden!
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Qwen-Coder grows right on your computer - no internet needed!
            </p>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-3">
                🌱 Why Grow a Qwen Garden?
              </h3>
              <ul className="text-left space-y-2 text-yellow-800 dark:text-yellow-400">
                <li className="flex items-start gap-2">
                  <span>🏡</span>
                  <span>Runs locally on your machine - complete privacy</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🚀</span>
                  <span>Blazing fast responses with no network delays</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>💰</span>
                  <span>Completely free - no API costs ever</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🔒</span>
                  <span>Your code never leaves your computer</span>
                </li>
              </ul>
            </div>
          </motion.div>
        );

      case 1: // Choose Deployment Path
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <motion.div className="text-6xl mx-auto mb-4">🛤️</motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Choose Your Garden Location
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Will you grow Qwen in your backyard or use the community garden?
              </p>
            </div>

            <div className="grid gap-4">
              {/* Local Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDeploymentChoice('local')}
                className={`
                  p-6 rounded-xl border-2 transition-all text-left
                  ${deploymentChoice === 'local'
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <span className="text-5xl">🏡</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                      Backyard Garden (Local)
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      Grow Qwen right on your computer - completely private and free forever!
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-green-600 dark:text-green-400">✅ 100% Privacy</p>
                      <p className="text-xs text-green-600 dark:text-green-400">✅ No internet needed</p>
                      <p className="text-xs text-green-600 dark:text-green-400">✅ Zero cost</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Needs 8GB+ RAM</p>
                    </div>
                  </div>
                  {deploymentChoice === 'local' && (
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

              {/* Cloud Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDeploymentChoice('cloud')}
                className={`
                  p-6 rounded-xl border-2 transition-all text-left
                  ${deploymentChoice === 'cloud'
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <span className="text-5xl">☁️</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                      Community Garden (Cloud)
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      Use Alibaba's DashScope API - powerful and ready instantly!
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-green-600 dark:text-green-400">✅ No setup needed</p>
                      <p className="text-xs text-green-600 dark:text-green-400">✅ Works on any device</p>
                      <p className="text-xs text-green-600 dark:text-green-400">✅ Always latest model</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">💳 Free tier available</p>
                    </div>
                  </div>
                  {deploymentChoice === 'cloud' && (
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
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <p className="text-sm text-purple-800 dark:text-purple-300 flex items-start gap-2">
                <span>💡</span>
                <span>
                  <strong>Pro tip:</strong> Start with the backyard garden (local) for complete 
                  privacy and zero costs. You can always switch to cloud later!
                </span>
              </p>
            </div>
          </motion.div>
        );

      case 2: // Setup (Install for local, API key for cloud)
        if (deploymentChoice === 'local') {
          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-6xl mx-auto mb-4"
                >
                  🌱
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Let's Plant Your Garden!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  We'll help you set up Ollama - it's like the soil for your AI garden
                </p>
              </div>

              {ollamaStatus === 'checking' && (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="text-4xl mx-auto mb-4"
                  >
                    🔍
                  </motion.div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Checking if your garden soil is ready...
                  </p>
                </div>
              )}

              {ollamaStatus === 'installed' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-300">
                      Great! Your garden soil (Ollama) is ready!
                    </h3>
                  </div>
                  <p className="text-green-800 dark:text-green-400">
                    Ollama is installed and running. Now let's choose which seeds to plant!
                  </p>
                </motion.div>
              )}

              {ollamaStatus === 'not-installed' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-4">
                      🪴 Quick Garden Setup (2 minutes)
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-blue-800 dark:text-blue-400 mb-2">
                          Step 1: Download Ollama (the garden soil)
                        </h4>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            Visit the Ollama website to download:
                          </p>
                          <a 
                            href="https://ollama.com/download" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                          >
                            Download Ollama
                            <span>↗️</span>
                          </a>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-blue-800 dark:text-blue-400 mb-2">
                          Step 2: Install and Run
                        </h4>
                        <div className="bg-gray-900 text-green-400 rounded-lg p-3 font-mono text-sm">
                          <p className="mb-1"># After installing, open Terminal and run:</p>
                          <p>ollama run qwen2.5-coder:7b</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-blue-800 dark:text-blue-400 mb-2">
                          Step 3: That's it! 🎉
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          Your garden will be ready in about 5 minutes (downloading the model)
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={checkOllamaStatus}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all"
                  >
                    🔄 Check Again (after installing)
                  </button>
                </div>
              )}
            </motion.div>
          );
        } else {
          // Cloud setup - API key
          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <motion.div
                  animate={{ 
                    y: [0, -5, 0],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ 
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="text-6xl mx-auto mb-4"
                >
                  ☁️
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Connect to the Cloud Garden
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  Get your DashScope API key to access Qwen in the cloud
                </p>
              </div>

              <APIKeyValidator
                provider="qwen"
                value={apiKey}
                onChange={setApiKey}
                onValidate={handleValidateKey}
                placeholder="sk-..."
                helpText="Your DashScope API key for cloud access"
                farmTheme={true}
              />

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-4">
                  ☁️ How to get your cloud garden pass:
                </h3>
                
                <ol className="space-y-3 text-blue-800 dark:text-blue-400 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <div>
                      Visit DashScope Console
                      <a href="https://dashscope.console.aliyun.com" target="_blank" rel="noopener noreferrer" 
                        className="ml-2 underline hover:text-blue-600">
                        dashscope.console.aliyun.com ↗️
                      </a>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>Sign up or login with Alibaba Cloud account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>Go to "API Keys" and create a new key</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-200 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Copy and paste your key above</span>
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
                    <span className="text-2xl">☁️</span>
                    Connected to the cloud garden successfully!
                  </p>
                </motion.div>
              )}
            </motion.div>
          );
        }

      case 3: // Configure (Model selection)
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
                💧
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Choose Your Garden Size
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {deploymentChoice === 'local' 
                  ? 'Pick the right size for your computer garden'
                  : 'Select your cloud garden capacity'
                }
              </p>
            </div>

            <div className="space-y-4">
              {LOCAL_MODELS.map((model) => (
                <motion.button
                  key={model.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedModel(model.id)}
                  className={`
                    w-full p-4 rounded-xl border-2 transition-all text-left
                    ${selectedModel === model.id
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{model.icon}</span>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">
                          {model.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {model.description}
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

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Size</div>
                      <div className="font-medium">{model.size}</div>
                    </div>
                    <div className="text-center bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Speed</div>
                      <div>{model.speed}</div>
                    </div>
                    <div className="text-center bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Needs</div>
                      <div className="text-xs">{model.memory}</div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {selectedModel === 'qwen2.5-coder:7b' && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
                  <span>🌱</span>
                  <span>
                    <strong>Perfect choice!</strong> The 7B model is like a starter garden - 
                    grows quickly, doesn't need much space, and produces great results!
                  </span>
                </p>
              </div>
            )}

            {deploymentChoice === 'local' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  💡 First time download will take 5-10 minutes depending on your internet speed
                </p>
              </div>
            )}
          </motion.div>
        );

      case 4: // Complete
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-8xl mx-auto mb-4"
            >
              🌸
            </motion.div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Your Garden is Blooming!
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              {deploymentChoice === 'local'
                ? "Your private AI garden is ready! Everything runs on your computer - no internet needed!"
                : "You're connected to the cloud garden! Powerful AI at your fingertips!"
              }
            </p>

            <div className="bg-gradient-to-br from-green-50 to-yellow-50 dark:from-green-900/20 dark:to-yellow-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-4">
                🌻 Your Garden Setup:
              </h3>
              <div className="space-y-2 text-left text-green-800 dark:text-green-400">
                <div className="flex justify-between">
                  <span>Location:</span>
                  <span className="font-semibold">
                    {deploymentChoice === 'local' ? '🏡 Local Garden' : '☁️ Cloud Garden'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="font-semibold">
                    {LOCAL_MODELS.find(m => m.id === selectedModel)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Privacy:</span>
                  <span className="font-semibold">
                    {deploymentChoice === 'local' ? '🔒 100% Private' : '🔐 Encrypted'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cost:</span>
                  <span className="font-semibold">
                    {deploymentChoice === 'local' ? '💚 Free Forever' : '💙 Pay as you grow'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">
                🚀 Ready to Code!
              </h3>
              <ul className="text-left space-y-2 text-blue-800 dark:text-blue-400">
                <li className="flex items-start gap-2">
                  <span>🌱</span>
                  <span>Create farms with Qwen as your AI engine</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>💬</span>
                  <span>Chat naturally in multiple languages</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🔧</span>
                  <span>Generate, debug, and refactor code</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>📚</span>
                  <span>Huge 128K context window for large projects</span>
                </li>
              </ul>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleComplete}
              className="mx-auto px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Start Growing Code! 🌻
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
          <div className="bg-gradient-to-r from-yellow-400 to-amber-500 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <span className="text-3xl">🌻</span>
                Qwen Garden Setup Wizard
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
                        ? 'w-8 bg-yellow-500'
                        : index < currentStep
                        ? 'bg-yellow-400'
                        : 'bg-gray-300 dark:bg-gray-600'
                      }
                    `}
                  />
                ))}
              </div>

              {currentStep < SETUP_STEPS.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(Math.min(SETUP_STEPS.length - 1, currentStep + 1))}
                  disabled={
                    (currentStep === 2 && deploymentChoice === 'local' && ollamaStatus !== 'installed') ||
                    (currentStep === 2 && deploymentChoice === 'cloud' && !isValidated)
                  }
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                    ${(currentStep === 2 && deploymentChoice === 'local' && ollamaStatus !== 'installed') ||
                      (currentStep === 2 && deploymentChoice === 'cloud' && !isValidated)
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white hover:from-yellow-600 hover:to-amber-700 shadow-lg hover:shadow-xl'
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