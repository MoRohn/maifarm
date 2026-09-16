import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectItem } from '../ui/select';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAnsiParser } from '@/utils/ansiParser';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  CommandLineIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

interface TerminalDrawerProps {
  sessionName: string;
  farmId?: string;
  isOpen: boolean;
  onToggle: () => void;
  selectedAgentId?: number;
  onAgentSelect?: (agentId: number | undefined) => void;
  height?: 'small' | 'medium' | 'large' | 'full';
  theme?: 'dark' | 'light' | 'matrix' | 'ocean';
}

interface TerminalOutput {
  agentId: number;
  content: string;
  timestamp: number;
  lines: string[];
}

interface AgentInfo {
  agentId: number;
  name: string;
  isActive: boolean;
  lineCount: number;
  lastActivity: Date;
}

/**
 * Terminal themes
 */
const TERMINAL_THEMES = {
  dark: {
    background: 'bg-gray-900',
    text: 'text-green-400',
    border: 'border-gray-700',
    scrollbar: 'scrollbar-dark'
  },
  light: {
    background: 'bg-white',
    text: 'text-gray-900',
    border: 'border-gray-300',
    scrollbar: 'scrollbar-light'
  },
  matrix: {
    background: 'bg-black',
    text: 'text-green-300',
    border: 'border-green-500',
    scrollbar: 'scrollbar-green'
  },
  ocean: {
    background: 'bg-blue-900',
    text: 'text-cyan-300',
    border: 'border-blue-400',
    scrollbar: 'scrollbar-blue'
  }
};

/**
 * Height presets
 */
const HEIGHT_PRESETS = {
  small: 'h-48',
  medium: 'h-64',
  large: 'h-96',
  full: 'h-screen'
};

/**
 * Terminal Drawer Component
 */
