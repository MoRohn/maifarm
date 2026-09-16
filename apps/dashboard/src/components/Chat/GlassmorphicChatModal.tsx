import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Zap, Trees, Sprout } from 'lucide-react';
import { clsx } from 'clsx';
import { useThemeStore } from '@/store/themeStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChatStore } from '@/store/chatStore';

export type ChatMode = 'quick-task' | 'go-wild' | 'new-farm';

interface GlassmorphicChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ChatMode;
  onComplete: (config: any) => void;
}

const modeConfig = {
  'quick-task': {
    icon: Zap,
    title: 'Quick Task Assistant',
    subtitle: 'Let\'s get something done fast',
    gradient: 'from-sky-400 to-sky-600',
    accentColor: 'sky',
    personality: 'efficient'
  },
  'go-wild': {
    icon: Trees,
    title: 'Creative Explorer',
    subtitle: 'Ready to explore uncharted territory',
    gradient: 'from-harvest-400 to-harvest-600',
    accentColor: 'harvest',
    personality: 'creative'
  },
  'new-farm': {
    icon: Sprout,
    title: 'Farm Architect',
    subtitle: 'Building something amazing together',
    gradient: 'from-leaf-400 to-leaf-600',
    accentColor: 'leaf',
    personality: 'strategic'
  }
};

export const GlassmorphicChatModal: React.FC<GlassmorphicChatModalProps> = ({
  isOpen,
  onClose,
  mode,
  onComplete
}) => {
  const { theme, colorScheme } = useThemeStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const config = modeConfig[mode];
  const Icon = config.icon;
  
  const { 
    messages, 
    addMessage, 
    clearMessages,
    currentMode,
    setMode 
  } = useChatStore();

  // Set mode when component mounts or mode changes
  useEffect(() => {
    if (isOpen) {
      setMode(mode);
      // Don't clear messages immediately to allow for conversation continuation
    }
  }, [mode, isOpen, setMode]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (text: string, attachments?: File[]) => {
    // This will be handled by the parent wizard component
    // The wizard will manage the actual AI interaction
    if (onComplete) {
      onComplete({ 
        action: 'message', 
        text, 
        attachments 
      });
    }
  };

  // Calculate glass effect based on theme
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  const glassClasses = clsx(
    'backdrop-blur-2xl',
    isDark ? [
      'bg-gray-900/40',
      'border-white/10',
      'shadow-2xl shadow-black/20'
    ] : [
      'bg-white/40', 
      'border-gray-200/50',
      'shadow-2xl shadow-gray-900/10'
    ]
  );

  const headerGlassClasses = clsx(
    'backdrop-blur-xl',
    isDark ? 'bg-gray-900/60' : 'bg-white/60'
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          onClick={onClose}
        >
          {/* Backdrop with blur */}
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Chat Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={clsx(
              'relative w-full max-w-4xl max-h-[80vh] h-[80vh] rounded-3xl border overflow-hidden flex flex-col',
              glassClasses
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient background accent */}
            <div 
              className={clsx(
                'absolute inset-0 opacity-10 bg-gradient-to-br pointer-events-none',
                config.gradient
              )}
            />

            {/* Header */}
            <div className={clsx(
              'relative z-10 p-6 border-b flex-shrink-0',
              headerGlassClasses,
              isDark ? 'border-white/10' : 'border-gray-200/50'
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Animated Icon */}
                  <motion.div
                    className={clsx(
                      'w-14 h-14 rounded-2xl flex items-center justify-center',
                      'bg-gradient-to-br shadow-lg',
                      config.gradient
                    )}
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </motion.div>
                  
                  {/* Title */}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {config.title}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {config.subtitle}
                    </p>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className={clsx(
                    'p-3 rounded-xl transition-all',
                    'hover:bg-gray-100 dark:hover:bg-gray-800',
                    'hover:scale-110',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2',
                    'focus:ring-sky-500 dark:focus:ring-sky-400'
                  )}
                  aria-label="Close"
                >
                  <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    mode={mode}
                    isLatest={index === messages.length - 1}
                    onButtonClick={(action) => onComplete?.({ action })}
                    onSuggestionClick={(suggestion) => handleSendMessage(suggestion)}
                  />
                ))}
              </AnimatePresence>
              
              {/* Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center space-x-2 text-gray-500 dark:text-gray-400"
                >
                  <div className="flex space-x-1">
                    <motion.div
                      className="w-2 h-2 bg-current rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-current rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-current rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                    />
                  </div>
                  <span className="text-sm">AI is thinking...</span>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={clsx(
              'relative z-10 p-6 border-t flex-shrink-0',
              headerGlassClasses,
              isDark ? 'border-white/10' : 'border-gray-200/50'
            )}>
              <ChatInput
                onSend={handleSendMessage}
                mode={mode}
                placeholder={`Tell me about your ${mode === 'quick-task' ? 'task' : mode === 'go-wild' ? 'creative idea' : 'project'}...`}
              />
            </div>

            {/* Decorative elements */}
            <div className="absolute top-10 right-10 opacity-20 pointer-events-none">
              <Sparkles className="w-32 h-32 text-current" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};