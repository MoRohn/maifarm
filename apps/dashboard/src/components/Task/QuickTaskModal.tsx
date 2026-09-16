import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, Send, Sparkles, Paperclip, ChevronRight, Timer, Target, Flame, Eye, Bug, FileText, Code, Wrench, TestTube } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { motion, AnimatePresence } from 'framer-motion';
import { FarmLaunchService } from '@/services/farmLaunchFix';
import FileUpload from '../common/FileUpload';

// Quick Task Theme Colors - Leaf Green for speed and efficiency
const quickTaskTheme = {
  primary: '#22c55e', // leaf-500
  primaryDark: '#16a34a', // leaf-600
  primaryLight: '#4ade80', // leaf-400
  accent: '#86efac', // leaf-300
  gradient: {
    from: '#052e16', // green-950
    via: '#14532d', // green-900
    to: '#15803d', // leaf-700
  },
  glow: 'rgba(34, 197, 94, 0.4)',
  cardBg: 'rgba(5, 46, 22, 0.6)', // green-950/60
  cardBorder: 'rgba(34, 197, 94, 0.25)',
};

// Quick task suggestions for the user
const quickTaskSuggestions = [
  { icon: Eye, title: 'Quick Code Review', description: 'Review a snippet or small file', duration: '5 min' },
  { icon: Bug, title: 'Fix a Bug', description: 'Debug and fix a specific issue', duration: '10 min' },
  { icon: FileText, title: 'Write Documentation', description: 'Add comments or README', duration: '10 min' },
  { icon: TestTube, title: 'Write Tests', description: 'Create unit or integration tests', duration: '15 min' },
  { icon: Wrench, title: 'Refactor Code', description: 'Clean up and optimize', duration: '10 min' },
  { icon: Code, title: 'Implement Feature', description: 'Add a small feature', duration: '15 min' },
];

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

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setTaskDescription('');
      setEnhancedTask('');
      setAttachedFiles([]);
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

    // Set a timeout to prevent infinite loading - backend can take up to 120 seconds
    const timeout = setTimeout(() => {
      console.error('[QuickTaskModal] Task launch timeout after 90 seconds');
      toast.error('Task launch taking longer than expected. Please check the dashboard.', {
        duration: 4000,
        icon: '⏱️'
      });
      setStep('input');
      setLoading(false);
    }, 90000); // 90 second timeout to match backend

    try {
      console.log('[QuickTaskModal] Launching quick task with enhanced service');

      // Add file context to prompt if files are attached
      let enhancedPrompt = prompt;
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => f.name).join(', ');
        enhancedPrompt = `${prompt}\n\n[Attached files: ${fileNames}]`;
        console.log('[QuickTaskModal] Added file context to prompt:', fileNames);
      }

      // Use Promise.race to implement a proper timeout - backend can take up to 120 seconds
      const launchPromise = FarmLaunchService.createQuickTask(enhancedPrompt, attachedFiles);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Launch timeout')), 85000) // 85 seconds to allow backend time
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
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-safe"
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
          }}
        >
          {/* Themed gradient backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${quickTaskTheme.gradient.from} 0%, ${quickTaskTheme.gradient.via} 50%, ${quickTaskTheme.gradient.to} 100%)`,
            }}
            onClick={onClose}
          >
            {/* Animated glow effects */}
            <motion.div
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
              style={{ backgroundColor: quickTaskTheme.glow }}
            />
            <motion.div
              animate={{
                opacity: [0.2, 0.4, 0.2],
                scale: [1.1, 1, 1.1],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl"
              style={{ backgroundColor: quickTaskTheme.glow }}
            />
          </motion.div>

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative w-full max-w-2xl"
          >
            {/* Main container with glass effect */}
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden border"
              style={{
                backgroundColor: 'rgba(6, 78, 59, 0.85)',
                borderColor: quickTaskTheme.cardBorder,
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Subtle inner glow */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  boxShadow: `inset 0 1px 1px rgba(255,255,255,0.1), 0 0 40px ${quickTaskTheme.glow}`,
                }}
              />

              {/* Header */}
              <div className="relative px-6 py-5 border-b" style={{ borderColor: quickTaskTheme.cardBorder }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Animated icon container */}
                    <motion.div
                      className="relative p-3 rounded-xl"
                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
                      animate={{
                        boxShadow: [
                          `0 0 20px ${quickTaskTheme.glow}`,
                          `0 0 30px ${quickTaskTheme.glow}`,
                          `0 0 20px ${quickTaskTheme.glow}`,
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Zap className="w-7 h-7" style={{ color: quickTaskTheme.primary }} />
                    </motion.div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Quick Task
                      </h2>
                      <p className="text-sm" style={{ color: quickTaskTheme.accent }}>
                        5 min · iPhone
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg transition-all hover:scale-110"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: quickTaskTheme.accent
                    }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content - scrollable for iOS small screens with safe area support */}
              <div
                className="relative p-6 overflow-y-auto"
                style={{
                  maxHeight: 'calc(var(--full-vh, 80vh) - 200px - env(safe-area-inset-bottom, 0px))',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {/* Input Step */}
                {step === 'input' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Suggested Tasks Section */}
                    <div>
                      <p className="text-sm font-medium mb-3" style={{ color: quickTaskTheme.accent }}>
                        Suggested for iPhone
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {quickTaskSuggestions.slice(0, 3).map((suggestion, index) => {
                          const IconComponent = suggestion.icon;
                          return (
                            <motion.button
                              key={index}
                              whileHover={{ scale: 1.02, y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setTaskDescription(suggestion.title + ': ' + suggestion.description)}
                              className="p-4 rounded-xl text-left transition-all"
                              style={{
                                backgroundColor: quickTaskTheme.cardBg,
                                borderColor: quickTaskTheme.cardBorder,
                                border: '1px solid',
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <IconComponent
                                  className="w-5 h-5"
                                  style={{ color: index === 0 ? '#3B82F6' : index === 1 ? '#EF4444' : quickTaskTheme.accent }}
                                />
                                <span className="text-xs opacity-60 text-white">{suggestion.duration}</span>
                              </div>
                              <h4 className="font-semibold text-white text-sm mb-1">{suggestion.title}</h4>
                              <p className="text-xs opacity-70 text-white">{suggestion.description}</p>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Task Description */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">
                        Describe your task
                      </label>
                      <textarea
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="What would you like help with? Be specific for better results."
                        className="w-full px-4 py-3 rounded-xl resize-none transition-all text-white placeholder-white/40"
                        style={{
                          backgroundColor: quickTaskTheme.cardBg,
                          borderColor: taskDescription ? quickTaskTheme.primary : quickTaskTheme.cardBorder,
                          border: '1px solid',
                          outline: 'none',
                        }}
                        rows={4}
                        autoFocus
                        onFocus={(e) => {
                          e.target.style.borderColor = quickTaskTheme.primary;
                          e.target.style.boxShadow = `0 0 0 3px ${quickTaskTheme.glow}`;
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = taskDescription ? quickTaskTheme.primary : quickTaskTheme.cardBorder;
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <p className="mt-2 text-xs opacity-60 text-white">
                        What would you like help with? Be specific for better results.
                      </p>
                      {taskDescription.trim().length > 0 && taskDescription.trim().length < 5 && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs flex items-center space-x-1"
                          style={{ color: '#FBBF24' }}
                        >
                          <span>⚠️</span>
                          <span>Please add {5 - taskDescription.trim().length} more character{5 - taskDescription.trim().length !== 1 ? 's' : ''}</span>
                        </motion.p>
                      )}
                    </div>

                    {/* Attachments Section */}
                    <div
                      className="p-4 rounded-xl"
                      style={{
                        backgroundColor: quickTaskTheme.cardBg,
                        borderColor: quickTaskTheme.cardBorder,
                        border: '1px solid',
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-white">Attachments</span>
                          <span className="text-xs opacity-50 text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                            ℹ️
                          </span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: quickTaskTheme.primary }}
                          onClick={() => document.getElementById('quicktask-file-input')?.click()}
                        >
                          <span className="text-white text-lg">+</span>
                        </motion.button>
                      </div>
                      <div className="text-center py-4">
                        <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-40 text-white" />
                        <p className="text-sm opacity-60 text-white">No files attached</p>
                        <p className="text-xs opacity-40 text-white mt-1">Recommended: Screenshots & Photos, Code Snippets</p>
                      </div>
                      <input
                        id="quicktask-file-input"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
                        }}
                      />
                      {attachedFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {attachedFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                              <span className="text-sm text-white truncate">{file.name}</span>
                              <button
                                onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                                className="text-red-400 hover:text-red-300"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <motion.button
                      whileHover={{ scale: loading ? 1 : 1.02 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                      onClick={handleSubmitTask}
                      disabled={!taskDescription.trim() || loading}
                      className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center space-x-2"
                      style={{
                        backgroundColor: (taskDescription.trim() && !loading) ? quickTaskTheme.primary : 'rgba(255,255,255,0.1)',
                        color: (taskDescription.trim() && !loading) ? 'white' : 'rgba(255,255,255,0.4)',
                        cursor: (taskDescription.trim() && !loading) ? 'pointer' : 'not-allowed',
                        boxShadow: (taskDescription.trim() && !loading) ? `0 4px 20px ${quickTaskTheme.glow}` : 'none',
                      }}
                    >
                      <Zap className="w-5 h-5" />
                      <span>{loading ? 'Launching...' : 'Start Quick Task'}</span>
                      {attachedFiles.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                          +{attachedFiles.length}
                        </span>
                      )}
                    </motion.button>
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
                    className="flex flex-col items-center justify-center py-12 space-y-6"
                  >
                    <div className="relative">
                      {/* Outer rotating ring */}
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full"
                      >
                        <div
                          className="w-24 h-24 rounded-full border-4 border-transparent"
                          style={{
                            borderTopColor: quickTaskTheme.primary,
                            borderRightColor: quickTaskTheme.primaryLight,
                          }}
                        />
                      </motion.div>

                      {/* Inner pulsing circle */}
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-24 h-24 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${quickTaskTheme.primaryDark} 0%, ${quickTaskTheme.primary} 50%, ${quickTaskTheme.primaryLight} 100%)`,
                        }}
                      >
                        <Zap className="w-12 h-12 text-white" />
                      </motion.div>

                      {/* Particles */}
                      <motion.div
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute inset-0 rounded-full blur-xl"
                        style={{
                          background: `linear-gradient(135deg, ${quickTaskTheme.primaryLight} 0%, ${quickTaskTheme.primary} 100%)`,
                        }}
                      />
                    </div>

                    <div className="text-center space-y-2">
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-xl font-bold"
                        style={{
                          background: `linear-gradient(90deg, ${quickTaskTheme.primaryLight} 0%, ${quickTaskTheme.primary} 50%, ${quickTaskTheme.accent} 100%)`,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        Launching Sprint
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-sm"
                        style={{ color: quickTaskTheme.accent }}
                      >
                        Setting up your 5-minute sprint...
                      </motion.p>
                    </div>

                    {/* Loading dots */}
                    <div className="flex space-x-2">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{
                            y: [0, -10, 0],
                            backgroundColor: [quickTaskTheme.primaryDark, quickTaskTheme.primary, quickTaskTheme.primaryLight, quickTaskTheme.primaryDark]
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.15
                          }}
                          className="w-2 h-2 rounded-full"
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
