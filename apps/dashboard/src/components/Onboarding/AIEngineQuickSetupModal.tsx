import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  CloudIcon,
  ServerIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { api } from '@/services/apiClient';

interface HardwareInfo {
  hasNvidiaGPU: boolean;
  hasAppleSilicon: boolean;
  memoryGB: number;
  computeScore: number;
  recommendedBackend: 'vllm' | 'llama-cpp';
  recommendedModel: string;
  modelRecommendation?: {
    modelName: string;
    modelSize: string;
    backend: string;
    performanceCategory: string;
    reason: string;
  };
}

interface EngineOption {
  id: 'gpt-oss' | 'claude' | 'openai' | 'skip';
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  isLocal: boolean;
  requiresApiKey: boolean;
  hardwareRequirement?: string;
}

export const AIEngineQuickSetupModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [detectingHardware, setDetectingHardware] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  // Check if user needs to see the modal on component mount
  useEffect(() => {
    const hasSeenModal = localStorage.getItem('maifarm:ai-engine-setup-complete');
    const hasDefaultEngine = localStorage.getItem('maifarm:default-ai-engine');

    if (!hasSeenModal && !hasDefaultEngine) {
      // Detect hardware first
      detectHardware();
      setIsOpen(true);
    } else {
      setDetectingHardware(false);
    }
  }, []);

  const detectHardware = async () => {
    try {
      // Fetch both hardware capabilities and model recommendation
      const [hardwareResponse, recommendationResponse] = await Promise.all([
        api.get('/api/auto-model-setup/hardware'),
        api.get('/api/auto-model-setup/recommend').catch(() => null),
      ]);

      if (hardwareResponse.data?.success && hardwareResponse.data?.capabilities) {
        const caps = hardwareResponse.data.capabilities;
        const recommendation = recommendationResponse?.data?.success
          ? recommendationResponse.data.recommendation
          : null;

        setHardware({
          hasNvidiaGPU: caps.hasNvidiaGPU,
          hasAppleSilicon: caps.hasAppleSilicon,
          memoryGB: caps.memory?.totalGB || 8,
          computeScore: caps.computeScore || 0,
          recommendedBackend: caps.hasNvidiaGPU ? 'vllm' : 'llama-cpp',
          recommendedModel: caps.gpu?.name || caps.cpu?.model || 'Unknown',
          modelRecommendation: recommendation ? {
            modelName: recommendation.modelName,
            modelSize: recommendation.modelSize,
            backend: recommendation.backend,
            performanceCategory: recommendation.performanceCategory,
            reason: recommendation.reason,
          } : undefined,
        });
      }
    } catch (error) {
      console.error('Hardware detection failed:', error);
      // Continue with defaults if hardware detection fails
    } finally {
      setDetectingHardware(false);
    }
  };

  const engineOptions: EngineOption[] = [
    {
      id: 'gpt-oss',
      name: 'Local AI (Recommended)',
      description: hardware?.modelRecommendation
        ? `${hardware.modelRecommendation.modelName.split('/').pop()} (${hardware.modelRecommendation.modelSize}) - ${hardware.modelRecommendation.reason}`
        : hardware?.hasAppleSilicon
        ? `GPT-OSS with ${hardware.recommendedModel} - Optimized for your Apple ${hardware.memoryGB}GB system`
        : hardware?.hasNvidiaGPU
        ? `GPT-OSS with NVIDIA GPU acceleration - ${hardware.memoryGB}GB available`
        : `GPT-OSS CPU mode - ${hardware?.memoryGB || 8}GB RAM detected`,
      icon: <CpuChipIcon className="w-8 h-8" />,
      badge: hardware?.modelRecommendation
        ? `${hardware.modelRecommendation.performanceCategory.charAt(0).toUpperCase() + hardware.modelRecommendation.performanceCategory.slice(1)} Performance`
        : hardware ? 'Best for your hardware' : 'Free & Private',
      isLocal: true,
      requiresApiKey: false,
      hardwareRequirement: hardware?.modelRecommendation
        ? `${hardware.modelRecommendation.backend.toUpperCase()} • ${hardware.memoryGB}GB RAM`
        : hardware?.hasAppleSilicon ? 'Apple Silicon' : hardware?.hasNvidiaGPU ? 'NVIDIA GPU' : '8GB+ RAM',
    },
    {
      id: 'claude',
      name: 'Claude (Cloud)',
      description: 'Industry-leading AI with 200K context - Requires API key',
      icon: <CloudIcon className="w-8 h-8" />,
      badge: 'Most Powerful',
      isLocal: false,
      requiresApiKey: true,
    },
    {
      id: 'openai',
      name: 'OpenAI GPT-4 (Cloud)',
      description: 'GPT-4o and GPT-4o mini - Requires API key',
      icon: <SparklesIcon className="w-8 h-8" />,
      badge: 'Popular Choice',
      isLocal: false,
      requiresApiKey: true,
    },
    {
      id: 'skip',
      name: 'Set up later',
      description: 'Configure AI engine in Settings when ready',
      icon: <ArrowRightIcon className="w-8 h-8" />,
      isLocal: false,
      requiresApiKey: false,
    },
  ];

  const handleSelectEngine = async (engineId: string) => {
    setSelectedEngine(engineId);

    if (engineId === 'skip') {
      handleSkip();
      return;
    }

    setLoading(true);

    try {
      if (engineId === 'gpt-oss') {
        // Check installation status first
        const statusResponse = await api.get('/api/auto-model-setup/status');

        if (statusResponse.data?.isInstalled) {
          // Already installed, just set as default
          localStorage.setItem('maifarm:default-ai-engine', 'gpt-oss');
          localStorage.setItem('maifarm:ai-engine-setup-complete', 'true');
          toast.success('GPT-OSS is ready to use!');
          setIsOpen(false);
        } else {
          // Need to install
          await api.post('/api/auto-model-setup/install');

          localStorage.setItem('maifarm:default-ai-engine', 'gpt-oss');
          localStorage.setItem('maifarm:ai-engine-setup-complete', 'true');

          toast.success('GPT-OSS installation started! You can monitor progress in Settings.');
          setIsOpen(false);
        }
      } else {
        // Redirect to Settings for API key configuration
        localStorage.setItem('maifarm:ai-engine-setup-complete', 'true');
        navigate(`/settings?tab=aiProvider&engine=${engineId}`);
        setIsOpen(false);
      }
    } catch (error: any) {
      console.error('Engine setup failed:', error);
      const message = error?.response?.data?.error || 'Failed to configure AI engine. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('maifarm:ai-engine-setup-complete', 'true');
    setIsOpen(false);
    toast.info('You can configure an AI engine anytime in Settings');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleSkip();
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 p-6 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <ServerIcon className="w-8 h-8" />
                  Choose Your AI Engine
                </h2>
                <p className="text-purple-100 mt-1">
                  Select how you want to power your AI farms
                </p>
              </div>
              <button
                onClick={handleSkip}
                className="text-white/80 hover:text-white transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Hardware Detection Banner */}
          {detectingHardware && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin">
                  <CpuChipIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm text-blue-900 dark:text-blue-200">
                  Detecting your hardware to recommend the best AI engine...
                </span>
              </div>
            </div>
          )}

          {hardware && !detectingHardware && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 p-4">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                    Hardware Detected: {hardware.hasAppleSilicon ? 'Apple Silicon' : hardware.hasNvidiaGPU ? 'NVIDIA GPU' : 'CPU Mode'} • {hardware.memoryGB}GB RAM
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Compute Score: {hardware.computeScore}/100 • Backend: {hardware.recommendedBackend}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Engine Options */}
          <div className="p-6 space-y-3">
            {engineOptions.map((option) => (
              <motion.button
                key={option.id}
                onClick={() => handleSelectEngine(option.id)}
                disabled={loading && selectedEngine !== option.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  w-full p-4 rounded-xl border-2 text-left transition-all
                  ${selectedEngine === option.id
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 bg-white dark:bg-gray-900'
                  }
                  ${loading && selectedEngine !== option.id ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`
                    p-3 rounded-lg
                    ${option.id === 'gpt-oss' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : ''}
                    ${option.id === 'claude' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : ''}
                    ${option.id === 'openai' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}
                    ${option.id === 'skip' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' : ''}
                  `}>
                    {option.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {option.name}
                      </h3>
                      {option.badge && (
                        <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">
                          {option.badge}
                        </span>
                      )}
                      {option.isLocal && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full">
                          Private
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {option.description}
                    </p>
                    {option.hardwareRequirement && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        ✓ {option.hardwareRequirement}
                      </p>
                    )}
                  </div>

                  {/* Selection Indicator */}
                  {selectedEngine === option.id && loading ? (
                    <div className="animate-spin">
                      <ArrowRightIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  ) : (
                    <ArrowRightIcon className="w-6 h-6 text-gray-400 dark:text-gray-600 group-hover:text-purple-600 dark:group-hover:text-purple-400" />
                  )}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900 rounded-b-2xl">
            <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
              You can change or add more AI engines anytime in <strong>Settings → AI Engine Setup</strong>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AIEngineQuickSetupModal;
