import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassmorphicChatModal } from '../Chat/GlassmorphicChatModal';
import { ConceptExplainerModal } from '../Harvest/ConceptExplainerModal';
import { useChatStore, useChatContext } from '@/store/chatStore';
import { aiChatService } from '@/services/aiChatService';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { Message } from '../Chat/ChatMessage';
import { useFarmStore } from '@/store/farmStore';

interface GoWildChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoWildChatWizard: React.FC<GoWildChatWizardProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const [showConceptExplainer, setShowConceptExplainer] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingFarm, setIsCreatingFarm] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [farmName, setFarmName] = useState('');
  const [conversationStage, setConversationStage] = useState<'intro' | 'exploring' | 'finalizing'>('intro');
  
  const { addFarm, fetchFarms } = useFarmStore();
  const { 
    messages, 
    addMessage, 
    clearMessages,
    updateMessage 
  } = useChatStore();
  
  const { 
    context, 
    setTaskDescription,
    setTimeoutMinutes,
    setYamlConfig,
    setFinalPrompt,
    setCreativityLevel,
    setNumberOfAgents,
    addFocusArea
  } = useChatContext();

  // Initialize conversation when modal opens
  useEffect(() => {
    if (isOpen) {
      aiChatService.initializeConversation('go-wild');
      setConversationStage('intro');
      
      // Add initial creative greeting
      setTimeout(() => {
        const greetings = [
          {
            content: "🎨 Ready to break boundaries and explore uncharted territory? Let's unleash your creative vision!\n\nWhat wild idea should we bring to life today?",
            suggestions: [
              'Reimagine our user interface',
              'Create an AI-powered feature',
              'Build something never seen before',
              'Innovate our architecture'
            ]
          },
          {
            content: "🚀 Time to think outside the box! I'm here to help you explore creative solutions without limits.\n\nWhat innovative challenge shall we tackle?",
            suggestions: [
              'Revolutionize our workflow',
              'Design a futuristic system',
              'Experiment with new patterns',
              'Create something magical'
            ]
          },
          {
            content: "✨ Let's push the boundaries of what's possible! No idea is too wild.\n\nWhat creative exploration excites you today?",
            suggestions: [
              'Invent a new approach',
              'Challenge conventional thinking',
              'Blend unexpected technologies',
              'Create an artistic solution'
            ]
          }
        ];
        
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        
        addMessage({
          id: 'greeting',
          role: 'assistant',
          content: randomGreeting.content,
          timestamp: new Date(),
          suggestions: randomGreeting.suggestions
        });
      }, 500);
    }
  }, [isOpen, addMessage]);

  // Handle message sending with AI response
  const handleSendMessage = async (text: string, attachments?: File[]) => {
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
      attachments
    };
    addMessage(userMessage);

    // Update conversation stage based on content
    updateConversationStage(text);

    // Create AI response message with streaming
    const aiMessageId = `ai-${Date.now()}`;
    addMessage({
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    });

    try {
      // Stream AI response
      await aiChatService.streamResponse(text, (chunk) => {
        updateMessage(aiMessageId, {
          content: chunk.content,
          suggestions: chunk.suggestions,
          buttons: chunk.buttons
        });

        // Process any context updates from the response
        if (chunk.isComplete) {
          processAIResponse(chunk.content);
        }
      });
    } catch (error) {
      console.error('AI response error:', error);
      updateMessage(aiMessageId, {
        content: getCreativeResponse(conversationStage)
      });
    }
  };

  // Update conversation stage
  const updateConversationStage = (userInput: string) => {
    const lower = userInput.toLowerCase();
    
    if (conversationStage === 'intro' && userInput.length > 20) {
      setConversationStage('exploring');
      setTaskDescription(userInput);
    } else if (messages.filter(m => m.role === 'user').length >= 2) {
      setConversationStage('finalizing');
    }
  };

  // Get creative response based on stage
  const getCreativeResponse = (stage: string): string => {
    switch (stage) {
      case 'intro':
        return "That's an exciting vision! 🌟 Tell me more about what you want to explore. What makes this idea wild and innovative?";
      
      case 'exploring':
        return "What an exciting creative challenge! 🎨🎨\n\n" +
               "For '" + (context.taskDescription || 'your creative vision') + "', I suggest we:\n\n" +
               "1. Set creativity level to high (80%)\n" +
               "2. Use 3-5 agents for diverse exploration\n" +
               "3. Allow 30 minutes for deep innovation\n\n" +
               "Would you like to add any specific areas to explore?";
      
      case 'finalizing':
        return "Your creative vision is taking shape beautifully! ✨\n\n" +
               "Let me prepare the perfect environment for this exploration. " +
               "I'll configure multiple agents to explore different creative angles simultaneously.";
      
      default:
        return "Let's keep exploring! What other creative aspects should we consider?";
    }
  };

  // Process AI response to extract context
  const processAIResponse = (response: string) => {
    const lines = response.toLowerCase();
    
    // Extract creativity level mentions
    if (lines.includes('creativity') || lines.includes('experimental')) {
      if (!context.creativityLevel) {
        setCreativityLevel(80); // Default high for GoWild
      }
    }
    
    // Extract time mentions
    if (lines.includes('minute') || lines.includes('hour')) {
      if (!context.timeoutMinutes) {
        setTimeoutMinutes(30); // Default 30 minutes for exploration
      }
    }
    
    // Check if ready to generate config
    if (conversationStage === 'finalizing' || messages.filter(m => m.role === 'user').length >= 2) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && !lastMessage.buttons) {
        updateMessage(lastMessage.id, {
          buttons: [
            { label: '🚀 Launch Creative Exploration', action: 'generate', variant: 'primary' },
            { label: '✏️ Adjust Parameters', action: 'adjust', variant: 'secondary' }
          ]
        });
      }
    }
  };

  // Handle button actions
  const handleButtonAction = async (action: string) => {
    switch (action) {
      case 'generate':
        await generateConfiguration();
        break;
      case 'adjust':
        addMessage({
          id: `adjust-${Date.now()}`,
          role: 'assistant',
          content: "Let's fine-tune your creative parameters! What would you like to adjust?\n\n" +
                  `Current settings:\n` +
                  `• Creativity: ${context.creativityLevel || 80}%\n` +
                  `• Agents: ${context.numberOfAgents || 5}\n` +
                  `• Duration: ${context.timeoutMinutes || 30} minutes`,
          timestamp: new Date(),
          suggestions: [
            'Increase creativity to 100%',
            'Add more agents',
            'Extend exploration time',
            'Push creative limits'
          ]
        });
        break;
      case 'reset':
        handleReset();
        break;
      case 'execute':
        await executeGoWild();
        break;
    }
  };

  // Generate YAML configuration
  const generateConfiguration = async () => {
    setIsProcessing(true);
    
    // Add generating message
    addMessage({
      id: `generating-${Date.now()}`,
      role: 'assistant',
      content: '🎨 Crafting your creative exploration configuration...',
      timestamp: new Date()
    });

    try {
      // Set optimal parameters for GoWild
      if (!context.creativityLevel) setCreativityLevel(80);
      if (!context.numberOfAgents) setNumberOfAgents(5);
      if (!context.timeoutMinutes) setTimeoutMinutes(30);
      
      // Generate YAML from context
      const yaml = await aiChatService.generateYAML();
      setYamlConfig(yaml);
      
      // Enhance the prompt for maximum creativity
      const summary = aiChatService.getConversationSummary();
      const enhancedPrompt = await aiChatService.enhancePrompt(
        `${summary}\n\nApproach: Be innovative, experimental, and think outside conventional boundaries. ` +
        `Creativity level: ${context.creativityLevel}%. Explore unexpected connections and novel solutions.`
      );
      setFinalPrompt(enhancedPrompt);
      
      // Extract farm name
      const extractedName = summary.split(' ').slice(0, 5).join(' ') || 'Creative Exploration';
      setFarmName(extractedName);
      
      // Show configuration preview
      addMessage({
        id: `config-${Date.now()}`,
        role: 'assistant',
        content: `✨ Your creative exploration is ready!\n\n` +
                `**Project:** ${extractedName}\n` +
                `**Creativity Level:** ${context.creativityLevel || 80}%\n` +
                `**Exploration Agents:** ${context.numberOfAgents || 5}\n` +
                `**Discovery Time:** ${context.timeoutMinutes || 30} minutes\n\n` +
                `Here's your configuration:`,
        timestamp: new Date(),
        codeBlock: {
          language: 'yaml',
          code: yaml
        },
        buttons: [
          { label: '🚀 Begin Creative Journey', action: 'execute', variant: 'primary' },
          { label: '✏️ Modify', action: 'adjust', variant: 'secondary' }
        ]
      });
    } catch (error) {
      console.error('Configuration generation error:', error);
      addMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I need a bit more clarity on your creative vision. What specific areas should we explore?',
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute GoWild mode
  const executeGoWild = async () => {
    // Prevent double submission
    if (isCreatingFarm) {
      console.log('[GoWildChatWizard] Already creating farm, ignoring duplicate request');
      return;
    }
    
    setIsProcessing(true);
    setIsCreatingFarm(true);
    
    try {
      const basePayload = {
        prompt: context.finalPrompt || context.taskDescription || 'GoWild creative exploration',
        agentCount: context.numberOfAgents || 5,
        timeoutMinutes: context.timeoutMinutes || 30,
        provider: activeProvider || 'claude',
        useXenoSync: true,
        creativityLevel: context.creativityLevel || 80
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
        await fetchFarms();
        setFarmId(responseData.farmId);

        addMessage({
          id: `success-${Date.now()}`,
          role: 'assistant',
          content: '🎨 **Creative Exploration Launched!**\n\n' +
                  '✨ Your creative agents are now exploring uncharted territory!\n' +
                  '🧠 Creativity Level: ' + (context.creativityLevel || 80) + '%\n' +
                  '👥 Active Agents: ' + (context.numberOfAgents || 5) + '\n' +
                  '⏱️ Exploration Time: ' + (context.timeoutMinutes || 30) + ' minutes\n\n' +
                  '**Your Journey Ahead:**\n' +
                  '1. Brief introduction to the harvest concept\n' +
                  '2. Live view of agents exploring creative solutions\n' +
                  '3. Innovative results collected in real-time\n' +
                  '4. Final harvest of all discoveries\n\n' +
                  'Prepare for creative breakthroughs...',
          timestamp: new Date()
        });

        setTimeout(() => {
          addMessage({
            id: `transition-${Date.now()}`,
            role: 'system',
            content: '🚀 Entering creative exploration space...',
            timestamp: new Date()
          });

          setTimeout(() => {
            setShowConceptExplainer(true);
            navigate(`/farm/${responseData.farmId}/transition/gowild`);
            onClose();
          }, 1200);
        }, 2000);
      }
    } catch (error) {
      console.error('GoWild execution error:', error);
      addMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to launch creative exploration. Please try again or contact support.',
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
      setIsCreatingFarm(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    clearMessages();
    aiChatService.clearConversation();
    aiChatService.initializeConversation('go-wild');
    setConversationStage('intro');
    
    // Re-add creative greeting
    setTimeout(() => {
      addMessage({
        id: 'greeting-new',
        role: 'assistant',
        content: "🎨 Let's start fresh with a new creative vision! What wild idea shall we explore?",
        timestamp: new Date(),
        suggestions: [
          'Break conventional patterns',
          'Merge unexpected concepts',
          'Create something unprecedented',
          'Explore unknown possibilities'
        ]
      });
    }, 500);
  };

  // Handle concept explainer continuation
  const handleConceptExplainerContinue = () => {
    setShowConceptExplainer(false);
    if (farmId) {
      console.log(`[GoWildChatWizard] Navigating to harvest page for farm ${farmId}`);
      
      // Mark that the modal has been seen to prevent showing it again in HarvestPage
      sessionStorage.setItem(`concept-modal-seen-${farmId}`, 'true');
      
      // Close modal first to prevent interference
      onClose();
      // Navigate directly to the harvest page for the created farm
      setTimeout(() => {
        navigate(`/harvest/${farmId}`);
      }, 100);
    } else {
      console.error('[GoWildChatWizard] No farmId available for navigation');
      onClose();
    }
  };

  // Handle modal action
  const handleModalAction = async (config: any) => {
    if (config.action === 'message') {
      await handleSendMessage(config.text, config.attachments);
    } else {
      await handleButtonAction(config.action);
    }
  };

  return (
    <>
      <GlassmorphicChatModal
        isOpen={isOpen && !showConceptExplainer}
        onClose={onClose}
        mode="go-wild"
        onComplete={handleModalAction}
      />
      
      <ConceptExplainerModal
        isOpen={showConceptExplainer}
        onClose={() => setShowConceptExplainer(false)}
        onContinue={handleConceptExplainerContinue}
        farmName={farmName || 'Creative Exploration'}
      />
    </>
  );
};
