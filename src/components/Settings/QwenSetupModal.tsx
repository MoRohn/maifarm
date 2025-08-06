import React, { useState, useEffect } from 'react';
import { X, Download, CheckCircle, AlertCircle, Info, Loader2, Terminal, Copy, ExternalLink } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface QwenSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: () => void;
}

interface OllamaStatus {
  ollamaRunning: boolean;
  ollamaPath: string;
  totalModels: number;
  qwenModels: Array<{
    name: string;
    size: number;
    modified: string;
  }>;
  recommendations: Array<{
    name: string;
    description: string;
    size: string;
    recommended: boolean;
    minRAM: string;
    useCase: string;
  }>;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  error?: string;
}

export const QwenSetupModal: React.FC<QwenSetupModalProps> = ({ isOpen, onClose, onSetupComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder:7b');
  const [isLoading, setIsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { id: 'check', title: 'Check Ollama Installation', description: 'Verifying Ollama is installed and running', status: 'pending' },
    { id: 'select', title: 'Select Qwen Model', description: 'Choose a Qwen model based on your needs', status: 'pending' },
    { id: 'pull', title: 'Download Model', description: 'Pull the selected model from Ollama registry', status: 'pending' },
    { id: 'test', title: 'Test Model', description: 'Verify the model is working correctly', status: 'pending' }
  ]);

  useEffect(() => {
    if (isOpen) {
      checkOllamaStatus();
    }
  }, [isOpen]);

  const checkOllamaStatus = async () => {
    setIsLoading(true);
    updateStepStatus('check', 'in-progress');
    
    try {
      const response = await axios.get('/api/providers/ollama/status');
      setOllamaStatus(response.data.data);
      
      if (response.data.data.ollamaRunning) {
        updateStepStatus('check', 'completed');
        
        // If we already have Qwen models, skip to test
        if (response.data.data.qwenModels.length > 0) {
          setSelectedModel(response.data.data.qwenModels[0].name);
          updateStepStatus('select', 'completed');
          updateStepStatus('pull', 'completed');
          setCurrentStep(3);
        } else {
          setCurrentStep(1);
        }
      } else {
        updateStepStatus('check', 'error', 'Ollama is not running');
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      updateStepStatus('check', 'error', 'Failed to check Ollama status');
    } finally {
      setIsLoading(false);
    }
  };

  const updateStepStatus = (stepId: string, status: SetupStep['status'], error?: string) => {
    setSetupSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, error } : step
    ));
  };

  const handleModelSelect = (modelName: string) => {
    setSelectedModel(modelName);
    updateStepStatus('select', 'completed');
    setCurrentStep(2);
  };

  const pullModel = async () => {
    setIsPulling(true);
    updateStepStatus('pull', 'in-progress');
    
    try {
      // Start the pull process
      await axios.post('/api/providers/ollama/pull', {
        model: selectedModel
      });

      // Simulate progress (in real implementation, use WebSocket for progress)
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
          updateStepStatus('pull', 'completed');
          setCurrentStep(3);
          setIsPulling(false);
          testModel();
        }
        setPullProgress(progress);
      }, 1000);

    } catch (error) {
      console.error('Failed to pull model:', error);
      updateStepStatus('pull', 'error', 'Failed to download model');
      setIsPulling(false);
    }
  };

  const testModel = async () => {
    updateStepStatus('test', 'in-progress');
    
    try {
      const response = await axios.post('/api/providers/ollama/test', {
        model: selectedModel
      });

      if (response.data.success) {
        updateStepStatus('test', 'completed');
        toast.success('Qwen model is ready to use!');
        setTimeout(() => {
          onSetupComplete();
          onClose();
        }, 1500);
      } else {
        updateStepStatus('test', 'error', response.data.data?.error || 'Test failed');
      }
    } catch (error) {
      console.error('Failed to test model:', error);
      updateStepStatus('test', 'error', 'Failed to test model');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const getStepIcon = (status: SetupStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Setup Local Qwen Model</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Run Qwen models locally with complete privacy and no API costs
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-80px)]">
          {/* Sidebar - Setup Steps */}
          <div className="w-64 bg-gray-50 dark:bg-gray-900 p-4 border-r dark:border-gray-700">
            <div className="space-y-3">
              {setupSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                    index === currentStep ? 'bg-white dark:bg-gray-800 shadow-sm' : ''
                  }`}
                >
                  {getStepIcon(step.status)}
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{step.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{step.description}</p>
                    {step.error && (
                      <p className="text-xs text-red-500 mt-1">{step.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Benefits */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Benefits</h3>
              <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-400">
                <li>• No API costs</li>
                <li>• Complete privacy</li>
                <li>• No rate limits</li>
                <li>• Works offline</li>
                <li>• Customizable</li>
              </ul>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentStep === 0 && (
              <div className="space-y-6">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        {ollamaStatus?.ollamaRunning 
                          ? 'Ollama is running and ready!' 
                          : 'Ollama needs to be installed and running to use local models.'}
                      </p>
                    </div>
                  </div>
                </div>

                {!ollamaStatus?.ollamaRunning && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Installation Instructions</h3>
                    
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">macOS</span>
                        <button
                          onClick={() => copyToClipboard('brew install ollama')}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <code className="text-sm bg-gray-900 dark:bg-black text-green-400 p-2 rounded block">
                        brew install ollama
                      </code>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Linux</span>
                        <button
                          onClick={() => copyToClipboard('curl -fsSL https://ollama.ai/install.sh | sh')}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <code className="text-sm bg-gray-900 dark:bg-black text-green-400 p-2 rounded block">
                        curl -fsSL https://ollama.ai/install.sh | sh
                      </code>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Windows</p>
                      <a
                        href="https://ollama.ai/download/windows"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                      >
                        <span>Download Ollama for Windows</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <button
                      onClick={checkOllamaStatus}
                      className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Check Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select a Qwen Model</h3>
                
                <div className="grid gap-4">
                  {ollamaStatus?.recommendations.map((model) => (
                    <div
                      key={model.name}
                      onClick={() => handleModelSelect(model.name)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedModel === model.name
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-semibold text-gray-900 dark:text-white">{model.name}</h4>
                            {model.recommended && (
                              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{model.description}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-500">
                            <span>Size: {model.size}</span>
                            <span>Min RAM: {model.minRAM}</span>
                            <span>Use: {model.useCase}</span>
                          </div>
                        </div>
                        {selectedModel === model.name && (
                          <CheckCircle className="w-5 h-5 text-blue-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!selectedModel}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue with {selectedModel}
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Download Model</h3>
                
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Downloading {selectedModel}
                    </span>
                    <span className="text-sm text-gray-500">
                      {isPulling ? `${Math.round(pullProgress)}%` : 'Ready to download'}
                    </span>
                  </div>

                  {isPulling && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pullProgress}%` }}
                      />
                    </div>
                  )}

                  <div className="bg-gray-900 dark:bg-black rounded p-3 mb-4">
                    <code className="text-sm text-green-400">
                      ollama pull {selectedModel}
                    </code>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    This will download the model to your local machine. The download time depends on your internet speed and the model size.
                  </p>

                  <button
                    onClick={pullModel}
                    disabled={isPulling}
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isPulling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Start Download</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Manual Instructions */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                    Alternative: Manual Download
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
                    You can also pull the model manually in your terminal:
                  </p>
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-blue-600" />
                    <code className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded">
                      ollama pull {selectedModel}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Test Model</h3>
                
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Testing the model with a simple prompt to ensure it's working correctly...
                  </p>

                  {setupSteps[3].status === 'in-progress' && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  )}

                  {setupSteps[3].status === 'completed' && (
                    <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        Model Ready!
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {selectedModel} is now ready to use with MaiFarm
                      </p>
                    </div>
                  )}

                  {setupSteps[3].status === 'error' && (
                    <div className="text-center py-8">
                      <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        Test Failed
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                        {setupSteps[3].error}
                      </p>
                      <button
                        onClick={testModel}
                        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};