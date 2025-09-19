import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Send, Copy, Maximize2, Minimize2, User, Activity, Command, Keyboard, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '@/hooks/useWebSocket';
import { VirtualizedTerminal } from './VirtualizedTerminal';
import { normalizeAgentId } from '@/utils/agentIdNormalizer';
import { ReliableWebSocketConnection } from '@/services/websocket/reliableConnection';

interface OptimizedAgentTerminalProps {
  farmId: string;
  agentId: number | string;
  agentName?: string;
  agentUid?: string;
  status?: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  className?: string;
  onCommand?: (command: string) => void;
  theme?: 'dark' | 'light' | 'matrix' | 'ocean';
}

// Memoized status indicator
const StatusIndicator = React.memo<{ status: string }>(({ status }) => {
  const statusColors = {
    starting: 'bg-yellow-500',
    ready: 'bg-green-500',
    working: 'bg-blue-500',
    idle: 'bg-gray-500',
    error: 'bg-red-500'
  };

  return (
    <motion.div
      animate={{
        scale: status === 'working' ? [1, 1.2, 1] : 1
      }}
      transition={{
        duration: 1,
        repeat: status === 'working' ? Infinity : 0
      }}
      className={`w-2 h-2 rounded-full ${statusColors[status as keyof typeof statusColors] || 'bg-gray-500'}`}
      aria-label={`Agent status: ${status}`}
    />
  );
});

StatusIndicator.displayName = 'StatusIndicator';

export const OptimizedAgentTerminal = React.memo<OptimizedAgentTerminalProps>(({
  farmId,
  agentId: rawAgentId,
  agentName,
  agentUid,
  status = 'starting',
  className,
  onCommand,
  theme = 'dark'
}) => {
  // Normalize agent ID once
  const agentId = useMemo(() => normalizeAgentId(rawAgentId), [rawAgentId]);

  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reliableConnection = useRef<ReliableWebSocketConnection | null>(null);

  const { subscribe, socket, connected } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Initialize reliable connection
  useEffect(() => {
    if (socket && connected) {
      reliableConnection.current = new ReliableWebSocketConnection(socket);
    }
    return () => {
      reliableConnection.current?.destroy();
    };
  }, [socket, connected]);

  // Memoized session name
  const sessionName = useMemo(() => `farm-${farmId.substring(0, 8)}`, [farmId]);

  // Join terminal session with proper ID normalization
  const joinTerminalSession = useCallback(() => {
    if (reliableConnection.current && connected) {
      reliableConnection.current.emit('terminal:join_session', {
        sessionId: sessionName,
        farmId: farmId
      });

      reliableConnection.current.emit('terminal:join_agent', {
        sessionId: sessionName,
        farmId,
        agentId,
        agentIndex: agentId
      });
    }
  }, [connected, farmId, agentId, sessionName]);

  useEffect(() => {
    joinTerminalSession();
  }, [joinTerminalSession]);

  // Optimized terminal update handler
  const handleTerminalUpdate = useCallback((data: any) => {
    const eventData = data.payload || data;

    // Verify this update is for our agent
    if (normalizeAgentId(eventData.agentId) !== agentId) {
      return;
    }

    if (eventData.content) {
      const newLines = Array.isArray(eventData.content)
        ? eventData.content
        : eventData.content.split('\n');

      setTerminalLines(prev => {
        const combined = [...prev, ...newLines];
        // Limit to 10000 lines to prevent memory issues
        return combined.length > 10000 ? combined.slice(-10000) : combined;
      });
    }
  }, [agentId]);

  // Subscribe to terminal updates
  useEffect(() => {
    const unsubscribe = subscribe('terminal:output', handleTerminalUpdate);
    return () => unsubscribe();
  }, [subscribe, handleTerminalUpdate]);

  // Command submission with batching
  const handleCommandSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();

    if (!commandInput.trim() || !reliableConnection.current) return;

    const command = commandInput.trim();

    // Add to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    // Send command with batching for better performance
    reliableConnection.current.emitBatched('terminal:command', {
      sessionId: sessionName,
      farmId,
      agentId,
      command
    });

    // Add command to local display immediately
    setTerminalLines(prev => [...prev, `> ${command}`]);

    // Clear input
    setCommandInput('');

    // Call external handler if provided
    onCommand?.(command);
  }, [commandInput, sessionName, farmId, agentId, onCommand]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
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
    } else if (e.key === 'Escape') {
      setCommandInput('');
      setHistoryIndex(-1);
      inputRef.current?.blur();
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setTerminalLines([]);
    }
  }, [commandHistory, historyIndex]);

  // Copy terminal output
  const copyTerminalOutput = useCallback(() => {
    const text = terminalLines.join('\n');
    navigator.clipboard.writeText(text);
  }, [terminalLines]);

  // Focus management for accessibility
  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const element = terminalRef.current;
    if (element) {
      element.addEventListener('focusin', handleFocus);
      element.addEventListener('focusout', handleBlur);

      return () => {
        element.removeEventListener('focusin', handleFocus);
        element.removeEventListener('focusout', handleBlur);
      };
    }
  }, []);

  return (
    <motion.div
      ref={terminalRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'terminal-container rounded-lg shadow-lg overflow-hidden',
        isExpanded ? 'fixed inset-4 z-50' : 'relative h-96',
        isFocused && 'ring-2 ring-blue-500',
        className
      )}
      role="region"
      aria-label={`Terminal for ${agentName || `Agent ${agentId}`}`}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white">
        <div className="flex items-center gap-3">
          <StatusIndicator status={status} />
          <Terminal className="w-4 h-4" />
          <span className="font-semibold">
            {agentName || `Agent ${agentId}`}
          </span>
          <span className="text-xs text-gray-400">
            #{agentId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyTerminalOutput}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Copy terminal output"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label={isExpanded ? 'Minimize terminal' : 'Maximize terminal'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Keyboard shortcuts"
            title="Ctrl+L: Clear | ESC: Unfocus | ↑↓: History"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output with Virtual Scrolling */}
      <div className="flex-1 overflow-hidden">
        <VirtualizedTerminal
          lines={terminalLines}
          theme={theme}
          autoScroll={true}
          className="h-full"
        />
      </div>

      {/* Command Input */}
      <form onSubmit={handleCommandSubmit} className="border-t border-gray-700">
        <div className="flex items-center px-4 py-2 bg-gray-900">
          <ChevronRight className="w-4 h-4 text-green-500 mr-2" />
          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white outline-none font-mono text-sm"
            placeholder="Enter command..."
            aria-label="Terminal command input"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="ml-2 p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Send command"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {terminalLines.length > 0 && `Last output: ${terminalLines[terminalLines.length - 1]}`}
      </div>
    </motion.div>
  );
});

OptimizedAgentTerminal.displayName = 'OptimizedAgentTerminal';