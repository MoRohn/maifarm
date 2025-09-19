import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, Send, Sparkles, Paperclip, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { motion, AnimatePresence } from 'framer-motion';
import { FarmLaunchService } from '@/services/farmLaunchFix';
import FileUpload from '../common/FileUpload';

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'enhance' | 'launching'>('input');
  const [taskDescription, setTaskDescription] = useState('');
  const [enhancedTask, setEnhancedTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setTaskDescription('');
      setEnhancedTask('');
      setAttachedFiles([]);
      setIsFileUploadExpanded(false);
    }
  }, [isOpen]);

  const handleSubmitTask = () => {
    console.log('[QuickTaskModal] handleSubmitTask called with description:', taskDescription);
    const trimmed = taskDescription.trim();
    if (!trimmed) {
      toast.error('Please describe your task');
      return;
    }
    if (trimmed.length < 5) {
      toast.error('Please provide at least 5 characters to describe your task', {
        icon: '⚠️',
        duration: 3000
      });
      return;
    }
    console.log('[QuickTaskModal] Moving to enhance step');
    setStep('enhance');
  };

  const handleEnhanced = (enhanced: string, pills: string[]) => {
    setEnhancedTask(enhanced);
    launchTask(enhanced);
  };

  const handleSkipEnhancement = () => {
    setEnhancedTask(taskDescription);
    launchTask(taskDescription);
  };

  const launchTask = async (prompt: string) => {
    setLoading(true);
    setStep('launching');
    
    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.error('[QuickTaskModal] Task launch timeout after 10 seconds');
      toast.error('Task launch timeout. Please try again.', {
        duration: 4000,
        icon: '⏱️'
      });
      setStep('input');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    try {
      console.log('[QuickTaskModal] Launching quick task with enhanced service');
      
      // Add file context to prompt if files are attached
      let enhancedPrompt = prompt;
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => f.name).join(', ');
        enhancedPrompt = `${prompt}\n\n[Attached files: ${fileNames}]`;
        console.log('[QuickTaskModal] Added file context to prompt:', fileNames);
      }
      
      // Use Promise.race to implement a proper timeout
      const launchPromise = FarmLaunchService.createQuickTask(enhancedPrompt, attachedFiles);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Launch timeout')), 9000)
      );
      
      const result = await Promise.race([launchPromise, timeoutPromise]) as any;
      clearTimeout(timeout); // Clear the UI timeout if successful
      
      console.log('[QuickTaskModal] Launch result:', result);
      
      const farmId = result?.farmId;
      const harvestId = result?.harvestId;
      
      if (farmId) {
        toast.success('⚡ Task launched!');
        console.log('[QuickTaskModal] Successfully got farm ID:', farmId);
        
        // Close modal immediately
        onClose();
        
        // Navigate through concept explainer for Quick Tasks
        const navigationUrl = `/farm/${farmId}/transition/quicktask`;
        console.log('[QuickTaskModal] Navigating to:', navigationUrl);
        
        // Use requestAnimationFrame for smoother transition
        requestAnimationFrame(() => {
          navigate(navigationUrl);
        });
      } else {
        console.error('[QuickTaskModal] No farm ID in result:', result);
        throw new Error('Failed to generate farm ID');
      }
    } catch (error: any) {
      clearTimeout(timeout);
      console.error('[QuickTaskModal] Critical error:', error);
      
      // Provide more specific error messages
      if (error.message === 'Launch timeout') {
        toast.error('Server is taking too long to respond. Please try again.', {
          duration: 4000,
          icon: '⏱️'
        });
      } else if (error.response?.status === 400) {
        toast.error(error.response?.data?.error?.message || 'Invalid request. Please check your input.');
      } else if (error.response?.status >= 500) {
        toast.error('Server error. Please try again in a moment.');
      } else if (!navigator.onLine) {
        toast.error('No internet connection. Please check your network.');
      } else {
        toast.error('Failed to launch task. Please try again.');
      }
      
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Zap className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Quick Task
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    5-minute AI sprint
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Input Step */}
              {step === 'input' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      What do you need help with?
                    </label>
                    <div className="relative">
                      <textarea
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Describe your task (e.g., 'Fix the login button bug', 'Write unit tests for the API')"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                        rows={3}
                        autoFocus
                      />
                      {taskDescription.trim().length > 0 && (
                        <div className="absolute bottom-2 right-2 text-xs">
                          <span className={clsx(
                            "font-medium",
                            taskDescription.trim().length < 5 
                              ? "text-yellow-600 dark:text-yellow-400" 
                              : "text-gray-500 dark:text-gray-400"
                          )}>
                            {taskDescription.trim().length}/5
                          </span>
                        </div>
                      )}
                    </div>
                    {taskDescription.trim().length > 0 && taskDescription.trim().length < 5 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                        Please add {5 - taskDescription.trim().length} more character{5 - taskDescription.trim().length !== 1 ? 's' : ''} for a better description
                      </p>
                    )}
                  </div>

                  {/* Collapsible File Upload Section */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsFileUploadExpanded(!isFileUploadExpanded)}
                      className="flex items-center space-x-2 w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      {isFileUploadExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                      <Paperclip className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Attach Files {attachedFiles.length > 0 && `(${attachedFiles.length})`}
                      </span>
                      {attachedFiles.length > 0 && (
                        <div className="flex-1 flex justify-end">
                          <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                            {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} attached
                          </span>
                        </div>
                      )}
                    </button>
                    
                    <AnimatePresence>
                      {isFileUploadExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 pb-1">
                            <FileUpload
                              onFilesChange={setAttachedFiles}
                              maxFiles={5}
                              maxSizeInMB={10}
                              acceptedTypes={['image/*', '.pdf', '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.yaml', '.yml', '.json']}
                              className="mt-2"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚡ Quick Tasks run for exactly 5 minutes
                    </p>
                  </div>

                  <button
                    onClick={handleSubmitTask}
                    disabled={!taskDescription.trim()}
                    className={clsx(
                      "w-full px-6 py-3 rounded-lg font-medium transition-all duration-200",
                      "flex items-center justify-center space-x-2",
                      taskDescription.trim()
                        ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600 shadow-lg hover:shadow-xl transform hover:scale-105"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    )}
                  >
                    <Send className="w-4 h-4" />
                    <span>Continue</span>
                    {attachedFiles.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                        {attachedFiles.length} {attachedFiles.length === 1 ? 'file' : 'files'}
                      </span>
                    )}
                  </button>
                </motion.div>
              )}

              {/* Enhancement Step */}
              {step === 'enhance' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PromptEnhancer
                    originalPrompt={taskDescription}
                    mode="quicktask"
                    onEnhanced={handleEnhanced}
                    onSkip={handleSkipEnhancement}
                  />
                </motion.div>
              )}

              {/* Launching Step */}
              {step === 'launching' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 space-y-4"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    <Zap className="w-8 h-8 text-yellow-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    Launching your task...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Setting up your 5-minute sprint
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};