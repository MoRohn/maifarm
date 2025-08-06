import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Send, Copy, Maximize2, Minimize2, User, Activity, ChevronUp, ChevronDown, Command } from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '../../hooks/useWebSocket';

interface AgentTerminalProps {
  farmId: string;
  agentId: number;
  agentUid?: string;
  status?: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  className?: string;
  onCommand?: (command: string) => void;
}

export const AgentTerminal: React.FC<AgentTerminalProps> = ({
  farmId,
  agentId,
  agentUid,
  status = 'starting',
  className,
  onCommand
}) => {
  const [terminalContent, setTerminalContent] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { subscribe } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  useEffect(() => {
    // Subscribe to terminal updates for this agent
    const handleTerminalUpdate = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId && eventData.agentId === agentId) {
        const lines = eventData.content.split('\n');
        setTerminalContent(prev => [...prev, ...lines].slice(-500)); // Keep last 500 lines
      }
    };

    const handleCommandSent = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId && eventData.agentId === agentId) {
        setTerminalContent(prev => [...prev, `> ${eventData.command}`]);
      }
    };

    const handleAgentStatus = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId && eventData.agentId === agentId) {
        setTerminalContent(prev => [...prev, `[Status: ${eventData.status}]`]);
      }
    };

    const unsubscribeTerminal = subscribe('agent:terminal', handleTerminalUpdate);
    const unsubscribeCommand = subscribe('agent:command', handleCommandSent);
    const unsubscribeStatus = subscribe('agent:status', handleAgentStatus);

    // Load initial terminal content
    fetchTerminalHistory();

    return () => {
      unsubscribeTerminal();
      unsubscribeCommand();
      unsubscribeStatus();
    };
  }, [farmId, agentId, subscribe]);

  useEffect(() => {
    // Auto-scroll to bottom when new content is added
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalContent]);

  useEffect(() => {
    // Auto-focus input when command panel is shown
    if (showCommandInput && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200); // Small delay for animation
    }
  }, [showCommandInput]);

  const fetchTerminalHistory = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
      const response = await fetch(`${apiUrl}/api/farms/${farmId}/terminal/${agentId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.terminal) {
          setTerminalContent(data.data.terminal);
        }
      }
    } catch (error) {
      console.error('Error fetching terminal history:', error);
    }
  };

  const handleSendCommand = async () => {
    if (!commandInput.trim()) return;

    const command = commandInput.trim();
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
      const response = await fetch(`${apiUrl}/api/farms/${farmId}/terminal/${agentId}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command })
      });

      if (response.ok) {
        setCommandHistory(prev => [...prev, command]);
        setCommandInput('');
        setHistoryIndex(-1);
        
        if (onCommand) {
          onCommand(command);
        }
      }
    } catch (error) {
      console.error('Error sending command:', error);
      setTerminalContent(prev => [...prev, `[Error: Failed to send command]`]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  const copyTerminalContent = () => {
    const content = terminalContent.join('\n');
    navigator.clipboard.writeText(content);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'text-green-500';
      case 'working': return 'text-blue-500';
      case 'idle': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'ready': 
      case 'working': 
        return <Activity className="w-3 h-3 animate-pulse" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  return (
    <motion.div
      className={clsx(
        'bg-gray-900 rounded-lg border border-gray-700 overflow-hidden',
        isExpanded ? 'fixed inset-4 z-50' : 'relative',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Terminal Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          <div className="flex items-center space-x-2">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-sm font-mono text-gray-300">
              Agent {agentId}
            </span>
            {agentUid && (
              <span className="text-xs text-gray-500 font-mono">
                ({agentUid.substring(0, 8)})
              </span>
            )}
          </div>
          <div className={clsx('flex items-center space-x-1', getStatusColor())}>
            {getStatusIcon()}
            <span className="text-xs capitalize">{status}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowCommandInput(!showCommandInput)}
            className={clsx(
              "p-1 rounded transition-colors flex items-center space-x-1",
              showCommandInput 
                ? "bg-blue-600 text-white" 
                : "hover:bg-gray-700 text-gray-400"
            )}
            title={showCommandInput ? 'Hide command input' : 'Show command input'}
          >
            <Command className="w-4 h-4" />
            {showCommandInput ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={copyTerminalContent}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Copy terminal content"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={terminalRef}
        className={clsx(
          'bg-black p-4 font-mono text-xs overflow-y-auto',
          isExpanded ? (showCommandInput ? 'h-[calc(100vh-14rem)]' : 'h-[calc(100vh-8rem)]') : 
                      (showCommandInput ? 'h-48' : 'h-64')
        )}
        style={{ 
          scrollBehavior: 'smooth',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
        }}
      >
        {terminalContent.length === 0 ? (
          <div className="text-gray-600">Waiting for agent output...</div>
        ) : (
          terminalContent.map((line, index) => (
            <div 
              key={index} 
              className={clsx(
                'whitespace-pre-wrap break-all',
                line.startsWith('>') ? 'text-green-400' : 
                line.startsWith('[') ? 'text-yellow-400' : 
                'text-gray-300'
              )}
            >
              {line || '\u00A0'}
            </div>
          ))
        )}
      </div>

      {/* Command Input - Collapsible */}
      <AnimatePresence>
        {showCommandInput && (
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
                  Send commands directly to Claude Code Agent {agentId}
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
                  placeholder="Enter command for Claude Code..."
                  className="flex-1 bg-gray-900 text-gray-300 font-mono text-sm outline-none placeholder-gray-600 px-2 py-1.5 rounded border border-gray-700 focus:border-blue-600 transition-colors"
                  disabled={status === 'starting' || status === 'error'}
                />
                <button
                  onClick={handleSendCommand}
                  disabled={!commandInput.trim() || status === 'starting' || status === 'error'}
                  className={clsx(
                    'p-1.5 rounded transition-colors flex items-center space-x-1',
                    commandInput.trim() && status !== 'starting' && status !== 'error'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  )}
                  title="Send command (Enter)"
                >
                  <Send className="w-4 h-4" />
                  <span className="text-xs">Send</span>
                </button>
              </div>
              {commandHistory.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-mono">↑↓ to navigate history • {commandHistory.length} commands</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};