import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassmorphicChatModal } from '../Chat/GlassmorphicChatModal';
import { ConceptExplainerModal } from '../Harvest/ConceptExplainerModal';
import { useChatStore, useChatContext } from '@/store/chatStore';
import { aiChatService } from '@/services/aiChatService';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { Message } from '../Chat/ChatMessage';

interface QuickTaskChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickTaskChatWizard: React.FC<QuickTaskChatWizardProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const [showConceptExplainer, setShowConceptExplainer] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  
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
    setFinalPrompt 
  } = useChatContext();

  // Initialize conversation when modal opens
  useEffect(() => {
    if (isOpen) {
      aiChatService.initializeConversation('quick-task');
      
      // Add initial greeting message with varied suggestions
      setTimeout(() => {
        const suggestionSets = [
          [
            'Organize my project files',
            'Create a README',
            'Generate documentation',
            'Clean up unused code'
          ],
          [
            'Write a blog post',
            'Create social media content',
            'Draft an email template',
            'Summarize meeting notes'
          ],
          [
            'Analyze this data',
            'Create a simple script',
            'Convert file formats',
            'Extract information from text'
          ],
          [
            'Design a logo concept',
            'Create color palette',
            'Generate placeholder images',
            'Make a simple diagram'
          ],
          [
            'Research best practices',
            'Find alternatives to X',
            'Compare solutions',
            'Gather requirements'
          ],
          [
            'Fix TypeScript errors',
            'Write unit tests',
            'Debug this issue',
            'Optimize performance'
          ],
          [
            'Create a checklist',
            'Plan project milestones',
            'Write user stories',
            'Define success metrics'
          ],
          [
            'Review and improve code',
            'Add comments and docs',
            'Simplify complex logic',
            'Update dependencies'
          ]
        ];
        
        // Randomly select a suggestion set
        const randomSet = suggestionSets[Math.floor(Math.random() * suggestionSets.length)];
        
        addMessage({
          id: 'greeting',
          role: 'assistant',
          content: "Hi! I'm here to help you get something done quickly. 🚀\n\nWhat task do you need help with? I'll help you define it clearly and execute it with a single agent in under 5 minutes.",
          timestamp: new Date(),
          suggestions: randomSet
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
        content: "I'm having trouble processing that. Could you try rephrasing or let me know more details about your task?"
      });
    }
  };

  // Process AI response to extract context
  const processAIResponse = (response: string) => {
    // Extract task details from conversation
    const lines = response.toLowerCase();
    
    // Look for time-related mentions
    if (lines.includes('minute') || lines.includes('quick')) {
      setTimeoutMinutes(5);
    }
    
    // Check if we have enough context to generate config
    const messageCount = messages.filter(m => m.role === 'user').length;
    if (messageCount >= 2) {
      // Add action buttons for config generation
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && !lastMessage.buttons) {
        updateMessage(lastMessage.id, {
          buttons: [
            { label: '✨ Generate Configuration', action: 'generate', variant: 'primary' },
            { label: '🔄 Start Over', action: 'reset', variant: 'secondary' }
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
      case 'reset':
        clearMessages();
        aiChatService.clearConversation();
        aiChatService.initializeConversation('quick-task');
        break;
      case 'execute':
        await executeTask();
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
      content: '🔧 Generating your Quick Task configuration...',
      timestamp: new Date()
    });

    try {
      // Generate YAML from context
      const yaml = await aiChatService.generateYAML();
      setYamlConfig(yaml);
      
      // Enhance the prompt
      const summary = aiChatService.getConversationSummary();
      const enhancedPrompt = await aiChatService.enhancePrompt(summary);
      setFinalPrompt(enhancedPrompt);
      
      // Extract task name from conversation
      const extractedName = summary.split(' ').slice(0, 5).join(' ');
      setTaskName(extractedName);
      
      // Show configuration preview
      addMessage({
        id: `config-${Date.now()}`,
        role: 'assistant',
        content: `Great! I've prepared your Quick Task configuration:\n\n**Task:** ${extractedName}\n**Timeout:** 5 minutes\n**Agent:** Single focused agent\n\nHere's the configuration:`,
        timestamp: new Date(),
        codeBlock: {
          language: 'yaml',
          code: yaml
        },
        buttons: [
          { label: '🚀 Execute Task', action: 'execute', variant: 'primary' },
          { label: '✏️ Modify', action: 'modify', variant: 'secondary' }
        ]
      });
    } catch (error) {
      console.error('Configuration generation error:', error);
      addMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I had trouble generating the configuration. Could you provide more details about your task?',
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute the task
  const executeTask = async () => {
    setIsProcessing(true);
    
    try {
      // Create and launch the quick task
      const response = await api.tasks.quick({
        title: taskName || 'Quick Task',
        description: context.finalPrompt || context.taskDescription || '',
        config: context.yamlConfig,
        metadata: {
          source: 'chat-wizard',
          conversationSummary: aiChatService.getConversationSummary()
        }
      });

      if (response.data.success) {
        const taskData = response.data.data;
        const quickFarmId = taskData.farmId || response.data.farmId;
        
        if (quickFarmId) {
          setFarmId(quickFarmId);
          
          // Show success message with clear transition
          addMessage({
            id: `success-${Date.now()}`,
            role: 'assistant',
            content: '✅ **Task Launched Successfully!**\n\n' +
                    '🚀 Your agent is now working on the task.\n' +
                    '⏱️ Estimated completion: 5 minutes\n\n' +
                    '**What happens next:**\n' +
                    '1. You\'ll see a brief explanation of our farm concept\n' +
                    '2. Then watch your agent work in real-time\n' +
                    '3. Collect your results when complete\n\n' +
                    'Transitioning now...',
            timestamp: new Date()
          });
          
          // Clear transition to concept explainer
          setTimeout(() => {
            // Add final transition message
            addMessage({
              id: `transition-${Date.now()}`,
              role: 'system',
              content: '🌟 Opening harvest terminal...',
              timestamp: new Date()
            });
            
            // Show concept explainer after a brief pause
            setTimeout(() => {
              setShowConceptExplainer(true);
            }, 800);
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Task execution error:', error);
      addMessage({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to execute the task. Please try again or contact support.',
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle concept explainer continuation
  const handleConceptExplainerContinue = () => {
    setShowConceptExplainer(false);
    if (farmId) {
      console.log(`[QuickTaskChatWizard] Navigating to harvest page for farm ${farmId}`);
      
      // Mark that the modal has been seen to prevent showing it again in HarvestPage
      sessionStorage.setItem(`concept-modal-seen-${farmId}`, 'true');
      
      // Close modal first to prevent interference
      onClose();
      // Navigate directly to the harvest page for the created farm
      setTimeout(() => {
        navigate(`/harvest/${farmId}`);
      }, 100);
    }
  };

  // Handle modal message/action
  const handleModalAction = async (config: any) => {
    if (config.action === 'message') {
      // Handle new message from chat input or suggestion click
      await handleSendMessage(config.text, config.attachments);
    } else if (config.action === 'execute') {
      await executeTask();
    } else if (config.action === 'generate') {
      await generateConfiguration();
    } else if (config.action === 'reset') {
      clearMessages();
      aiChatService.clearConversation();
      aiChatService.initializeConversation('quick-task');
      // Re-add greeting with new random suggestions
      setTimeout(() => {
        const resetSuggestions = [
          [
            'Update documentation',
            'Format code consistently',
            'Remove dead code',
            'Add error handling'
          ],
          [
            'Create a workflow',
            'Generate test data',
            'Build a template',
            'Automate a task'
          ],
          [
            'Research a topic',
            'Compare tools',
            'Analyze feedback',
            'Create a proposal'
          ],
          [
            'Organize resources',
            'Create naming conventions',
            'Set up project structure',
            'Define coding standards'
          ]
        ];
        
        const randomResetSet = resetSuggestions[Math.floor(Math.random() * resetSuggestions.length)];
        
        addMessage({
          id: 'greeting-new',
          role: 'assistant',
          content: "Let's start fresh! What task would you like to accomplish?",
          timestamp: new Date(),
          suggestions: randomResetSet
        });
      }, 500);
    }
  };

  return (
    <>
      <GlassmorphicChatModal
        isOpen={isOpen && !showConceptExplainer}
        onClose={onClose}
        mode="quick-task"
        onComplete={handleModalAction}
      />
      
      <ConceptExplainerModal
        isOpen={showConceptExplainer}
        onClose={() => setShowConceptExplainer(false)}
        onContinue={handleConceptExplainerContinue}
        farmName={taskName || 'Quick Task'}
      />
    </>
  );
};