import React from 'react';
import { X, Download, Info, Terminal, ExternalLink } from 'lucide-react';

interface ModelDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelName: string;
  downloadCommand: string;
  huggingFaceUrl?: string;
  requirements: {
    diskSpace: string;
    memory: string;
  };
  onDownload: () => void;
  isDownloading: boolean;
  downloadProgress?: string;
}

export const ModelDownloadModal: React.FC<ModelDownloadModalProps> = ({
  isOpen,
  onClose,
  modelName,
  downloadCommand,
  huggingFaceUrl,
  requirements,
  onDownload,
  isDownloading,
  downloadProgress
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Download {modelName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={isDownloading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Requirements */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  System Requirements
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Disk Space: {requirements.diskSpace}</li>
                  <li>• RAM: {requirements.memory}</li>
                  <li>• Ollama must be installed and running</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Download Methods */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              Download Methods
            </h4>

            {/* Method 1: Automatic */}
            <div className="border dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium text-gray-900 dark:text-white">
                  Method 1: Automatic Download
                </h5>
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Click the button below to automatically download and install the model.
              </p>
              <button
                onClick={onDownload}
                disabled={isDownloading}
                className="w-full py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDownloading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Start Download
                  </>
                )}
              </button>
              
              {downloadProgress && (
                <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-900 rounded text-sm font-mono">
                  {downloadProgress}
                </div>
              )}
            </div>

            {/* Method 2: Manual */}
            <div className="border dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium text-gray-900 dark:text-white">
                  Method 2: Manual Installation
                </h5>
                <Terminal className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Run this command in your terminal:
              </p>
              <div className="bg-gray-900 text-gray-100 rounded p-3 font-mono text-sm">
                {downloadCommand}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(downloadCommand)}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                Copy to clipboard
              </button>
            </div>

            {/* HuggingFace Link */}
            {huggingFaceUrl && (
              <div className="border dark:border-gray-700 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">
                  Model Information
                </h5>
                <a
                  href={huggingFaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
                >
                  View on HuggingFace
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>
              The download may take several minutes depending on your internet connection.
              The model will be stored in your local Ollama directory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};