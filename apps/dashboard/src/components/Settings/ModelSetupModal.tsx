import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Terminal, Cpu, HardDrive, CheckCircle, AlertCircle } from 'lucide-react';
import type { RecommendedModel } from '@/types/ollama';

interface ModelSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  recommendedModels: RecommendedModel[];
}

const ModelSetupModal: React.FC<ModelSetupModalProps> = ({ 
  isOpen, 
  onClose, 
  onComplete,
  recommendedModels 
}) => {
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder:7b');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<'select' | 'installing' | 'complete'>('select');
  const [installProgress, setInstallProgress] = useState('');

  const defaultModels: RecommendedModel[] = recommendedModels.length > 0 ? recommendedModels : [
    {
      name: 'qwen2.5-coder:32b',
      size: '19GB',
      description: 'Most capable Qwen Coder model',
      useCase: 'Complex coding tasks, large context windows'
    },
    {
      name: 'qwen2.5-coder:7b',
      size: '4.5GB',
      description: 'Balanced performance and resource usage',
      useCase: 'General coding tasks, good for most users'
    },
    {
      name: 'qwen2.5-coder:1.5b',
      size: '1GB',
      description: 'Lightweight model for basic tasks',
      useCase: 'Simple completions, limited resources'
    }
  ];

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallStep('installing');
    
    try {
      // Create EventSource for server-sent events
      const eventSource = new EventSource(`/api/ollama/pull?model=${encodeURIComponent(selectedModel)}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          setInstallProgress(data.message);
        } else if (data.type === 'complete') {
          setInstallStep('complete');
          eventSource.close();
          setTimeout(() => {
            onComplete();
          }, 2000);
        } else if (data.type === 'error') {
          setInstallProgress(`Error: ${data.message}`);
          eventSource.close();
          setIsInstalling(false);
        }
      };
      
      eventSource.onerror = () => {
        setInstallProgress('Connection lost. Please check Ollama service.');
        eventSource.close();
        setIsInstalling(false);
      };
    } catch (error) {
      console.error('Installation error:', error);
      setInstallProgress('Failed to start installation');
      setIsInstalling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Setup Local Qwen Model
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {installStep === 'select' && (
              <>
                {/* Prerequisites */}
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                    Prerequisites
                  </h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                    <li>• Ollama must be installed on your system</li>
                    <li>• Ollama service should be running (ollama serve)</li>
                    <li>• Sufficient disk space for the model</li>
                    <li>• At least 8GB RAM for 7B models, 32GB for larger models</li>
                  </ul>
                </div>

                {/* Model Selection */}
                <div className="mb-6">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                    Select a Model
                  </h3>
                  <div className="space-y-3">
                    {defaultModels.map((model) => (
                      <label
                        key={model.name}
                        className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="model"
                          value={model.name}
                          checked={selectedModel === model.name}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{model.name}</span>
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                              {model.size}
                            </span>
                            {model.name === 'qwen2.5-coder:7b' && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {model.description}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Best for: {model.useCase}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Manual Installation Instructions */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-medium">Manual Installation</span>
                  </div>
                  <code className="block text-xs text-gray-600 dark:text-gray-400 font-mono p-2 bg-white dark:bg-gray-800 rounded">
                    ollama pull {selectedModel}
                  </code>
                </div>
              </>
            )}

            {installStep === 'installing' && (
              <div className="text-center py-8">
                <div className="mb-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                  Installing {selectedModel}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  This may take several minutes depending on your connection...
                </p>
                {installProgress && (
                  <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <code className="text-xs font-mono text-gray-700 dark:text-gray-300">
                      {installProgress}
                    </code>
                  </div>
                )}
              </div>
            )}

            {installStep === 'complete' && (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Installation Complete!
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedModel} has been successfully installed and is ready to use.
                </p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
            {installStep === 'select' && (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <HardDrive className="w-4 h-4" />
                  <span>Models stored in ~/.ollama/models</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Install Model
                  </button>
                </div>
              </>
            )}
            
            {installStep === 'installing' && (
              <div className="w-full text-center text-sm text-gray-600 dark:text-gray-400">
                Please keep this window open during installation
              </div>
            )}
            
            {installStep === 'complete' && (
              <div className="w-full text-center">
                <button
                  onClick={onComplete}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ModelSetupModal;