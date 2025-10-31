import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Download, Maximize2, Minimize2, Code, Eye } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface HtmlPreviewProps {
  filePath: string;
  farmId: string;
  agentId: number;
  agentName: string;
  onClose: () => void;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({
  filePath,
  farmId,
  agentId,
  agentName,
  onClose
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');

  useEffect(() => {
    fetchHtmlContent();
  }, [filePath, farmId]);

  const fetchHtmlContent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch the HTML file content from the farm workspace
      const response = await fetch(`/api/harvest/files/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmId,
          filePath,
          agentId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setHtmlContent(data.content || '');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load HTML file');
      }
    } catch (err) {
      console.error('Error fetching HTML content:', err);
      setError('Failed to load HTML file');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'preview.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openInNewTab = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed ${isFullscreen ? 'inset-0' : 'inset-4'} z-50 flex items-center justify-center`}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        
        {/* Preview Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden ${
            isFullscreen ? 'w-full h-full' : 'w-full max-w-6xl h-[80vh]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gray-100 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    HTML Preview
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {filePath} • Opened by {agentName}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* View Mode Toggle */}
                <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-1 flex">
                  <Tooltip content="Preview mode" position="bottom">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`p-1.5 rounded transition-colors ${
                        viewMode === 'preview' 
                          ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Source code" position="bottom">
                    <button
                      onClick={() => setViewMode('source')}
                      className={`p-1.5 rounded transition-colors ${
                        viewMode === 'source' 
                          ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
                
                {/* Actions */}
                <Tooltip content="Open in new tab" position="bottom">
                  <button
                    onClick={openInNewTab}
                    className="p-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                </Tooltip>
                
                <Tooltip content="Download HTML file" position="bottom">
                  <button
                    onClick={downloadFile}
                    className="p-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                </Tooltip>
                
                <Tooltip content={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} position="bottom">
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    )}
                  </button>
                </Tooltip>
                
                <Tooltip content="Close preview" position="bottom">
                  <button
                    onClick={onClose}
                    className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-hidden bg-white dark:bg-gray-950">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading HTML content...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-red-500 mb-4">
                    <X className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-red-600 dark:text-red-400 font-semibold">Error Loading File</p>
                  <p className="text-gray-600 dark:text-gray-400 mt-2">{error}</p>
                  <button
                    onClick={fetchHtmlContent}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : viewMode === 'preview' ? (
              <iframe
                srcDoc={htmlContent}
                className="w-full h-full border-none"
                title="HTML Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="h-full overflow-auto">
                <pre className="p-6 text-sm font-mono">
                  <code className="language-html text-gray-800 dark:text-gray-200">
                    {htmlContent}
                  </code>
                </pre>
              </div>
            )}
          </div>
          
          {/* Footer with file info */}
          {!loading && !error && (
            <div className="bg-gray-100 dark:bg-gray-800 px-6 py-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600 dark:text-gray-400">
                  {viewMode === 'preview' ? 'Preview Mode' : 'Source Code'}
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  Size: {(new Blob([htmlContent]).size / 1024).toFixed(2)} KB
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default HtmlPreview;