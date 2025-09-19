import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Terminal, 
  Play, 
  Pause, 
  RotateCcw, 
  X, 
  Send,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Cpu,
  MessageSquare
} from 'lucide-react';
import { MultiClaudeAgent } from '@/types/multiClaude';
import { AgentTerminalOutput } from './AgentTerminalOutput';

interface AgentCardProps {
  agent: MultiClaudeAgent;
  onCommand: (command: string) => void;
  onPrompt: (prompt: string) => void;
  onRemove: () => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onCommand,
  onPrompt,
  onRemove
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getStatusIcon = () => {
    switch (agent.status) {
      case 'starting':
        return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'working':
        return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'idle':
        return <Cpu className="w-4 h-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'starting':
        return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10';
      case 'ready':
        return 'border-green-400 bg-green-50 dark:bg-green-900/10';
      case 'working':
        return 'border-blue-400 bg-blue-50 dark:bg-blue-900/10 animate-pulse';
      case 'idle':
        return 'border-gray-300 bg-gray-50 dark:bg-gray-800';
      case 'error':
        return 'border-red-400 bg-red-50 dark:bg-red-900/10';
      default:
        return 'border-gray-300 bg-white dark:bg-gray-900';
    }
  };

  const handleSendPrompt = () => {
    if (promptInput.trim()) {
      onPrompt(promptInput.trim());
      setPromptInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [promptInput]);

  return (
    <motion.div
      layout
      className={`relative flex flex-col h-full border-2 rounded-xl shadow-lg transition-all duration-300 ${getStatusColor()}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Agent {agent.agentNumber}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {agent.paneId || 'Initializing...'}
            </p>
          </div>
        </div>
        
        <button
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove Agent"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Status: <span className="font-medium capitalize">{agent.status}</span>
          </span>
          {agent.currentStep > 0 && (
            <span className="text-gray-600 dark:text-gray-400">
              Step: {agent.currentStep}
            </span>
          )}
        </div>
        {agent.lastActivity && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {agent.lastActivity}
          </p>
        )}
      </div>

      {/* Terminal Output */}
      <div className="flex-1 min-h-[200px] max-h-[400px] overflow-hidden">
        <AgentTerminalOutput 
          output={agent.output || []}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
        />
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* Control Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onCommand('start')}
            disabled={agent.status === 'working'}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            title="Start Agent"
          >
            <Play className="w-4 h-4" />
            <span className="text-sm font-medium">Start</span>
          </button>
          
          <button
            onClick={() => onCommand('pause')}
            disabled={agent.status !== 'working'}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            title="Pause Agent"
          >
            <Pause className="w-4 h-4" />
            <span className="text-sm font-medium">Pause</span>
          </button>
          
          <button
            onClick={() => onCommand('reset')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            title="Reset Agent"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-sm font-medium">Reset</span>
          </button>
        </div>

        {/* Prompt Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter prompt for this agent..."
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
              rows={1}
              style={{ minHeight: '38px', maxHeight: '120px' }}
            />
            <MessageSquare className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
          
          <button
            onClick={handleSendPrompt}
            disabled={!promptInput.trim() || agent.status !== 'ready'}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            title="Send Prompt"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Processing Indicator */}
      {agent.status === 'working' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-blue-500/5 pointer-events-none rounded-xl"
        >
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-2 px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
              <Activity className="w-3 h-3 animate-pulse" />
              Processing...
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};