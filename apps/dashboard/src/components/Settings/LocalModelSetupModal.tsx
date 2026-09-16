import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Terminal,
  Cpu,
  HardDrive,
  Zap,
  ExternalLink,
  Loader,
  RefreshCw
} from 'lucide-react';

interface LocalModelSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface OllamaStatus {
  installed: boolean;
  version?: string;
  running?: boolean;
  error?: string;
}

interface LocalModel {
  name: string;
  size: string;
  description: string;
  useCase: string;
  command: string;
  isInstalled?: boolean;
  parameterSize?: string;
}

const LocalModelSetupModal: React.FC<LocalModelSetupModalProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [availableModels, setAvailableModels] = useState<LocalModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [installProgress, setInstallProgress] = useState<string>('');

  const steps = [
    { title: 'Check Ollama', description: 'Verify Ollama installation' },
    { title: 'Select Model', description: 'Choose a Llama model for your needs' },
    { title: 'Install Model', description: 'Download and configure the model' },
    { title: 'Test Setup', description: 'Verify everything works' }
  ];

  // Check Ollama status on mount
  useEffect(() => {
    if (isOpen) {
      checkOllamaStatus();
    }
  }, [isOpen]);

  const checkOllamaStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/providers/ollama/status');
      const data = await response.json();
      
      if (data.success) {
        setOllamaStatus({
          installed: data.data.installed,
          version: data.data.version,
          running: data.data.running
        });
        
        // Load available models
        const modelsResponse = await fetch('/api/providers/ollama/models');
        const modelsData = await modelsResponse.json();
        
        if (modelsData.success) {
          const recommendations = modelsData.data.recommendations || [];
          const installedModels = modelsData.data.models || [];
          
          // Mark which models are installed
          const modelsWithStatus = recommendations.map((model: LocalModel) => ({
            ...model,
            isInstalled: installedModels.some((m: any) => 
              m.name.toLowerCase().includes(model.name.split(':')[0].toLowerCase())
            )
          }));
          
          setAvailableModels(modelsWithStatus);
        }
        
        if (data.data.installed) {
          setCurrentStep(1);
        }
      } else {
        setOllamaStatus({
          installed: false,
          error: 'Failed to check Ollama status'
        });
      }
    } catch (error) {
      setOllamaStatus({
        installed: false,
        error: 'Failed to connect to server'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const installOllama = () => {
    // Open Ollama download page
    window.open('https://ollama.ai/download', '_blank');
  };

  const pullModel = async (modelName: string) => {
    setIsLoading(true);
    setInstallProgress('Pulling model... This may take several minutes.');
    
    try {
      // Get pull instructions
      const instructionsResponse = await fetch(`/api/providers/ollama/instructions?model=${modelName}`);
      const instructions = await instructionsResponse.json();
      
      if (instructions.success) {
        // Show command to user
        setInstallProgress(`Run this command in your terminal:\n${instructions.data.command}`);
        
        // For now, we'll show the command and let the user run it manually
        // In a production app, we could trigger this server-side
        setTimeout(() => {
          setCurrentStep(3);
          setIsLoading(false);
        }, 3000);
      }
    } catch (error) {
      setInstallProgress('Failed to get installation instructions');
      setIsLoading(false);
    }
  };

  const testModel = async () => {
    if (!selectedModel) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/providers/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Test completed successfully - stay on step 3
        if (onComplete) {
          setTimeout(() => {
            onComplete();
            onClose();
          }, 2000);
        }
      } else {
        setInstallProgress('Model test failed. Please ensure the model is installed.');
      }
    } catch (error) {
      setInstallProgress('Failed to test model');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        // Check Ollama
        return (
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center py-8">
                <Loader className="w-8 h-8 animate-spin text-purple-600 mb-4" />
                <p className="text-gray-600">Checking Ollama installation...</p>
              </div>
            ) : ollamaStatus ? (
              <div>
                {ollamaStatus.installed ? (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <CheckCircle className="w-6 h-6 text-green-600 mt-1" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-green-900 dark:text-green-400 mb-2">
                          Ollama is installed!
                        </h4>
                        <p className="text-sm text-green-800 dark:text-green-300">
                          Version: {ollamaStatus.version || 'Unknown'}
                        </p>
                        <button
                          onClick={() => setCurrentStep(1)}
                          className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Continue to Model Selection
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <AlertCircle className="w-6 h-6 text-amber-600 mt-1" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-400 mb-2">
                          Ollama not detected
                        </h4>
                        <p className="text-sm text-amber-800 dark:text-amber-300 mb-4">
                          Ollama is required to run Llama models locally. It's free and easy to install.
                        </p>
                        <button
                          onClick={installOllama}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download Ollama
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        <button
                          onClick={checkOllamaStatus}
                          className="mt-3 flex items-center gap-2 px-4 py-2 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Check Again
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );

      case 1:
        // Select Model
        return (
          <div className="space-y-6">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                Choose a Llama Model
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a model based on your hardware and requirements.
              </p>
            </div>

            <div className="space-y-3">
              {availableModels.map((model) => (
                <div
                  key={model.name}
                  onClick={() => setSelectedModel(model.name)}
                  className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedModel === model.name
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                  }`}
                >
                  {model.isInstalled && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                        Installed
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-purple-600" />
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h5 className="font-semibold text-gray-900 dark:text-white">
                          {model.name}
                        </h5>
                        <span className="text-sm text-gray-500">
                          {model.size}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {model.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Best for: {model.useCase}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep(0)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (selectedModel) {
                    const model = availableModels.find(m => m.name === selectedModel);
                    if (model?.isInstalled) {
                      setCurrentStep(3); // Skip to test
                    } else {
                      setCurrentStep(2); // Go to install
                    }
                  }
                }}
                disabled={!selectedModel}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {selectedModel && availableModels.find(m => m.name === selectedModel)?.isInstalled
                  ? 'Test Model'
                  : 'Install Model'}
              </button>
            </div>
          </div>
        );

      case 2:
        // Install Model
        return (
          <div className="space-y-6">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                Install {selectedModel}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Run the following command in your terminal to install the model.
              </p>
            </div>

            <div className="bg-gray-900 text-gray-100 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" />
                <span className="text-xs font-mono">Terminal</span>
              </div>
              <code className="block font-mono text-sm">
                ollama pull {selectedModel}
              </code>
            </div>

            {installProgress && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">
                  {installProgress}
                </p>
              </div>
            )}

            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <h5 className="font-medium text-purple-900 dark:text-purple-400 mb-2">
                Why run locally?
              </h5>
              <ul className="space-y-2 text-sm text-purple-800 dark:text-purple-300">
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Zero latency - runs directly on your machine</span>
                </li>
                <li className="flex items-start gap-2">
                  <HardDrive className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Complete privacy - your code never leaves your device</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>No API costs - completely free to use</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                I've Installed the Model
              </button>
            </div>
          </div>
        );

      case 3:
        // Test Setup
        return (
          <div className="space-y-6">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                Test Your Setup
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Let's verify that {selectedModel} is working correctly.
              </p>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center py-8">
                <Loader className="w-8 h-8 animate-spin text-purple-600 mb-4" />
                <p className="text-gray-600">Testing model...</p>
              </div>
            ) : currentStep === 3 && selectedModel ? (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-green-600 mt-1" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 dark:text-green-400 mb-2">
                      Setup Complete!
                    </h4>
                    <p className="text-sm text-green-800 dark:text-green-300">
                      {selectedModel} is ready to use. You can now create farms using your local Llama model.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={testModel}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Run Test
                </button>
                
                <button
                  onClick={() => setCurrentStep(2)}
                  className="w-full mt-3 px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Back to Installation
                </button>
              </div>
            )}

            {installProgress && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {installProgress}
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Setup Local Llama Model
                </h3>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Progress Steps */}
              <div className="flex items-center gap-2 mt-4">
                {steps.map((step, index) => (
                  <React.Fragment key={index}>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                          index < currentStep
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            : index === currentStep
                            ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                        }`}
                      >
                        {index < currentStep ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span
                        className={`text-xs hidden sm:block ${
                          index <= currentStep
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-500'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 transition-colors ${
                          index < currentStep
                            ? 'bg-green-300 dark:bg-green-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
              {renderStepContent()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocalModelSetupModal;