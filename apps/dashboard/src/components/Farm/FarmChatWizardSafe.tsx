import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { useFarmStore } from '@/store/farmStore';
import { Rocket, Sparkles, X, Sprout, ChevronRight, ChevronDown, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { FarmInputField } from './FarmInputField';
import { useAIProvider } from '@/hooks/useAIProvider';
import { handleApiError, showRateLimitModal } from '@/utils/errorHandlers';

interface FarmChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Inner component that uses hooks
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

const FarmChatWizardInner: React.FC<FarmChatWizardProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'decision' | 'ready'>('input');
  const [userPrompt, setUserPrompt] = useState('');
  const [finalPrompt, setFinalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [selectedEnhancementLabel, setSelectedEnhancementLabel] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEnhancementQuestion, setShowEnhancementQuestion] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<EnhancementOption[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);

  const { addFarm, fetchFarms } = useFarmStore();
  const { provider: activeProvider } = useAIProvider();

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setUserPrompt('');
      setFinalPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancementLabel(null);
      setShowEnhancementQuestion(false);
      setEnhancementOptions([]);
      setAttachedFiles([]);
      setIsFileUploadExpanded(false);
      setMessages([{
        id: 'greeting',
        type: 'assistant',
        content: "Plant your seeds here!"
      }]);
    }
  }, [isOpen]);

  const handleUserMessage = (content: string) => {
    const trimmed = content.trim();
    if (trimmed.length < 5) {
      toast.error('Please provide at least 5 characters to describe your farm');
      return;
    }

    const timestamp = Date.now();
    setUserPrompt(trimmed);
    setFinalPrompt(trimmed);
    setEnhancedPrompt('');
    setSelectedEnhancementLabel(null);
    setShowEnhancementQuestion(true);
    setEnhancementOptions([]);

    setMessages(prev => [
      ...prev,
      {
        id: `user-${timestamp}`,
        type: 'user',
        content: trimmed
      },
      {
        id: `assistant-${timestamp}`,
        type: 'assistant',
        content: 'Would you like me to enhance your prompt before we launch the farm?'
      }
    ]);

    setStep('decision');
  };

  const generateEnhancementOptions = (prompt: string): EnhancementOption[] => {
    const trimmed = prompt.trim();

    return [
      {
        id: 'narrative-roadmap',
        title: 'Story-driven roadmap',
        description: 'Turns the idea into a friendly action plan with clear phases and outcomes.',
        highlights: [
          'Explain the overall goal in plain language',
          'Suggest a logical sequence of phases with owners',
          'List the outcomes and risks people should watch for'
        ],
        prompt: `Imagine we are teammates planning this together. The goal is to ${trimmed}. Lay out a friendly roadmap with three or four phases. For each phase, explain what success looks like, who should lead it, anything to watch out for, and what we hand off to the next phase.`
      },
      {
        id: 'why-what-how',
        title: 'Why / what / how breakdown',
        description: 'Adds context, audience, and success measures so the farm understands the bigger picture.',
        highlights: [
          'Clarify why this matters and who benefits',
          'Describe the main pieces we should deliver',
          'Share how we will know it worked and the follow-up steps'
        ],
        prompt: `Let’s keep the heart of the original idea: ${trimmed}. Briefly remind the team why this matters, who will use the outcome, and what a great result looks like. Then outline the main pieces we should create, how we test or review them, and the next actions once we deliver.`
      }
    ];
  };

  const handleRequestEnhancement = () => {
    if (!userPrompt) return;

    const timestamp = Date.now();
    const options = generateEnhancementOptions(userPrompt);

    setMessages(prev => [
      ...prev,
      {
        id: `user-yes-${timestamp}`,
        type: 'user',
        content: 'Yes, enhance it.'
      },
      {
        id: `assistant-options-${timestamp}`,
        type: 'assistant',
        content: 'Great! Here are two enhanced versions you can choose from. Pick the one that feels right or continue with your original prompt.'
      }
    ]);

    setEnhancementOptions(options);
    setShowEnhancementQuestion(false);
  };

  const handleSkipEnhancement = () => {
    const timestamp = Date.now();

    setMessages(prev => [
      ...prev,
      {
        id: `user-no-${timestamp}`,
        type: 'user',
        content: 'No, continue with my original prompt.'
      },
      {
        id: `assistant-ack-${timestamp}`,
        type: 'assistant',
        content: 'Perfect— we will use your original prompt as-is.'
      }
    ]);

    setShowEnhancementQuestion(false);
    setEnhancementOptions([]);
    setSelectedEnhancementLabel(null);
    setEnhancedPrompt('');
    setFinalPrompt(userPrompt);
    setStep('ready');
  };

  const handleSelectEnhancedPrompt = (option: EnhancementOption) => {
    const timestamp = Date.now();

    setMessages(prev => [
      ...prev,
      {
        id: `user-select-${timestamp}`,
        type: 'user',
        content: `Let's use the “${option.title}” version.`
      },
      {
        id: `assistant-confirm-${timestamp}`,
        type: 'assistant',
        content: 'Awesome— I will use that enhanced prompt for the farm setup.'
      }
    ]);

    setEnhancedPrompt(option.prompt);
    setSelectedEnhancementLabel(option.title);
    setFinalPrompt(option.prompt);
    setShowEnhancementQuestion(false);
    setStep('ready');
  };

  const handleRevisitEnhancement = () => {
    const timestamp = Date.now();

    setMessages(prev => [
      ...prev,
      {
        id: `assistant-revisit-${timestamp}`,
        type: 'assistant',
        content: 'No problem— we can adjust the prompt again. Would you like another enhancement?' 
      }
    ]);

    setSelectedEnhancementLabel(null);
    setEnhancedPrompt('');
    setFinalPrompt(userPrompt);
    setEnhancementOptions([]);
    setShowEnhancementQuestion(true);
    setStep('decision');
  };

  const handleLaunchFarm = async () => {
    if (!userPrompt.trim()) {
      toast.error('Please enter a task description');
      return;
    }

    setIsProcessing(true);

    try {
      const provider = activeProvider || 'claude';
      const farmName = `Farm ${Date.now()}`;

      console.log('[FarmChatWizard] Starting YAML generation for provider:', provider);

      const promptToUse = (finalPrompt || userPrompt).trim();
      if (promptToUse.length < 5) {
        toast.error('Prompt must be at least 5 characters');
        setStep('input');
        return;
      }

      let promptWithAttachments = promptToUse;
      if (attachedFiles.length > 0) {
        const fileList = attachedFiles.map(file => file.name).join(', ');
        promptWithAttachments = `${promptToUse}\n\nHelpful context from attached files: ${fileList}`;
      }

      setFinalPrompt(promptWithAttachments);

      const payload = {
        prompt: promptWithAttachments,
        name: farmName,
        description: promptWithAttachments,
        provider,
        mode: 'collaborative',
        agentCount: 3,
        timeoutSeconds: 3600,
        useXenoSync: true
      } as const;

      console.log('[FarmChatWizard] Creating farm via quick action payload:', payload);

      let createResponse;
      if (attachedFiles.length > 0) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
        attachedFiles.forEach((file) => formData.append('files', file));
        createResponse = await api.quickActions.createFarm(formData);
      } else {
        createResponse = await api.quickActions.createFarm(payload);
      }
      console.log('[FarmChatWizard] Farm creation response status:', createResponse.status);

      const responseData = createResponse.data?.data || createResponse.data;
      const newFarmId = responseData?.farmId;

      if (!newFarmId) {
        throw new Error('Failed to create farm - no ID returned');
      }

      setFarmId(newFarmId);

      if (responseData?.farm) {
        addFarm(responseData.farm);
      }

      await fetchFarms();

      toast.success(`Farm "${farmName}" launch scheduled!`);

      // Close modal first to prevent conflicts
      onClose();

      // Navigate after a small delay to ensure modal is closed
      setTimeout(() => {
        if (navigate) {
          console.log('[FarmChatWizard] Navigating to:', `/farm/${newFarmId}/transition/farm`);
          navigate(`/farm/${newFarmId}/transition/farm`);
        }
      }, 150);

    } catch (error: any) {
      console.error('[FarmChatWizard] Farm creation failed:', error);

      // Check for rate limit errors and show modal
      if (error.code === 'RATE_LIMIT_EXCEEDED' || error.response?.status === 429) {
        showRateLimitModal(error);
      } else {
        // Use generic API error handler for other errors
        handleApiError(error, 'Failed to create farm');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isProcessing) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-green-600 to-blue-600 p-6 text-white">
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <Sprout className="h-8 w-8" />
                <div>
                  <h2 className="text-2xl font-bold">Plant Your Farm</h2>
                  <p className="text-green-100 mt-1">Tell us what you want to grow</p>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="flex items-center gap-4 mt-6">
                <div className={clsx(
                  "flex items-center gap-2",
                  step === 'input' ? 'text-white' : 'text-green-200'
                )}>
                  <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    step === 'input' ? 'bg-white text-green-600' : 'bg-green-700'
                  )}>
                    1
                  </div>
                  <span className="text-sm font-medium">Describe</span>
                </div>

                <div className="flex-1 h-0.5 bg-green-700" />

                <div className={clsx(
                  "flex items-center gap-2",
                  step === 'enhance' ? 'text-white' : 'text-green-200'
                )}>
                  <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    step === 'enhance' ? 'bg-white text-green-600' : 'bg-green-700'
                  )}>
                    2
                  </div>
                  <span className="text-sm font-medium">Enhance</span>
                </div>

                <div className="flex-1 h-0.5 bg-green-700" />

                <div className={clsx(
                  "flex items-center gap-2",
                  step === 'ready' ? 'text-white' : 'text-green-200'
                )}>
                  <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    step === 'ready' ? 'bg-white text-green-600' : 'bg-green-700'
                  )}>
                    3
                  </div>
                  <span className="text-sm font-medium">Launch</span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              <div className="space-y-6">
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={clsx(
                        'flex',
                        message.type === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={clsx(
                          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white shadow-lg'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-green-200/40 dark:border-green-500/20'
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
                      disabled={isProcessing}
                      minLength={5}
                      submitButtonText="Send"
                      className="pt-2"
                      variant="textarea"
                      placeholder="Tell the farm what you want to accomplish..."
                    />

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsFileUploadExpanded(prev => !prev)}
                        className="flex items-center space-x-2 w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        {isFileUploadExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <Paperclip className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Attach reference files (optional)
                        </span>
                        {attachedFiles.length > 0 && (
                          <span className="ml-auto text-xs text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">
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
                  </div>
                )}

                {step === 'decision' && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-green-200/60 dark:border-green-500/20 shadow-sm">
                      <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Your prompt</h3>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{userPrompt}</p>
                    </div>

                    {showEnhancementQuestion && (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={handleRequestEnhancement}
                          className="flex-1 px-5 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg shadow-md hover:from-green-600 hover:to-blue-600 transition-all flex items-center justify-center gap-2"
                        >
                          <Sparkles className="h-5 w-5" />
                          Enhance my prompt
                        </button>
                        <button
                          onClick={handleSkipEnhancement}
                          className="flex-1 px-5 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                          No, continue
                        </button>
                      </div>
                    )}

                    {!showEnhancementQuestion && enhancementOptions.length > 0 && (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          {enhancementOptions.map((option) => (
                            <div
                              key={option.id}
                              className="h-full bg-white dark:bg-gray-800 rounded-xl border border-green-200/70 dark:border-green-500/30 shadow-sm p-5 flex flex-col gap-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{option.title}</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{option.description}</p>
                                </div>
                                <Sparkles className="h-5 w-5 text-green-500" />
                              </div>

                              <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                {option.highlights.map((highlight, index) => (
                                  <li key={`${option.id}-highlight-${index}`} className="flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                                    <span>{highlight}</span>
                                  </li>
                                ))}
                              </ul>

                              <button
                                onClick={() => handleSelectEnhancedPrompt(option)}
                                className="mt-auto inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-blue-500 text-white font-medium hover:from-green-600 hover:to-blue-600 transition-all"
                              >
                                Use this version
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={handleSkipEnhancement}
                          className="w-full px-5 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                          No, continue with my original prompt
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {step === 'ready' && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-green-100 via-blue-100 to-green-100 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-lg p-6 border border-green-200/60 dark:border-green-500/20">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                        Your farm is ready to launch
                      </h3>

                      <div className="space-y-4 text-sm">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400 mb-1 font-medium">Original prompt</p>
                          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{userPrompt}</p>
                        </div>

                        <div>
                          <p className="text-gray-600 dark:text-gray-400 mb-1 font-medium">Prompt we will use</p>
                          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{(finalPrompt || userPrompt)}</p>

                          {selectedEnhancementLabel ? (
                            <span className="inline-flex items-center gap-2 mt-3 text-xs font-medium px-3 py-1 rounded-full bg-green-200/70 dark:bg-green-500/20 text-green-800 dark:text-green-200">
                              <Sparkles className="h-3 w-3" />
                              Enhanced with “{selectedEnhancementLabel}”
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 mt-3 text-xs font-medium px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                              Using original prompt
                            </span>
                          )}
                        </div>

                        {attachedFiles.length > 0 && (
                          <div>
                            <p className="text-gray-600 dark:text-gray-400 mb-1 font-medium">Attached files</p>
                            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                              {attachedFiles.map(file => (
                                <li key={file.name} className="flex items-center gap-2">
                                  <Paperclip className="w-3 h-3" />
                                  <span>{file.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <button
                        onClick={handleRevisitEnhancement}
                        disabled={isProcessing}
                        className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleLaunchFarm}
                        disabled={isProcessing}
                        className="px-8 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center gap-2"
                      >
                        {isProcessing ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                            Launching...
                          </span>
                        ) : (
                          <>
                            <Rocket className="h-5 w-5" />
                            Launch Farm
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Wrapper component with error boundary and suspense
export const FarmChatWizard: React.FC<FarmChatWizardProps> = (props) => {
  const [hasError, setHasError] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Delay mounting to ensure React Router context is ready
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  if (hasError) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading Farm Wizard</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            There was an error loading the farm creation wizard. Please refresh the page and try again.
          </p>
          <button
            onClick={() => {
              setHasError(false);
              props.onClose();
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!isMounted) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ErrorBoundary
        onError={() => setHasError(true)}
        fallback={null}
      >
        <FarmChatWizardInner {...props} />
      </ErrorBoundary>
    </Suspense>
  );
};

// Simple error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[FarmChatWizard ErrorBoundary]', error, errorInfo);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}
