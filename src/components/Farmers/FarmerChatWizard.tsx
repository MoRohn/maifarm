import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X,
  Sparkles,
  Rocket,
  Users,
  Clock,
  Zap,
  ChevronRight,
  MessageCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { FarmerTemplate } from '@/types/farmers';
import { api } from '@/services/apiClient';
import { useFarmStore } from '@/store/farmStore';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { FarmInputField } from '../Farm/FarmInputField';

interface FarmerChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
  farmer: FarmerTemplate;
}

interface ChatMessage {
  id: string;
  type: 'assistant' | 'user';
  content: string;
  metadata?: {
    agents?: Array<{ name: string; emoji: string; role: string }>;
    config?: { maxAgents: number; timeout: number };
  };
}

export const FarmerChatWizard: React.FC<FarmerChatWizardProps> = ({
  isOpen,
  onClose,
  farmer
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'greeting' | 'input' | 'enhance' | 'ready'>('greeting');
  const [userPrompt, setUserPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [selectedEnhancements, setSelectedEnhancements] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [customAgentCount, setCustomAgentCount] = useState(farmer.config.maxAgents || 3);
  const [customTimeout, setCustomTimeout] = useState(farmer.config.timeout || 3600);
  
  const { addFarm, fetchFarms } = useFarmStore();

  // Initialize with farmer greeting when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('greeting');
      setUserPrompt('');
      setEnhancedPrompt('');
      setSelectedEnhancements([]);
      setCustomAgentCount(farmer.config.maxAgents || 3);
      setCustomTimeout(farmer.config.timeout || 3600);
      
      // Create personalized greeting based on farmer
      const greetingMessage = generateFarmerGreeting();
      setMessages([{
        id: 'farmer-greeting',
        type: 'assistant',
        content: greetingMessage,
        metadata: {
          agents: farmer.agents.map(a => ({
            name: a.name,
            emoji: a.emoji || '🌾',
            role: a.role
          })),
          config: {
            maxAgents: farmer.config.maxAgents || 3,
            timeout: farmer.config.timeout || 3600
          }
        }
      }]);
      
      // Auto-advance to input after a moment
      setTimeout(() => setStep('input'), 1500);
    }
  }, [isOpen, farmer]);

  const generateFarmerGreeting = (): string => {
    const introductions = [
      `🌟 Hi! I'm the ${farmer.title}, ready to help you ${farmer.description.toLowerCase()}`,
      `👋 Welcome! The ${farmer.title} team is here, specialized in ${farmer.category} tasks`,
      `${farmer.agents[0]?.emoji || '🌾'} Hello! I'm ${farmer.title}, and I've assembled a team of ${farmer.agents.length} specialized agents for you`,
      `✨ Greetings! The ${farmer.title} is ready to tackle your ${farmer.category} challenges`
    ];
    
    const randomIntro = introductions[Math.floor(Math.random() * introductions.length)];
    
    // Add agent preview
    const agentPreview = farmer.agents.slice(0, 3).map(a => 
      `${a.emoji || '👤'} ${a.name}`
    ).join(', ');
    
    return `${randomIntro}\n\nMy team includes: ${agentPreview}${farmer.agents.length > 3 ? ` and ${farmer.agents.length - 3} more...` : ''}\n\nWhat would you like us to help you build today?`;
  };

  const handleUserMessage = async (content: string) => {
    setUserPrompt(content);
    
    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content
    }]);

    // Add farmer's response acknowledging the task
    const acknowledgment = generateTaskAcknowledgment(content);
    setMessages(prev => [...prev, {
      id: `ack-${Date.now()}`,
      type: 'assistant',
      content: acknowledgment
    }]);

    // Move to enhancement step
    setStep('enhance');
  };

  const generateTaskAcknowledgment = (task: string): string => {
    const responses = [
      `Great choice! The ${farmer.title} team is perfect for this. Let me enhance your request with our ${farmer.category} expertise...`,
      `Excellent! My ${farmer.agents.length} specialized agents will collaborate on this. Would you like me to enhance the prompt with domain-specific context?`,
      `Perfect match for our skills! The ${farmer.title} specializes in exactly this type of work. Let me optimize the task for my agents...`,
      `I understand! This aligns perfectly with our ${farmer.category} capabilities. Shall I enhance this with our specialized knowledge?`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleEnhanced = (enhanced: string, pills: string[]) => {
    // Merge farmer context with enhanced prompt
    const farmerEnhancedPrompt = mergeFarmerContext(enhanced);
    setEnhancedPrompt(farmerEnhancedPrompt);
    setSelectedEnhancements([...pills, `${farmer.title} expertise`]);
    setStep('ready');
    
    // Add confirmation message with farmer context
    setMessages(prev => [...prev, {
      id: 'enhanced',
      type: 'assistant',
      content: `✨ Excellent! I've enhanced your prompt with ${farmer.title}'s specialized knowledge and added: ${pills.join(', ')}\n\nYour farm will have ${customAgentCount} agents working for up to ${Math.floor(customTimeout / 3600)} hour(s).\n\nReady to launch your ${farmer.category} farm?`
    }]);
  };

  const handleSkipEnhancement = () => {
    // Still merge farmer context even if skipping enhancement
    const farmerPrompt = mergeFarmerContext(userPrompt);
    setEnhancedPrompt(farmerPrompt);
    setStep('ready');
    
    setMessages(prev => [...prev, {
      id: 'ready',
      type: 'assistant',
      content: `👍 Got it! I'll use your original prompt with ${farmer.title}'s built-in expertise.\n\nLaunching with ${customAgentCount} specialized agents.`
    }]);
  };

  const mergeFarmerContext = (prompt: string): string => {
    // Add farmer-specific context to the prompt
    const context = [
      `Using ${farmer.title} farmer template with ${farmer.agents.length} specialized agents.`,
      `Focus: ${farmer.category} development with emphasis on ${farmer.description}.`,
      `Agent roles: ${farmer.agents.map(a => `${a.name} (${a.role})`).join(', ')}.`,
      `Coordination: ${farmer.config.coordination || 'collaborative'} workflow.`,
      `User request: ${prompt}`
    ];
    
    return context.join('\n');
  };

  const launchFarm = async () => {
    setIsProcessing(true);
    
    let timeoutId: NodeJS.Timeout | null = null;
    let hasCompleted = false;
    
    try {
      // Check for API key
      const provider = localStorage.getItem('ai_provider') || 'claude';
      let hasApiKey = false;
      
      try {
        const response = await fetch('/api/providers/status');
        if (response.ok) {
          const data = await response.json();
          hasApiKey = data.providers?.[provider]?.configured || false;
        }
      } catch (error) {
        console.log('Server API status check failed, checking localStorage');
      }
      
      if (!hasApiKey) {
        hasApiKey = !!localStorage.getItem(`${provider}_api_key`);
      }
      
      // REMOVED: Don't check API keys in frontend - backend handles this
      // The backend will use API keys from database or environment
      // This was causing false "missing API key" notifications
      
      timeoutId = setTimeout(() => {
        if (!hasCompleted) {
          hasCompleted = true;
          setIsProcessing(false);
          toast.error('Network request timed out. Please try again.', { duration: 5000 });
        }
      }, 90000);
      
      // Generate farmer-aware YAML configuration
      setMessages(prev => [...prev, {
        id: `config-${Date.now()}`,
        type: 'assistant',
        content: `🔧 Generating ${farmer.title} farm configuration...`
      }]);
      
      console.log(`[FarmerChatWizard] Generating YAML for farmer ${farmer.id}`);
      
      // Use the farmer-specific YAML generation endpoint
      const yamlResponse = await api.farmers.generateYaml(farmer.id, {
        farmName: `${farmer.title} - ${userPrompt.slice(0, 30)}`,
        description: enhancedPrompt || userPrompt,
        customPrompt: userPrompt,
        maxAgents: customAgentCount,
        timeout: customTimeout
      });
      
      const yamlContent = yamlResponse.data?.yaml;
      
      if (!yamlContent) {
        console.error('[FarmerChatWizard] YAML generation returned empty content');
        hasCompleted = true;
        throw new Error('Configuration generation failed. Please try again.');
      }
      
      console.log('[FarmerChatWizard] YAML content generated successfully');
      
      // Launch the farm using the farmer launch endpoint
      setMessages(prev => [...prev, {
        id: `launch-${Date.now()}`,
        type: 'assistant',
        content: `🚀 Launching your ${farmer.title} farm...`
      }]);
      
      const farmName = `${farmer.title} - ${userPrompt.slice(0, 30).replace(/[^a-zA-Z0-9\s]/g, '').trim()}`;
      
      const launchResponse = await api.farmers.launch(farmer.id, {
        farmName,
        description: enhancedPrompt || userPrompt,
        userPrompt: userPrompt,
        maxAgents: customAgentCount,
        yamlContent
      });
      
      if (launchResponse.data?.success && launchResponse.data?.data?.farmId) {
        hasCompleted = true;
        const newFarmId = launchResponse.data.data.farmId;
        
        // Update store with the new farm
        await fetchFarms();
        
        toast.success(`🚀 ${farmer.title} farm launching!`);
        
        // Navigate through concept explainer with farmer context
        navigate(`/farm/${newFarmId}/transition/farm`, {
          state: {
            farmId: newFarmId,
            farmerTemplate: farmer,
            justLaunched: true
          }
        });
        
        setTimeout(() => {
          onClose();
        }, 100);
      } else {
        hasCompleted = true;
        throw new Error('Farm creation failed. Please try again.');
      }
    } catch (error: any) {
      hasCompleted = true;
      
      let errorMessage = '';
      if (error.message) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Failed to launch farm. Please try again.';
      }
      
      toast.error(errorMessage, { duration: 6000 });
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
        {/* Header with Farmer Info */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-green-400 to-green-600 rounded-lg shadow-lg">
              <span className="text-2xl">{farmer.agents[0]?.emoji || '🌾'}</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {farmer.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {farmer.category} specialist • {farmer.agents.length} agents
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
        <div className="h-96 overflow-y-auto p-6 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  'flex',
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={clsx(
                    'max-w-md px-4 py-3 rounded-2xl',
                    message.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Show agent preview if available */}
                  {message.metadata?.agents && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex flex-wrap gap-2">
                        {message.metadata.agents.map((agent, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center space-x-1 px-2 py-1 bg-white/10 rounded-full text-xs"
                          >
                            <span>{agent.emoji}</span>
                            <span>{agent.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          {step === 'input' && (
            <FarmInputField
              onSubmit={handleUserMessage}
              placeholder={`Tell the ${farmer.title} team what you'd like to build...`}
              disabled={isProcessing}
            />
          )}

          {step === 'enhance' && !isProcessing && (
            <div className="space-y-4">
              <PromptEnhancer
                originalPrompt={userPrompt}
                mode='farm'
                onEnhanced={handleEnhanced}
                onSkip={handleSkipEnhancement}
              />
              
              {/* Configuration Options */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <input
                      type="range"
                      min="1"
                      max={farmer.config.maxAgents || 8}
                      value={customAgentCount}
                      onChange={(e) => setCustomAgentCount(parseInt(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm font-medium">{customAgentCount} agents</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <select
                      value={customTimeout}
                      onChange={(e) => setCustomTimeout(parseInt(e.target.value))}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                    >
                      <option value={1800}>30 min</option>
                      <option value={3600}>1 hour</option>
                      <option value={7200}>2 hours</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'ready' && !isProcessing && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <Sparkles className="w-4 h-4" />
                <span>Ready with {selectedEnhancements.length} enhancements</span>
              </div>
              <button
                onClick={launchFarm}
                disabled={isProcessing}
                className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105"
              >
                <Rocket className="w-5 h-5" />
                <span>Launch {farmer.title} Farm</span>
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center justify-center space-x-3 py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent" />
              <span className="text-gray-600 dark:text-gray-400">Processing...</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};