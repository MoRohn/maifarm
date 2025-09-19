import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  User, 
  Activity, 
  Copy, 
  Command, 
  ChevronUp, 
  ChevronDown,
  Send,
  Pause,
  Play
} from 'lucide-react';
import { TerminalSession, TerminalAgent } from '@/types/terminal';

interface TerminalPaneProps {
  session: TerminalSession;
  agent: TerminalAgent;
  output: string[];
  onSendCommand: (command: string) => Promise<boolean>;
  registerTerminalRef: (element: HTMLDivElement | null) => void;
  className?: string;
  showCommandInput?: boolean;
  expanded?: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  session,
  agent,
  output,
  onSendCommand,
  registerTerminalRef,
  className = '',
  showCommandInput = true,
  expanded = false
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Register terminal ref with parent
  useEffect(() => {
    registerTerminalRef(terminalRef.current);
  }, [registerTerminalRef]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (terminalRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
          }
        });
      });
    }
  }, [output]);

  // Focus input when prompt is shown
  useEffect(() => {
    if (showPrompt && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [showPrompt]);

  const getStatusColor = () => {
    switch (agent.status) {
      case 'ready': return 'text-green-400';
      case 'working': return 'text-blue-400';
      case 'idle': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'disconnected': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = () => {
    const baseClasses = "w-3 h-3";
    const animatedClasses = agent.status === 'working' ? `${baseClasses} animate-pulse` : baseClasses;
    
    return <Activity className={animatedClasses} />;
  };

  const handleSendCommand = async () => {
    if (!commandInput.trim() || isExecuting) return;

    setIsExecuting(true);
    try {
      const success = await onSendCommand(commandInput.trim());
      if (success) {
        setCommandInput('');
      }
    } catch (error) {
      console.error('Error sending command:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const copyToClipboard = () => {
    const content = output.join('\n');
    navigator.clipboard.writeText(content).then(() => {
      // Could add a toast notification here
      console.log('Terminal output copied to clipboard');
    });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    // In a real implementation, this would send a pause/resume signal to the agent
  };

  const terminalHeight = expanded 
    ? (showPrompt ? 'calc(100vh - 12rem)' : 'calc(100vh - 8rem)')
    : 'auto';

  return (
    <motion.div
      className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Terminal Header */}
      <div className="bg-gray-800 px-3 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          <div className="flex items-center space-x-2">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-sm font-mono text-gray-300">
              Agent {agent.id}
            </span>
            {agent.uid && (
              <span className="text-xs text-gray-500 font-mono">
                ({agent.uid.substring(0, 8)})
              </span>
            )}
          </div>
          <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="text-xs capitalize">{agent.status}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          {/* Pause/Resume */}
          <button
            onClick={togglePause}
            className={`p-1 rounded transition-colors ${
              isPaused 
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                : 'hover:bg-gray-700 text-gray-400 hover:text-white'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <Play className="w-3 h-3" />
            ) : (
              <Pause className="w-3 h-3" />
            )}
          </button>

          {/* Command prompt toggle */}
          {showCommandInput && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className={`p-1 rounded transition-colors flex items-center space-x-1 ${
                showPrompt 
                  ? 'bg-blue-600 text-white' 
                  : 'hover:bg-gray-700 text-gray-400 hover:text-white'
              }`}
              title={showPrompt ? 'Hide command input' : 'Show command input'}
            >
              <Command className="w-3 h-3" />
              {showPrompt ? (
                <ChevronUp className="w-2 h-2" />
              ) : (
                <ChevronDown className="w-2 h-2" />
              )}
            </button>
          )}

          {/* Copy */}
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Copy terminal content"
          >
            <Copy className="w-3 h-3 text-gray-400 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={terminalRef}
        className="bg-black p-3 font-mono text-xs overflow-y-auto flex-1 min-h-0"
        style={{ 
          maxHeight: terminalHeight === 'auto' ? '100%' : terminalHeight,
          minHeight: '200px',
          scrollBehavior: 'smooth',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {output.length === 0 ? (
          <div className="text-gray-600 flex items-center justify-center h-full">
            <div className="text-center">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div>Waiting for agent output...</div>
              <div className="text-xs mt-1 opacity-70">
                Agent {agent.id} is {agent.status}
              </div>
            </div>
          </div>
        ) : (
          output.map((line, index) => (
            <div 
              key={index} 
              className={`whitespace-pre-wrap break-words leading-relaxed overflow-hidden ${
                line.startsWith('>') ? 'text-green-400' : 
                line.startsWith('[') && line.endsWith(']') ? 'text-yellow-400' : 
                line.includes('error') || line.includes('Error') ? 'text-red-400' :
                'text-gray-300'
              }`}
            >
              {line || '\u00A0'}
            </div>
          ))
        )}
      </div>

      {/* Command Input */}
      <AnimatePresence>
        {showPrompt && showCommandInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-800 border-t border-gray-700 p-3">
              <div className="mb-2">
                <p className="text-xs text-gray-500 font-mono">
                  Send command to Agent {agent.id}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400 font-mono text-sm">$</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter command..."
                  className="flex-1 bg-gray-900 text-gray-300 font-mono text-sm outline-none placeholder-gray-600 px-2 py-1.5 rounded border border-gray-700 focus:border-blue-600 transition-colors"
                  disabled={agent.status === 'error' || agent.status === 'disconnected' || isExecuting}
                />
                <button
                  onClick={handleSendCommand}
                  disabled={!commandInput.trim() || agent.status === 'error' || agent.status === 'disconnected' || isExecuting}
                  className={`p-1.5 rounded transition-colors flex items-center space-x-1 ${
                    commandInput.trim() && agent.status !== 'error' && agent.status !== 'disconnected' && !isExecuting
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Send command (Enter)"
                >
                  {isExecuting ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};