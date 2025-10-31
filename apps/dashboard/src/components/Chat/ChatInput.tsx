import React, { useState, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, X, Mic, Sparkles, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { ChatMode } from './GlassmorphicChatModal';
import { useThemeStore } from '@/store/themeStore';
import { toast } from 'react-hot-toast';

interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  mode: ChatMode;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  mode,
  placeholder = "Type your message...",
  disabled = false
}) => {
  const { theme } = useThemeStore();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [showLengthWarning, setShowLengthWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const MIN_CHAR_LENGTH = 10;
  
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const modeColors = {
    'quick-task': 'focus:border-sky-500',
    'go-wild': 'focus:border-harvest-500',
    'new-farm': 'focus:border-leaf-500'
  };

  const modeGradients = {
    'quick-task': 'from-sky-500 to-sky-600',
    'go-wild': 'from-harvest-500 to-harvest-600',
    'new-farm': 'from-leaf-500 to-leaf-600'
  };

  const handleSubmit = () => {
    const trimmedMessage = message.trim();
    
    // Check minimum length requirement
    if (trimmedMessage && trimmedMessage.length < MIN_CHAR_LENGTH && attachments.length === 0) {
      setShowLengthWarning(true);
      toast.error(`Please enter at least ${MIN_CHAR_LENGTH} characters for your prompt`, {
        icon: '⚠️',
        duration: 3000,
        style: {
          borderRadius: '10px',
          background: isDark ? '#333' : '#fff',
          color: isDark ? '#fff' : '#333',
        }
      });
      return;
    }
    
    if (trimmedMessage || attachments.length > 0) {
      onSend(trimmedMessage, attachments.length > 0 ? attachments : undefined);
      setMessage('');
      setAttachments([]);
      setShowLengthWarning(false);
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);
    
    // Update warning state based on length
    if (newMessage.trim().length >= MIN_CHAR_LENGTH) {
      setShowLengthWarning(false);
    }
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments([...attachments, ...files]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // Quick suggestions based on mode - more varied and randomized
  const getQuickSuggestions = () => {
    switch (mode) {
      case 'quick-task': {
        const quickTaskSuggestions = [
          ['Organize files', 'Clean up code', 'Update docs'],
          ['Create a script', 'Automate workflow', 'Generate report'],
          ['Fix bug', 'Add feature', 'Improve UI'],
          ['Write content', 'Format data', 'Extract info'],
          ['Research topic', 'Compare options', 'Analyze results'],
          ['Build template', 'Create config', 'Set up environment']
        ];
        return quickTaskSuggestions[Math.floor(Math.random() * quickTaskSuggestions.length)];
      }
      case 'go-wild': {
        const goWildSuggestions = [
          ['Explore new patterns', 'Innovate architecture', 'Research alternatives'],
          ['Reimagine workflow', 'Create something unique', 'Think differently'],
          ['Challenge assumptions', 'Find creative solutions', 'Experiment freely']
        ];
        return goWildSuggestions[Math.floor(Math.random() * goWildSuggestions.length)];
      }
      case 'new-farm': {
        const farmSuggestions = [
          ['Build full application', 'Create microservices', 'Design system'],
          ['Develop platform', 'Architect solution', 'Scale infrastructure'],
          ['Launch product', 'Deploy services', 'Integrate systems']
        ];
        return farmSuggestions[Math.floor(Math.random() * farmSuggestions.length)];
      }
      default:
        return [];
    }
  };

  const suggestions = message.length === 0 ? getQuickSuggestions() : [];

  return (
    <div className="space-y-3">
      {/* Attachments */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2"
          >
            {attachments.map((file, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className={clsx(
                  'flex items-center space-x-2 px-3 py-1 rounded-lg',
                  isDark ? 'bg-gray-800/50' : 'bg-gray-100/50'
                )}
              >
                <Paperclip className="w-3 h-3" />
                <span className="text-xs truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick suggestions */}
      <AnimatePresence>
        {suggestions.length > 0 && !isFocused && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-wrap gap-2"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              Try:
            </span>
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMessage(suggestion)}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs transition-all',
                  'bg-gradient-to-r text-white',
                  modeGradients[mode],
                  'hover:shadow-md'
                )}
              >
                <Sparkles className="w-3 h-3 inline mr-1" />
                {suggestion}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Character count warning */}
      <AnimatePresence>
        {showLengthWarning && message.trim().length > 0 && message.trim().length < MIN_CHAR_LENGTH && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={clsx(
              'flex items-center space-x-2 px-3 py-2 rounded-lg text-sm',
              'bg-yellow-100 dark:bg-yellow-900/30',
              'text-yellow-800 dark:text-yellow-200',
              'border border-yellow-300 dark:border-yellow-700'
            )}
          >
            <AlertCircle className="w-4 h-4" />
            <span>
              Your message needs at least {MIN_CHAR_LENGTH - message.trim().length} more character{MIN_CHAR_LENGTH - message.trim().length !== 1 ? 's' : ''}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className={clsx(
        'relative flex items-end space-x-2 p-3 rounded-2xl transition-all',
        isDark ? [
          'bg-gray-800/30 backdrop-blur-sm',
          'border border-gray-700/50'
        ] : [
          'bg-white/30 backdrop-blur-sm',
          'border border-gray-200/50'
        ],
        isFocused && modeColors[mode],
        showLengthWarning && message.trim().length > 0 && message.trim().length < MIN_CHAR_LENGTH && 'border-yellow-500'
      )}>
        {/* File attachment button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-200/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </motion.button>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="*"
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            'flex-1 resize-none bg-transparent outline-none',
            'min-h-[40px] max-h-[150px]',
            'text-sm placeholder-gray-500 dark:placeholder-gray-400',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          rows={1}
        />

        {/* Voice input button (future enhancement) */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          disabled={disabled}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-200/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Voice input"
          title="Voice input (coming soon)"
        >
          <Mic className="w-5 h-5 opacity-50" />
        </motion.button>

        {/* Character counter */}
        {message.trim().length > 0 && (
          <span className={clsx(
            'text-xs font-medium transition-colors',
            message.trim().length < MIN_CHAR_LENGTH 
              ? 'text-yellow-600 dark:text-yellow-400' 
              : 'text-gray-500 dark:text-gray-400'
          )}>
            {message.trim().length}/{MIN_CHAR_LENGTH}
          </span>
        )}

        {/* Send button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && attachments.length === 0)}
          className={clsx(
            'p-2 rounded-lg transition-all',
            'bg-gradient-to-r text-white',
            modeGradients[mode],
            'hover:shadow-lg',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Send message"
        >
          <Send className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Character count and hints */}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {message.length > 0 && `${message.length} characters`}
        </span>
        <span>
          Press Enter to send, Shift+Enter for new line
        </span>
      </div>
    </div>
  );
};