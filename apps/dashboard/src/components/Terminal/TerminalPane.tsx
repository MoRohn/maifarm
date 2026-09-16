import React, { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
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

// PERFORMANCE FIX: Threshold for enabling virtualization
// Lowered from 500 to 200 for better iOS/mobile performance
// iOS devices have limited memory and DOM rendering is expensive
const VIRTUALIZATION_THRESHOLD = 200;

// MEMORY FIX: Maximum lines to keep in terminal output
// Prevents memory exhaustion on long-running sessions
// Matches VirtualTerminal.tsx maxLines default for consistency
const MAX_TERMINAL_LINES = 5000;

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

/**
 * PERFORMANCE FIX: Memoized terminal line component to prevent re-renders
 * Uses stable key based on content + index for efficient React reconciliation
 */
interface TerminalLineProps {
  line: string;
  lineKey: string;
}

const TerminalLine = memo(({ line, lineKey }: TerminalLineProps) => {
  const className = useMemo(() => {
    if (line.startsWith('>')) return 'text-green-400';
    if (line.startsWith('[') && line.endsWith(']')) return 'text-yellow-400';
    if (line.includes('error') || line.includes('Error')) return 'text-red-400';
    return 'text-gray-300';
  }, [line]);

  return (
    <div
      key={lineKey}
      className={`whitespace-pre-wrap break-words leading-relaxed overflow-hidden select-text ${className}`}
      style={{
        contain: 'layout paint',  // CSS containment for iOS performance - allow text selection
        WebkitUserSelect: 'text',  // Enable text selection on iOS Safari
        userSelect: 'text'
      }}
    >
      {line || '\u00A0'}
    </div>
  );
});
TerminalLine.displayName = 'TerminalLine';

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

  // MEMORY FIX: Limit output lines to prevent memory exhaustion on long sessions
  const processedOutput = useMemo(() => {
    if (output.length > MAX_TERMINAL_LINES) {
      return output.slice(-MAX_TERMINAL_LINES);
    }
    return output;
  }, [output]);

  // Register terminal ref with parent
  useEffect(() => {
    registerTerminalRef(terminalRef.current);
  }, [registerTerminalRef]);

  // Auto-scroll to bottom when output changes
  // PERFORMANCE FIX: Removed double RAF - single RAF is sufficient for scroll
  useEffect(() => {
    if (terminalRef.current) {
      requestAnimationFrame(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
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
    const content = processedOutput.join('\n');
    navigator.clipboard.writeText(content).then(() => {
      // Could add a toast notification here
      console.log('Terminal output copied to clipboard');
    });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    // In a real implementation, this would send a pause/resume signal to the agent
  };

  // CRITICAL FIX: Use CSS variable for accurate viewport height on iOS Safari
  const terminalHeight = expanded
    ? (showPrompt ? 'calc(var(--full-vh, 100vh) - 12rem)' : 'calc(var(--full-vh, 100vh) - 8rem)')
    : 'auto';

  // PERFORMANCE FIX: Enable virtualization for large outputs (> 200 lines)
  const useVirtualization = processedOutput.length > VIRTUALIZATION_THRESHOLD;
  const listRef = useRef<List>(null);

  // Auto-scroll virtualized list to bottom
  useEffect(() => {
    if (useVirtualization && listRef.current && processedOutput.length > 0 && !isPaused) {
      listRef.current.scrollToItem(processedOutput.length - 1, 'end');
    }
  }, [processedOutput.length, useVirtualization, isPaused]);

  // Virtualized row renderer
  const VirtualizedRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const line = processedOutput[index];
    let colorClass = 'text-gray-300';
    if (line.startsWith('>')) colorClass = 'text-green-400';
    else if (line.startsWith('[') && line.endsWith(']')) colorClass = 'text-yellow-400';
    else if (line.includes('error') || line.includes('Error')) colorClass = 'text-red-400';

    return (
      <div
        style={{ ...style, contain: 'content' }}
        className={`whitespace-pre-wrap break-words leading-relaxed overflow-hidden px-3 ${colorClass}`}
      >
        {line || '\u00A0'}
      </div>
    );
  }, [processedOutput]);

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
          {/* Pause/Resume - ACCESSIBILITY FIX: Added aria-label, iOS touch target (44px min) */}
          <button
            onClick={togglePause}
            className={`p-2 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation ${
              isPaused
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'hover:bg-gray-700 text-gray-400 hover:text-white'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
            aria-label={isPaused ? 'Resume terminal output' : 'Pause terminal output'}
            aria-pressed={isPaused}
          >
            {isPaused ? (
              <Play className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Pause className="w-3 h-3" aria-hidden="true" />
            )}
          </button>

          {/* Command prompt toggle - ACCESSIBILITY FIX: Added aria-label, iOS touch target */}
          {showCommandInput && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className={`p-2 rounded transition-colors flex items-center space-x-1 min-h-[44px] touch-manipulation ${
                showPrompt
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-400 hover:text-white'
              }`}
              title={showPrompt ? 'Hide command input' : 'Show command input'}
              aria-label={showPrompt ? 'Hide command input' : 'Show command input'}
              aria-expanded={showPrompt}
            >
              <Command className="w-3 h-3" aria-hidden="true" />
              {showPrompt ? (
                <ChevronUp className="w-2 h-2" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-2 h-2" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Copy - ACCESSIBILITY FIX: Added aria-label, iOS touch target */}
          <button
            onClick={copyToClipboard}
            className="p-2 hover:bg-gray-700 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            title="Copy terminal content"
            aria-label="Copy terminal content to clipboard"
          >
            <Copy className="w-3 h-3 text-gray-400 hover:text-white" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Terminal Content - ACCESSIBILITY FIX: Added aria-live and role */}
      <div
        ref={terminalRef}
        className="bg-black font-mono text-xs flex-1 min-h-0"
        style={{
          maxHeight: terminalHeight === 'auto' ? '100%' : terminalHeight,
          minHeight: '200px',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
        }}
        role="log"
        aria-label={`Terminal output for agent ${agent.name}`}
        aria-live="polite"
        aria-atomic="false"
        tabIndex={0}
      >
        {processedOutput.length === 0 ? (
          <div className="text-gray-600 flex items-center justify-center h-full p-3">
            <div className="text-center">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div>Waiting for agent output...</div>
              <div className="text-xs mt-1 opacity-70">
                Agent {agent.id} is {agent.status}
              </div>
            </div>
          </div>
        ) : useVirtualization ? (
          /* PERFORMANCE FIX: Virtualized rendering for 200+ lines
           * Uses react-window for efficient DOM recycling
           * Only renders visible rows + overscan for smooth scrolling */
          <AutoSizer>
            {({ height, width }) => (
              <List
                ref={listRef}
                height={height}
                width={width}
                itemCount={processedOutput.length}
                itemSize={20} // Approximate line height in pixels
                overscanCount={10} // Render 10 extra rows above/below viewport
                // PERFORMANCE FIX: Use 'auto' scroll for virtualized lists - 'smooth' causes jank on iOS Safari
                style={{ scrollBehavior: 'auto' }}
              >
                {VirtualizedRow}
              </List>
            )}
          </AutoSizer>
        ) : (
          /* Standard rendering for smaller outputs (< 200 lines)
           * Uses memoized line component with stable keys */
          <div
            className="overflow-y-auto h-full p-3"
            style={{
              // PERFORMANCE FIX: Use 'auto' for better iOS Safari performance; 'smooth' can cause scroll jank
              scrollBehavior: 'auto',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              WebkitOverflowScrolling: 'touch' // iOS momentum scrolling
            }}
          >
            {processedOutput.map((line, index) => (
              <TerminalLine
                key={`${index}-${line.slice(0, 20)}`}
                lineKey={`${index}-${line.slice(0, 20)}`}
                line={line}
              />
            ))}
          </div>
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
                  className={`p-2 rounded transition-colors flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation ${
                    commandInput.trim() && agent.status !== 'error' && agent.status !== 'disconnected' && !isExecuting
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Send command (Enter)"
                  aria-label="Send command to terminal"
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