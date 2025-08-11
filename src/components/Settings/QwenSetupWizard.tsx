import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu,
  Download,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  Terminal,
  Info,
  ArrowRight,
  ArrowLeft,
  Home,
  HardDrive,
  Settings,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface QwenModel {
  name: string;
  size: string;
  description: string;
  recommended?: boolean;
  minRAM: string;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const QWEN_MODELS: QwenModel[] = [
  {
    name: 'qwen2.5-coder:32b',
    size: '~21GB',
    description: 'Best performance for complex coding tasks',
    minRAM: '32GB',
    recommended: true
  },
  {
    name: 'qwen2.5-coder:7b',
    size: '~4.7GB',
    description: 'Good balance of performance and resource usage',
    minRAM: '8GB'
  },
  {
    name: 'qwen2.5-coder:1.5b',
    size: '~1GB',
    description: 'Lightweight option for basic tasks',
    minRAM: '4GB'
  },
  {
    name: 'qwen3-coder:480b',
    size: '~100GB',
    description: '480B parameter model with exceptional capabilities',
    minRAM: '128GB'
  }
];

const SETUP_STEPS: SetupStep[] = [
  {
    id: 'detect',
    title: 'Detect Local Models',
    description: 'Scan for existing Qwen models on your system',
    icon: FolderOpen
  },
  {
    id: 'install',
    title: 'Install Ollama',
    description: 'Set up Ollama to run local models',
    icon: Download
  },
  {
    id: 'select',
    title: 'Select Model',
    description: 'Choose a Qwen model that fits your needs',
    icon: Cpu
  },
  {
    id: 'configure',
    title: 'Configure',
    description: 'Set up model parameters and paths',
    icon: Settings
  }
];

interface QwenSetupWizardProps {
  onComplete?: (modelName: string) => void;
  onClose?: () => void;
}

export const QwenSetupWizard: React.FC<QwenSetupWizardProps> = ({
  onComplete,
  onClose
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState<string>('');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'running' | 'not-installed' | 'stopped'>('checking');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  useEffect(() => {
    checkOllamaStatus();
    detectLocalModels();
  }, []);

  const checkOllamaStatus = async () => {
    try {
      const response = await apiClient.get('/api/qwen/ollama/status');
      setOllamaStatus(response.data.isRunning ? 'running' : 'stopped');
    } catch (error) {
      setOllamaStatus('not-installed');
    }
  };

  const detectLocalModels = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get('/api/qwen/models/detect');
      if (response.data.found && response.data.models) {
        setDetectedModels(response.data.models.map((m: any) => m.name));
        if (response.data.models.length > 0) {
          setSelectedModel(response.data.models[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to detect models:', error);
      setError('Failed to detect local models. Please ensure Ollama is installed.');
    } finally {
      setIsLoading(false);
    }
  };

  const startOllama = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await apiClient.post('/api/qwen/ollama/start');
      setOllamaStatus('running');
      // Re-detect models after starting Ollama
      await detectLocalModels();
    } catch (error) {
      setError('Failed to start Ollama service. Please start it manually.');
    } finally {
      setIsLoading(false);
    }
  };

  const pullModel = async (modelName: string) => {
    setIsLoading(true);
    setError(null);
    setDownloadProgress(0);
    
    try {
      // Start SSE connection for progress updates
      const eventSource = new EventSource(`/api/qwen/models/pull?model=${encodeURIComponent(modelName)}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.progress) {
          setDownloadProgress(data.progress);
        }
        if (data.complete) {
          eventSource.close();
          setIsLoading(false);
          setSelectedModel(modelName);
          detectLocalModels(); // Refresh the list
        }
      };
      
      eventSource.onerror = (error) => {
        eventSource.close();
        setError('Failed to download model. Please try again.');
        setIsLoading(false);
      };
    } catch (error) {
      setError('Failed to pull model. Please run manually: ollama pull ' + modelName);
      setIsLoading(false);
    }
  };

  const setCustomModelPath = async () => {
    if (!customPath) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await apiClient.post('/api/qwen/models/path', { path: customPath });
      await detectLocalModels();
    } catch (error) {
      setError('Failed to set custom model path.');
    } finally {
      setIsLoading(false);
    }
  };

  const completeSetup = async () => {
    if (!selectedModel) {
      setError('Please select a model');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await apiClient.post('/api/qwen/models/activate', { model: selectedModel });
      onComplete?.(selectedModel);
    } catch (error) {
      setError('Failed to activate model');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    const step = SETUP_STEPS[currentStep];
    
    switch (step.id) {
      case 'detect':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Scanning for Qwen Models</h3>
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
            
            {detectedModels.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Found {detectedModels.length} model(s):</p>
                <div className="space-y-2">
                  {detectedModels.map(model => (
                    <div
                      key={model}
                      className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium">{model}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Configure Selected Model
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-yellow-800">No Qwen models found locally.</p>
                      <p className="text-xs text-yellow-600 mt-1">
                        You can either download a model or specify a custom path.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom Model Path (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      placeholder="/path/to/models"
                      className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={setCustomModelPath}
                      disabled={!customPath || isLoading}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Scan
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={() => setCurrentStep(1)}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Install Ollama & Download Model
                </button>
              </div>
            )}
          </div>
        );
        
      case 'install':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Ollama Setup</h3>
            
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Ollama Status:</span>
                <span className={clsx(
                  'px-2 py-1 rounded text-sm font-medium',
                  ollamaStatus === 'running' && 'bg-green-100 text-green-700',
                  ollamaStatus === 'stopped' && 'bg-yellow-100 text-yellow-700',
                  ollamaStatus === 'not-installed' && 'bg-red-100 text-red-700',
                  ollamaStatus === 'checking' && 'bg-gray-100 text-gray-700'
                )}>
                  {ollamaStatus === 'checking' ? 'Checking...' : ollamaStatus.replace('-', ' ')}
                </span>
              </div>
              
              {ollamaStatus === 'not-installed' && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm text-gray-600">Install Ollama to run local models:</p>
                  <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
                    {navigator.platform.includes('Mac') 
                      ? 'brew install ollama'
                      : 'curl -fsSL https://ollama.com/install.sh | sh'}
                  </div>
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    Download from ollama.com
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              )}
              
              {ollamaStatus === 'stopped' && (
                <button
                  onClick={startOllama}
                  disabled={isLoading}
                  className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? 'Starting...' : 'Start Ollama Service'}
                </button>
              )}
              
              {ollamaStatus === 'running' && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Ollama is running and ready</span>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setCurrentStep(2)}
              disabled={ollamaStatus !== 'running'}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select Model to Download
            </button>
          </div>
        );
        
      case 'select':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Choose a Qwen Model</h3>
            
            <div className="space-y-3">
              {QWEN_MODELS.map(model => (
                <div
                  key={model.name}
                  className={clsx(
                    'p-4 border rounded-lg cursor-pointer transition-all',
                    selectedModel === model.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                  onClick={() => setSelectedModel(model.name)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.name}</span>
                        {model.recommended && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{model.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {model.size}
                        </span>
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          {model.minRAM} RAM
                        </span>
                      </div>
                    </div>
                    {detectedModels.includes(model.name) && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {selectedModel && !detectedModels.includes(selectedModel) && (
              <div className="space-y-3">
                {downloadProgress > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Downloading...</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => pullModel(selectedModel)}
                  disabled={isLoading}
                  className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? 'Downloading...' : `Download ${selectedModel}`}
                </button>
              </div>
            )}
            
            {selectedModel && detectedModels.includes(selectedModel) && (
              <button
                onClick={() => setCurrentStep(3)}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Configure Model
              </button>
            )}
          </div>
        );
        
      case 'configure':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Final Configuration</h3>
            
            {selectedModel && (
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Selected Model:</span>
                  <span className="text-blue-600">{selectedModel}</span>
                </div>
                
                <div className="pt-3 border-t space-y-2">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm">Model is ready to use</span>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded text-sm text-blue-800">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5" />
                      <div>
                        <p>Qwen3-Coder offers:</p>
                        <ul className="list-disc list-inside mt-1 text-xs">
                          <li>480B parameters (35B active)</li>
                          <li>256K token context window</li>
                          <li>Free API access</li>
                          <li>Superior coding capabilities</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            
            <button
              onClick={completeSetup}
              disabled={!selectedModel || isLoading}
              className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Activating...' : 'Complete Setup'}
            </button>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Qwen3-Coder Setup Wizard</h2>
            <p className="text-sm text-gray-600">Configure local AI models for MaiFarm</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>
      
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {SETUP_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={clsx(
                'flex items-center',
                index < SETUP_STEPS.length - 1 && 'flex-1'
              )}
            >
              <div
                className={clsx(
                  'flex flex-col items-center',
                  currentStep === index && 'text-blue-600',
                  currentStep > index && 'text-green-600',
                  currentStep < index && 'text-gray-400'
                )}
              >
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                    currentStep === index && 'border-blue-600 bg-blue-50',
                    currentStep > index && 'border-green-600 bg-green-50',
                    currentStep < index && 'border-gray-300 bg-white'
                  )}
                >
                  {currentStep > index ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs mt-1 font-medium">{step.title}</span>
              </div>
              {index < SETUP_STEPS.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-0.5 mx-2',
                    currentStep > index ? 'bg-green-600' : 'bg-gray-300'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      
      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="min-h-[300px]"
        >
          {renderStepContent()}
        </motion.div>
      </AnimatePresence>
      
      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </button>
        
        <div className="flex gap-1">
          {SETUP_STEPS.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={clsx(
                'w-2 h-2 rounded-full transition-colors',
                currentStep === index ? 'bg-blue-600' : 'bg-gray-300'
              )}
            />
          ))}
        </div>
        
        <button
          onClick={() => setCurrentStep(Math.min(SETUP_STEPS.length - 1, currentStep + 1))}
          disabled={currentStep === SETUP_STEPS.length - 1}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};