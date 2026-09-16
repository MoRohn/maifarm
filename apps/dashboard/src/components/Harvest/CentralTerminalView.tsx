import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal as TerminalIcon,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Search,
  Filter,
  Command,
  ChevronRight,
  Activity,
  Cpu,
  Database,
  Zap,
  Grid3x3,
  Columns,
  Square,
  PanelLeft,
  Settings,
  Sparkles,
  Moon,
  Sun,
  Eye,
  EyeOff,
  RotateCw,
  PlayCircle,
  PauseCircle,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  FileText,
  Code2,
  Braces,
  FileCode,
  GitBranch,
  Layers,
  LayoutDashboard,
  Monitor
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Tooltip } from '../common/Tooltip';
import { HarvestDashboardView } from './HarvestDashboardView';

interface Agent {
  id: number;
  name: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  output: string[];
  metrics?: {
    cpu: number;
    memory: number;
    tasksCompleted: number;
    successRate: number;
    avgResponseTime: number;
  };
}

interface CentralTerminalViewProps {
  farmId?: string;
  sessionName?: string;
  agents: Agent[];
  className?: string;
  onAgentSelect?: (agentId: number) => void;
  farmName?: string;
  farmStatus?: string;
  harvest?: any;
  onClose?: () => void;
}

type LayoutMode = 'fullscreen' | 'split-horizontal' | 'split-vertical' | 'grid' | 'focus';
type TerminalTheme = 'pro-dark' | 'pro-light' | 'cyberpunk' | 'ocean' | 'forest' | 'sunset';

