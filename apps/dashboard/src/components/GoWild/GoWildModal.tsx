import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, Paperclip, ChevronDown, ChevronRight, Sprout } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarmStore } from '@/store/farmStore';
import { useAIProvider } from '@/hooks/useAIProvider';
import FileUpload from '../common/FileUpload';
import { FarmInputField } from '../Farm/FarmInputField';
import { handleApiError, showRateLimitModal } from '@/utils/errorHandlers';

interface GoWildModalProps {
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

export const GoWildModal: React.FC<GoWildModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { addFarm, fetchFarms } = useFarmStore();
  const { provider: activeProvider } = useAIProvider();

  const [step, setStep] = useState<'input' | 'decision' | 'launching'>('input');
  const [explorationTopic, setExplorationTopic] = useState('');
  const [finalPrompt, setFinalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [selectedEnhancementLabel, setSelectedEnhancementLabel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEnhancementQuestion, setShowEnhancementQuestion] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<EnhancementOption[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setExplorationTopic('');
      setFinalPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancementLabel(null);
      setMessages([
        {
          id: 'assistant-welcome',
          type: 'assistant',
          content: 'What wild idea or open-ended exploration should we chase?'
        }
      ]);
      setShowEnhancementQuestion(false);
      setEnhancementOptions([]);
      setAttachedFiles([]);
      setIsFileUploadExpanded(false);
    }
  }, [isOpen]);

  const handleUserMessage = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error('Please enter an exploration topic');
      return;
    }
    if (trimmed.length < 5) {
      toast.error('Please provide at least 5 characters to describe your exploration topic', {
        icon: '⚠️',
        duration: 3000
      });
      return;
    }

    const timestamp = Date.now();
    setExplorationTopic(trimmed);
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
        content: 'Shall I add a touch of story and direction before the agents head out?'
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
        id: 'storyboard-adventure',
        title: 'Storyboard adventure',
        description: 'Turns the idea into a playful journey with memorable stops and questions to answer.',
        highlights: [
          'Sets the scene and tone for the exploration',
          'Suggests key stops with guiding questions',
          'Captures souvenirs (insights, artifacts, or prototypes)'
        ],
        prompt: `Imagine this exploration as a story. The theme is "${trimmed}". Describe the setting, who is along for the ride, and the atmosphere we want to create. Suggest three memorable stops on the journey. For each stop, share a guiding question and the kind of souvenir (insight, artifact, or prototype) we hope to bring back before continuing.`
      },
      {
        id: 'north-star-compass',
        title: 'North Star + compass',
        description: 'Adds the why, the dream outcome, and the follow-up threads we should consider once agents report back.',
        highlights: [
          'Clarifies who benefits and what success feels like',
          'Offers open-ended prompts to spark fresh angles',
          'Encourages a discovery log and next steps'
        ],
        prompt: `Keep the spirit of "${trimmed}" but add a helpful compass. Start with a short note on why this exploration matters and who will benefit from what we learn. Offer a handful of open-ended prompts that could spark unexpected ideas. Encourage the agents to keep a discovery log of inspiring resources, quotes, or wild thoughts. Conclude with a friendly summary of the most exciting next steps once the exploration wraps.`
      }
    ];
  };

  const handleRequestEnhancement = () => {
    if (!explorationTopic) return;
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-enhance-${timestamp}`,
        type: 'user',
        content: 'Yes, add some extra sparkle.'
      },
      {
        id: `assistant-options-${timestamp}`,
        type: 'assistant',
        content: 'Here are two inspired takes. Choose one or keep your original idea.'
      }
    ]);

    setEnhancementOptions(getEnhancementOptions(explorationTopic));
    setShowEnhancementQuestion(false);
  };

  const handleSkipEnhancement = () => {
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-skip-${timestamp}`,
        type: 'user',
        content: 'No magic needed— let’s go as-is.'
      },
      {
        id: `assistant-skip-${timestamp}`,
        type: 'assistant',
        content: 'Adventure it is! Launching with your original idea.'
      }
    ]);

    setShowEnhancementQuestion(false);
    setEnhancementOptions([]);
    setSelectedEnhancementLabel(null);
    setEnhancedPrompt('');
    setFinalPrompt(explorationTopic);
    launchExploration(explorationTopic);
  };

  const handleSelectEnhancement = (option: EnhancementOption) => {
    const timestamp = Date.now();
    setMessages(prev => [
      ...prev,
      {
        id: `user-select-${timestamp}`,
        type: 'user',
        content: `Let’s follow the “${option.title}” path.`
      },
      {
        id: `assistant-select-${timestamp}`,
        type: 'assistant',
        content: 'Wonderful choice. I’ll guide the agents with that storyline.'
      }
    ]);

    setShowEnhancementQuestion(false);
    setEnhancementOptions([]);
    setSelectedEnhancementLabel(option.title);
    setEnhancedPrompt(option.prompt);
    setFinalPrompt(option.prompt);
    launchExploration(option.prompt);
  };

  const launchExploration = async (prompt: string) => {
    setLoading(true);
    setStep('launching');

    try {
      let promptWithFiles = prompt;
      if (attachedFiles.length > 0) {
        const fileNames = attachedFiles.map(file => file.name).join(', ');
        promptWithFiles = `${prompt}\n\nHelpful context from attached files: ${fileNames}`;
      }

      const basePayload = {
        prompt: promptWithFiles,
        agentCount: 5,
        timeoutMinutes: 45,
        provider: 'claude',
        useXenoSync: true
      } as const;

      let response;
      if (attachedFiles.length > 0) {
        const formData = new FormData();
        Object.entries(basePayload).forEach(([key, value]) => formData.append(key, String(value)));
        attachedFiles.forEach((file) => formData.append('files', file));
        response = await api.quickActions.startGoWild(formData);
      } else {
        response = await api.quickActions.startGoWild(basePayload);
      }

      const responseData = response.data?.data || response.data;

      if (responseData?.farmId) {
        if (responseData.farm) {
          await addFarm(responseData.farm);
        }
        await fetchFarms();

        toast.success('🌲 Exploration launch scheduled!');
        navigate(`/farm/${responseData.farmId}/transition/gowild`);

        setTimeout(() => {
          onClose();
        }, 100);
      }
    } catch (error: any) {
      console.error('[GoWildModal] Failed to launch exploration:', error);

      // Check for rate limit errors and show modal
      if (error.code === 'RATE_LIMIT_EXCEEDED' || error.response?.status === 429) {
        showRateLimitModal(error);
      } else {
        // Use generic API error handler for other errors
        handleApiError(error, 'Failed to launch exploration');
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
            className="relative w-full max-w-lg bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="relative bg-gradient-to-r from-orange-500 via-amber-500 to-amber-600 p-6 text-white">
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
                  <h2 className="text-xl font-semibold">Go Wild Exploration</h2>
                  <p className="text-sm text-white/80">Launch an open-ended creative journey</p>
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
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg'
                          : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-amber-200/70 dark:border-amber-500/30'
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
                    placeholder="Where should our AI explorers wander next?"
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
                        Drop in mood boards, research, or inspiration (optional)
                      </span>
                      {attachedFiles.length > 0 && (
                        <span className="ml-auto text-xs text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
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

              {step === 'decision' && showEnhancementQuestion && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-900 border border-amber-200/70 dark:border-amber-500/30 rounded-xl p-4 shadow-sm">
                    <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">Current idea</h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {explorationTopic}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleRequestEnhancement}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg shadow-md hover:from-orange-600 hover:to-amber-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="h-5 w-5" />
                      Add a spark of inspiration
                    </button>
                    <button
                      onClick={handleSkipEnhancement}
                      className="flex-1 px-5 py-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    >
                      No thanks, just explore
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
                        className="h-full bg-white dark:bg-gray-900 border border-amber-200/70 dark:border-amber-500/30 rounded-xl p-4 shadow-sm flex flex-col gap-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{option.title}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{option.description}</p>
                          </div>
                          <Sparkles className="h-5 w-5 text-amber-500" />
                        </div>

                        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {option.highlights.map((highlight, index) => (
                            <li key={`${option.id}-highlight-${index}`} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          onClick={() => handleSelectEnhancement(option)}
                          className="mt-auto inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 text-white font-medium hover:from-orange-600 hover:to-amber-700 transition-all"
                        >
                          Use this story
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSkipEnhancement}
                    className="w-full px-5 py-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                  >
                    No, continue with my original idea
                  </button>
                </div>
              )}

              {step === 'launching' && (
                <div className="flex flex-col items-center justify-center space-y-6 py-12">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-amber-300 border-t-transparent rounded-full animate-spin" />
                    <Sprout className="w-8 h-8 text-orange-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">Launching exploration...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Unleashing AI creativity</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
