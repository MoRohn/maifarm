import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Loader2, FileText, Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';

interface IncubateButtonProps {
  farmId: string;
  harvestId: string;
  farmName: string;
  disabled?: boolean;
  onIncubationStarted?: (sessionId: string) => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const IncubateButton: React.FC<IncubateButtonProps> = ({
  farmId,
  harvestId,
  farmName,
  disabled = false,
  onIncubationStarted,
  className,
  variant = 'primary',
  size = 'md'
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userContext, setUserContext] = useState('');
  const [usePromptFile, setUsePromptFile] = useState(false);
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setUserContext('');
    setUsePromptFile(false);
    setPromptFile(null);
  };

  const handleCloseModal = () => {
    if (isStarting) return; // Prevent closing while starting
    setIsModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('File size must be less than 10MB');
        return;
      }
      setPromptFile(file);
      // Read file content for preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setUserContext(content.substring(0, 5000)); // Preview first 5000 chars
      };
      reader.readAsText(file);
    }
  };

  const handleStartIncubation = async () => {
    setIsStarting(true);

    try {
      let contextToSend = userContext.trim();

      // If using prompt file, send file content
      if (usePromptFile && promptFile) {
        const reader = new FileReader();
        const fileContent = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(promptFile);
        });
        contextToSend = fileContent;
      }

      const response = await api.post('/api/incubations/start', {
        farmId,
        harvestId,
        userContext: contextToSend || undefined
      });

      if (response.data?.success && response.data?.data?.sessionId) {
        const sessionId = response.data.data.sessionId;
        toast.success('🌱 Incubation started successfully!');
        onIncubationStarted?.(sessionId);
        setIsModalOpen(false);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Failed to start incubation:', error);
      toast.error(
        error.response?.data?.error?.message ||
        error.message ||
        'Failed to start incubation'
      );
    } finally {
      setIsStarting(false);
    }
  };

  const getButtonClasses = () => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm space-x-1.5',
      md: 'px-4 py-2 text-base space-x-2',
      lg: 'px-6 py-3 text-lg space-x-2.5'
    };

    const variantClasses = {
      primary: 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white shadow-lg hover:shadow-xl',
      secondary: 'bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700',
      outline: 'border-2 border-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
    };

    return clsx(
      baseClasses,
      sizeClasses[size],
      variantClasses[variant],
      className
    );
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'w-4 h-4';
      case 'md': return 'w-5 h-5';
      case 'lg': return 'w-6 h-6';
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={handleOpenModal}
        disabled={disabled}
        className={getButtonClasses()}
      >
        <Sparkles className={getIconSize()} />
        <span>Incubate</span>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg sm:max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 flex-shrink-0">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                  <div className="p-1.5 sm:p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
                      Incubate Farm
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                      Create an evolved version of "{farmName}"
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  disabled={isStarting}
                  aria-label="Close incubation modal"
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                  <div className="flex items-start space-x-2 sm:space-x-3">
                    <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                        What is Incubation?
                      </p>
                      <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-400 leading-relaxed">
                        Incubation evolves your farm's harvest through 5 AI-powered stages:
                        Contextual Grounding → Gap Analysis → Evolutionary Leap → Validation →
                        Final Deliverable. The result is a new generation farm with enhanced outputs.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Context Input Option Toggle */}
                <div className="flex items-center space-x-2 sm:space-x-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <button
                    onClick={() => setUsePromptFile(false)}
                    aria-pressed={!usePromptFile}
                    className={clsx(
                      'flex-1 py-2.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium transition-all min-h-[44px] text-sm sm:text-base',
                      !usePromptFile
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    )}
                  >
                    Text Input
                  </button>
                  <button
                    onClick={() => setUsePromptFile(true)}
                    aria-pressed={usePromptFile}
                    className={clsx(
                      'flex-1 py-2.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium transition-all min-h-[44px] text-sm sm:text-base',
                      usePromptFile
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    )}
                  >
                    Upload File
                  </button>
                </div>

                {/* User Context Input */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    Additional Context <span className="text-gray-500">(Optional)</span>
                  </label>

                  {!usePromptFile ? (
                    <textarea
                      value={userContext}
                      onChange={(e) => setUserContext(e.target.value)}
                      placeholder="Provide guidance for the incubation process... e.g., 'Focus on performance optimization' or 'Enhance error handling and add comprehensive tests'"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                      rows={5}
                      disabled={isStarting}
                    />
                  ) : (
                    <div>
                      <div className="flex items-center justify-center w-full">
                        <label className={clsx(
                          'flex flex-col items-center justify-center w-full h-28 sm:h-32 border-2 border-dashed rounded-lg cursor-pointer',
                          'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600',
                          'hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600',
                          isStarting && 'opacity-50 cursor-not-allowed'
                        )}>
                          <div className="flex flex-col items-center justify-center py-4 sm:pt-5 sm:pb-6 px-4">
                            <FileText className="w-8 h-8 sm:w-10 sm:h-10 mb-2 text-gray-400" />
                            <p className="mb-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center">
                              <span className="font-semibold">Tap to upload</span> <span className="hidden sm:inline">or drag and drop</span>
                            </p>
                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 text-center">
                              Text, Markdown, or JSON (MAX 10MB)
                            </p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept=".txt,.md,.json"
                            onChange={handleFileChange}
                            disabled={isStarting}
                          />
                        </label>
                      </div>

                      {promptFile && (
                        <div className="mt-2 sm:mt-3 p-2.5 sm:p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center space-x-2 min-w-0">
                            <FileText className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                            <span className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300 truncate">
                              {promptFile.name}
                            </span>
                            <span className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                              ({(promptFile.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    💡 Provide specific goals or areas to guide the AI incubation process
                  </p>
                </div>

                {/* Preview of stages */}
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 rounded-lg p-3 sm:p-4 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Incubation Stages:
                  </p>
                  {/* MOBILE FIX: Use responsive grid that wraps on small screens */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2 text-center">
                    {['🧭', '🔍', '🚀', '✅', '📦'].map((emoji, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <div className="text-lg sm:text-2xl mb-0.5 sm:mb-1">{emoji}</div>
                        <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                          {20 * (idx + 1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <button
                  onClick={handleCloseModal}
                  disabled={isStarting}
                  className="px-4 py-2.5 sm:py-2 min-h-[44px] text-sm sm:text-base text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={handleStartIncubation}
                  disabled={isStarting}
                  aria-label={isStarting ? 'Starting incubation...' : 'Start incubation'}
                  className="flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 min-h-[44px] bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Start Incubation</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
