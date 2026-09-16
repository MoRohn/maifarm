import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal as TerminalIcon,
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  Cpu,
  Database,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  RefreshCw,
  Play,
  Pause,
  Filter,
  Search,
  Command,
  ChevronRight,
  Grid3x3,
  Layers,
  Monitor,
  Settings,
  Moon,
  Sun,
  X
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/utils/cn';

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

interface ProfessionalTerminalProps {
  farmId?: string;
  sessionName?: string;
  agents?: Agent[];
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
}

type ViewMode = 'unified' | 'grid' | 'tabs' | 'split';
type TerminalTheme = 'professional' | 'matrix' | 'ocean' | 'midnight';

export const ProfessionalTerminal: React.FC<ProfessionalTerminalProps> = ({
  farmId,
  sessionName,
  agents: initialAgents = [],
  className,
  theme = 'dark'
}) => {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<number>(0);
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>('professional');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [debouncedConnected, setDebouncedConnected] = useState(true); // Default to connected to prevent flicker
  const [apiError, setApiError] = useState<{
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    details: string;
    timestamp: Date;
  } | null>(null);
  
  const terminalRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const { socket, isConnected } = useWebSocket();

  // Terminal theme configurations
  const getThemeStyles = () => {
    switch (terminalTheme) {
      case 'matrix':
        return {
          bg: 'bg-black',
          text: 'text-green-400',
          border: 'border-green-900/50',
          accent: 'text-green-500',
          scrollbar: 'scrollbar-matrix'
        };
      case 'ocean':
        return {
          bg: 'bg-gradient-to-br from-blue-950 to-cyan-950',
          text: 'text-cyan-300',
          border: 'border-cyan-800/50',
          accent: 'text-cyan-400',
          scrollbar: 'scrollbar-ocean'
        };
      case 'midnight':
        return {
          bg: 'bg-gradient-to-br from-gray-950 to-slate-900',
          text: 'text-blue-300',
          border: 'border-blue-900/50',
          accent: 'text-blue-400',
          scrollbar: 'scrollbar-midnight'
        };
      default: // professional
        return {
          bg: 'bg-gray-950',
          text: 'text-gray-300',
          border: 'border-gray-800',
          accent: 'text-blue-400',
          scrollbar: 'scrollbar-professional'
        };
    }
  };

  const themeStyles = getThemeStyles();

  // Memoize terminal output handler to prevent recreating on every render
  const handleTerminalOutput = useCallback((data: {
    sessionName: string;
    agentId: number;
    lines: string[];
  }) => {
    if (data.sessionName !== sessionName || isPaused) return;
    
    setAgents(prev => {
      const updated = [...prev];
      if (updated[data.agentId]) {
        updated[data.agentId] = {
          ...updated[data.agentId],
          output: [...updated[data.agentId].output, ...data.lines].slice(-1000)
        };
      }
      return updated;
    });
  }, [sessionName, isPaused]);

  // Debounce connection status to prevent UI flicker
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (isConnected && !debouncedConnected) {
      // Connected - update immediately
      setDebouncedConnected(true);
    } else if (!isConnected && debouncedConnected) {
      // Disconnected - wait before updating to prevent flicker
      timeoutId = setTimeout(() => {
        setDebouncedConnected(false);
      }, 1000); // 1 second delay
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isConnected, debouncedConnected]);

  // Handle API error events
  const handleApiError = useCallback((error: {
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    details: string;
    timestamp: Date;
  }) => {
    setApiError(error);
    
    // Auto-dismiss warnings after 10 seconds
    if (error.severity === 'warning') {
      setTimeout(() => {
        setApiError(prev => prev?.timestamp === error.timestamp ? null : prev);
      }, 10000);
    }
  }, []);

  // WebSocket event handlers with stable references
  useEffect(() => {
    if (!socket || !sessionName) return;
    
    // Only join/leave session when connection state actually changes
    if (isConnected) {
      socket.on('terminal:output', handleTerminalOutput);
      socket.on('agent:error', handleApiError);
      socket.emit('terminal:join_session', { sessionId: sessionName, farmId });
    }

    return () => {
      if (socket && isConnected) {
        socket.off('terminal:output', handleTerminalOutput);
        socket.off('agent:error', handleApiError);
        socket.emit('terminal:leave_session', { sessionId: sessionName });
      }
    };
  }, [socket, isConnected, sessionName, farmId, handleTerminalOutput, handleApiError]);

  // Auto-scroll functionality
  useEffect(() => {
    if (autoScroll && !isPaused) {
      Object.keys(terminalRefs.current).forEach(key => {
        const ref = terminalRefs.current[Number(key)];
        if (ref) {
          ref.scrollTop = ref.scrollHeight;
        }
      });
    }
  }, [agents, autoScroll, isPaused]);

  // Initialize mock agents if none provided
  useEffect(() => {
    if (agents.length === 0 && farmId) {
      // Create mock agents for demonstration
      const mockAgents: Agent[] = Array.from({ length: 3 }, (_, i) => ({
        id: i,
        name: `Agent-${String(i + 1).padStart(2, '0')}`,
        status: 'active' as const,
        output: ['Initializing...', 'Connected to orchestrator', 'Ready for tasks'],
        metrics: {
          cpu: Math.random() * 100,
          memory: Math.random() * 100,
          tasksCompleted: Math.floor(Math.random() * 50),
          successRate: 85 + Math.random() * 15,
          avgResponseTime: 500 + Math.random() * 1500
        }
      }));
      setAgents(mockAgents);
    }
  }, [farmId, agents.length]);

  const getLogLevel = (line: string): 'info' | 'warning' | 'error' | 'critical' => {
    const lowerLine = line.toLowerCase();
    // Check for critical errors first
    if (lowerLine.includes('credit balance') || 
        lowerLine.includes('critical error') ||
        lowerLine.includes('authentication failed') ||
        lowerLine.includes('❌')) return 'critical';
    if (lowerLine.includes('error') || lowerLine.includes('fail')) return 'error';
    if (lowerLine.includes('warn') || 
        lowerLine.includes('caution') || 
        lowerLine.includes('⚠️')) return 'warning';
    return 'info';
  };

  const getLogColor = (level: 'info' | 'warning' | 'error' | 'critical') => {
    switch (level) {
      case 'critical': return 'text-red-500 font-bold';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      default: return themeStyles.text;
    }
  };

  const filterOutput = (output: string[]) => {
    return output.filter(line => {
      if (filterLevel !== 'all') {
        const level = getLogLevel(line);
        if (filterLevel === 'error' && level !== 'error') return false;
        if (filterLevel === 'warning' && level !== 'warning') return false;
        if (filterLevel === 'info' && level !== 'info') return false;
      }
      
      if (searchTerm) {
        return line.toLowerCase().includes(searchTerm.toLowerCase());
      }
      
      return true;
    });
  };

  const copyToClipboard = async (agentId: number) => {
    const agent = agents[agentId];
    if (agent) {
      const text = agent.output.join('\n');
      await navigator.clipboard.writeText(text);
    }
  };

  const downloadLogs = (agentId: number) => {
    const agent = agents[agentId];
    if (agent) {
      const text = agent.output.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${agent.name}-logs.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const renderUnifiedView = () => (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div 
        ref={el => terminalRefs.current[0] = el}
        className={cn(
          'flex-1 p-6 overflow-y-auto font-mono text-sm min-h-0',
          themeStyles.bg,
          themeStyles.scrollbar
        )}
      >
        <AnimatePresence mode="popLayout">
          {agents.flatMap((agent, agentIdx) => 
            filterOutput(agent.output).map((line, lineIdx) => {
              const level = getLogLevel(line);
              return (
                <motion.div
                  key={`${agentIdx}-${lineIdx}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-4 py-1 hover:bg-white/5 px-2 -mx-2 rounded group"
                >
                  <span className="text-gray-600 dark:text-gray-500 text-xs font-medium min-w-[80px]">
                    {agent.name}
                  </span>
                  <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-500 mt-0.5" />
                  <span className={cn('flex-1', getLogColor(level))}>
                    {line}
                  </span>
                  <span className="text-gray-700 dark:text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date().toLocaleTimeString()}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderGridView = () => (
    <div className="flex-1 p-4 overflow-y-auto min-h-0">
      <div className={cn(
        'grid gap-4',
        agents.length <= 2 ? 'grid-cols-1 lg:grid-cols-2' :
        agents.length <= 4 ? 'grid-cols-2' :
        'grid-cols-2 lg:grid-cols-3'
      )}>
        {agents.map((agent, idx) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              'rounded-xl overflow-hidden flex flex-col',
              'bg-gray-900/50 backdrop-blur-sm',
              'border',
              themeStyles.border
            )}
          >
            <div className="bg-gray-900/80 px-4 py-3 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  agent.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                  agent.status === 'error' ? 'bg-red-500' :
                  'bg-gray-500'
                )} />
                <span className="text-sm font-medium text-white">{agent.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyToClipboard(idx)}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                >
                  <Copy className="w-3 h-3 text-gray-400" />
                </button>
                <button
                  onClick={() => downloadLogs(idx)}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                >
                  <Download className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
            <div 
              ref={el => terminalRefs.current[idx] = el}
              className={cn(
                'h-48 p-3 overflow-y-auto font-mono text-xs',
                themeStyles.bg,
                themeStyles.scrollbar
              )}
            >
              {filterOutput(agent.output).map((line, lineIdx) => {
                const level = getLogLevel(line);
                return (
                  <div key={lineIdx} className={cn('py-0.5', getLogColor(level))}>
                    {line}
                  </div>
                );
              })}
            </div>
            {agent.metrics && (
              <div className="bg-gray-900/80 px-4 py-2 border-t border-gray-800">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-blue-400" />
                      <span className="text-gray-400">{agent.metrics.cpu.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="w-3 h-3 text-purple-400" />
                      <span className="text-gray-400">{agent.metrics.memory.toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="text-emerald-400">{agent.metrics.successRate.toFixed(0)}% success</span>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderTabsView = () => (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="bg-gray-900/80 px-4 py-2 flex items-center gap-2 overflow-x-auto border-b border-gray-800">
        {agents.map((agent, idx) => (
          <button
            key={agent.id}
            onClick={() => setSelectedAgent(idx)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              selectedAgent === idx
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                agent.status === 'active' ? 'bg-emerald-500' :
                agent.status === 'error' ? 'bg-red-500' :
                'bg-gray-500'
              )} />
              {agent.name}
            </div>
          </button>
        ))}
      </div>
      {agents[selectedAgent] && (
        <div 
          ref={el => terminalRefs.current[selectedAgent] = el}
          className={cn(
            'flex-1 p-6 overflow-y-auto font-mono text-sm min-h-0',
            themeStyles.bg,
            themeStyles.scrollbar
          )}
        >
          {filterOutput(agents[selectedAgent].output).map((line, idx) => {
            const level = getLogLevel(line);
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.1, delay: idx * 0.01 }}
                className={cn('py-1', getLogColor(level))}
              >
                {line}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'flex flex-col rounded-2xl overflow-hidden relative h-full',
        'bg-gray-950 border border-gray-800',
        isFullscreen && 'fixed inset-4 z-30', // Further reduced to stay below harvest page header
        className
      )}
    >
      {/* API Error Banner */}
      <AnimatePresence>
        {apiError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              'px-6 py-3 flex items-center justify-between',
              apiError.severity === 'critical' ? 'bg-red-600/20 border-b border-red-600/50' :
              apiError.severity === 'warning' ? 'bg-amber-600/20 border-b border-amber-600/50' :
              'bg-blue-600/20 border-b border-blue-600/50'
            )}
          >
            <div className="flex items-center gap-3">
              <AlertCircle className={cn(
                'w-5 h-5',
                apiError.severity === 'critical' ? 'text-red-500' :
                apiError.severity === 'warning' ? 'text-amber-500' :
                'text-blue-500'
              )} />
              <div>
                <div className="font-medium text-white">{apiError.message}</div>
                <div className="text-sm text-gray-300 mt-0.5">
                  {apiError.details}
                  {(apiError.type === 'api_credits' || apiError.type === 'api_auth') && (
                    <a 
                      href="/settings?tab=ai" 
                      className="ml-2 text-blue-400 hover:text-blue-300 underline"
                    >
                      Go to Settings →
                    </a>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Professional Header - Non-sticky when embedded */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-500 rounded-lg">
                <TerminalIcon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">System Terminal</h3>
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  {agents.length} agents • {debouncedConnected ? 'Connected' : 'Disconnected'}
                  {apiError && apiError.severity === 'critical' && (
                    <span className="ml-2 text-red-400">• API Error</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search logs..."
                className="pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors w-48"
              />
            </div>

            {/* Filter Dropdown */}
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as any)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">All Logs</option>
              <option value="info">Info</option>
              <option value="warning">Warnings</option>
              <option value="error">Errors</option>
            </select>

            {/* View Mode Selector */}
            <div className="flex items-center bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('unified')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'unified' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                )}
                title="Unified View"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                )}
                title="Grid View"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('tabs')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'tabs' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                )}
                title="Tabs View"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>

            {/* Theme Selector */}
            <select
              value={terminalTheme}
              onChange={(e) => setTerminalTheme(e.target.value as TerminalTheme)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="professional">Professional</option>
              <option value="matrix">Matrix</option>
              <option value="ocean">Ocean</option>
              <option value="midnight">Midnight</option>
            </select>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  autoScroll ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                )}
                title="Auto-scroll"
              >
                <Activity className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  isPaused ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                )}
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Content */}
      {viewMode === 'unified' && renderUnifiedView()}
      {viewMode === 'grid' && renderGridView()}
      {viewMode === 'tabs' && renderTabsView()}

      {/* Status Bar */}
      <div className="bg-gray-900 px-6 py-2 border-t border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                debouncedConnected ? 'bg-emerald-500' : 'bg-red-500'
              )} />
              <span className="text-gray-400">
                {debouncedConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <span className="text-gray-500">
              {agents.reduce((acc, agent) => acc + agent.output.length, 0)} total lines
            </span>
          </div>
          <div className="flex items-center gap-4 text-gray-500">
            <span>{new Date().toLocaleTimeString()}</span>
            <span>Terminal v2.0</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};