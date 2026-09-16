import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { useFarmStore } from '@/store/farmStore';
import { Rocket, Sparkles, X, Sprout, Plus, Minus, Clock, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { FarmInputField } from './FarmInputField';
import { SeedApplier } from '../Seeds/SeedApplier';

interface FarmChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FarmChatWizard: React.FC<FarmChatWizardProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'enhance' | 'ready'>('input');
  const [userPrompt, setUserPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [selectedEnhancements, setSelectedEnhancements] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; type: 'assistant' | 'user'; content: string }>>([]);

  // Farm configuration state
  const [agentCount, setAgentCount] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(60); // Default 1 hour
  const [appliedSeedIds, setAppliedSeedIds] = useState<string[]>([]); // Seeds to apply to farm

  const { addFarm, fetchFarms } = useFarmStore();

  // Duration options in minutes
  const durationOptions = [
    { label: '30 min', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '4 hours', value: 240 },
  ];

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setUserPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancements([]);
      setAgentCount(3);
      setDurationMinutes(60);
      setAppliedSeedIds([]); // Reset applied seeds
      setMessages([{
        id: 'greeting',
        type: 'assistant',
        content: "Plant your seeds here!"
      }]);
    }
  }, [isOpen]);

  const handleUserMessage = async (content: string) => {
    setUserPrompt(content);
    
    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content
    }]);

    // Move to enhancement step
    setStep('enhance');
  };

  const handleEnhanced = (enhanced: string, pills: string[]) => {
    setEnhancedPrompt(enhanced);
    setSelectedEnhancements(pills);
    setStep('ready');
    
    // Add confirmation message
    setMessages(prev => [...prev, {
      id: 'enhanced',
      type: 'assistant',
      content: `✨ Great! I've enhanced your prompt with: ${pills.join(', ')}\n\nReady to launch your farm?`
    }]);
  };

  const handleSkipEnhancement = () => {
    setEnhancedPrompt(userPrompt);
    setStep('ready');
    
    // Add confirmation message
    setMessages(prev => [...prev, {
      id: 'ready',
      type: 'assistant',
      content: "👍 Got it! Ready to launch your farm with your original prompt."
    }]);
  };

  const launchFarm = async () => {
    setIsProcessing(true);
    
    let timeoutId: NodeJS.Timeout | null = null;
    let hasCompleted = false;
    
    try {
      // Check for API key - first check server status, then localStorage
      const provider = localStorage.getItem('ai_provider') || 'claude';
      
      // Try to check server API status first
      let hasApiKey = false;
      try {
        const response = await fetch('/api/providers/status');
        if (response.ok) {
          const data = await response.json();
          hasApiKey = data.providers?.[provider]?.configured || false;
        }
      } catch (error) {
        // If server check fails, fall back to localStorage check
        console.log('Server API status check failed, checking localStorage');
      }
      
      // If server check didn't confirm API key, check localStorage as fallback
      if (!hasApiKey) {
        hasApiKey = !!localStorage.getItem(`${provider}_api_key`);
      }
      
      // REMOVED: Don't check API keys in frontend - backend handles this
      // The backend will use API keys from database or environment
      // This was causing false "missing API key" notifications
      
      // Only use timeout as a true failsafe for network issues
      timeoutId = setTimeout(() => {
        if (!hasCompleted) {
          hasCompleted = true;
          setIsProcessing(false);
          toast.error('Network request timed out. Please check your connection and try again.', {
            duration: 5000
          });
        }
      }, 90000); // 90 second failsafe for true network timeouts
      
      // Generate YAML configuration
      setMessages(prev => [...prev, {
        id: `config-${Date.now()}`,
        type: 'assistant',
        content: `🔧 Generating farm configuration for ${provider} provider...`
      }]);
      
      console.log('[FarmChatWizard] Starting YAML generation for provider:', provider);
      
      const yamlRequest = {
        prompt: enhancedPrompt || userPrompt,
        mode: 'freestyle',
        constraints: {
          maxAgents: agentCount,
          context: 'Creating a new AI agent farm for collaborative development'
        },
        enhancePrompt: false // Already enhanced if needed
      };
      
      let yamlContent;
      try {
        console.log('[FarmChatWizard] Sending YAML generation request...');
        const yamlResponse = await api.post('/api/yaml/generate', yamlRequest);
        console.log('[FarmChatWizard] YAML generation response received:', yamlResponse.status);
        
        yamlContent = yamlResponse.data?.data?.yaml;
        
        if (!yamlContent) {
          console.error('[FarmChatWizard] YAML generation returned empty content');
          hasCompleted = true;
          throw new Error('Configuration generation returned empty result. Please try again.');
        }
        
        console.log('[FarmChatWizard] YAML content generated successfully');
      } catch (yamlError: any) {
        hasCompleted = true;
        // Specific error for YAML generation with better diagnostics
        if (yamlError.response?.status === 404) {
          throw new Error('YAML generation endpoint not found. Please ensure the server is running.');
        } else if (yamlError.response?.status === 500) {
          throw new Error('Server error during configuration generation. Please check server logs.');
        } else if (yamlError.response?.data?.error?.message) {
          throw new Error(`Configuration generation failed: ${yamlError.response.data.error.message}`);
        } else if (yamlError.message.includes('Network') || yamlError.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to the server. Please ensure the server is running on port 4567.');
        } else {
          throw new Error(`Failed to generate farm configuration: ${yamlError.message || 'Unknown error'}`);
        }
      }

      // Create the farm
      setMessages(prev => [...prev, {
        id: `create-${Date.now()}`,
        type: 'assistant',
        content: "🌱 Creating your farm..."
      }]);
      
      const farmName = userPrompt.slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'New Farm';
      
      const farmPayload = {
        name: farmName,
        description: enhancedPrompt || userPrompt,
        prompt: enhancedPrompt || userPrompt,
        type: 'collaborative',
        mode: 'harvest', // Standard farm mode
        status: 'launching',
        orchestratorType: 'multiClaude',
        timeout: durationMinutes * 60, // Convert minutes to seconds
        numberOfAgents: agentCount,
        yamlContent: yamlContent, // YAML content as separate field
        config: {
          maxAgents: agentCount,
          timeout: durationMinutes * 60,
          yaml: yamlContent,
          autoScale: false
        },
        autoScale: false,
        autoIncubate: true, // Enable incubation by default for chat wizard
        // Seeds context injection (Feature A: Seeds can Seed a Farm)
        appliedSeedIds: appliedSeedIds.length > 0 ? appliedSeedIds : undefined
      };
      
      console.log('[FarmChatWizard] Creating farm with name:', farmName);
      const createResponse = await api.post('/api/farms', farmPayload);
      console.log('[FarmChatWizard] Farm creation response:', createResponse.status);

      // CRITICAL FIX: Check success flag and access data correctly
      // API returns { success: boolean, data: Farm, message: string }
      const responseData = createResponse.data;
      if (responseData?.success && responseData?.data?.id) {
        hasCompleted = true;
        const newFarmId = responseData.data.id;
        setFarmId(newFarmId);
        await addFarm(responseData.data); // Add the farm data, not the full response
        await fetchFarms();
        
        toast.success('🚀 Farm launching!');
        
        // Navigate through concept explainer first
        const transitionUrl = `/farm/${newFarmId}/transition/farm`;
        navigate(transitionUrl);
        
        // Close modal after navigation
        setTimeout(() => {
          onClose();
        }, 100);
      } else if (!responseData?.success) {
        hasCompleted = true;
        // Handle failure response - get error message from API
        const errorMsg = responseData?.error?.message || responseData?.message || 'Farm creation failed';
        throw new Error(errorMsg);
      } else {
        hasCompleted = true;
        throw new Error('Farm creation did not return an ID. Please try again.');
      }
    } catch (error: any) {
      hasCompleted = true;
      
      // Extract detailed error message with better diagnostics
      let errorMessage = '';
      
      // Don't prefix with "Failed to launch farm" if error already contains specific message
      if (error.message && (
        error.message.includes('Configuration') ||
        error.message.includes('server') ||
        error.message.includes('connect')
      )) {
        errorMessage = error.message;
      } else if (error.response?.status === 404) {
        errorMessage = 'Farm creation endpoint not found. Please ensure the server is running.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error during farm creation. Please check server logs.';
      } else if (error.response?.data?.error?.message) {
        errorMessage = `Farm creation failed: ${error.response.data.error.message}`;
      } else if (error.response?.data?.error) {
        errorMessage = `Farm creation failed: ${error.response.data.error}`;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = `Failed to launch farm: ${error.message}`;
      } else {
        errorMessage = 'Failed to launch farm. Please check your connection and try again.';
      }
      
      toast.error(errorMessage, {
        duration: 6000 // Longer duration for error messages
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Sprout className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Create New Farm
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Multi-agent collaboration for complex tasks
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <div className="space-y-4">
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
                    'max-w-[80%] px-4 py-2 rounded-lg',
                    message.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Enhancement step */}
          {step === 'enhance' && userPrompt && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <PromptEnhancer
                originalPrompt={userPrompt}
                mode="farm"
                onEnhanced={handleEnhanced}
                onSkip={handleSkipEnhancement}
              />
            </motion.div>
          )}

          {/* Ready to launch */}
          {step === 'ready' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 space-y-6"
            >
              {/* Farm Configuration Controls */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-4">
                {/* Agent Count Control */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Agents</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Number of AI agents</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setAgentCount(prev => Math.max(2, prev - 1))}
                      disabled={agentCount <= 2}
                      className={clsx(
                        "w-8 h-8 flex items-center justify-center rounded-lg transition-all",
                        agentCount <= 2
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                          : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800"
                      )}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center font-semibold text-gray-900 dark:text-white text-lg">
                      {agentCount}
                    </span>
                    <button
                      onClick={() => setAgentCount(prev => Math.min(10, prev + 1))}
                      disabled={agentCount >= 10}
                      className={clsx(
                        "w-8 h-8 flex items-center justify-center rounded-lg transition-all",
                        agentCount >= 10
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                          : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800"
                      )}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Duration Control */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                      <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Duration</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Maximum runtime</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {durationOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setDurationMinutes(option.value)}
                        className={clsx(
                          "px-3 py-1.5 text-sm font-medium rounded-lg transition-all",
                          durationMinutes === option.value
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Seed Applier - Feature A: Seeds can Seed a Farm */}
              <div className="mt-4">
                <SeedApplier
                  selectedSeedIds={appliedSeedIds}
                  onSeedsChange={setAppliedSeedIds}
                  mode="harvest"
                  engine="claude"
                  maxSeeds={5}
                />
              </div>

              {/* Launch Button */}
              <div className="flex justify-center">
                <button
                  onClick={launchFarm}
                  disabled={isProcessing}
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
                >
                  <span className="flex items-center space-x-3">
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                        <span>Launching...</span>
                      </>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5 group-hover:animate-bounce" />
                        <span>Launch Farm</span>
                        <Sparkles className="w-5 h-5" />
                      </>
                    )}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area - only show in input step */}
        {step === 'input' && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {/* Info tip */}
            <div className="px-6 pt-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 flex items-center space-x-2">
                <span className="text-lg">🌾</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Farms use multiple AI agents working together
                </p>
              </div>
            </div>
            
            {/* Input field */}
            <div className="p-6">
              <FarmInputField
                placeholder="Describe what you want to task the AI agent farm with..."
                onSubmit={handleUserMessage}
                variant="inline"
                minLength={5}
                showCharacterCount={true}
                autoFocus={true}
                submitButtonText="Send"
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};