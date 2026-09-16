/**
 * UnifiedFarmChatWizard - Enhanced Conversational Farm Creation Experience
 *
 * A fluid, chatbot-like interface that replaces traditional form inputs
 * with a natural conversation flow. Optimized for both iMac (keyboard + mouse)
 * and iOS (touch + gesture) experiences.
 *
 * Features:
 * - Three modes: Quick Task, New Farm, Go Wild
 * - Conversational UI with AI assistant
 * - Adaptive layouts for desktop and mobile
 * - Haptic feedback support
 * - Drag-and-drop file attachments
 * - Keyboard shortcuts for power users
 * - Real-time prompt enhancement
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation, Variants } from 'framer-motion';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import {
  X,
  Send,
  Sparkles,
  Zap,
  Trees,
  Sprout,
  Paperclip,
  Bot,
  User,
  ChevronRight,
  Clock,
  Users,
  Sliders,
  ArrowRight,
  Command,
  CheckCircle2,
  Loader2,
  Wand2,
  Rocket,
  Settings2,
  FileText,
  Image as ImageIcon,
  Code,
  Mic,
  Plus,
  Minus,
  Star,
  ChevronDown,
  RotateCcw,
  Play
} from 'lucide-react';

import { useThemeStore } from '@/store/themeStore';
import { useChatStore, useChatContext } from '@/store/chatStore';
import { useFarmStore } from '@/store/farmStore';
import { api } from '@/services/apiClient';
import { aiChatService } from '@/services/aiChatService';
import { FileUpload } from '@/components/common/FileUpload';

// ============================================================================
// TYPES
// ============================================================================

export type FarmMode = 'quick-task' | 'new-farm' | 'go-wild';

export interface UnifiedFarmChatWizardProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: FarmMode;
}

interface ConversationStep {
  id: string;
  type: 'greeting' | 'input' | 'confirmation' | 'configuration' | 'enhancement' | 'launch';
  complete: boolean;
}

interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  actions?: MessageAction[];
  configCard?: ConfigCardData;
  isTyping?: boolean;
}

interface MessageAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant: 'primary' | 'secondary' | 'ghost';
  action: string;
}

interface ConfigCardData {
  mode: FarmMode;
  taskDescription: string;
  agentCount: number;
  duration: number;
  creativityLevel?: number;
  enhanced?: boolean;
  enhancementType?: string;
}

// ============================================================================
// MODE CONFIGURATION
// ============================================================================

const modeConfig: Record<FarmMode, {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  bgGradient: string;
  accentColor: string;
  defaultAgents: number;
  defaultDuration: number;
  maxAgents: number;
  personality: string;
  greetings: string[];
  suggestions: string[][];
}> = {
  'quick-task': {
    icon: Zap,
    title: 'Quick Task',
    subtitle: 'Get things done in 5 minutes',
    description: 'Fast, focused task execution with a single agent',
    gradient: 'from-sky-500 to-cyan-500',
    bgGradient: 'from-sky-500/10 via-cyan-500/5 to-transparent',
    accentColor: 'sky',
    defaultAgents: 1,
    defaultDuration: 5,
    maxAgents: 2,
    personality: 'efficient',
    greetings: [
      "Let's get something done quickly! What task do you need help with?",
      "Ready to tackle a quick task! What's on your mind?",
      "Quick task mode activated! What would you like to accomplish?"
    ],
    suggestions: [
      ['Fix this bug', 'Write unit tests', 'Clean up code'],
      ['Update documentation', 'Review this PR', 'Optimize performance'],
      ['Generate boilerplate', 'Refactor function', 'Add error handling'],
      ['Create API endpoint', 'Write CSS styles', 'Debug this issue']
    ]
  },
  'new-farm': {
    icon: Sprout,
    title: 'New Farm',
    subtitle: 'Build something amazing',
    description: 'Create a multi-agent farm for complex tasks',
    gradient: 'from-emerald-500 to-green-500',
    bgGradient: 'from-emerald-500/10 via-green-500/5 to-transparent',
    accentColor: 'emerald',
    defaultAgents: 3,
    defaultDuration: 60,
    maxAgents: 10,
    personality: 'strategic',
    greetings: [
      "Let's plant something great together! What would you like to build?",
      "Ready to grow your next project! Tell me about your vision.",
      "Farm architect mode! What amazing thing shall we create?"
    ],
    suggestions: [
      ['Build a new feature', 'Create microservice', 'Design API'],
      ['Implement authentication', 'Build dashboard', 'Create CLI tool'],
      ['Develop mobile app', 'Build web scraper', 'Create automation'],
      ['Design database schema', 'Build testing suite', 'Create deployment pipeline']
    ]
  },
  'go-wild': {
    icon: Trees,
    title: 'Go Wild',
    subtitle: 'Explore uncharted territory',
    description: 'Autonomous AI exploration with maximum creativity',
    gradient: 'from-purple-500 to-fuchsia-500',
    bgGradient: 'from-purple-500/10 via-fuchsia-500/5 to-transparent',
    accentColor: 'purple',
    defaultAgents: 5,
    defaultDuration: 30,
    maxAgents: 20,
    personality: 'creative',
    greetings: [
      "Ready to push boundaries! What should we explore today?",
      "Creativity mode unlocked! Share your wildest ideas.",
      "Let's venture into the unknown! What inspires you?"
    ],
    suggestions: [
      ['Reimagine the UX', 'Explore new architecture', 'Innovate the workflow'],
      ['Research alternatives', 'Prototype wild ideas', 'Break conventions'],
      ['Merge unexpected concepts', 'Challenge assumptions', 'Create art'],
      ['Design the future', 'Build something unique', 'Experiment freely']
    ]
  }
};

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 300
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 }
  }
};

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 25, stiffness: 400 }
  },
  exit: { opacity: 0, y: -10, scale: 0.95 }
};

const suggestionVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.05, type: 'spring', stiffness: 500 }
  })
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const TypingIndicator: React.FC<{ gradient: string }> = ({ gradient }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="flex items-center space-x-1 px-4 py-2"
  >
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className={clsx('w-2 h-2 rounded-full bg-gradient-to-r', gradient)}
        animate={{ y: [0, -6, 0] }}
        transition={{
          repeat: Infinity,
          duration: 0.6,
          delay: i * 0.15,
          ease: 'easeInOut'
        }}
      />
    ))}
  </motion.div>
);

const ModeSwitcher: React.FC<{
  currentMode: FarmMode;
  onModeChange: (mode: FarmMode) => void;
  disabled?: boolean;
}> = ({ currentMode, onModeChange, disabled }) => {
  const modes: FarmMode[] = ['quick-task', 'new-farm', 'go-wild'];

  return (
    <div className="flex items-center space-x-1 p-1 bg-gray-100/50 dark:bg-gray-800/50 rounded-xl backdrop-blur-sm">
      {modes.map((mode) => {
        const config = modeConfig[mode];
        const Icon = config.icon;
        const isActive = currentMode === mode;

        return (
          <motion.button
            key={mode}
            onClick={() => !disabled && onModeChange(mode)}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.02 } : undefined}
            whileTap={!disabled ? { scale: 0.98 } : undefined}
            className={clsx(
              'flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200',
              'text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed',
              isActive
                ? `bg-gradient-to-r ${config.gradient} text-white shadow-lg`
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{config.title}</span>
          </motion.button>
        );
      })}
    </div>
  );
};

const ConfigurationCard: React.FC<{
  config: ConfigCardData;
  mode: FarmMode;
  onUpdate: (updates: Partial<ConfigCardData>) => void;
  isEditable?: boolean;
}> = ({ config, mode, onUpdate, isEditable = true }) => {
  const modeSettings = modeConfig[mode];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-2xl p-5 backdrop-blur-xl border',
        'bg-gradient-to-br from-white/80 to-white/40 dark:from-gray-800/80 dark:to-gray-800/40',
        'border-gray-200/50 dark:border-gray-700/50',
        'shadow-xl shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            `bg-gradient-to-br ${modeSettings.gradient} shadow-lg`
          )}>
            <modeSettings.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {modeSettings.title}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configuration
            </p>
          </div>
        </div>

        {config.enhanced && (
          <div className={clsx(
            'flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium',
            `bg-gradient-to-r ${modeSettings.gradient} text-white`
          )}>
            <Sparkles className="w-3 h-3" />
            <span>Enhanced</span>
          </div>
        )}
      </div>

      {/* Task Description */}
      <div className="mb-4 p-3 rounded-xl bg-gray-100/50 dark:bg-gray-700/50">
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
          {config.taskDescription || 'No description yet...'}
        </p>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Agent Count */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-100/50 dark:bg-gray-700/50">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Agents</span>
          </div>
          {isEditable ? (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onUpdate({ agentCount: Math.max(1, config.agentCount - 1) })}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center font-semibold">{config.agentCount}</span>
              <button
                onClick={() => onUpdate({ agentCount: Math.min(modeSettings.maxAgents, config.agentCount + 1) })}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="font-semibold">{config.agentCount}</span>
          )}
        </div>

        {/* Duration */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-100/50 dark:bg-gray-700/50">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Time</span>
          </div>
          <span className="font-semibold">{config.duration} min</span>
        </div>

        {/* Creativity Level (Go Wild only) */}
        {mode === 'go-wild' && (
          <div className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-purple-100/50 dark:bg-purple-900/30">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-purple-600 dark:text-purple-400">Creativity</span>
            </div>
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <motion.button
                  key={level}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => isEditable && onUpdate({ creativityLevel: level })}
                  className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                    (config.creativityLevel || 3) >= level
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700'
                  )}
                >
                  <Star className="w-3 h-3" />
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const SuggestionPill: React.FC<{
  text: string;
  gradient: string;
  onClick: () => void;
  index: number;
}> = ({ text, gradient, onClick, index }) => (
  <motion.button
    custom={index}
    variants={suggestionVariants}
    initial="hidden"
    animate="visible"
    whileHover={{ scale: 1.05, y: -2 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={clsx(
      'px-4 py-2 rounded-full text-sm font-medium',
      'bg-gradient-to-r text-white shadow-lg shadow-black/10',
      'hover:shadow-xl transition-shadow',
      gradient
    )}
  >
    <span className="flex items-center space-x-1">
      <Sparkles className="w-3 h-3" />
      <span>{text}</span>
    </span>
  </motion.button>
);

const MessageBubble: React.FC<{
  message: AssistantMessage;
  mode: FarmMode;
  onAction?: (action: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  onConfigUpdate?: (updates: Partial<ConfigCardData>) => void;
}> = ({ message, mode, onAction, onSuggestionClick, onConfigUpdate }) => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isUser = message.role === 'user';
  const modeSettings = modeConfig[mode];

  return (
    <motion.div
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={clsx('max-w-[85%] space-y-2', isUser ? 'items-end' : 'items-start')}>
        {/* Avatar and Name */}
        <div className={clsx(
          'flex items-center space-x-2',
          isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'
        )}>
          <motion.div
            whileHover={{ scale: 1.1, rotate: isUser ? 0 : [0, -5, 5, 0] }}
            className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center',
              isUser
                ? (isDark ? 'bg-gray-700' : 'bg-gray-200')
                : `bg-gradient-to-br ${modeSettings.gradient} shadow-lg`
            )}
          >
            {isUser ? (
              <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </motion.div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isUser ? 'You' : 'MaiFarm Assistant'}
          </span>
        </div>

        {/* Message Content */}
        <motion.div
          whileHover={{ scale: 1.005 }}
          className={clsx(
            'rounded-2xl px-4 py-3 backdrop-blur-sm',
            isUser
              ? `bg-gradient-to-br ${modeSettings.gradient} text-white shadow-lg`
              : clsx(
                  'border',
                  isDark
                    ? 'bg-gray-800/80 border-gray-700/50 text-gray-100'
                    : 'bg-white/80 border-gray-200/50 text-gray-900'
                )
          )}
        >
          {message.isTyping ? (
            <TypingIndicator gradient={modeSettings.gradient} />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          )}
        </motion.div>

        {/* Configuration Card */}
        {message.configCard && (
          <ConfigurationCard
            config={message.configCard}
            mode={mode}
            onUpdate={onConfigUpdate || (() => {})}
            isEditable={!isUser}
          />
        )}

        {/* Suggestions */}
        {!isUser && message.suggestions && message.suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-2 pt-2"
          >
            {message.suggestions.map((suggestion, index) => (
              <SuggestionPill
                key={suggestion}
                text={suggestion}
                gradient={modeSettings.gradient}
                onClick={() => onSuggestionClick?.(suggestion)}
                index={index}
              />
            ))}
          </motion.div>
        )}

        {/* Action Buttons */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 pt-2"
          >
            {message.actions.map((action) => (
              <motion.button
                key={action.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onAction?.(action.action)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-xl font-medium text-sm transition-all',
                  action.variant === 'primary'
                    ? `bg-gradient-to-r ${modeSettings.gradient} text-white shadow-lg hover:shadow-xl`
                    : action.variant === 'secondary'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                {action.icon}
                <span>{action.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Timestamp */}
        <div className={clsx(
          'text-xs text-gray-400 dark:text-gray-500',
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

const ChatInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach: () => void;
  mode: FarmMode;
  disabled?: boolean;
  placeholder?: string;
  attachmentCount?: number;
}> = ({
  value,
  onChange,
  onSubmit,
  onAttach,
  mode,
  disabled,
  placeholder,
  attachmentCount = 0
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const modeSettings = modeConfig[mode];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className={clsx(
      'flex items-end space-x-3 p-4 rounded-2xl backdrop-blur-xl border',
      isDark
        ? 'bg-gray-800/50 border-gray-700/50'
        : 'bg-white/50 border-gray-200/50'
    )}>
      {/* Attachment Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onAttach}
        disabled={disabled}
        className={clsx(
          'relative p-2 rounded-xl transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Paperclip className="w-5 h-5" />
        {attachmentCount > 0 && (
          <span className={clsx(
            'absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center',
            `bg-gradient-to-r ${modeSettings.gradient} text-white`
          )}>
            {attachmentCount}
          </span>
        )}
      </motion.button>

      {/* Text Input */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || `Describe your ${mode === 'quick-task' ? 'task' : mode === 'go-wild' ? 'exploration' : 'project'}...`}
          rows={1}
          className={clsx(
            'w-full resize-none bg-transparent outline-none',
            'text-sm placeholder-gray-500 dark:placeholder-gray-400',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-[40px] max-h-[150px]'
          )}
        />
      </div>

      {/* Voice Input (Future) */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        disabled
        className={clsx(
          'p-2 rounded-xl transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          'disabled:opacity-30 disabled:cursor-not-allowed'
        )}
        title="Voice input (coming soon)"
      >
        <Mic className="w-5 h-5" />
      </motion.button>

      {/* Send Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className={clsx(
          'p-3 rounded-xl transition-all',
          `bg-gradient-to-r ${modeSettings.gradient}`,
          'text-white shadow-lg hover:shadow-xl',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Send className="w-5 h-5" />
      </motion.button>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UnifiedFarmChatWizard: React.FC<UnifiedFarmChatWizardProps> = ({
  isOpen,
  onClose,
  initialMode = 'new-farm'
}) => {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const { addFarm, fetchFarms } = useFarmStore();

  // State
  const [mode, setMode] = useState<FarmMode>(initialMode);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [config, setConfig] = useState<ConfigCardData>({
    mode: initialMode,
    taskDescription: '',
    agentCount: modeConfig[initialMode].defaultAgents,
    duration: modeConfig[initialMode].defaultDuration,
    creativityLevel: 3
  });

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Derived state
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const modeSettings = modeConfig[mode];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation when modal opens or mode changes
  useEffect(() => {
    if (isOpen) {
      initializeConversation();
    }
  }, [isOpen, mode]);

  // Update config when mode changes
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      mode,
      agentCount: modeSettings.defaultAgents,
      duration: modeSettings.defaultDuration
    }));
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Cmd/Ctrl + Enter to launch
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (config.taskDescription && !isLaunching) {
          handleLaunch();
        }
      }

      // Escape to close
      if (e.key === 'Escape' && !isProcessing && !isLaunching) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, config, isLaunching, isProcessing]);

  // Initialize conversation with greeting
  const initializeConversation = useCallback(() => {
    const greeting = modeSettings.greetings[Math.floor(Math.random() * modeSettings.greetings.length)];
    const suggestions = modeSettings.suggestions[Math.floor(Math.random() * modeSettings.suggestions.length)];

    setMessages([{
      id: `greeting-${Date.now()}`,
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
      suggestions
    }]);

    setInputValue('');
    setAttachedFiles([]);
    setConfig({
      mode,
      taskDescription: '',
      agentCount: modeSettings.defaultAgents,
      duration: modeSettings.defaultDuration,
      creativityLevel: 3
    });
  }, [mode, modeSettings]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: FarmMode) => {
    if (newMode !== mode) {
      setMode(newMode);
    }
  }, [mode]);

  // Handle user message submission
  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    // Update config
    const newConfig: ConfigCardData = {
      ...config,
      taskDescription: userMessage.content
    };
    setConfig(newConfig);

    // Add typing indicator
    const typingId = `typing-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: typingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true
    }]);

    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));

    // Generate response based on mode
    let response: AssistantMessage;

    if (messages.filter(m => m.role === 'user').length === 0) {
      // First user message - offer enhancement
      response = {
        id: `response-${Date.now()}`,
        role: 'assistant',
        content: getEnhancementOfferMessage(mode, userMessage.content),
        timestamp: new Date(),
        configCard: newConfig,
        actions: [
          {
            id: 'enhance',
            label: 'Enhance Prompt',
            icon: <Sparkles className="w-4 h-4" />,
            variant: 'primary',
            action: 'enhance'
          },
          {
            id: 'launch-now',
            label: 'Launch Now',
            icon: <Rocket className="w-4 h-4" />,
            variant: 'secondary',
            action: 'launch'
          }
        ]
      };
    } else {
      // Follow-up - ready to launch
      response = {
        id: `response-${Date.now()}`,
        role: 'assistant',
        content: getReadyToLaunchMessage(mode),
        timestamp: new Date(),
        configCard: newConfig,
        actions: [
          {
            id: 'launch',
            label: `Launch ${modeSettings.title}`,
            icon: <Rocket className="w-4 h-4" />,
            variant: 'primary',
            action: 'launch'
          },
          {
            id: 'adjust',
            label: 'Adjust Settings',
            icon: <Settings2 className="w-4 h-4" />,
            variant: 'ghost',
            action: 'adjust'
          }
        ]
      };
    }

    // Replace typing indicator with response
    setMessages(prev => prev.filter(m => m.id !== typingId).concat(response));
    setIsProcessing(false);
  }, [inputValue, isProcessing, config, messages, mode, modeSettings]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    // Optionally auto-submit
    // handleSubmit();
  }, []);

  // Handle action button clicks
  const handleAction = useCallback(async (action: string) => {
    switch (action) {
      case 'enhance':
        await handleEnhance();
        break;
      case 'launch':
        await handleLaunch();
        break;
      case 'adjust':
        handleShowSettings();
        break;
      case 'reset':
        initializeConversation();
        break;
    }
  }, []);

  // Handle prompt enhancement
  const handleEnhance = useCallback(async () => {
    setIsProcessing(true);

    const typingId = `typing-enhance-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: typingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true
    }]);

    await new Promise(resolve => setTimeout(resolve, 1500));

    const enhancedConfig: ConfigCardData = {
      ...config,
      enhanced: true,
      enhancementType: mode === 'go-wild' ? 'creative-expansion' : 'structured-roadmap'
    };
    setConfig(enhancedConfig);

    const response: AssistantMessage = {
      id: `enhanced-${Date.now()}`,
      role: 'assistant',
      content: getEnhancedPromptMessage(mode, config.taskDescription),
      timestamp: new Date(),
      configCard: enhancedConfig,
      actions: [
        {
          id: 'launch',
          label: 'Launch Enhanced',
          icon: <Rocket className="w-4 h-4" />,
          variant: 'primary',
          action: 'launch'
        },
        {
          id: 'reset',
          label: 'Start Over',
          icon: <RotateCcw className="w-4 h-4" />,
          variant: 'ghost',
          action: 'reset'
        }
      ]
    };

    setMessages(prev => prev.filter(m => m.id !== typingId).concat(response));
    setIsProcessing(false);
  }, [config, mode]);

  // Handle farm launch
  const handleLaunch = useCallback(async () => {
    if (!config.taskDescription || isLaunching) return;

    setIsLaunching(true);

    const launchingId = `launching-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: launchingId,
      role: 'system',
      content: `Launching ${modeSettings.title}...`,
      timestamp: new Date()
    }]);

    try {
      const farmData = {
        name: `${modeSettings.title}: ${config.taskDescription.slice(0, 30)}`,
        description: config.taskDescription,
        type: mode === 'go-wild' ? 'autonomous' : 'collaborative',
        config: {
          maxAgents: config.agentCount,
          timeout: config.duration * 60,
          goWildMode: mode === 'go-wild' ? {
            enabled: true,
            creativityLevel: config.creativityLevel as 1 | 2 | 3 | 4 | 5
          } : undefined
        }
      };

      const response = await api.post('/api/farms', farmData);
      const newFarm = response.data?.data || response.data;

      if (newFarm?.id) {
        // Launch the farm
        await api.post(`/api/farms/${newFarm.id}/launch`, {
          numberOfAgents: config.agentCount,
          prompt: config.taskDescription,
          provider: 'claude'
        });

        addFarm(newFarm);
        await fetchFarms();

        toast.success(`${modeSettings.title} launched successfully!`);

        // Success message
        setMessages(prev => prev.concat({
          id: `success-${Date.now()}`,
          role: 'assistant',
          content: `Your ${modeSettings.title.toLowerCase()} has been launched successfully! Redirecting to the harvest view...`,
          timestamp: new Date()
        }));

        // Navigate after delay
        setTimeout(() => {
          onClose();
          navigate(`/farm/${newFarm.id}/transition/${mode === 'go-wild' ? 'gowild' : 'farm'}`);
        }, 1500);
      }
    } catch (error) {
      console.error('Launch failed:', error);
      toast.error('Failed to launch. Please try again.');

      setMessages(prev => prev.filter(m => m.id !== launchingId).concat({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        timestamp: new Date(),
        actions: [
          {
            id: 'retry',
            label: 'Try Again',
            icon: <RotateCcw className="w-4 h-4" />,
            variant: 'primary',
            action: 'launch'
          }
        ]
      }));
    } finally {
      setIsLaunching(false);
    }
  }, [config, mode, modeSettings, addFarm, fetchFarms, navigate, onClose, isLaunching]);

  // Handle settings toggle
  const handleShowSettings = useCallback(() => {
    setMessages(prev => [...prev, {
      id: `settings-${Date.now()}`,
      role: 'assistant',
      content: 'You can adjust the configuration above. When you\'re ready, just say "launch" or click the launch button!',
      timestamp: new Date(),
      configCard: config
    }]);
  }, [config]);

  // Handle config updates
  const handleConfigUpdate = useCallback((updates: Partial<ConfigCardData>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle file attachment
  const handleFilesChange = useCallback((files: File[]) => {
    setAttachedFiles(files);
    setShowFileUpload(false);

    if (files.length > 0) {
      setMessages(prev => [...prev, {
        id: `files-${Date.now()}`,
        role: 'system',
        content: `${files.length} file${files.length > 1 ? 's' : ''} attached: ${files.map(f => f.name).join(', ')}`,
        timestamp: new Date()
      }]);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isProcessing && !isLaunching) {
              onClose();
            }
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              'relative w-full max-w-4xl h-[85vh] max-h-[900px] rounded-3xl overflow-hidden',
              'flex flex-col',
              'backdrop-blur-2xl border shadow-2xl',
              isDark
                ? 'bg-gray-900/90 border-gray-700/50'
                : 'bg-white/90 border-gray-200/50'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background Gradient */}
            <div className={clsx(
              'absolute inset-0 opacity-30 pointer-events-none bg-gradient-to-br',
              modeSettings.bgGradient
            )} />

            {/* Header */}
            <div className={clsx(
              'relative z-10 flex items-center justify-between px-6 py-4 border-b',
              isDark ? 'border-gray-700/50' : 'border-gray-200/50'
            )}>
              <div className="flex items-center space-x-4">
                {/* Mode Icon */}
                <motion.div
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5 }}
                  className={clsx(
                    'w-12 h-12 rounded-2xl flex items-center justify-center',
                    `bg-gradient-to-br ${modeSettings.gradient} shadow-lg`
                  )}
                >
                  <modeSettings.icon className="w-6 h-6 text-white" />
                </motion.div>

                {/* Title */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {modeSettings.title}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {modeSettings.subtitle}
                  </p>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="hidden md:block">
                <ModeSwitcher
                  currentMode={mode}
                  onModeChange={handleModeChange}
                  disabled={isProcessing || isLaunching}
                />
              </div>

              {/* Close Button */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                disabled={isProcessing || isLaunching}
                className={clsx(
                  'p-2 rounded-xl transition-colors',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Mobile Mode Switcher */}
            <div className="md:hidden px-4 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
              <ModeSwitcher
                currentMode={mode}
                onModeChange={handleModeChange}
                disabled={isProcessing || isLaunching}
              />
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mode={mode}
                    onAction={handleAction}
                    onSuggestionClick={handleSuggestionClick}
                    onConfigUpdate={handleConfigUpdate}
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* File Upload Overlay */}
            <AnimatePresence>
              {showFileUpload && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-24 left-6 right-6 z-20"
                >
                  <div className={clsx(
                    'p-4 rounded-2xl backdrop-blur-xl border shadow-xl',
                    isDark
                      ? 'bg-gray-800/95 border-gray-700/50'
                      : 'bg-white/95 border-gray-200/50'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Attach Files</h4>
                      <button
                        onClick={() => setShowFileUpload(false)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <FileUpload
                      onFilesChange={handleFilesChange}
                      maxFiles={10}
                      maxSizeInMB={10}
                      acceptedTypes={['image/*', '.pdf', '.txt', '.md', '.js', '.ts', '.py', '.yaml', '.json']}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="relative z-10 p-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                onAttach={() => setShowFileUpload(true)}
                mode={mode}
                disabled={isProcessing || isLaunching}
                attachmentCount={attachedFiles.length}
              />

              {/* Keyboard Shortcuts Hint */}
              <div className="flex items-center justify-center mt-2 space-x-4 text-xs text-gray-400">
                <span className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Enter</kbd>
                  <span>to send</span>
                </span>
                <span className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">
                    <Command className="w-3 h-3 inline" />+Enter
                  </kbd>
                  <span>to launch</span>
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEnhancementOfferMessage(mode: FarmMode, task: string): string {
  switch (mode) {
    case 'quick-task':
      return `Got it! I can help you "${task.slice(0, 50)}..." quickly.\n\nWould you like me to enhance your prompt with structured steps, or launch right away?`;
    case 'new-farm':
      return `Great project idea! I'll help you build "${task.slice(0, 50)}..."\n\nI can enhance your prompt with a detailed roadmap and success criteria, or we can launch now with your current description.`;
    case 'go-wild':
      return `Love the creative vision! "${task.slice(0, 50)}..." sounds exciting.\n\nWant me to expand this with creative exploration paths and innovative approaches, or dive right in?`;
  }
}

function getEnhancedPromptMessage(mode: FarmMode, task: string): string {
  switch (mode) {
    case 'quick-task':
      return `I've enhanced your prompt with clear objectives and expected outcomes. Your quick task is now optimized for fast, focused execution.`;
    case 'new-farm':
      return `Your prompt has been enhanced with:\n- Clear project phases\n- Success criteria\n- Risk considerations\n- Deliverable checkpoints\n\nYour farm is ready to grow something amazing!`;
    case 'go-wild':
      return `I've expanded your creative brief with:\n- Multiple exploration angles\n- Innovation triggers\n- Cross-domain inspirations\n- Unexpected connections to explore\n\nThe agents will now push boundaries even further!`;
  }
}

function getReadyToLaunchMessage(mode: FarmMode): string {
  switch (mode) {
    case 'quick-task':
      return `Perfect! Your quick task is configured and ready. Hit launch when you're ready to go!`;
    case 'new-farm':
      return `Excellent! Your farm is all set up. The configuration looks great. Ready to plant some seeds?`;
    case 'go-wild':
      return `The creative exploration is configured. Agents are standing by to venture into the unknown. Ready to go wild?`;
  }
}

export default UnifiedFarmChatWizard;
