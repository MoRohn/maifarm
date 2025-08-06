import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Info, AlertTriangle, Server, Download, CheckCircle, XCircle } from 'lucide-react';
import AIProviderSelector, { type AIProvider } from '../common/AIProviderSelector';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../hooks/useToast';
import { QwenLocalSetup } from './QwenLocalSetup';
import { ModelDownloadModal } from './ModelDownloadModal';
import { QwenSetupModal } from './QwenSetupModal';

const AIProviderSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { success: showSuccess, error: showError } = useToast();
  
  // Get AI provider from settings, defaulting to 'claude'
  const currentProvider = (settings.aiProvider as AIProvider) || 'claude';
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(currentProvider);
  const [isValidating, setIsValidating] = useState(false);
  const [showQwenSetup, setShowQwenSetup] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{
    running: boolean;
    hasQwenModel: boolean;
    modelName?: string;
    loading: boolean;
  }>({ running: false, hasQwenModel: false, loading: true });

  const handleProviderChange = async (provider: AIProvider) => {
    setSelectedProvider(provider);
    
    // Save to settings
    updateSettings({ aiProvider: provider } as any);
    
    // Show success message
    showSuccess(`Default AI provider changed to ${provider === 'claude' ? 'Claude Code' : 'Qwen3-Coder'}`);
  };

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/providers/ollama/status');
      const result = await response.json();
      
      if (result.success) {
        const qwenModel = result.data.qwenModels?.[0];
        setOllamaStatus({
          running: result.data.ollamaRunning,
          hasQwenModel: result.data.qwenModels?.length > 0,
          modelName: qwenModel?.name,
          loading: false
        });
      } else {
        setOllamaStatus(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      setOllamaStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const validateProvider = async (provider: AIProvider) => {
    setIsValidating(true);
    try {
      if (provider === 'qwen' && ollamaStatus.hasQwenModel) {
        // Test local model
        const response = await fetch('/api/providers/ollama/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ollamaStatus.modelName })
        });
        const result = await response.json();
        
        if (result.success) {
          showSuccess('Local Qwen model is working correctly');
        } else {
          showError('Local Qwen model test failed. Please check Ollama is running.');
        }
      } else {
        // Check API configuration
        const response = await fetch(`/api/providers/${provider}`);
        const result = await response.json();
        
        if (result.success && result.data.configured && result.data.enabled) {
          showSuccess(`${provider === 'claude' ? 'Claude Code' : 'Qwen3-Coder API'} is properly configured`);
        } else {
          showError(`${provider === 'claude' ? 'Claude Code' : 'Qwen3-Coder API'} is not configured. Please check your API keys.`);
        }
      }
    } catch (error) {
      showError('Failed to validate provider configuration');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          AI Engine Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure your preferred AI provider for farm orchestration.
        </p>
      </div>

      {/* Default Provider Selection */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Default AI Engine
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This will be the default AI provider for new farms. You can override this per farm.
        </p>
        
        <AIProviderSelector
          value={selectedProvider}
          onChange={handleProviderChange}
          showDetails={true}
          className="mb-4"
        />
      </div>

      {/* Provider Status */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Provider Configuration Status
        </h4>
        
        <div className="space-y-4">
          {/* Claude Status */}
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Claude Code</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Anthropic's Claude AI</p>
              </div>
            </div>
            <button
              onClick={() => validateProvider('claude')}
              disabled={isValidating}
              className="px-3 py-1 text-sm font-medium text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-md transition-colors"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
          </div>
          
          {/* Qwen Status */}
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Qwen3-Coder</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {ollamaStatus.hasQwenModel ? `Local (${ollamaStatus.modelName})` : 'API or Local via Ollama'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ollamaStatus.hasQwenModel && (
                <CheckCircle className="w-4 h-4 text-green-600" />
              )}
              <button
                onClick={() => validateProvider('qwen')}
                disabled={isValidating}
                className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
              >
                {isValidating ? 'Validating...' : 'Validate'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Local Model Setup */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Local Qwen Model (via Ollama)
        </h4>
        
        <div className="space-y-4">
          {/* Ollama Status */}
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-gray-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Ollama Service</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {ollamaStatus.loading ? 'Checking...' : 
                   ollamaStatus.running ? 'Running' : 'Not Running'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!ollamaStatus.loading && (
                ollamaStatus.running ? 
                  <CheckCircle className="w-4 h-4 text-green-600" /> : 
                  <XCircle className="w-4 h-4 text-red-600" />
              )}
              <button
                onClick={checkOllamaStatus}
                className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
          
          {/* Local Model Status */}
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Qwen Coder Model</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {ollamaStatus.hasQwenModel ? 
                    `Installed: ${ollamaStatus.modelName}` : 
                    'Not installed'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowQwenSetup(true)}
              className="px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
            >
              Setup
            </button>
          </div>
        </div>
        
        {ollamaStatus.hasQwenModel && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300">
              ✅ Local Qwen model is available! Farms will use this model automatically when Qwen is selected.
            </p>
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="mb-2">
              <strong>Claude Code:</strong> Requires CLAUDE_API_KEY in your environment variables.
            </p>
            <p className="mb-2">
              <strong>Qwen3-Coder API:</strong> Can be configured with QWEN_API_KEY. Set QWEN_ENABLED=true to enable.
            </p>
            <p>
              <strong>Qwen Local:</strong> Install via Ollama for free, unlimited local usage. No API key required!
            </p>
          </div>
        </div>
      </div>

      {/* Farm-Specific Override Notice */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <p>
              The default provider can be overridden when creating individual farms.
              This setting only affects new farms created without specifying a provider.
            </p>
          </div>
        </div>
      </div>
      
      {/* Qwen Setup Modal */}
      {showQwenSetup && (
        <QwenSetupModal
          isOpen={showQwenSetup}
          onClose={() => {
            setShowQwenSetup(false);
            checkOllamaStatus();
          }}
          onSetupComplete={() => {
            setShowQwenSetup(false);
            checkOllamaStatus();
            showSuccess('Qwen model setup completed successfully!');
          }}
        />
      )}
    </div>
  );
};

export default AIProviderSettings;