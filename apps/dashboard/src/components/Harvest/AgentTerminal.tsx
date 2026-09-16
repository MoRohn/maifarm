import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Send, Copy, Maximize2, Minimize2, User, Activity, ChevronUp, ChevronDown, Command, Search, Filter, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '@/hooks/useWebSocket';
import { AnsiParser } from '@/utils/ansiParser';
import { EnhancedTerminalMessage } from './EnhancedTerminalMessage';

interface AgentTerminalProps {
  farmId: string;
  agentId: number;
  agentName?: string;
  agentUid?: string;
  status?: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  className?: string;
  onCommand?: (command: string) => void;
}

interface TerminalMessage {
  content: string;
  type?: 'normal' | 'command' | 'status' | 'warning' | 'limit' | 'model' | 'rate-limit' | 'notice' | 'thinking';
  timestamp?: string;
  isPinned?: boolean;
}

export const AgentTerminal: React.FC<AgentTerminalProps> = ({
  farmId,
  agentId,
  agentName,
  agentUid,
  status = 'starting',
  className,
  onCommand
}) => {
  const [terminalContent, setTerminalContent] = useState<TerminalMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<TerminalMessage[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0);

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { subscribe, socket, connected } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Track if we've joined the session to avoid duplicate joins
  const hasJoinedRef = useRef(false);
  
  // Function to join terminal session
  const joinTerminalSession = useCallback(() => {
    if (socket && connected && !hasJoinedRef.current) {
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      // CRITICAL: Send both sessionId and farmId to ensure proper room joining
      const joinData = {
        sessionId: sessionName,
        farmId: farmId // Full farmId for room management
      };
      socket.emit('terminal:join_session', joinData);
      
      // Also join agent-specific rooms
      socket.emit('terminal:join_agent', {
        sessionId: sessionName,
        farmId,
        agentId: Number(agentId),
        agentIndex: Number(agentId)
      });
      
      hasJoinedRef.current = true;
      
      // Request initial terminal state
      socket.emit('terminal:request_state', {
        sessionId: sessionName,
        farmId,
        agentId: Number(agentId)
      });
    }
  }, [socket, connected, farmId, agentId]);

  // Handle initial connection and reconnections
  useEffect(() => {
    joinTerminalSession();
    
    // Reset join status when disconnected
    if (!connected) {
      hasJoinedRef.current = false;
    }
  }, [connected, joinTerminalSession]);

  useEffect(() => {
    
    // Subscribe to terminal updates for this agent
    const handleTerminalUpdate = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      
      // CRITICAL: Strict agent ID matching with normalization
      // Normalize both incoming and component agentId to numbers for comparison
      const incomingAgentId = typeof eventData.agentId === 'string' 
        ? parseInt(eventData.agentId, 10)
        : (eventData.agentId ?? eventData.agentIndex ?? eventData.paneIndex);
      
      const ourAgentId = typeof agentId === 'string' 
        ? parseInt(agentId as any, 10)
        : agentId;
      
      // Validate the incoming agent ID
      if (isNaN(incomingAgentId) || incomingAgentId < 0) {
        console.warn(`[AgentTerminal-${ourAgentId}] Invalid incoming agentId:`, eventData.agentId);
        return;
      }
      
      // Check if this update is for our agent - STRICT matching by agent ID
      const isOurAgent = (eventData.farmId === farmId || eventData.sessionId?.includes(farmId)) && 
                        (incomingAgentId === ourAgentId);
      
      // Debug logging for agent matching
      if (!isOurAgent && eventData.farmId === farmId) {
        console.log(`[AgentTerminal-${ourAgentId}] Ignoring output for agent ${incomingAgentId}`);
        return;
      }
      
      // Handle various content formats
      let content = null;
      if (eventData.content) {
        content = eventData.content;
      } else if (eventData.lines) {
        content = Array.isArray(eventData.lines) ? eventData.lines : [eventData.lines];
      } else if (eventData.output) {
        content = eventData.output;
      }
      
      if (isOurAgent && content) {
        console.log(`[AgentTerminal-${ourAgentId}] Processing ${Array.isArray(content) ? content.length : 1} lines`);
        const lines = Array.isArray(content) ? content : content.split('\n');
        const newMessages: TerminalMessage[] = lines.map((line: string) => {
          // Clean ANSI codes for type detection only
          const cleanLineForDetection = AnsiParser.stripAnsi(line);
          
          // Detect message type based on clean content
          let type: TerminalMessage['type'] = 'normal';
          let isPinned = false;
          
          if (cleanLineForDetection.includes('[CLAUDE LIMIT]')) {
            type = 'limit';
            isPinned = true;
          } else if (cleanLineForDetection.includes('[MODEL CHANGE]')) {
            type = 'model';
            isPinned = true;
          } else if (cleanLineForDetection.includes('[RATE LIMIT]')) {
            type = 'rate-limit';
            isPinned = true;
          } else if (cleanLineForDetection.includes('[CLAUDE CMD]')) {
            type = 'command';
          } else if (cleanLineForDetection.includes('[Status:')) {
            type = 'status';
          } else if (cleanLineForDetection.includes('⚠️') || cleanLineForDetection.includes('[Warning]')) {
            type = 'warning';
          } else if (cleanLineForDetection.includes('📌') || cleanLineForDetection.includes('[Notice]')) {
            type = 'notice';
          } else if (cleanLineForDetection.includes('🤔') || cleanLineForDetection.includes('Thinking...')) {
            type = 'thinking';
          } else if (cleanLineForDetection.startsWith('>')) {
            type = 'command';
          }
          
          // Clean the line fully for storage and display
          const cleanContent = AnsiParser.cleanTerminalOutput(line);
          
          return {
            content: cleanContent, // Store cleaned content
            type,
            timestamp: eventData.timestamp || new Date().toISOString(),
            isPinned
          };
        }).filter((msg: any) => msg.content.trim() !== ''); // Filter out empty lines
        
        if (newMessages.length > 0) {
          // Update pinned messages
          const newPinned = newMessages.filter(msg => msg.isPinned);
          if (newPinned.length > 0) {
            setPinnedMessages(prev => [...prev, ...newPinned].slice(-3)); // Keep last 3 pinned
          }
          
          setTerminalContent(prev => {
            const combined = [...prev, ...newMessages];
            // Implement circular buffer to prevent memory leaks
            return combined.length > 1000 ? combined.slice(-1000) : combined;
          })
        }
      }
    };

    const handleCommandSent = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId && eventData.agentId === agentId) {
        const commandMsg: TerminalMessage = {
          content: `> ${eventData.command}`,
          type: 'command',
          timestamp: new Date().toISOString()
        };
        setTerminalContent(prev => [...prev, commandMsg]);
      }
    };

    const handleAgentStatus = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId && eventData.agentId === agentId) {
        const statusMsg: TerminalMessage = {
          content: `[Status: ${eventData.status}]`,
          type: 'status',
          timestamp: new Date().toISOString()
        };
        setTerminalContent(prev => [...prev, statusMsg]);
      }
    };

    // Subscribe to multiple terminal event types for better compatibility
    const unsubscribeTerminal = subscribe('agent:terminal', handleTerminalUpdate);
    const unsubscribeTerminalOutput = subscribe('terminal:output', handleTerminalUpdate);
    const unsubscribeCommand = subscribe('agent:command', handleCommandSent);
    const unsubscribeStatus = subscribe('agent:status', handleAgentStatus);

    // Load initial terminal content
    fetchTerminalHistory();

    return () => {
      unsubscribeTerminal();
      unsubscribeTerminalOutput();
      unsubscribeCommand();
      unsubscribeStatus();
      
      // Leave terminal session on unmount
      if (socket && connected) {
        const sessionName = `farm-${farmId.substring(0, 8)}`;
        socket.emit('terminal:leave_session', { sessionId: sessionName });
      }
      
      // Reset join status
      hasJoinedRef.current = false;
    };
  }, [farmId, agentId, subscribe, socket, connected]);

  // Filter and search terminal content
  const filteredContent = useMemo(() => {
    let filtered = [...terminalContent];

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(msg => msg.type === filterType);
    }

    // Apply search term
    if (searchTerm) {
      filtered = filtered.filter(msg => {
        const cleanContent = AnsiParser.stripAnsi(msg.content).toLowerCase();
        return cleanContent.includes(searchTerm.toLowerCase());
      });
    }

    return filtered;
  }, [terminalContent, filterType, searchTerm]);

  // Search matches for navigation
  const searchMatches = useMemo(() => {
    if (!searchTerm) return [];
    return filteredContent.map((msg, index) => {
      const cleanContent = AnsiParser.stripAnsi(msg.content).toLowerCase();
      return cleanContent.includes(searchTerm.toLowerCase()) ? index : -1;
    }).filter(index => index !== -1);
  }, [filteredContent, searchTerm]);

  useEffect(() => {
    // Auto-scroll to bottom when new content is added (only if not searching)
    if (terminalRef.current && !searchTerm) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalContent, searchTerm]);

  useEffect(() => {
    // Auto-focus input when command panel is shown
    if (showCommandInput && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200); // Small delay for animation
    }
  }, [showCommandInput]);

  useEffect(() => {
    // Auto-focus search input when search is shown
    if (showSearch && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [showSearch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      // Escape to close search
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchTerm('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  const fetchTerminalHistory = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
      const response = await fetch(`${apiUrl}/api/farms/${farmId}/terminal/${agentId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.terminal) {
          // Convert plain strings to TerminalMessage objects
          const messages = data.data.terminal.map((line: string) => ({
            content: line,
            type: 'normal' as const,
            timestamp: new Date().toISOString()
          }));
          setTerminalContent(messages);
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
      const errorMsg: TerminalMessage = {
        content: `[Error: Failed to send command]`,
        type: 'warning',
        timestamp: new Date().toISOString()
      };
      setTerminalContent(prev => [...prev, errorMsg]);
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
    // Ensure we strip any remaining ANSI codes when copying
    const content = filteredContent.map(msg => AnsiParser.stripAnsi(msg.content)).join('\n');
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
        'bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col h-full min-h-0',
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
              {agentName || `Agent ${agentId}`}
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
            onClick={() => setShowSearch(!showSearch)}
            className={clsx(
              "p-1 rounded transition-colors",
              showSearch
                ? "bg-blue-600 text-white"
                : "hover:bg-gray-700 text-gray-400"
            )}
            title={showSearch ? 'Hide search' : 'Show search (Ctrl+F)'}
          >
            <Search className="w-4 h-4" />
          </button>
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

      {/* Search and Filter Bar */}
      {showSearch && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-gray-800 border-b border-gray-700 p-2 flex items-center space-x-2"
        >
          <div className="flex-1 flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search terminal output..."
              className="flex-1 bg-gray-900 text-sm px-2 py-1 rounded border border-gray-700 focus:border-blue-500 focus:outline-none text-gray-300"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-900 text-sm px-2 py-1 rounded border border-gray-700 focus:border-blue-500 focus:outline-none text-gray-300"
            >
              <option value="all">All Messages</option>
              <option value="normal">Normal</option>
              <option value="command">Commands</option>
              <option value="status">Status</option>
              <option value="warning">Warnings</option>
              <option value="error">Errors</option>
              <option value="thinking">Thinking</option>
            </select>
          </div>
          {searchMatches.length > 0 && (
            <div className="text-xs text-gray-400">
              {searchMatches.length} matches
            </div>
          )}
        </motion.div>
      )}

      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="bg-gray-800 border-b border-gray-700 p-2">
          <div className="space-y-1">
            {pinnedMessages.map((msg, index) => (
              <div
                key={`pinned-${index}`}
                className={clsx(
                  'text-xs font-mono px-2 py-1 rounded',
                  msg.type === 'limit' && 'bg-orange-900/50 text-orange-300',
                  msg.type === 'model' && 'bg-blue-900/50 text-blue-300',
                  msg.type === 'rate-limit' && 'bg-red-900/50 text-red-300'
                )}
              >
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terminal Content */}
      <div 
        ref={terminalRef}
        className={clsx(
          'bg-black p-2 sm:p-3 md:p-4 font-mono text-xs overflow-y-auto flex-1 min-h-0',
          isExpanded ? 'max-h-full' : 'max-h-[400px]'
        )}
        style={{
          scrollBehavior: 'smooth',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
          // CRITICAL FIX: Use CSS variable for accurate viewport height on iOS Safari
          minHeight: isExpanded ? 'calc(var(--full-vh, 100vh) - 12rem)' : '200px',
          maxHeight: isExpanded ? 'calc(var(--full-vh, 100vh) - 8rem)' : 'clamp(250px, 40vh, 400px)',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {filteredContent.length === 0 ? (
          <div className="text-gray-600">
            {searchTerm || filterType !== 'all'
              ? 'No matching messages found'
              : 'Waiting for agent output...'}
          </div>
        ) : (
          filteredContent.map((msg, index) => {
            const getMessageStyle = () => {
              switch (msg.type) {
                case 'command': return 'text-green-400';
                case 'status': return 'text-yellow-400';
                case 'warning': return 'text-orange-400';
                case 'limit': return 'text-orange-300 font-bold';
                case 'model': return 'text-blue-300 font-bold';
                case 'rate-limit': return 'text-red-400 font-bold';
                case 'notice': return 'text-cyan-400';
                case 'thinking': return 'text-purple-400 italic';
                default: return 'text-gray-300';
              }
            };
            
            return (
              <div 
                key={index} 
                className={clsx(
                  'whitespace-pre-wrap break-words leading-relaxed',
                  getMessageStyle(),
                  msg.isPinned && 'bg-gray-900/30'
                )}
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere'
                }}
              >
                {msg.content || '\u00A0'}
              </div>
            );
          })
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