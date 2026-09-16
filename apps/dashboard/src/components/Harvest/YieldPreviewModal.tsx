import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ExternalLink,
  Download,
  Maximize2,
  Minimize2,
  Code,
  Eye,
  FileText,
  Image as ImageIcon,
  File,
  AlertCircle
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { HarvestYield } from '@/types/harvest';

interface YieldPreviewModalProps {
  yieldItem: HarvestYield;
  harvestId?: string;
  onClose: () => void;
  onDownload?: (yieldItem: HarvestYield) => void;
}

export const YieldPreviewModal: React.FC<YieldPreviewModalProps> = ({
  yieldItem,
  harvestId,
  onClose,
  onDownload
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');

  // Focus trap refs
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Focus management and keyboard handling
  useEffect(() => {
    // Add escape key listener
    document.addEventListener('keydown', handleKeyDown);

    // Focus the close button on mount
    setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);

    // Store previously focused element to restore on close
    const previouslyFocused = document.activeElement as HTMLElement;

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previously focused element
      previouslyFocused?.focus?.();
    };
  }, [handleKeyDown]);

  // Focus trap: keep focus within modal
  const handleFocusTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [yieldItem]);

  const fetchContent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to fetch content from API if harvestId is available
      if (harvestId && yieldItem.id) {
        try {
          const response = await fetch(`/api/harvests/${harvestId}/yield/${yieldItem.id}/preview`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.content) {
              setContent(data.data.content);
              return;
            }
          }
        } catch (apiError) {
          console.warn('Failed to fetch from API, falling back to local data:', apiError);
        }
      }
      
      // Fallback to local data
      if (yieldItem.data && typeof yieldItem.data === 'string') {
        setContent(yieldItem.data);
      } else if (yieldItem.data && typeof yieldItem.data === 'object') {
        setContent(JSON.stringify(yieldItem.data, null, 2));
      } else {
        // Show metadata if no content available
        setContent(`File: ${yieldItem.name}\nType: ${yieldItem.type}\nLocation: ${yieldItem.location || 'Not available'}\nSize: ${yieldItem.size ? formatFileSize(yieldItem.size) : 'N/A'}\n\nContent preview not available. Use download to get the file.`);
      }
    } catch (err) {
      console.error('Error fetching yield content:', err);
      setError('Failed to load file content');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = () => {
    const type = yieldItem.mimeType || '';
    if (type.includes('image')) return <ImageIcon className="w-5 h-5" />;
    if (type.includes('text') || yieldItem.type === 'documentation') return <FileText className="w-5 h-5" />;
    if (yieldItem.type === 'code') return <Code className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const isTextContent = () => {
    const type = yieldItem.mimeType || '';
    const textTypes = ['text/', 'application/json', 'application/yaml', 'application/javascript'];
    return textTypes.some(t => type.includes(t)) || yieldItem.type === 'documentation' || yieldItem.type === 'code';
  };

  const isImageContent = () => {
    const type = yieldItem.mimeType || '';
    return type.includes('image/');
  };

  const downloadFile = () => {
    if (onDownload) {
      onDownload(yieldItem);
    } else {
      // Fallback download using content
      const blob = new Blob([content], { type: yieldItem.mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = yieldItem.name || 'download';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const openInNewTab = () => {
    const blob = new Blob([content], { type: yieldItem.mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading content...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400 font-semibold">Error Loading File</p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">{error}</p>
            <button
              onClick={fetchContent}
              className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (isImageContent()) {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <img
            src={`data:${yieldItem.mimeType};base64,${content}`}
            alt={yieldItem.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
        </div>
      );
    }

    if (isTextContent() && viewMode === 'preview' && yieldItem.mimeType?.includes('html')) {
      return (
        <iframe
          srcDoc={content}
          className="w-full h-full border-none"
          title="Content Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      );
    }

    // Default text view
    return (
      <div className="h-full overflow-auto">
        <pre className="p-6 text-sm font-mono whitespace-pre-wrap">
          <code className="text-gray-800 dark:text-gray-200">
            {content}
          </code>
        </pre>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed ${isFullscreen ? 'inset-0' : 'inset-4'} z-50 flex items-center justify-center`}
        onClick={onClose}
        onKeyDown={handleFocusTrap}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

        {/* Preview Modal */}
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="yield-preview-title"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden ${
            isFullscreen ? 'w-full h-full' : 'w-full max-w-6xl max-h-[85vh] sm:max-w-[calc(100vw-2rem)]'
          }`}
          style={{ height: isFullscreen ? '100%' : 'calc(var(--full-vh, 85vh) * 0.85)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gray-100 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    {getFileIcon()}
                  </div>
                  <div>
                    <h3 id="yield-preview-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                      {yieldItem.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {yieldItem.type} • {yieldItem.size ? formatFileSize(yieldItem.size) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* View Mode Toggle - Only for text content */}
                {isTextContent() && (
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-1 flex">
                    <Tooltip content="Preview mode" position="bottom">
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`p-1.5 rounded transition-colors ${
                          viewMode === 'preview' 
                            ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400' 
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
                            ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400' 
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Code className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}
                
                {/* Actions */}
                <Tooltip content="Open in new tab" position="bottom">
                  <button
                    onClick={openInNewTab}
                    aria-label="Open in new tab"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                  </button>
                </Tooltip>

                <Tooltip content="Download file" position="bottom">
                  <button
                    onClick={downloadFile}
                    aria-label="Download file"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    <Download className="w-4 h-4 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                  </button>
                </Tooltip>

                <Tooltip content={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} position="bottom">
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" aria-hidden="true" />
                    )}
                  </button>
                </Tooltip>
                
                <Tooltip content="Close preview" position="bottom">
                  <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    aria-label="Close preview"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  >
                    <X className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
          
          {/* Content - uses dynamic viewport height for iOS Safari compatibility */}
          <div className="flex-1 overflow-hidden bg-white dark:bg-gray-950" style={{ height: isFullscreen ? 'calc(var(--full-vh, 100vh) - 80px)' : 'calc(var(--full-vh, 85vh) * 0.85 - 80px)' }}>
            {renderPreview()}
          </div>
          
          {/* Footer with file info */}
          {!loading && !error && (
            <div className="bg-gray-100 dark:bg-gray-800 px-6 py-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600 dark:text-gray-400">
                  {yieldItem.description || yieldItem.name}
                </div>
                <div className="flex items-center space-x-4 text-gray-600 dark:text-gray-400">
                  {yieldItem.createdBy?.agentName && (
                    <span>Created by {yieldItem.createdBy?.agentName || 'Unknown'}</span>
                  )}
                  <span>{yieldItem.size ? formatFileSize(yieldItem.size) : 'N/A'}</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default YieldPreviewModal;