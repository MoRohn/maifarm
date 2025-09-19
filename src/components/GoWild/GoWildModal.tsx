import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trees, Rocket, Sparkles, Paperclip, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarmStore } from '@/store/farmStore';
import FileUpload from '../common/FileUpload';

interface GoWildModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoWildModal: React.FC<GoWildModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'enhance' | 'launching'>('input');
  const [explorationTopic, setExplorationTopic] = useState('');
  const [enhancedTopic, setEnhancedTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);
  const { addFarm, fetchFarms } = useFarmStore();

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setExplorationTopic('');
      setEnhancedTopic('');
      setAttachedFiles([]);
      setIsFileUploadExpanded(false);
    }
  }, [isOpen]);

  const handleSubmitTopic = () => {
    if (!explorationTopic.trim()) {
      toast.error('Please enter an exploration topic');
      return;
    }
    if (explorationTopic.trim().length < 5) {
      toast.error('Please provide at least 5 characters to describe your exploration topic', {
        icon: '⚠️',
        duration: 3000
      });
      return;
    }
    setStep('enhance');
  };

  const handleEnhanced = (enhanced: string, pills: string[]) => {
    setEnhancedTopic(enhanced);
    launchExploration(enhanced);
  };

  const handleSkipEnhancement = () => {
    setEnhancedTopic(explorationTopic);
    launchExploration(explorationTopic);
  };

  const launchExploration = async (prompt: string) => {
    setLoading(true);
    setStep('launching');
    
    try {
      console.log('[GoWildModal] Launching exploration with prompt:', prompt);
      
      // Add file context to prompt if files are attached
      let enhancedPrompt = prompt;
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => f.name).join(', ');
        enhancedPrompt = `${prompt}\n\n[Attached files: ${fileNames}]`;
        console.log('[GoWildModal] Added file context to prompt:', fileNames);
      }
      
      let response;
      
      // If files are attached, use FormData
      if (attachedFiles.length > 0) {
        const formData = new FormData();
        formData.append('prompt', enhancedPrompt);
        formData.append('timeout', '1800'); // 30 minutes default for GoWild
        formData.append('autoScale', 'true');
        formData.append('maxAgents', '5');
        
        // Append each file
        attachedFiles.forEach((file) => {
          formData.append('files', file);
        });
        
        response = await api.post('/api/go-wild', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // No files, use regular JSON
        response = await api.post('/api/go-wild', {
          prompt: enhancedPrompt,
          timeout: 1800, // 30 minutes default for GoWild
          autoScale: true,
          maxAgents: 5
        });
      }
      
      if (response.data?.farmId) {
        // Add farm to store
        if (response.data.farm) {
          await addFarm(response.data.farm);
          await fetchFarms();
        }
        
        toast.success('🌲 Going wild!');
        
        // Navigate through concept explainer first
        const transitionUrl = `/farm/${response.data.farmId}/transition/gowild`;
        console.log('[GoWildModal] Navigating to concept explainer:', transitionUrl);
        navigate(transitionUrl);
        
        // Close modal after navigation
        setTimeout(() => {
          onClose();
        }, 100);
      }
    } catch (error: any) {
      console.error('[GoWildModal] Failed to launch exploration:', error);
      let errorMessage = 'Failed to launch exploration. ';
      
      if (error.response?.data?.error) {
        if (typeof error.response.data.error === 'object') {
          errorMessage += error.response.data.error.message || JSON.stringify(error.response.data.error);
        } else {
          errorMessage += error.response.data.error;
        }
      } else if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please try again.';
      }
      
      toast.error(errorMessage);
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
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Trees className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Go Wild
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Autonomous AI exploration
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
                      What should AI explore?
                    </label>
                    <div className="relative">
                      <textarea
                        value={explorationTopic}
                        onChange={(e) => setExplorationTopic(e.target.value)}
                        placeholder="Give AI agents creative freedom to explore ideas (e.g., 'Build an innovative game', 'Create a unique data visualization')"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                        rows={4}
                        autoFocus
                      />
                      {explorationTopic.trim().length > 0 && (
                        <div className="absolute bottom-2 right-2 text-xs">
                          <span className={clsx(
                            "font-medium",
                            explorationTopic.trim().length < 5 
                              ? "text-yellow-600 dark:text-yellow-400" 
                              : "text-gray-500 dark:text-gray-400"
                          )}>
                            {explorationTopic.trim().length}/10
                          </span>
                        </div>
                      )}
                    </div>
                    {explorationTopic.trim().length > 0 && explorationTopic.trim().length < 5 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                        Please add {10 - explorationTopic.trim().length} more character{10 - explorationTopic.trim().length !== 1 ? 's' : ''} for a better description
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
                              maxFiles={10}
                              maxSizeInMB={10}
                              acceptedTypes={['image/*', '.pdf', '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.yaml', '.yml', '.json']}
                              className="mt-2"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                      <p className="text-sm text-emerald-800 dark:text-emerald-200">
                        🌲 GoWild mode lets AI agents explore autonomously for 30 minutes
                      </p>
                    </div>
                    
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        ⚡ Agents will self-organize and pursue creative solutions
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmitTopic}
                    disabled={!explorationTopic.trim()}
                    className={clsx(
                      "w-full px-6 py-3 rounded-lg font-medium transition-all duration-200",
                      "flex items-center justify-center space-x-2",
                      explorationTopic.trim()
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-lg hover:shadow-xl transform hover:scale-105"
                        : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
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
                    originalPrompt={explorationTopic}
                    mode="gowild"
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
                    <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <Trees className="w-8 h-8 text-emerald-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    Launching exploration...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Unleashing AI creativity
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