export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  sessionName,
  farmId,
  isOpen,
  onToggle,
  selectedAgentId,
  onAgentSelect,
  height = 'medium',
  theme = 'dark'
}) => {
  // State
  const [terminalOutputs, setTerminalOutputs] = useState<Map<number, string[]>>(new Map());
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  // Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // WebSocket connection
  const { socket } = useWebSocket();

  // Theme configuration
  const currentTheme = TERMINAL_THEMES[theme];

  // Connect to terminal events
  useEffect(() => {
    if (!socket) return;

    // Join session room
    socket.emit('terminal:join_session', { sessionId: sessionName, farmId });

    const handleTerminalOutput = (data: {
      sessionName: string;
      agentId: number;
      lines: string[];
      timestamp: number;
    }) => {
      if (data.sessionName !== sessionName) return;

      setTerminalOutputs(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.agentId) || [];
        const newLines = [...existing, ...data.lines];
        
        // Limit to last 1000 lines per agent
        if (newLines.length > 1000) {
          newLines.splice(0, newLines.length - 1000);
        }
        
        updated.set(data.agentId, newLines);
        return updated;
      });

      // Update agent info
      setAgents(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex(a => a.agentId === data.agentId);
        
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            isActive: true,
            lineCount: updated[existingIndex].lineCount + data.lines.length,
            lastActivity: new Date()
          };
        } else {
          updated.push({
            agentId: data.agentId,
            name: `Agent ${data.agentId}`,
            isActive: true,
            lineCount: data.lines.length,
            lastActivity: new Date()
          });
        }

        return updated.sort((a, b) => a.agentId - b.agentId);
      });
    };

    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);

    socket.on('terminal:output', handleTerminalOutput);
    socket.on('terminal:connected', handleConnected);
    socket.on('terminal:disconnected', handleDisconnected);
    socket.on('connect', handleConnected);
    socket.on('disconnect', handleDisconnected);

    return () => {
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:connected', handleConnected);
      socket.off('terminal:disconnected', handleDisconnected);
      socket.off('connect', handleConnected);
      socket.off('disconnect', handleDisconnected);
      socket.emit('terminal:leave_session', { sessionId: sessionName });
    };
  }, [socket, sessionName, farmId]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (autoScroll && outputRef.current && isOpen) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutputs, selectedAgentId, autoScroll, isOpen]);

  // Update total line count
  useEffect(() => {
    const total = agents.reduce((sum, agent) => sum + agent.lineCount, 0);
    setLineCount(total);
  }, [agents]);

  // Get current terminal content
  const currentOutput = useMemo(() => {
    if (selectedAgentId === undefined) {
      // Show all agents' output mixed
      const allLines: { line: string; agentId: number; timestamp: Date }[] = [];
      
      for (const [agentId, lines] of terminalOutputs) {
        lines.forEach(line => {
          allLines.push({
            line,
            agentId,
            timestamp: new Date() // Would need real timestamps from server
          });
        });
      }
      
      // Sort by timestamp (approximate)
      return allLines.map(({ line, agentId }) => 
        showTimestamps 
          ? `[Agent ${agentId}] ${line}`
          : line
      );
    } else {
      // Show specific agent's output
      const lines = terminalOutputs.get(selectedAgentId) || [];
      return showTimestamps 
        ? lines.map(line => `[${new Date().toLocaleTimeString()}] ${line}`)
        : lines;
    }
  }, [terminalOutputs, selectedAgentId, showTimestamps]);

  // Parse ANSI content for display
  const parsedContent = useAnsiParser(currentOutput.join('\n'), {
    preserveNewlines: true
  });

  // Clear terminal output
  const clearTerminal = () => {
    if (selectedAgentId !== undefined) {
      setTerminalOutputs(prev => {
        const updated = new Map(prev);
        updated.set(selectedAgentId, []);
        return updated;
      });
    } else {
      setTerminalOutputs(new Map());
    }
  };

  // Copy terminal content to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(currentOutput.join('\n'));
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Card className={`w-full transition-all duration-300 ${currentTheme.border} ${isOpen ? '' : 'shadow-lg'}`}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-8 w-8 p-0"
            >
              {isOpen ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronUpIcon className="h-4 w-4" />
              )}
            </Button>
            
            <div className="flex items-center gap-2">
              <CommandLineIcon className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-lg">Terminal Output</CardTitle>
              
              {/* Connection Status */}
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-xs">
              {agents.length} agents • {lineCount} lines
            </Badge>
            
            {!isOpen && selectedAgentId !== undefined && (
              <Badge variant="default" className="text-xs">
                Agent {selectedAgentId}
              </Badge>
            )}
          </div>
        </div>

        {/* Controls (when open) */}
        {isOpen && (
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-3">
              {/* Agent Selector */}
              <Select 
                value={selectedAgentId?.toString() || 'all'} 
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    onAgentSelect?.(undefined);
                  } else {
                    onAgentSelect?.(parseInt(e.target.value));
                  }
                }}
                className="w-48"
              >
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.agentId} value={agent.agentId.toString()}>
                    {agent.name} ({agent.lineCount} lines)
                  </SelectItem>
                ))}
              </Select>

              {/* Options */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTimestamps(!showTimestamps)}
                className={showTimestamps ? 'bg-gray-100' : ''}
              >
                <AdjustmentsHorizontalIcon className="h-4 w-4 mr-1" />
                Timestamps
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className={autoScroll ? 'bg-gray-100' : ''}
              >
                <ArrowPathIcon className="h-4 w-4 mr-1" />
                Auto-scroll
              </Button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
              >
                <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                Copy
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearTerminal}
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Terminal Content */}
      {isOpen && (
        <CardContent className="p-0">
          <div 
            ref={terminalRef}
            className={`${HEIGHT_PRESETS[height]} ${currentTheme.background} ${currentTheme.border} border-t overflow-hidden font-mono text-sm`}
          >
            <div
              ref={outputRef}
              className={`h-full overflow-y-auto p-4 ${currentTheme.scrollbar}`}
              style={{ scrollBehavior: autoScroll ? 'smooth' : 'auto' }}
            >
              {currentOutput.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <CommandLineIcon className={`h-12 w-12 mx-auto mb-3 ${currentTheme.text} opacity-50`} />
                    <p className={`${currentTheme.text} opacity-75`}>
                      {isConnected ? 'Waiting for terminal output...' : 'Connecting to terminal...'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`${currentTheme.text} whitespace-pre-wrap break-words`}>
                  <div dangerouslySetInnerHTML={{ __html: parsedContent }} />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default TerminalDrawer;