export const CentralTerminalView: React.FC<CentralTerminalViewProps> = ({
  farmId,
  sessionName,
  agents,
  className,
  onAgentSelect,
  farmName = 'AI Workflow',
  farmStatus = 'active',
  harvest,
  onClose
}) => {
  const [viewMode, setViewMode] = useState<'terminal' | 'harvest'>('terminal');
  // Default to showing all agents in grid mode if there are multiple agents
  const defaultSelectedAgents = agents.length > 1 
    ? agents.slice(0, Math.min(4, agents.length)).map((_, idx) => idx)
    : [0];
  const [selectedAgents, setSelectedAgents] = useState<number[]>(defaultSelectedAgents);
  // Default to grid layout if there are multiple agents
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(agents.length > 1 ? 'grid' : 'fullscreen');
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>('pro-dark');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const terminalRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const { socket, isConnected } = useWebSocket();
  const [agentOutputs, setAgentOutputs] = useState<{ [key: number]: string[] }>({});

  // CRITICAL FIX: Track user scroll state to prevent auto-scroll when user is reading
  const userScrolledRef = useRef<{ [key: number]: boolean }>({});
  const scrollTimeoutRef = useRef<{ [key: number]: NodeJS.Timeout | null }>({});

  // MEMORY FIX: Maximum lines to keep per agent (prevents memory leak)
  const MAX_TERMINAL_LINES = 2000;

  // CLEANUP FIX: Clear scroll timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(scrollTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Trigger terminal verification on mount
  useEffect(() => {
    if (!farmId || !sessionName) return;
    
    const verifyTerminalStream = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
        const response = await fetch(`${apiUrl}/api/terminal/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionName,
            farmId,
            agentCount: agents.length
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[CentralTerminalView] Terminal verification:', data);
        }
      } catch (error) {
        console.error('[CentralTerminalView] Failed to verify terminal:', error);
      }
    };
    
    // Delay verification to ensure WebSocket connection is established
    const timer = setTimeout(verifyTerminalStream, 500);
    return () => clearTimeout(timer);
  }, [farmId, sessionName, agents.length]);
  
  // Subscribe to terminal WebSocket events
  useEffect(() => {
    console.log('[CentralTerminalView] WebSocket effect:', {
      socket: !!socket,
      isConnected,
      sessionName,
      farmId
    });
    
    if (!socket || !isConnected || !sessionName || !farmId) {
      console.warn('[CentralTerminalView] Cannot join session - missing:', {
        socket: !socket,
        connected: !isConnected,
        session: !sessionName,
        farm: !farmId
      });
      return;
    }

    console.log('[CentralTerminalView] Joining terminal session:', sessionName, 'for farm:', farmId);
    
    // Join the terminal session room
    socket.emit('terminal:join_session', { 
      sessionId: sessionName, 
      farmId 
    });
    
    // Request any cached messages immediately after joining
    setTimeout(() => {
      socket.emit('terminal:request_cached', {
        sessionId: sessionName,
        farmId
      });
    }, 100);

    // Handle terminal output
    const handleTerminalOutput = (data: any) => {
      console.log('[CentralTerminalView] Received terminal output:', data);
      
      // Extract agent ID from various possible formats
      const agentIndex = data.agentId ?? data.agentIndex ?? 0;
      
      // Extract output lines from various formats
      let newLines: string[] = [];
      if (data.lines && Array.isArray(data.lines)) {
        newLines = data.lines;
      } else if (data.output) {
        if (Array.isArray(data.output)) {
          newLines = data.output;
        } else if (typeof data.output === 'string') {
          newLines = data.output.split('\n').filter((line: string) => line.trim());
        }
      }
      
      if (newLines.length > 0) {
        setAgentOutputs(prev => {
          const existingLines = prev[agentIndex] || [];
          const combinedLines = [...existingLines, ...newLines];
          // MEMORY FIX: Keep only last MAX_TERMINAL_LINES to prevent unbounded growth
          const trimmedLines = combinedLines.length > MAX_TERMINAL_LINES
            ? combinedLines.slice(-MAX_TERMINAL_LINES)
            : combinedLines;
          return {
            ...prev,
            [agentIndex]: trimmedLines
          };
        });
        
        // SCROLL FIX: Only auto-scroll if enabled AND user hasn't manually scrolled recently
        if (autoScroll && terminalRefs.current[agentIndex] && !userScrolledRef.current[agentIndex]) {
          requestAnimationFrame(() => {
            if (terminalRefs.current[agentIndex]) {
              terminalRefs.current[agentIndex]!.scrollTop = terminalRefs.current[agentIndex]!.scrollHeight;
            }
          });
        }
      }
    };

    // Listen for terminal output events
    socket.on('terminal:output', handleTerminalOutput);
    
    // Also listen for terminal:joined event which may include cached data
    const handleTerminalJoined = (data: any) => {
      console.log('[CentralTerminalView] Terminal joined event:', data);
      if (data.cachedOutputs) {
        // Process any cached outputs
        for (const output of data.cachedOutputs) {
          handleTerminalOutput(output);
        }
      }
    };
    socket.on('terminal:joined', handleTerminalJoined);

    return () => {
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:joined', handleTerminalJoined);
      socket.emit('terminal:leave_session', { sessionId: sessionName, farmId });
    };
  }, [socket, isConnected, sessionName, farmId, autoScroll]);
  
  // Update selected agents when agents list changes
  useEffect(() => {
    if (layoutMode === 'grid' && agents.length > 1) {
      // In grid mode, automatically select up to 4 agents
      setSelectedAgents(agents.slice(0, Math.min(4, agents.length)).map((_, idx) => idx));
    } else if (layoutMode === 'split-horizontal' || layoutMode === 'split-vertical') {
      // In split modes, select up to 2 agents
      setSelectedAgents(agents.slice(0, Math.min(2, agents.length)).map((_, idx) => idx));
    } else if (agents.length > 0 && selectedAgents.length === 0) {
      // If no agents selected, select the first one
      setSelectedAgents([0]);
    }
  }, [agents.length]); // Only re-run when number of agents changes

  // KEYBOARD SHORTCUTS: CMD+1..9 for quick agent switching
  // Allows users to quickly switch between agents using keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle CMD/Ctrl + number keys
      if (!(e.metaKey || e.ctrlKey)) return;

      // Check for number keys 1-9
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const agentIndex = parseInt(e.key) - 1; // Convert to 0-indexed

        // Only switch if agent exists
        if (agentIndex < agents.length) {
          // In fullscreen/focus mode, switch to single agent
          if (layoutMode === 'fullscreen' || layoutMode === 'focus') {
            setSelectedAgents([agentIndex]);
          } else {
            // In grid/split modes, toggle agent selection
            setSelectedAgents(prev => {
              if (prev.includes(agentIndex)) {
                // If only one selected, don't deselect
                if (prev.length <= 1) return prev;
                return prev.filter(id => id !== agentIndex);
              } else {
                // Add agent to selection (max 4 in grid, 2 in split)
                const maxAgents = layoutMode === 'grid' ? 4 : 2;
                if (prev.length >= maxAgents) {
                  // Replace oldest selection
                  return [...prev.slice(1), agentIndex];
                }
                return [...prev, agentIndex];
              }
            });
          }

          // Notify parent if callback provided
          if (onAgentSelect) {
            onAgentSelect(agentIndex);
          }
        }
      }

      // CMD+0 for all agents (grid mode)
      if (e.key === '0') {
        e.preventDefault();
        if (agents.length > 1) {
          setLayoutMode('grid');
          setSelectedAgents(agents.slice(0, Math.min(4, agents.length)).map((_, idx) => idx));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agents.length, layoutMode, onAgentSelect]);

  // Terminal theme configurations with professional color schemes
  const getThemeConfig = () => {
    switch (terminalTheme) {
      case 'pro-light':
        return {
          bg: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
          terminalBg: 'bg-white',
          text: 'text-gray-800',
          border: 'border-gray-200',
          accent: 'text-blue-600',
          headerBg: 'bg-gradient-to-r from-gray-100 to-white',
          scrollbar: 'scrollbar-light',
          selection: 'selection:bg-blue-100',
          glow: ''
        };
      case 'cyberpunk':
        return {
          bg: 'bg-gradient-to-br from-purple-950 via-black to-pink-950',
          terminalBg: 'bg-black/90',
          text: 'text-cyan-300',
          border: 'border-purple-500/30',
          accent: 'text-pink-400',
          headerBg: 'bg-gradient-to-r from-purple-900/50 to-pink-900/50',
          scrollbar: 'scrollbar-cyber',
          selection: 'selection:bg-purple-500/30',
          glow: 'shadow-[0_0_50px_rgba(168,85,247,0.3)]'
        };
      case 'ocean':
        return {
          bg: 'bg-gradient-to-br from-blue-950 via-teal-950 to-cyan-950',
          terminalBg: 'bg-blue-950/90',
          text: 'text-cyan-200',
          border: 'border-teal-500/30',
          accent: 'text-teal-400',
          headerBg: 'bg-gradient-to-r from-blue-900/50 to-teal-900/50',
          scrollbar: 'scrollbar-ocean',
          selection: 'selection:bg-teal-500/30',
          glow: 'shadow-[0_0_50px_rgba(20,184,166,0.3)]'
        };
      case 'forest':
        return {
          bg: 'bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950',
          terminalBg: 'bg-green-950/90',
          text: 'text-green-200',
          border: 'border-emerald-500/30',
          accent: 'text-emerald-400',
          headerBg: 'bg-gradient-to-r from-green-900/50 to-emerald-900/50',
          scrollbar: 'scrollbar-forest',
          selection: 'selection:bg-emerald-500/30',
          glow: 'shadow-[0_0_50px_rgba(16,185,129,0.3)]'
        };
      case 'sunset':
        return {
          bg: 'bg-gradient-to-br from-orange-950 via-red-950 to-pink-950',
          terminalBg: 'bg-orange-950/90',
          text: 'text-orange-200',
          border: 'border-orange-500/30',
          accent: 'text-orange-400',
          headerBg: 'bg-gradient-to-r from-orange-900/50 to-red-900/50',
          scrollbar: 'scrollbar-sunset',
          selection: 'selection:bg-orange-500/30',
          glow: 'shadow-[0_0_50px_rgba(251,146,60,0.3)]'
        };
      default: // pro-dark
        return {
          bg: 'bg-gradient-to-br from-gray-950 via-gray-900 to-black',
          terminalBg: 'bg-gray-950/95',
          text: 'text-gray-300',
          border: 'border-gray-700',
          accent: 'text-blue-400',
          headerBg: 'bg-gradient-to-r from-gray-900 to-gray-800',
          scrollbar: 'scrollbar-dark',
          selection: 'selection:bg-blue-500/20',
          glow: ''
        };
    }
  };

  const theme = getThemeConfig();

  // Get font size classes
  const getFontSize = () => {
    switch (fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-base';
      default: return 'text-sm';
    }
  };

  // Handle layout mode change with automatic agent selection
  const handleLayoutModeChange = (mode: LayoutMode) => {
    setLayoutMode(mode);
    
    // Automatically adjust selected agents based on layout mode
    switch (mode) {
      case 'fullscreen':
      case 'focus':
        // Keep only the first selected agent
        if (selectedAgents.length > 0) {
          setSelectedAgents([selectedAgents[0]]);
        } else {
          setSelectedAgents([0]);
        }
        break;
      case 'split-horizontal':
      case 'split-vertical':
        // Select first 2 agents
        setSelectedAgents(agents.slice(0, Math.min(2, agents.length)).map((_, idx) => idx));
        break;
      case 'grid':
        // Select first 4 agents (or all if less than 4)
        setSelectedAgents(agents.slice(0, Math.min(4, agents.length)).map((_, idx) => idx));
        break;
    }
  };

  // Handle agent selection based on layout mode
  const handleAgentSelect = (agentId: number) => {
    if (layoutMode === 'focus' || layoutMode === 'fullscreen') {
      setSelectedAgents([agentId]);
    } else if (layoutMode === 'split-horizontal' || layoutMode === 'split-vertical') {
      if (selectedAgents.includes(agentId)) {
        setSelectedAgents(selectedAgents.filter(id => id !== agentId));
      } else if (selectedAgents.length < 2) {
        setSelectedAgents([...selectedAgents, agentId]);
      } else {
        setSelectedAgents([selectedAgents[1], agentId]);
      }
    } else if (layoutMode === 'grid') {
      if (selectedAgents.includes(agentId)) {
        setSelectedAgents(selectedAgents.filter(id => id !== agentId));
      } else if (selectedAgents.length < 4) {
        setSelectedAgents([...selectedAgents, agentId]);
      } else {
        setSelectedAgents([...selectedAgents.slice(1), agentId]);
      }
    }
    onAgentSelect?.(agentId);
  };

  // Parse log level from output line
  const getLogLevel = (line: string): 'info' | 'warning' | 'error' | 'success' => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) return 'error';
    if (lower.includes('warn') || lower.includes('caution')) return 'warning';
    if (lower.includes('success') || lower.includes('complete') || lower.includes('done')) return 'success';
    return 'info';
  };

  // Get color for log level
  const getLogColor = (level: 'info' | 'warning' | 'error' | 'success') => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      case 'success': return 'text-emerald-400';
      default: return theme.text;
    }
  };

  // Filter output based on search and filter level
  const filterOutput = (output: string[]) => {
    return output.filter(line => {
      if (filterLevel !== 'all') {
        const level = getLogLevel(line);
        if (filterLevel !== level && !(filterLevel === 'error' && level === 'error')) return false;
      }
      if (searchTerm && !line.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  // Copy terminal output
  const copyOutput = async (agentId: number) => {
    const agent = agents[agentId];
    if (agent) {
      const text = agent.output.join('\n');
      await navigator.clipboard.writeText(text);
    }
  };

  // Download terminal output
  const downloadOutput = (agentId: number) => {
    const agent = agents[agentId];
    if (agent) {
      const text = agent.output.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${agent.name}-output-${Date.now()}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll) {
      Object.keys(terminalRefs.current).forEach(key => {
        const ref = terminalRefs.current[Number(key)];
        if (ref) {
          ref.scrollTop = ref.scrollHeight;
        }
      });
    }
  }, [agents, autoScroll]);

  // Render terminal for a single agent
  const renderTerminal = (agent: Agent, isFullWidth: boolean = true) => {
    // Use WebSocket output if available, fallback to agent.output
    const agentOutput = agentOutputs[agent.id] || agentOutputs[agents.indexOf(agent)] || agent.output || [];
    const filteredOutput = filterOutput(agentOutput);
    
    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex flex-col h-full overflow-hidden rounded-xl',
          theme.terminalBg,
          theme.border,
          'border',
          theme.glow,
          !isFullWidth && 'min-w-0'
        )}
      >
        {/* Terminal Header */}
        <div className={cn(
          'px-4 py-3 flex items-center justify-between',
          theme.headerBg,
          'border-b',
          theme.border,
          'backdrop-blur-sm'
        )}>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors cursor-pointer" />
            </div>
            <div className="flex items-center gap-2">
              <TerminalIcon className={cn('w-4 h-4', theme.accent)} />
              <span className={cn('font-medium', theme.text)}>{agent.name}</span>
              <div className={cn(
                'px-2 py-0.5 rounded-full text-xs',
                agent.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                agent.status === 'error' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              )}>
                {agent.status}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content="Copy output">
              <button
                onClick={() => copyOutput(agent.id)}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  'hover:bg-white/10',
                  theme.text
                )}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Download log">
              <button
                onClick={() => downloadOutput(agent.id)}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  'hover:bg-white/10',
                  theme.text
                )}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={el => terminalRefs.current[agent.id] = el}
          className={cn(
            'flex-1 overflow-y-auto p-4 font-mono',
            getFontSize(),
            theme.text,
            theme.selection,
            wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
          )}
          style={{
            minHeight: 0,
            scrollbarWidth: 'thin',
            scrollbarColor: terminalTheme === 'pro-light'
              ? 'rgb(209 213 219) rgb(243 244 246)'
              : 'rgb(55 65 81) rgb(17 24 39)'
          }}
          // SCROLL FIX: Track user scroll to prevent auto-scroll when reading
          onScroll={(e) => {
            const el = e.currentTarget;
            const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;

            if (!isAtBottom) {
              // User scrolled up, mark as user-scrolled
              userScrolledRef.current[agent.id] = true;
              // Clear existing timeout
              if (scrollTimeoutRef.current[agent.id]) {
                clearTimeout(scrollTimeoutRef.current[agent.id]!);
              }
              // Reset user scroll flag after 3 seconds of inactivity
              scrollTimeoutRef.current[agent.id] = setTimeout(() => {
                userScrolledRef.current[agent.id] = false;
              }, 3000);
            } else {
              // User is at bottom, reset flag
              userScrolledRef.current[agent.id] = false;
            }
          }}
        >
          {filteredOutput.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Activity className={cn('w-8 h-8 mx-auto mb-3', theme.accent, 'animate-pulse')} />
                <p className={cn('text-sm', theme.text, 'opacity-60')}>
                  Waiting for output...
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* PERFORMANCE FIX: Removed AnimatePresence mode="popLayout" which causes layout thrashing
                  with large outputs. Using simple CSS transitions for better performance */}
              {filteredOutput.map((line, idx) => {
                const level = getLogLevel(line);
                return (
                  <div
                    key={`${agent.id}-${idx}`}
                    className={cn(
                      'flex items-start gap-3 group hover:bg-white/5 px-2 -mx-2 rounded transition-colors',
                      getLogColor(level)
                    )}
                    style={{ contain: 'layout paint' }} // CSS containment for performance
                  >
                    {showLineNumbers && (
                      <span className="text-gray-600 dark:text-gray-500 select-none min-w-[3ch] text-right">
                        {idx + 1}
                      </span>
                    )}
                    <ChevronRight className="w-3 h-3 mt-0.5 text-gray-600 dark:text-gray-500 flex-shrink-0" />
                    <span className="flex-1 break-all">{line}</span>
                    {showTimestamps && (
                      <span className="text-gray-600 dark:text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date().toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Terminal Status Bar */}
        {agent.metrics && (
          <div className={cn(
            'px-4 py-2 flex items-center justify-between text-xs',
            'border-t',
            theme.border,
            theme.headerBg,
            'backdrop-blur-sm'
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-blue-400" />
                <span className={theme.text}>{agent.metrics.cpu.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-purple-400" />
                <span className={theme.text}>{agent.metrics.memory.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span className={theme.text}>{agent.metrics.avgResponseTime}ms</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span className={theme.text}>{agent.metrics.successRate.toFixed(0)}% success</span>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  // Render layout based on mode
  const renderLayout = () => {
    const visibleAgents = selectedAgents.map(id => agents[id]).filter(Boolean);
    
    switch (layoutMode) {
      case 'split-horizontal':
        return (
          <div className="flex gap-4 h-full">
            {visibleAgents.slice(0, 2).map(agent => (
              <div key={agent.id} className="flex-1 min-w-0">
                {renderTerminal(agent, false)}
              </div>
            ))}
          </div>
        );
      
      case 'split-vertical':
        return (
          <div className="flex flex-col gap-4 h-full">
            {visibleAgents.slice(0, 2).map(agent => (
              <div key={agent.id} className="flex-1 min-h-0">
                {renderTerminal(agent)}
              </div>
            ))}
          </div>
        );
      
      case 'grid':
        return (
          <div className="grid grid-cols-2 gap-4 h-full">
            {visibleAgents.slice(0, 4).map(agent => (
              <div key={agent.id} className="min-h-0">
                {renderTerminal(agent, false)}
              </div>
            ))}
          </div>
        );
      
      case 'focus':
      case 'fullscreen':
      default:
        return visibleAgents[0] ? renderTerminal(visibleAgents[0]) : null;
    }
  };

  return (
    <div className={cn(
      'flex flex-col h-full',
      theme.bg,
      className
    )}>
      {/* Professional Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'px-6 py-4 backdrop-blur-xl',
          'bg-white/70 dark:bg-gray-900/70',
          'border-b border-gray-200/50 dark:border-gray-700/50',
          'flex items-center justify-between flex-wrap gap-4',
          'min-h-[80px]' // Ensure minimum height to prevent cut-off
        )}
      >
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {/* Tab Switcher */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('terminal')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
                viewMode === 'terminal'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <Monitor className="w-4 h-4" />
              Terminal
            </button>
            <button
              onClick={() => setViewMode('harvest')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
                viewMode === 'harvest'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
              Harvest
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
              {viewMode === 'terminal' ? (
                <TerminalIcon className="w-5 h-5 text-white" />
              ) : (
                <LayoutDashboard className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {viewMode === 'terminal' ? 'Terminal Console' : 'Harvest Dashboard'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {agents.length} agents • {farmStatus}
              </p>
            </div>
          </div>

          {/* Agent Pills - Only show in terminal view */}
          {viewMode === 'terminal' && (
            <div className="flex items-center gap-2">
              {agents.map((agent, index) => (
              <button
                key={agent.id}
                onClick={() => handleAgentSelect(agent.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all group',
                  selectedAgents.includes(agent.id)
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
                title={`${agent.name} (⌘${index + 1})`}
              >
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    agent.status === 'active' ? 'bg-emerald-400' :
                    agent.status === 'error' ? 'bg-red-400' :
                    'bg-gray-400'
                  )} />
                  {agent.name}
                  {/* Keyboard shortcut hint - visible on hover */}
                  {index < 9 && (
                    <span className={cn(
                      'ml-1 px-1 py-0.5 text-[10px] font-mono rounded',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      selectedAgents.includes(agent.id)
                        ? 'bg-white/20'
                        : 'bg-gray-300 dark:bg-gray-600'
                    )}>
                      ⌘{index + 1}
                    </span>
                  )}
                </div>
              </button>
            ))}
            </div>
          )}
        </div>

        {/* Center Section - Search (Terminal view only) */}
        {viewMode === 'terminal' && (
          <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className={cn(
                'pl-10 pr-4 py-2 rounded-lg',
                'bg-gray-100 dark:bg-gray-800',
                'text-gray-900 dark:text-white',
                'placeholder-gray-500',
                'border border-gray-200 dark:border-gray-700',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                'transition-all w-64'
              )}
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as any)}
            className={cn(
              'px-3 py-2 rounded-lg',
              'bg-gray-100 dark:bg-gray-800',
              'text-gray-900 dark:text-white',
              'border border-gray-200 dark:border-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              'transition-all'
            )}
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warning">Warnings</option>
            <option value="error">Errors</option>
          </select>
          </div>
        )}

        {/* Right Section - Controls */}
        <div className="flex items-center gap-2">
          {/* Layout Mode Selector - Terminal view only */}
          {viewMode === 'terminal' && (
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <Tooltip content="Fullscreen">
              <button
                onClick={() => handleLayoutModeChange('fullscreen')}
                className={cn(
                  'p-1.5 rounded transition-all',
                  layoutMode === 'fullscreen'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Square className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Split Horizontal">
              <button
                onClick={() => handleLayoutModeChange('split-horizontal')}
                className={cn(
                  'p-1.5 rounded transition-all',
                  layoutMode === 'split-horizontal'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Columns className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Split Vertical">
              <button
                onClick={() => handleLayoutModeChange('split-vertical')}
                className={cn(
                  'p-1.5 rounded transition-all',
                  layoutMode === 'split-vertical'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <PanelLeft className="w-4 h-4 rotate-90" />
              </button>
            </Tooltip>
            <Tooltip content="Grid View">
              <button
                onClick={() => handleLayoutModeChange('grid')}
                className={cn(
                  'p-1.5 rounded transition-all',
                  layoutMode === 'grid'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
          )}

          {/* Theme Selector - Terminal view only */}
          {viewMode === 'terminal' && (
          <select
            value={terminalTheme}
            onChange={(e) => setTerminalTheme(e.target.value as TerminalTheme)}
            className={cn(
              'px-3 py-2 rounded-lg',
              'bg-gray-100 dark:bg-gray-800',
              'text-gray-900 dark:text-white text-sm',
              'border border-gray-200 dark:border-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              'transition-all'
            )}
          >
            <option value="pro-dark">Pro Dark</option>
            <option value="pro-light">Pro Light</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="ocean">Ocean</option>
            <option value="forest">Forest</option>
            <option value="sunset">Sunset</option>
          </select>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <Tooltip content="Auto-scroll">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  autoScroll
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                <Activity className="w-4 h-4" />
              </button>
            </Tooltip>
            {viewMode === 'terminal' && (
              <Tooltip content="Settings">
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    'bg-gray-100 dark:bg-gray-800',
                    'text-gray-600 dark:text-gray-400',
                    'hover:bg-gray-200 dark:hover:bg-gray-700'
                  )}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </motion.div>

      {/* Settings Panel - Terminal view only */}
      <AnimatePresence>
        {isSettingsOpen && viewMode === 'terminal' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'px-6 py-4',
              'bg-gray-50 dark:bg-gray-900/50',
              'border-b border-gray-200/50 dark:border-gray-700/50'
            )}
          >
            <div className="flex items-center gap-6 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showLineNumbers}
                  onChange={(e) => setShowLineNumbers(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700 dark:text-gray-300">Line Numbers</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700 dark:text-gray-300">Timestamps</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={wordWrap}
                  onChange={(e) => setWordWrap(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700 dark:text-gray-300">Word Wrap</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">Font Size:</span>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value as any)}
                  className="px-2 py-1 rounded text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      {viewMode === 'terminal' ? (
        <div className="flex-1 p-6 min-h-0">
          {renderLayout()}
        </div>
      ) : (
        <HarvestDashboardView
          farmId={farmId || ''}
          farmName={farmName}
          harvest={harvest}
          agents={agents}
          onClose={onClose}
        />
      )}

      {/* Status Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'px-6 py-3',
          'bg-white/70 dark:bg-gray-900/70',
          'border-t border-gray-200/50 dark:border-gray-700/50',
          'backdrop-blur-xl'
        )}
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-emerald-500' : 'bg-red-500'
              )} />
              <span className="text-gray-600 dark:text-gray-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <span className="text-gray-500">
              {agents.reduce((acc, agent) => acc + agent.output.length, 0)} total lines
            </span>
            <span className="text-gray-500">
              Layout: {layoutMode}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-500">
              Theme: {terminalTheme}
            </span>
            <span className="text-gray-500">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Export wrapped version with error boundary for safety
import { EnhancedTerminalErrorBoundary } from './EnhancedTerminalErrorBoundary';

export const CentralTerminalViewWithErrorBoundary: React.FC<CentralTerminalViewProps> = (props) => {
  return (
    <EnhancedTerminalErrorBoundary
      terminalId={props.farmId}
      agentName={props.farmName}
      onError={(error, errorInfo) => {
        console.error('[CentralTerminalView] Error caught by boundary:', {
          error: error.message,
          farmId: props.farmId,
          farmName: props.farmName,
          componentStack: errorInfo.componentStack?.slice(0, 500)
        });
      }}
    >
      <CentralTerminalView {...props} />
    </EnhancedTerminalErrorBoundary>
  );
};