import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { useFarmStore } from '@/store/farmStore';
import { Rocket, Sparkles, X, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { FarmInputField } from './FarmInputField';

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
  
  const { addFarm, fetchFarms } = useFarmStore();

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setUserPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancements([]);
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
          maxAgents: 3,
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
        config: yamlContent,
        type: 'collaborative',
        status: 'launching',
        orchestratorType: 'multiClaude',
        timeout: 3600, // 1 hour default
        autoScale: false
      };
      
      console.log('[FarmChatWizard] Creating farm with name:', farmName);
      const createResponse = await api.post('/api/farms', farmPayload);
      console.log('[FarmChatWizard] Farm creation response:', createResponse.status);

      if (createResponse.data?.id) {
        hasCompleted = true;
        const newFarmId = createResponse.data.id;
        setFarmId(newFarmId);
        await addFarm(createResponse.data);
        await fetchFarms();
        
        toast.success('🚀 Farm launching!');
        
        // Navigate through concept explainer first
        const transitionUrl = `/farm/${newFarmId}/transition/farm`;
        navigate(transitionUrl);
        
        // Close modal after navigation
        setTimeout(() => {
          onClose();
        }, 100);
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
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Sprout className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Create New Farm
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Let's farm something amazing
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
              className="mt-6 flex justify-center"
            >
              <button
                onClick={launchFarm}
                disabled={isProcessing}
                className="group relative px-8 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-semibold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
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
            </motion.div>
          )}
        </div>

        {/* Input Area - only show in input step */}
        {step === 'input' && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {/* Info tip */}
            <div className="px-6 pt-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 flex items-center space-x-2">
                <span className="text-lg">🌾</span>
                <p className="text-sm text-green-800 dark:text-green-200">
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