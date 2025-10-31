import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HardDrive, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Server,
  Cpu,
  RefreshCw,
  Settings,
  FolderOpen,
  Terminal
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { OllamaStatus, ModelValidation, RecommendedModel } from '@/types/ollama';
import ModelSetupModal from './ModelSetupModal';

const LocalModelSettings: React.FC = () => {
  const { success: showSuccess, error: showError, info: showInfo } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [customPath, setCustomPath] = useState('');

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ollama/status');
      const data = await response.json();
      
      if (data.success) {
        setOllamaStatus(data.data);
        
        // Auto-select best Qwen model if available
        if (data.data.qwenModelInstalled && data.data.availableModels.length > 0) {
          const qwenModel = data.data.availableModels.find((m: any) => 
            m.name.toLowerCase().includes('qwen')
          );
          if (qwenModel) {
            setSelectedModel(qwenModel.name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      showError('Failed to check local model status');
    } finally {
      setIsLoading(false);
    }
  };

  const validateModel = async () => {
    if (!selectedModel) {
      showError('Please select a model to validate');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/ollama/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: selectedModel })
      });
      
      const result: ModelValidation = await response.json();
      
      if (result.valid) {
        showSuccess(`Model ${selectedModel} is valid and ready to use!`);
        
        // Configure the model as default
        await configureLocalModel(selectedModel);
      } else {
        showError(result.message || 'Model validation failed');
        if (result.instructions) {
          setShowSetupModal(true);
        }
      }
    } catch (error) {
      showError('Failed to validate model');
    } finally {
      setIsValidating(false);
    }
  };

  const configureLocalModel = async (modelName: string) => {
    try {
      const response = await fetch('/api/ollama/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          modelName,
          ollamaPath: customPath || undefined
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess('Local Qwen model configured successfully!');
        await checkOllamaStatus(); // Refresh status
      } else {
        showError('Failed to configure local model');
      }
    } catch (error) {
      showError('Configuration error');
    }
  };

  const testModel = async () => {
    if (!selectedModel) {
      showError('Please select a model to test');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          modelName: selectedModel,
          prompt: 'Write a simple hello world function in Python.'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess('Model test successful! Check console for output.');
        console.log('Model response:', result.response);
      } else {
        showError(result.error || 'Test failed');
      }
    } catch (error) {
      showError('Failed to test model');
    } finally {
      setIsLoading(false);
    }
  };

  const startOllamaService = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ollama/start', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess('Ollama service started successfully');
        setTimeout(checkOllamaStatus, 2000);
      } else {
        showError(result.message || 'Failed to start Ollama');
      }
    } catch (error) {
      showError('Failed to start Ollama service');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Local Model Configuration
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Configure local Qwen models via Ollama for private, offline AI capabilities
              </p>
            </div>
            <button
              onClick={checkOllamaStatus}
              disabled={isLoading}
              className="p-2 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Benefits Section */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>No API costs - runs locally</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Complete data privacy</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Works offline</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Fast inference on good hardware</span>
            </div>
          </div>
        </div>

        {/* Status Section */}
        {ollamaStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm"
          >
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">
              Ollama Status
            </h4>
            
            <div className="space-y-3">
              {/* Installation Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium">Ollama Installed</span>
                </div>
                <div className="flex items-center gap-2">
                  {ollamaStatus.isInstalled ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">Yes</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                      <span className="text-sm text-yellow-600 dark:text-yellow-400">Not Found</span>
                    </>
                  )}
                </div>
              </div>

              {/* Service Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium">Service Running</span>
                </div>
                <div className="flex items-center gap-2">
                  {ollamaStatus.isRunning ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">Active</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <button
                        onClick={startOllamaService}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                      >
                        Start Service
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Qwen Model Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium">Qwen Model</span>
                </div>
                <div className="flex items-center gap-2">
                  {ollamaStatus.qwenModelInstalled ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">Installed</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                      <button
                        onClick={() => setShowSetupModal(true)}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                      >
                        Install Model
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Models Path */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium">Models Directory</span>
              </div>
              <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                {ollamaStatus.modelsPath}
              </code>
            </div>
          </motion.div>
        )}

        {/* Model Selection */}
        {ollamaStatus?.availableModels && ollamaStatus.availableModels.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm"
          >
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">
              Available Models
            </h4>
            
            <div className="space-y-2">
              {ollamaStatus.availableModels.map((model) => (
                <label
                  key={model.name}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="model"
                      value={model.name}
                      checked={selectedModel === model.name}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-sm">{model.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Size: {(model.size / 1024 / 1024 / 1024).toFixed(2)} GB
                      </p>
                    </div>
                  </div>
                  {model.name.includes('qwen') && (
                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                      Recommended
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={validateModel}
                disabled={!selectedModel || isValidating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? 'Validating...' : 'Validate & Configure'}
              </button>
              <button
                onClick={testModel}
                disabled={!selectedModel || isLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Model
              </button>
            </div>
          </motion.div>
        )}

        {/* Custom Path Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm"
        >
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            Advanced Configuration
          </h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Ollama Path (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="~/.ollama (default)"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => validateModel()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Validate Path
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Specify a custom path if Ollama is installed in a non-standard location
              </p>
            </div>

            {/* Terminal Commands Helper */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium">Quick Setup Commands</span>
              </div>
              <div className="space-y-2">
                <code className="block text-xs text-gray-600 dark:text-gray-400 font-mono p-2 bg-white dark:bg-gray-800 rounded">
                  # Install Ollama (if not installed)<br />
                  curl -fsSL https://ollama.ai/install.sh | sh
                </code>
                <code className="block text-xs text-gray-600 dark:text-gray-400 font-mono p-2 bg-white dark:bg-gray-800 rounded">
                  # Pull recommended Qwen model<br />
                  ollama pull qwen2.5-coder:7b
                </code>
                <code className="block text-xs text-gray-600 dark:text-gray-400 font-mono p-2 bg-white dark:bg-gray-800 rounded">
                  # Start Ollama service<br />
                  ollama serve
                </code>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium mb-1">About Local Models</p>
              <p>
                Local models provide complete privacy and eliminate API costs. However, they require
                significant system resources (8GB+ RAM recommended for 7B models, 16GB+ for larger models).
                Claude API remains available as a fallback option.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      <AnimatePresence>
        {showSetupModal && (
          <ModelSetupModal
            isOpen={showSetupModal}
            onClose={() => setShowSetupModal(false)}
            onComplete={() => {
              setShowSetupModal(false);
              checkOllamaStatus();
            }}
            recommendedModels={ollamaStatus?.recommendedModels || []}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default LocalModelSettings;