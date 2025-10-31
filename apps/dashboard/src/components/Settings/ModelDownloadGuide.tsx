import React, { useState, useEffect } from 'react';
import { X, Download, AlertCircle, CheckCircle, Terminal, Cpu, HardDrive } from 'lucide-react';
import { ollamaClient } from '@services/ollamaClient';

interface ModelDownloadGuideProps {
  modelName: string;
  onClose: () => void;
  onComplete: () => void;
}

interface ModelInfo {
  name: string;
  size: string;
  ram: string;
  description: string;
}

const ModelDownloadGuide: React.FC<ModelDownloadGuideProps> = ({ modelName, onClose, onComplete }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const modelInfo: Record<string, ModelInfo> = {
    'qwen2.5-coder:32b': {
      name: 'Qwen2.5 Coder 32B',
      size: '~19GB',
      ram: '32GB+ recommended',
      description: 'Best performance for complex code generation tasks'
    },
    'qwen2.5-coder:7b': {
      name: 'Qwen2.5 Coder 7B',
      size: '~4.7GB',
      ram: '16GB recommended',
      description: 'Balanced performance and resource usage'
    },
    'qwen2.5-coder:1.5b': {
      name: 'Qwen2.5 Coder 1.5B',
      size: '~1GB',
      ram: '8GB minimum',
      description: 'Lightweight model for basic tasks'
    },
    'qwen2.5:32b': {
      name: 'Qwen2.5 32B',
      size: '~19GB',
      ram: '32GB+ recommended',
      description: 'General purpose model with strong reasoning'
    },
    'qwen2.5:14b': {
      name: 'Qwen2.5 14B',
      size: '~8.5GB',
      ram: '16GB recommended',
      description: 'Medium-sized general model'
    },
    'qwen2.5:7b': {
      name: 'Qwen2.5 7B',
      size: '~4.7GB',
      ram: '16GB recommended',
      description: 'Efficient general purpose model'
    }
  };

  const currentModel = modelInfo[modelName] || {
    name: modelName,
    size: 'Unknown',
    ram: 'Check model requirements',
    description: 'Custom model'
  };

  const startDownload = async () => {
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    setDownloadStatus('Connecting to Ollama registry...');

    try {
      // Subscribe to download progress
      const eventSource = new EventSource(`/api/ollama/pull?modelName=${encodeURIComponent(modelName)}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          setDownloadStatus(data.message || 'Downloading...');
          // Parse progress from message if available
          const progressMatch = data.message?.match(/(\d+)%/);
          if (progressMatch) {
            setDownloadProgress(parseInt(progressMatch[1]));
          }
        } else if (data.type === 'complete') {
          setDownloadStatus('Download complete!');
          setDownloadProgress(100);
          setIsDownloading(false);
          eventSource.close();
          setTimeout(onComplete, 2000);
        } else if (data.type === 'error') {
          setError(data.error || 'Download failed');
          setIsDownloading(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError('Connection lost. Please check Ollama is running.');
        setIsDownloading(false);
        eventSource.close();
      };
    } catch (err: any) {
      setError(err.message || 'Failed to start download');
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Download Qwen Model
          </h2>
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Model Information */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">
              {currentModel.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {currentModel.description}
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Size</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentModel.size}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-gray-500 dark:text-gray-400">RAM</p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentModel.ram}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Type</p>
                  <p className="font-medium text-gray-900 dark:text-white">Code</p>
                </div>
              </div>
            </div>
          </div>

          {/* Manual Instructions */}
          {!isDownloading && !error && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white">
                Download Instructions
              </h4>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You can download this model automatically using the button below, or manually via terminal.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Manual download command:
                </p>
                <div className="bg-gray-100 dark:bg-gray-900 rounded p-3">
                  <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
                    ollama pull {modelName}
                  </code>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Ensure you have enough disk space and a stable internet connection. The download may take 5-30 minutes depending on the model size and your connection speed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Download Progress */}
          {isDownloading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Downloading...
                </h4>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {downloadProgress}%
                </span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                {downloadStatus}
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Please keep this window open until the download completes.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Download Failed
                    </h4>
                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You can try downloading manually using:
                </p>
                <div className="bg-gray-100 dark:bg-gray-900 rounded p-3">
                  <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
                    ollama pull {modelName}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Success State */}
          {downloadProgress === 100 && !isDownloading && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
                    Download Complete!
                  </h4>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    {currentModel.name} has been successfully downloaded and is ready to use.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? 'Cancel' : 'Close'}
          </button>
          
          {!isDownloading && downloadProgress !== 100 && (
            <button
              onClick={startDownload}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 inline-flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Start Download
            </button>
          )}

          {downloadProgress === 100 && (
            <button
              onClick={onComplete}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelDownloadGuide;