import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Download, RefreshCw, Server, Settings, Info, Cpu } from 'lucide-react';
import { useSettingsStore } from '@store/settingsStore';
import { ollamaClient } from '@services/ollamaClient';
import OllamaSetupWizard from './OllamaSetupWizard';
import ModelDownloadGuide from './ModelDownloadGuide';

interface ModelStatus {
  available: boolean;
  modelName?: string;
  modelSize?: number;
  error?: string;
}

interface OllamaStatus {
  running: boolean;
  totalModels: number;
  qwenModels: any[];
  recommendations?: any[];
}

const QwenModelSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDownloadGuide, setShowDownloadGuide] = useState(false);
  const [selectedModel, setSelectedModel] = useState(settings.qwenLocalModel || 'qwen2.5-coder:7b');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setIsChecking(true);
    try {
      const status = await ollamaClient.getStatus();
      setOllamaStatus(status);

      if (status.running) {
        await checkModelAvailability();
      } else {
        setModelStatus({
          available: false,
          error: 'Ollama is not running. Please start Ollama service first.'
        });
      }
    } catch (error: any) {
      console.error('Error checking Ollama status:', error);
      setOllamaStatus(null);
      setModelStatus({
        available: false,
        error: error.message || 'Failed to check Ollama status'
      });
    } finally {
      setIsChecking(false);
    }
  };

  const checkModelAvailability = async () => {
    try {
      const validation = await ollamaClient.validateModel(selectedModel);
      setModelStatus({
        available: validation.valid,
        modelName: validation.model?.name,
        modelSize: validation.model?.size,
        error: validation.error
      });

      if (validation.valid) {
        // Update settings with validated model
        updateSettings({
          qwenLocalModel: selectedModel,
          qwenLocalEnabled: true,
          aiProvider: 'qwen_local'
        });
      }
    } catch (error: any) {
      setModelStatus({
        available: false,
        error: error.message || 'Failed to validate model'
      });
    }
  };

  const testModel = async () => {
    setTestResult(null);
    try {
      const result = await ollamaClient.testModel(selectedModel);
      setTestResult({
        success: result.success,
        message: result.response || result.error || 'Test completed'
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Test failed'
      });
    }
  };

  const formatModelSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const getProviderBadge = () => {
    if (settings.aiProvider === 'qwen_local' && modelStatus?.available) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active Provider
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Qwen Local Model Configuration
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure Qwen models to run locally using Ollama for enhanced privacy and offline capabilities
          </p>
        </div>
        {getProviderBadge()}
      </div>

      {/* Ollama Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Server className={`w-5 h-5 ${ollamaStatus?.running ? 'text-green-500' : 'text-gray-400'}`} />
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Ollama Service Status
            </h4>
          </div>
          <button
            onClick={checkOllamaStatus}
            disabled={isChecking}
            className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {ollamaStatus ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {ollamaStatus.running ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Ollama is running
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-400">
                    Ollama is not running
                  </span>
                </>
              )}
            </div>

            {ollamaStatus.running && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>Total models: {ollamaStatus.totalModels}</p>
                <p>Qwen models: {ollamaStatus.qwenModels.length}</p>
              </div>
            )}

            {!ollamaStatus.running && (
              <button
                onClick={() => setShowSetupWizard(true)}
                className="mt-2 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Settings className="w-4 h-4 mr-1" />
                Setup Ollama
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-gray-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Unable to connect to Ollama</span>
          </div>
        )}
      </div>

      {/* Model Selection */}
      {ollamaStatus?.running && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
            Select Qwen Model
          </h4>

          <div className="space-y-4">
            <div>
              <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Model
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="qwen2.5-coder:32b">Qwen2.5 Coder 32B (Best Performance)</option>
                <option value="qwen2.5-coder:7b">Qwen2.5 Coder 7B (Balanced)</option>
                <option value="qwen2.5-coder:1.5b">Qwen2.5 Coder 1.5B (Lightweight)</option>
                <option value="qwen2.5:32b">Qwen2.5 32B (General)</option>
                <option value="qwen2.5:14b">Qwen2.5 14B (General)</option>
                <option value="qwen2.5:7b">Qwen2.5 7B (General)</option>
                {ollamaStatus.qwenModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} (Installed)
                  </option>
                ))}
              </select>
            </div>

            {/* Model Status */}
            {modelStatus && (
              <div className={`rounded-md p-4 ${
                modelStatus.available 
                  ? 'bg-green-50 dark:bg-green-900/20' 
                  : 'bg-yellow-50 dark:bg-yellow-900/20'
              }`}>
                <div className="flex">
                  <div className="flex-shrink-0">
                    {modelStatus.available ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-400" />
                    )}
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {modelStatus.available ? 'Model Available' : 'Model Not Found'}
                    </h3>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      {modelStatus.available ? (
                        <div>
                          <p>Model: {modelStatus.modelName}</p>
                          <p>Size: {formatModelSize(modelStatus.modelSize)}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p>{modelStatus.error}</p>
                          <button
                            onClick={() => setShowDownloadGuide(true)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Download Instructions
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Test Model */}
            {modelStatus?.available && (
              <div className="flex items-center space-x-4">
                <button
                  onClick={testModel}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Cpu className="w-4 h-4 mr-2" />
                  Test Model
                </button>

                <button
                  onClick={checkModelAvailability}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Validate Model
                </button>
              </div>
            )}

            {/* Test Result */}
            {testResult && (
              <div className={`rounded-md p-4 ${
                testResult.success 
                  ? 'bg-green-50 dark:bg-green-900/20' 
                  : 'bg-red-50 dark:bg-red-900/20'
              }`}>
                <p className={`text-sm ${
                  testResult.success 
                    ? 'text-green-800 dark:text-green-200' 
                    : 'text-red-800 dark:text-red-200'
                }`}>
                  {testResult.message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comparison Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Qwen Local vs Claude API
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-300 space-y-2">
              <div>
                <strong>Qwen Local Benefits:</strong>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Complete privacy - runs entirely on your machine</li>
                  <li>No API costs - free after initial download</li>
                  <li>Works offline - no internet required</li>
                  <li>Lower latency for small tasks</li>
                </ul>
              </div>
              <div>
                <strong>Claude API Benefits:</strong>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Superior performance on complex tasks</li>
                  <li>No local resources required</li>
                  <li>Always up-to-date models</li>
                  <li>Larger context window (200K tokens)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showSetupWizard && (
        <OllamaSetupWizard
          onClose={() => setShowSetupWizard(false)}
          onComplete={() => {
            setShowSetupWizard(false);
            checkOllamaStatus();
          }}
        />
      )}

      {showDownloadGuide && (
        <ModelDownloadGuide
          modelName={selectedModel}
          onClose={() => setShowDownloadGuide(false)}
          onComplete={() => {
            setShowDownloadGuide(false);
            checkModelAvailability();
          }}
        />
      )}
    </div>
  );
};

export default QwenModelSettings;