import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, Paperclip, ChevronDown, ChevronRight, Sprout } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import FileUpload from '../common/FileUpload';
import { FarmInputField } from '../Farm/FarmInputField';
import { useAIProvider } from '@/hooks/useAIProvider';
import { useFarmStore } from '@/store/farmStore';
import { handleApiError, showRateLimitModal } from '@/utils/errorHandlers';

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  type: 'assistant' | 'user';
  content: string;
}

interface EnhancementOption {
  id: string;
  title: string;
  description: string;
  prompt: string;
  highlights: string[];
}

const deriveQuickTaskName = (prompt: string): string => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 'Quick Task';
  }

  const firstMeaningfulLine = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0) || trimmed;

  const normalized = firstMeaningfulLine.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Quick Task';
  }

  const sentenceCase = normalized[0].toUpperCase() + normalized.slice(1);
  return sentenceCase.length > 60 ? `${sentenceCase.slice(0, 57).trim()}…` : sentenceCase;
};

export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { provider: activeProvider } = useAIProvider();
  const { fetchFarms } = useFarmStore();
  const [step, setStep] = useState<'input' | 'decision' | 'launching'>('input');
  const [taskDescription, setTaskDescription] = useState('');
  const [finalPrompt, setFinalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [selectedEnhancementLabel, setSelectedEnhancementLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEnhancementQuestion, setShowEnhancementQuestion] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<EnhancementOption[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setTaskDescription('');
      setFinalPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancementLabel(null);
      setAttachedFiles([]);
      setIsFileUploadExpanded(false);
      setMessages([
        {
          id: 'assistant-welcome',
          type: 'assistant',
          content: 'What quick win should we tackle together?'
        }
      ]);
      setShowEnhancementQuestion(false);
      setEnhancementOptions([]);
    }
  }, [isOpen]);

  const handleUserMessage = (content: string) => {
    const trimmed = content.trim();
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

    const timestamp = Date.now();
    setTaskDescription(trimmed);
    setFinalPrompt(trimmed);
    setEnhancedPrompt('');
    setSelectedEnhancementLabel(null);

    setMessages(prev => [
      ...prev,
      {
        id: `user-${timestamp}`,
        type: 'user',
        content: trimmed
      },
      {
        id: `assistant-enhance-${timestamp}`,
        type: 'assistant',
        content: 'Want me to tidy that up or give it a little more clarity before we run?' 
      }
    ]);

    setEnhancementOptions([]);
    setShowEnhancementQuestion(true);
    setStep('decision');
  };

  const getEnhancementOptions = (prompt: string): EnhancementOption[] => {
    const trimmed = prompt.trim();
    return [
      {
        id: 'friendly-checklist',
        title: 'Friendly checklist version',
        description: 'Keeps the original request but adds a simple checklist so the agent knows exactly what to hand back.',
        highlights: [
          'Restates the task in plain language',
          'Adds a short deliverable checklist',
          'Mentions double-checks for quality'
        ],
        prompt: `We need to ${trimmed}. Please respond with a friendly checklist that covers: the main steps you’ll take, anything you’ll double-check before finishing, and the exact items you’ll hand back (links, summaries, code, etc.). Keep it warm and concise.`
      },
      {
        id: 'context-plus-next',
        title: 'Context + next-step guide',
        description: 'Explains why the task matters, what a great result looks like, and what to do once it lands.',
        highlights: [
          'Shares why the task matters to the team',
          'Describes the ideal final output',
          'Suggests a simple follow-up step'
        ],
        prompt: `The immediate goal is: ${trimmed}. Start with one sentence explaining why this matters right now and who benefits. Describe the ideal result in a couple of friendly bullets (mention format, tone, or examples if helpful). Wrap up with one practical recommendation for what we should do after we receive the deliverable.`
      }
    ];
  };

  const handleRequestEnhancement = () => {
    if (!taskDescription) return;
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-enhance-${timestamp}`,
        type: 'user',
        content: 'Yes, polish it for me.'
      },
      {
        id: `assistant-options-${timestamp}`,
        type: 'assistant',
        content: 'Here are two clearer versions. Pick one or stick with what you wrote.'
      }
    ]);

    setEnhancementOptions(getEnhancementOptions(taskDescription));
    setShowEnhancementQuestion(false);
  };

  const handleSkipEnhancement = () => {
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-skip-${timestamp}`,
        type: 'user',
        content: 'No need— send it as-is.'
      },
      {
        id: `assistant-skip-${timestamp}`,
        type: 'assistant',
        content: 'Great, launching with your original prompt now.'
      }
    ]);

    setShowEnhancementQuestion(false);
    setEnhancementOptions([]);
    setSelectedEnhancementLabel(null);
    setEnhancedPrompt('');
    setFinalPrompt(taskDescription);
    launchTask(taskDescription);
  };

  const handleSelectEnhancement = (option: EnhancementOption) => {
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-select-${timestamp}`,
        type: 'user',
        content: `Let’s use the “${option.title}” version.`
      },
      {
        id: `assistant-select-${timestamp}`,
        type: 'assistant',
        content: 'Perfect. I’ll use that tuned prompt for the agents.'
      }
    ]);

    setShowEnhancementQuestion(false);
    setEnhancementOptions([]);
    setSelectedEnhancementLabel(option.title);
    setEnhancedPrompt(option.prompt);
    setFinalPrompt(option.prompt);
    launchTask(option.prompt);
  };

  const launchTask = async (prompt: string) => {
    setLoading(true);
    setStep('launching');

    const timeout = setTimeout(() => {
      console.error('[QuickTaskModal] Task launch timeout after 30 seconds');
      toast.error('Task launch timeout. Please try again.', {
        duration: 4000,
        icon: '⏱️'
      });
      setStep('input');
      setLoading(false);
    }, 31000);

    try {
      let promptWithFiles = prompt;
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(f => f.name).join(', ');
        promptWithFiles = `${prompt}\n\n[Attached files: ${fileNames}]`;
      }

      const launchPromise = launchQuickTask(promptWithFiles);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Launch timeout')), 30000)
      );

      const result = await Promise.race([launchPromise, timeoutPromise]) as any;
      clearTimeout(timeout);

      const farmId = result?.farmId || result?.data?.farmId;
      if (farmId) {
        toast.success('⚡ Task launched!');
        onClose();
        await fetchFarms().catch(() => undefined);
        requestAnimationFrame(() => {
          navigate(`/farm/${farmId}/transition/quicktask`);
        });
      } else {
        throw new Error('Failed to generate farm ID');
      }
    } catch (error: any) {
      clearTimeout(timeout);
      console.error('[QuickTaskModal] Critical error:', error);

      if (error.message === 'Launch timeout') {
        toast.error('Server is taking too long to respond. Please try again.', {
          duration: 4000,
          icon: '⏱️'
        });
      } else if (error.code === 'RATE_LIMIT_EXCEEDED' || error.response?.status === 429) {
        // Show rate limit modal for rate limit errors
        showRateLimitModal(error);
      } else if (!navigator.onLine) {
        toast.error('No internet connection. Please check your network.');
      } else {
        // Use generic API error handler for other errors
        handleApiError(error, 'Failed to launch task');
      }

      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const launchQuickTask = async (prompt: string) => {
    const provider = activeProvider || 'claude';
    const taskName = deriveQuickTaskName(prompt);
    const basePayload = {
      prompt,
      name: taskName,
      description: prompt,
      provider,
      mode: 'quick-task',
      agentCount: 2,
      timeoutSeconds: 900,
      useXenoSync: true
    } as const;

    if (attachedFiles.length > 0) {
      const formData = new FormData();
      Object.entries(basePayload).forEach(([key, value]) => formData.append(key, String(value)));
      attachedFiles.forEach((file) => formData.append('files', file));
      const response = await api.quickActions.createFarm(formData);
      return response.data?.data || response.data;
    }

    const response = await api.quickActions.createFarm(basePayload);
    return response.data?.data || response.data;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sprout className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Quick Task Launch</h2>
                  <p className="text-sm text-white/80">Spin up a focused two-agent burst</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={clsx('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={clsx(
                        'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
                          : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-blue-200/70 dark:border-indigo-500/30'
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>

              {step === 'input' && (
                <div className="space-y-4">
                  <FarmInputField
                    onSubmit={handleUserMessage}
                    disabled={loading}
                    minLength={5}
                    submitButtonText="Send"
                    variant="textarea"
                    placeholder="Describe the quick task (e.g., ‘Draft a release note for today’s update’)."
                  />

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsFileUploadExpanded(!isFileUploadExpanded)}
                    className="flex items-center space-x-2 w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      {isFileUploadExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                      <Paperclip className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Attach context or files (optional)
                      </span>
                      {attachedFiles.length > 0 && (
                        <span className="ml-auto text-xs text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                          {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''}
                        </span>
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
                </div>
              )}

              {step === 'decision' && showEnhancementQuestion && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-900 border border-blue-200/60 dark:border-blue-800/40 rounded-xl p-4 shadow-sm">
                    <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Current prompt</h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {taskDescription}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleRequestEnhancement}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg shadow-md hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="h-5 w-5" />
                      Enhance it
                    </button>
                    <button
                      onClick={handleSkipEnhancement}
                    className="flex-1 px-5 py-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    >
                      No, continue
                    </button>
                  </div>
                </div>
              )}

              {step === 'decision' && !showEnhancementQuestion && enhancementOptions.length > 0 && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {enhancementOptions.map((option) => (
                      <div
                        key={option.id}
                        className="h-full bg-white dark:bg-gray-900 border border-blue-200/70 dark:border-indigo-500/30 rounded-xl p-4 shadow-sm flex flex-col gap-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{option.title}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{option.description}</p>
                          </div>
                          <Sparkles className="h-5 w-5 text-blue-500" />
                        </div>

                        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {option.highlights.map((highlight, index) => (
                            <li key={`${option.id}-highlight-${index}`} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          onClick={() => handleSelectEnhancement(option)}
                          className="mt-auto inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
                        >
                          Use this version
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSkipEnhancement}
                    className="w-full px-5 py-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                  >
                    No, continue with my original prompt
                  </button>
                </div>
              )}

              {step === 'launching' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 space-y-4"
                >
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-300 border-t-indigo-500" />
                  <div className="text-center space-y-2">
                    <p className="text-lg font-medium text-gray-900 dark:text-white">Launching quick task</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                      Warming up agents, setting the workspace, and preparing your deliverable.
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
