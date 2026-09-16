import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trees, Rocket, Sparkles, Paperclip, ChevronDown, ChevronRight, Compass, Brain, Zap, Lightbulb, Palette, Globe, Search, Atom, Wand2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarmStore } from '@/store/farmStore';
import FileUpload from '../common/FileUpload';

// GoWild Theme Colors - Burnt Orange for creative exploration
const goWildTheme = {
  primary: '#f17336', // burnt-orange-500
  primaryDark: '#e25a1e', // burnt-orange-600
  primaryLight: '#f5925a', // burnt-orange-400
  accent: '#fbbf8f', // warm orange accent
  secondary: '#bc4518', // burnt-orange-700
  gradient: {
    from: '#451a03', // orange-950
    via: '#7c2d12', // orange-900
    to: '#96381a', // burnt-orange-800
  },
  glow: 'rgba(241, 115, 54, 0.4)',
  cardBg: 'rgba(69, 26, 3, 0.7)', // orange-950/70
  cardBorder: 'rgba(241, 115, 54, 0.25)',
};

// GoWild exploration suggestions
const explorationSuggestions = [
  { icon: Lightbulb, title: 'Brainstorm Ideas', description: 'Generate creative concepts', duration: '30 min' },
  { icon: Globe, title: 'Research Topic', description: 'Deep dive into any subject', duration: '45 min' },
  { icon: Palette, title: 'Design Exploration', description: 'Explore visual concepts', duration: '30 min' },
  { icon: Search, title: 'Tech Discovery', description: 'Explore new technologies', duration: '1 hr' },
  { icon: Atom, title: 'Problem Solving', description: 'Tackle complex challenges', duration: '45 min' },
  { icon: Wand2, title: 'Creative Writing', description: 'Generate stories & content', duration: '30 min' },
];

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
  const { addFarm, fetchFarms } = useFarmStore();

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setExplorationTopic('');
      setEnhancedTopic('');
      setAttachedFiles([]);
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-safe"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {/* Themed gradient backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${goWildTheme.gradient.from} 0%, ${goWildTheme.gradient.via} 50%, ${goWildTheme.gradient.to} 100%)`,
            }}
            onClick={onClose}
          >
            {/* Animated cosmic glow effects */}
            <motion.div
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.2, 1],
                rotate: [0, 180, 360],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full blur-3xl"
              style={{ backgroundColor: goWildTheme.glow }}
            />
            <motion.div
              animate={{
                opacity: [0.2, 0.5, 0.2],
                scale: [1.2, 1, 1.2],
                rotate: [360, 180, 0],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full blur-3xl"
              style={{ backgroundColor: 'rgba(245, 146, 90, 0.3)' }}
            />
            {/* Sparkle particles */}
            <motion.div
              animate={{
                opacity: [0, 0.8, 0],
                y: [100, -100],
                x: [0, 50],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
              className="absolute top-1/2 left-1/3 w-2 h-2 rounded-full"
              style={{ backgroundColor: goWildTheme.accent }}
            />
            <motion.div
              animate={{
                opacity: [0, 0.6, 0],
                y: [50, -150],
                x: [0, -30],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeOut", delay: 1 }}
              className="absolute top-2/3 right-1/3 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: goWildTheme.primaryLight }}
            />
          </motion.div>

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative w-full max-w-2xl max-h-[90vh] flex flex-col"
          >
            {/* Main container with glass effect */}
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[90vh]"
              style={{
                backgroundColor: 'rgba(69, 26, 3, 0.9)',
                borderColor: goWildTheme.cardBorder,
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Subtle inner glow */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  boxShadow: `inset 0 1px 1px rgba(255,255,255,0.1), 0 0 60px ${goWildTheme.glow}`,
                }}
              />

              {/* Header */}
              <div className="relative px-6 py-5 border-b" style={{ borderColor: goWildTheme.cardBorder }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Animated icon container with sparkle effect */}
                    <motion.div
                      className="relative p-3 rounded-xl"
                      style={{ backgroundColor: 'rgba(241, 115, 54, 0.2)' }}
                      animate={{
                        boxShadow: [
                          `0 0 20px ${goWildTheme.glow}`,
                          `0 0 40px ${goWildTheme.glow}`,
                          `0 0 20px ${goWildTheme.glow}`,
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Trees className="w-7 h-7" style={{ color: goWildTheme.primary }} />
                      {/* Sparkle effect */}
                      <motion.div
                        className="absolute -top-1 -right-1"
                        animate={{ scale: [0, 1, 0], rotate: [0, 180, 360] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      >
                        <Sparkles className="w-4 h-4" style={{ color: goWildTheme.accent }} />
                      </motion.div>
                    </motion.div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Go Wild
                      </h2>
                      <p className="text-sm" style={{ color: goWildTheme.accent }}>
                        30 min - 2 hrs · Creative Exploration
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg transition-all hover:scale-110"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: goWildTheme.accent
                    }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content - iOS-safe scrollable area with dynamic viewport height */}
              <div className="relative p-6 overflow-y-auto flex-1"
                style={{
                  maxHeight: 'calc(var(--full-vh, 90vh) * 0.9 - 100px - env(safe-area-inset-bottom, 0px))',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {/* Input Step */}
                {step === 'input' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Exploration Suggestions */}
                    <div>
                      <p className="text-sm font-medium mb-3" style={{ color: goWildTheme.accent }}>
                        Exploration Ideas
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {explorationSuggestions.slice(0, 3).map((suggestion, index) => {
                          const IconComponent = suggestion.icon;
                          return (
                            <motion.button
                              key={index}
                              whileHover={{ scale: 1.02, y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setExplorationTopic(suggestion.title + ': ' + suggestion.description)}
                              className="p-4 rounded-xl text-left transition-all"
                              style={{
                                backgroundColor: goWildTheme.cardBg,
                                borderColor: goWildTheme.cardBorder,
                                border: '1px solid',
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <IconComponent
                                  className="w-5 h-5"
                                  style={{ color: index === 0 ? '#fbbf24' : index === 1 ? goWildTheme.primary : goWildTheme.accent }}
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

                    {/* Exploration Topic Input */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white">
                        What should AI explore?
                      </label>
                      <textarea
                        value={explorationTopic}
                        onChange={(e) => setExplorationTopic(e.target.value)}
                        placeholder="Give AI agents creative freedom to explore ideas, discover patterns, or build innovative solutions..."
                        className="w-full px-4 py-3 rounded-xl resize-none transition-all text-white placeholder-white/40"
                        style={{
                          backgroundColor: goWildTheme.cardBg,
                          borderColor: explorationTopic ? goWildTheme.primary : goWildTheme.cardBorder,
                          border: '1px solid',
                          outline: 'none',
                        }}
                        rows={3}
                        autoFocus
                        onFocus={(e) => {
                          e.target.style.borderColor = goWildTheme.primary;
                          e.target.style.boxShadow = `0 0 0 3px ${goWildTheme.glow}`;
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = explorationTopic ? goWildTheme.primary : goWildTheme.cardBorder;
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                      <p className="mt-2 text-xs opacity-60 text-white">
                        Describe the exploration topic. Be creative and open-ended for best results.
                      </p>
                      {explorationTopic.trim().length > 0 && explorationTopic.trim().length < 5 && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs flex items-center space-x-1"
                          style={{ color: '#FBBF24' }}
                        >
                          <span>⚠️</span>
                          <span>Please add {5 - explorationTopic.trim().length} more character{5 - explorationTopic.trim().length !== 1 ? 's' : ''}</span>
                        </motion.p>
                      )}
                    </div>

                    {/* Attachments Section - Compact for iPad */}
                    <div
                      className="p-3 rounded-xl"
                      style={{
                        backgroundColor: goWildTheme.cardBg,
                        borderColor: goWildTheme.cardBorder,
                        border: '1px solid',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Paperclip className="w-4 h-4 opacity-60 text-white" />
                          <span className="text-sm font-medium text-white">Attachments</span>
                          {attachedFiles.length === 0 && (
                            <span className="text-xs opacity-40 text-white">(optional)</span>
                          )}
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: goWildTheme.primary }}
                          onClick={() => document.getElementById('gowild-file-input')?.click()}
                        >
                          <span className="text-white text-sm">+</span>
                        </motion.button>
                      </div>
                      <input
                        id="gowild-file-input"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
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
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSubmitTopic}
                      disabled={!explorationTopic.trim()}
                      className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center space-x-2"
                      style={{
                        backgroundColor: explorationTopic.trim() ? goWildTheme.primary : 'rgba(255,255,255,0.1)',
                        color: explorationTopic.trim() ? 'white' : 'rgba(255,255,255,0.4)',
                        cursor: explorationTopic.trim() ? 'pointer' : 'not-allowed',
                        boxShadow: explorationTopic.trim() ? `0 4px 20px ${goWildTheme.glow}` : 'none',
                      }}
                    >
                      <Trees className="w-5 h-5" />
                      <span>Go Wild</span>
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
                    className="flex flex-col items-center justify-center py-12 space-y-6"
                  >
                    <div className="relative">
                      {/* Outer rotating ring */}
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full"
                      >
                        <div
                          className="w-24 h-24 rounded-full border-4 border-transparent"
                          style={{
                            borderTopColor: goWildTheme.primary,
                            borderRightColor: goWildTheme.primaryLight,
                          }}
                        />
                      </motion.div>

                      {/* Inner pulsing circle */}
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-24 h-24 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${goWildTheme.secondary} 0%, ${goWildTheme.primary} 50%, ${goWildTheme.primaryLight} 100%)`,
                        }}
                      >
                        <Trees className="w-12 h-12 text-white" />
                      </motion.div>

                      {/* Particles */}
                      <motion.div
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 rounded-full blur-xl"
                        style={{
                          background: `linear-gradient(135deg, ${goWildTheme.primaryLight} 0%, ${goWildTheme.primary} 100%)`,
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
                          background: `linear-gradient(90deg, ${goWildTheme.primaryLight} 0%, ${goWildTheme.primary} 50%, ${goWildTheme.accent} 100%)`,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        Launching Exploration
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-sm"
                        style={{ color: goWildTheme.accent }}
                      >
                        Unleashing AI creativity and autonomy...
                      </motion.p>
                    </div>

                    {/* Loading dots */}
                    <div className="flex space-x-2">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{
                            y: [0, -10, 0],
                            backgroundColor: [goWildTheme.secondary, goWildTheme.primary, goWildTheme.primaryLight, goWildTheme.secondary]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.2
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
