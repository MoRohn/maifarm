import React from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Paperclip, FileText, Image, Code } from 'lucide-react';
import { clsx } from 'clsx';
import { ChatMode } from './GlassmorphicChatModal';
import ReactMarkdown from 'react-markdown';
import { useThemeStore } from '@/store/themeStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: File[];
  suggestions?: string[];
  buttons?: { label: string; action: string; variant?: 'primary' | 'secondary' }[];
  codeBlock?: { language: string; code: string };
}

interface ChatMessageProps {
  message: Message;
  mode: ChatMode;
  isLatest?: boolean;
  onButtonClick?: (action: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  mode, 
  isLatest,
  onButtonClick,
  onSuggestionClick
}) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  const isUser = message.role === 'user';
  
  // Mode-specific colors
  const modeColors = {
    'quick-task': 'from-sky-500 to-sky-600',
    'go-wild': 'from-harvest-500 to-harvest-600',
    'new-farm': 'from-leaf-500 to-leaf-600'
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type.includes('text') || file.name.endsWith('.txt')) return FileText;
    if (file.name.match(/\.(js|ts|jsx|tsx|py|java|cpp|c|go|rs)$/)) return Code;
    return Paperclip;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'flex',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className={clsx(
        'max-w-[75%] space-y-2',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Avatar and name */}
        <div className={clsx(
          'flex items-center space-x-2',
          isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'
        )}>
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center',
            isUser ? (
              isDark ? 'bg-gray-700' : 'bg-gray-200'
            ) : (
              `bg-gradient-to-br ${modeColors[mode]}`
            )
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isUser ? 'You' : 'AI Assistant'}
          </span>
        </div>

        {/* Message bubble */}
        <motion.div
          className={clsx(
            'rounded-2xl px-4 py-3',
            isUser ? (
              isDark ? [
                'bg-gradient-to-br from-blue-600 to-blue-700',
                'text-white'
              ] : [
                'bg-gradient-to-br from-blue-500 to-blue-600',
                'text-white'
              ]
            ) : (
              isDark ? [
                'bg-gray-800/50 backdrop-blur-sm',
                'text-gray-100',
                'border border-gray-700/50'
              ] : [
                'bg-white/70 backdrop-blur-sm',
                'text-gray-900',
                'border border-gray-200/50'
              ]
            )
          )}
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          {/* Message content */}
          {message.codeBlock ? (
            <div className="space-y-2">
              <div className="text-sm opacity-80">Code snippet:</div>
              <pre className={clsx(
                'p-3 rounded-lg overflow-x-auto text-sm',
                isDark ? 'bg-gray-900/50' : 'bg-gray-100/50'
              )}>
                <code>{message.codeBlock.code}</code>
              </pre>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((file, index) => {
                const FileIcon = getFileIcon(file);
                return (
                  <div
                    key={index}
                    className={clsx(
                      'flex items-center space-x-2 p-2 rounded-lg',
                      isUser ? 'bg-white/10' : (
                        isDark ? 'bg-gray-700/50' : 'bg-gray-100/50'
                      )
                    )}
                  >
                    <FileIcon className="w-4 h-4" />
                    <span className="text-xs truncate max-w-[200px]">
                      {file.name}
                    </span>
                    <span className="text-xs opacity-60">
                      ({(file.size / 1024).toFixed(1)}KB)
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Suggestions (for AI messages) */}
          {!isUser && message.suggestions && message.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.suggestions.map((suggestion, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    isDark ? [
                      'bg-gray-700/50 hover:bg-gray-700',
                      'text-gray-200'
                    ] : [
                      'bg-gray-200/50 hover:bg-gray-200',
                      'text-gray-700'
                    ]
                  )}
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          )}

          {/* Action buttons (for AI messages) */}
          {!isUser && message.buttons && message.buttons.length > 0 && (
            <div className="mt-3 flex space-x-2">
              {message.buttons.map((button, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onButtonClick?.(button.action)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    button.variant === 'primary' ? (
                      `bg-gradient-to-r ${modeColors[mode]} text-white hover:shadow-lg`
                    ) : (
                      isDark ? [
                        'bg-gray-700/50 hover:bg-gray-700',
                        'text-gray-200'
                      ] : [
                        'bg-gray-200/50 hover:bg-gray-200',
                        'text-gray-700'
                      ]
                    )
                  )}
                >
                  {button.label}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Timestamp */}
        <div className={clsx(
          'text-xs text-gray-500 dark:text-gray-400',
          isUser ? 'text-right' : 'text-left'
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
      </div>
    </motion.div>
  );
};