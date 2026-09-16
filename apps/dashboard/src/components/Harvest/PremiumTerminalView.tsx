/**
 * PremiumTerminalView - Apple-inspired professional terminal monitoring
 *
 * Features:
 * - Glass morphism design with MaiFarm theming
 * - Real-time agent activity monitoring with heartbeat indicators
 * - Advanced terminal output with syntax highlighting
 * - Multi-agent split view with configurable layouts
 * - Professional status bars and metrics
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  Terminal as TerminalIcon,
  Activity,
  Cpu,
  Database,
  Zap,
  Copy,
  Download,
  Search,
  Filter,
  Grid3x3,
  Columns,
  Square,
  Maximize2,
  Settings,
  Eye,
  EyeOff,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Bot,
  Layers
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useWebSocket } from '@/hooks/useWebSocket';
import { premiumClasses } from '@/styles/premium-design-system';

// ============================================================================
// Types & Interfaces
// ============================================================================

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
  lastActivity?: number;
  heartbeat?: boolean;
}

interface PremiumTerminalViewProps {
  farmId: string;
  sessionName: string;
  farmName: string;
  agents: Agent[];
  className?: string;
  onAgentSelect?: (agentId: number) => void;
  onClose?: () => void;
}

type LayoutMode = 'fullscreen' | 'split-horizontal' | 'split-vertical' | 'grid';

interface TerminalTheme {
  name: string;
  bg: string;
  terminalBg: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentGlow: string;
  headerBg: string;
  statusBar: string;
}

// ============================================================================
// Theme Configurations
// ============================================================================

const DEFAULT_THEME: TerminalTheme = {
  name: 'MaiFarm Pro',
  bg: 'from-emerald-950 via-gray-950 to-gray-900',
  terminalBg: 'bg-gray-950/95',
  text: 'text-emerald-100',
  textMuted: 'text-emerald-300/60',
  border: 'border-emerald-500/20',
  accent: 'text-emerald-400',
  accentGlow: 'shadow-emerald-500/20',
  headerBg: 'bg-gradient-to-r from-emerald-900/50 to-gray-900/50',
  statusBar: 'bg-emerald-950/80',
};

const themes: Record<string, TerminalTheme> = {
  maifarm: DEFAULT_THEME,
  midnight: {
    name: 'Midnight',
    bg: 'from-slate-950 via-slate-900 to-gray-900',
    terminalBg: 'bg-slate-950/95',
    text: 'text-slate-100',
    textMuted: 'text-slate-400',
    border: 'border-slate-700/50',
    accent: 'text-blue-400',
    accentGlow: 'shadow-blue-500/20',
    headerBg: 'bg-gradient-to-r from-slate-900/50 to-gray-900/50',
    statusBar: 'bg-slate-950/80',
  },
  sunset: {
    name: 'Sunset',
    bg: 'from-orange-950 via-rose-950 to-gray-900',
    terminalBg: 'bg-gray-950/95',
    text: 'text-orange-100',
    textMuted: 'text-orange-300/60',
    border: 'border-orange-500/20',
    accent: 'text-orange-400',
    accentGlow: 'shadow-orange-500/20',
    headerBg: 'bg-gradient-to-r from-orange-900/50 to-rose-900/50',
    statusBar: 'bg-orange-950/80',
  },
  ocean: {
    name: 'Ocean',
    bg: 'from-cyan-950 via-blue-950 to-gray-900',
    terminalBg: 'bg-gray-950/95',
    text: 'text-cyan-100',
    textMuted: 'text-cyan-300/60',
    border: 'border-cyan-500/20',
    accent: 'text-cyan-400',
    accentGlow: 'shadow-cyan-500/20',
    headerBg: 'bg-gradient-to-r from-cyan-900/50 to-blue-900/50',
    statusBar: 'bg-cyan-950/80',
  },
};

// ============================================================================
// Component
// ============================================================================

export const PremiumTerminalView: React.FC<PremiumTerminalViewProps> = ({
  farmId,
  sessionName,
  farmName,
  agents,
  className,
  onAgentSelect,
  onClose,
}) => {
  // State
  const [selectedAgents, setSelectedAgents] = useState<number[]>(() =>
    agents.length > 1 ? agents.slice(0, Math.min(4, agents.length)).map((_, i) => i) : [0]
  );
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(agents.length > 1 ? 'grid' : 'fullscreen');
  const [currentTheme, setCurrentTheme] = useState<string>('maifarm');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [showSettings, setShowSettings] = useState(false);
  const [agentOutputs, setAgentOutputs] = useState<Record<number, string[]>>({});
  const [agentHeartbeats, setAgentHeartbeats] = useState<Record<number, number>>({});

  // Refs
  const terminalRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // WebSocket
  const { socket, isConnected } = useWebSocket();

  // Get current theme configuration - using DEFAULT_THEME as fallback
  const theme: TerminalTheme = themes[currentTheme] ?? DEFAULT_THEME;

  // ============================================================================
  // WebSocket Effects
  // ============================================================================

  useEffect(() => {
    if (!socket || !isConnected || !sessionName || !farmId) return;

    // Join terminal session
    socket.emit('terminal:join_session', { sessionId: sessionName, farmId });

    // Request cached messages
    setTimeout(() => {
      socket.emit('terminal:request_cached', { sessionId: sessionName, farmId });
    }, 100);

    const handleTerminalOutput = (data: any) => {
      const agentIndex = data.agentId ?? data.agentIndex ?? 0;

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
        setAgentOutputs(prev => ({
          ...prev,
          [agentIndex]: [...(prev[agentIndex] || []), ...newLines].slice(-1000) // Keep last 1000 lines
        }));

        // Update heartbeat
        setAgentHeartbeats(prev => ({
          ...prev,
          [agentIndex]: Date.now()
        }));

        // Auto-scroll
        if (autoScroll && terminalRefs.current[agentIndex]) {
          setTimeout(() => {
            terminalRefs.current[agentIndex]?.scrollTo({
              top: terminalRefs.current[agentIndex]!.scrollHeight,
              behavior: 'smooth'
            });
          }, 50);
        }
      }
    };

    const handleTerminalJoined = (data: any) => {
      if (data.cachedOutputs) {
        for (const output of data.cachedOutputs) {
          handleTerminalOutput(output);
        }
      }
    };

    socket.on('terminal:output', handleTerminalOutput);
    socket.on('terminal:joined', handleTerminalJoined);

    return () => {
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:joined', handleTerminalJoined);
      socket.emit('terminal:leave_session', { sessionId: sessionName, farmId });
    };
  }, [socket, isConnected, sessionName, farmId, autoScroll]);

  // Heartbeat animation check
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentHeartbeats(prev => ({ ...prev })); // Trigger re-render for heartbeat animations
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleLayoutChange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    switch (mode) {
      case 'fullscreen':
        setSelectedAgents([selectedAgents[0] ?? 0]);
        break;
      case 'split-horizontal':
      case 'split-vertical':
        setSelectedAgents(agents.slice(0, Math.min(2, agents.length)).map((_, i) => i));
        break;
      case 'grid':
        setSelectedAgents(agents.slice(0, Math.min(4, agents.length)).map((_, i) => i));
        break;
    }
  }, [agents.length, selectedAgents]);

  const handleAgentSelect = useCallback((agentId: number) => {
    if (layoutMode === 'fullscreen') {
      setSelectedAgents([agentId]);
    } else if (layoutMode === 'split-horizontal' || layoutMode === 'split-vertical') {
      if (selectedAgents.includes(agentId)) {
        if (selectedAgents.length > 1) {
          setSelectedAgents(selectedAgents.filter(id => id !== agentId));
        }
      } else if (selectedAgents.length < 2) {
        setSelectedAgents([...selectedAgents, agentId]);
      } else {
        const lastAgent = selectedAgents[1];
        setSelectedAgents([lastAgent !== undefined ? lastAgent : agentId, agentId]);
      }
    } else {
      if (selectedAgents.includes(agentId)) {
        if (selectedAgents.length > 1) {
          setSelectedAgents(selectedAgents.filter(id => id !== agentId));
        }
      } else if (selectedAgents.length < 4) {
        setSelectedAgents([...selectedAgents, agentId]);
      } else {
        setSelectedAgents([...selectedAgents.slice(1), agentId]);
      }
    }
    onAgentSelect?.(agentId);
  }, [layoutMode, selectedAgents, onAgentSelect]);

  const copyOutput = useCallback(async (agentId: number) => {
    const output = agentOutputs[agentId] || agents[agentId]?.output || [];
    await navigator.clipboard.writeText(output.join('\n'));
  }, [agentOutputs, agents]);

  const downloadOutput = useCallback((agentId: number) => {
    const output = agentOutputs[agentId] || agents[agentId]?.output || [];
    const blob = new Blob([output.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${agentId + 1}-output-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [agentOutputs, agents]);

  // ============================================================================
  // Helpers
  // ============================================================================

  const getLogLevel = (line: string): 'info' | 'warning' | 'error' | 'success' => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) return 'error';
    if (lower.includes('warn') || lower.includes('caution')) return 'warning';
    if (lower.includes('success') || lower.includes('complete') || lower.includes('done')) return 'success';
    return 'info';
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      case 'success': return 'text-emerald-400';
      default: return theme.text;
    }
  };

  const filterOutput = (output: string[]) => {
    return output.filter(line => {
      if (filterLevel !== 'all') {
        const level = getLogLevel(line);
        if (filterLevel !== level) return false;
      }
      if (searchTerm && !line.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-base';
      default: return 'text-sm';
    }
  };

  const isAgentActive = (agentId: number) => {
    const lastHeartbeat = agentHeartbeats[agentId] || 0;
    return Date.now() - lastHeartbeat < 5000; // Active within last 5 seconds
  };

  // ============================================================================
  // Render Terminal Pane
  // ============================================================================

  const renderTerminal = (agent: Agent, isCompact: boolean = false) => {
    const output = agentOutputs[agent.id] || agent.output || [];
    const filteredOutput = filterOutput(output);
    const isActive = isAgentActive(agent.id);

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex flex-col h-full overflow-hidden',
          'rounded-2xl border',
          theme.terminalBg,
          theme.border,
          `shadow-lg ${theme.accentGlow}`,
          'backdrop-blur-xl'
        )}
      >
        {/* Terminal Header */}
        <div className={cn(
          'px-4 py-3 flex items-center justify-between',
          theme.headerBg,
          'border-b',
          theme.border,
          'backdrop-blur-xl'
        )}>
          <div className="flex items-center gap-3">
            {/* Traffic Lights */}
            <div className="flex gap-1.5">
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors shadow-sm shadow-red-500/30"
              />
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 cursor-pointer transition-colors shadow-sm shadow-amber-500/30"
              />
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 cursor-pointer transition-colors shadow-sm shadow-emerald-500/30"
              />
            </div>

            {/* Agent Info */}
            <div className="flex items-center gap-2">
              <div className={cn(
                'p-1.5 rounded-lg',
                'bg-gradient-to-br',
                agent.status === 'active' || agent.status === 'processing'
                  ? 'from-emerald-500/20 to-emerald-600/10'
                  : agent.status === 'error'
                  ? 'from-red-500/20 to-red-600/10'
                  : 'from-gray-500/20 to-gray-600/10'
              )}>
                <Bot className={cn(
                  'w-4 h-4',
                  agent.status === 'active' || agent.status === 'processing'
                    ? 'text-emerald-400'
                    : agent.status === 'error'
                    ? 'text-red-400'
                    : 'text-gray-400'
                )} />
              </div>
              <div>
                <span className={cn('font-medium text-sm', theme.text)}>{agent.name}</span>
                <div className="flex items-center gap-2">
                  {/* Status Badge */}
                  <span className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded-md',
                    agent.status === 'active' || agent.status === 'processing'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : agent.status === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : agent.status === 'completed'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-500/20 text-gray-400'
                  )}>
                    {agent.status}
                  </span>
                  {/* Heartbeat Indicator */}
                  {isActive && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => copyOutput(agent.id)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                'hover:bg-white/10',
                theme.textMuted
              )}
              title="Copy output"
            >
              <Copy className="w-3.5 h-3.5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => downloadOutput(agent.id)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                'hover:bg-white/10',
                theme.textMuted
              )}
              title="Download log"
            >
              <Download className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={el => terminalRefs.current[agent.id] = el}
          className={cn(
            'flex-1 overflow-y-auto p-4 font-mono',
            getFontSizeClass(),
            theme.text,
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20'
          )}
          style={{ minHeight: 0 }}
        >
          {filteredOutput.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className={cn('mb-4', theme.accent)}
              >
                <Activity className="w-8 h-8" />
              </motion.div>
              <p className={cn('text-sm', theme.textMuted)}>Waiting for output...</p>
              <p className={cn('text-xs mt-1', theme.textMuted, 'opacity-60')}>
                Terminal stream will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-px">
              <AnimatePresence mode="popLayout">
                {filteredOutput.map((line, idx) => {
                  const level = getLogLevel(line);
                  return (
                    <motion.div
                      key={`${agent.id}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className={cn(
                        'flex items-start gap-2 group',
                        'hover:bg-white/5 px-2 -mx-2 py-0.5 rounded',
                        'transition-colors',
                        getLogColor(level)
                      )}
                    >
                      {showLineNumbers && (
                        <span className="text-gray-600 select-none min-w-[3ch] text-right font-mono text-xs">
                          {idx + 1}
                        </span>
                      )}
                      <ChevronRight className="w-3 h-3 mt-0.5 text-gray-600 flex-shrink-0 opacity-40" />
                      <span className="flex-1 break-all whitespace-pre-wrap">{line}</span>
                      {showTimestamps && (
                        <span className="text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          {new Date().toLocaleTimeString()}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Terminal Status Bar */}
        {agent.metrics && !isCompact && (
          <div className={cn(
            'px-4 py-2 flex items-center justify-between text-xs',
            'border-t',
            theme.border,
            theme.statusBar,
            'backdrop-blur-xl'
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-blue-400" />
                <span className={theme.textMuted}>{agent.metrics.cpu.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-purple-400" />
                <span className={theme.textMuted}>{agent.metrics.memory.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span className={theme.textMuted}>{agent.metrics.avgResponseTime}ms</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span className={theme.textMuted}>{agent.metrics.successRate.toFixed(0)}% success</span>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  // ============================================================================
  // Render Layout
  // ============================================================================

  const renderLayout = () => {
    const visibleAgents = selectedAgents
      .map(id => agents[id])
      .filter((agent): agent is Agent => agent !== undefined);

    switch (layoutMode) {
      case 'split-horizontal':
        return (
          <div className="flex gap-4 h-full">
            {visibleAgents.slice(0, 2).map(agent => (
              <div key={agent.id} className="flex-1 min-w-0">
                {renderTerminal(agent)}
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
          <div className="grid grid-cols-2 gap-4 h-full auto-rows-fr">
            {visibleAgents.slice(0, 4).map(agent => (
              <div key={agent.id} className="min-h-0">
                {renderTerminal(agent, true)}
              </div>
            ))}
          </div>
        );
      default:
        return visibleAgents[0] ? renderTerminal(visibleAgents[0]) : null;
    }
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className={cn(
      'flex flex-col h-full min-h-screen',
      `bg-gradient-to-br ${theme.bg}`,
      className
    )}>
      {/* Premium Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'px-6 py-4',
          'backdrop-blur-2xl bg-black/30',
          'border-b border-white/10',
          'flex items-center justify-between flex-wrap gap-4'
        )}
      >
        {/* Left Section - Title & Agent Pills */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2.5 rounded-xl',
              'bg-gradient-to-br from-emerald-500 to-emerald-600',
              'shadow-lg shadow-emerald-500/25'
            )}>
              <TerminalIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Terminal Console
              </h2>
              <p className="text-xs text-white/50">
                {agents.length} agents • {farmName}
              </p>
            </div>
          </div>

          {/* Agent Pills */}
          <div className="flex items-center gap-2 ml-4">
            {agents.map(agent => (
              <motion.button
                key={agent.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleAgentSelect(agent.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'flex items-center gap-1.5',
                  selectedAgents.includes(agent.id)
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                )}
              >
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  agent.status === 'active' || agent.status === 'processing'
                    ? 'bg-emerald-400'
                    : agent.status === 'error'
                    ? 'bg-red-400'
                    : 'bg-gray-400'
                )} />
                {agent.name}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Center Section - Search */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className={cn(
                'pl-10 pr-4 py-2 rounded-xl w-64',
                'bg-white/10 text-white placeholder-white/40',
                'border border-white/10',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50',
                'transition-all'
              )}
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as any)}
            className={cn(
              'px-3 py-2 rounded-xl',
              'bg-white/10 text-white',
              'border border-white/10',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
              'transition-all appearance-none cursor-pointer'
            )}
          >
            <option value="all" className="bg-gray-900">All Levels</option>
            <option value="info" className="bg-gray-900">Info</option>
            <option value="warning" className="bg-gray-900">Warnings</option>
            <option value="error" className="bg-gray-900">Errors</option>
          </select>
        </div>

        {/* Right Section - Controls */}
        <div className="flex items-center gap-2">
          {/* Layout Mode */}
          <div className="flex items-center bg-white/10 rounded-xl p-1">
            {[
              { mode: 'fullscreen' as LayoutMode, icon: Square, tooltip: 'Fullscreen' },
              { mode: 'split-horizontal' as LayoutMode, icon: Columns, tooltip: 'Split Horizontal' },
              { mode: 'split-vertical' as LayoutMode, icon: Layers, tooltip: 'Split Vertical' },
              { mode: 'grid' as LayoutMode, icon: Grid3x3, tooltip: 'Grid' },
            ].map(({ mode, icon: Icon, tooltip }) => (
              <motion.button
                key={mode}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleLayoutChange(mode)}
                className={cn(
                  'p-1.5 rounded-lg transition-all',
                  layoutMode === mode
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                )}
                title={tooltip}
              >
                <Icon className="w-4 h-4" />
              </motion.button>
            ))}
          </div>

          {/* Theme Selector */}
          <select
            value={currentTheme}
            onChange={(e) => setCurrentTheme(e.target.value)}
            className={cn(
              'px-3 py-2 rounded-xl',
              'bg-white/10 text-white text-sm',
              'border border-white/10',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
              'transition-all appearance-none cursor-pointer'
            )}
          >
            {Object.entries(themes).map(([key, t]) => (
              <option key={key} value={key} className="bg-gray-900">{t.name}</option>
            ))}
          </select>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn(
                'p-2 rounded-xl transition-all',
                autoScroll
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-white/10 text-white/50 hover:text-white hover:bg-white/20'
              )}
              title={autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF'}
            >
              <Activity className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                'p-2 rounded-xl transition-all',
                'bg-white/10 text-white/50 hover:text-white hover:bg-white/20'
              )}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Connection Status */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl',
            isConnected ? 'bg-emerald-500/20' : 'bg-red-500/20'
          )}>
            {isConnected ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className={cn(
              'text-xs font-medium',
              isConnected ? 'text-emerald-400' : 'text-red-400'
            )}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'px-6 py-4',
              'bg-black/20',
              'border-b border-white/10'
            )}
          >
            <div className="flex items-center gap-6 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={showLineNumbers}
                  onChange={(e) => setShowLineNumbers(e.target.checked)}
                  className="rounded bg-white/10 border-white/20"
                />
                Line Numbers
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded bg-white/10 border-white/20"
                />
                Timestamps
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/70">Font Size:</span>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value as any)}
                  className="px-2 py-1 rounded text-sm bg-white/10 text-white border border-white/20"
                >
                  <option value="small" className="bg-gray-900">Small</option>
                  <option value="medium" className="bg-gray-900">Medium</option>
                  <option value="large" className="bg-gray-900">Large</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal Area */}
      <div className="flex-1 p-6 min-h-0 overflow-hidden">
        {renderLayout()}
      </div>

      {/* Status Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'px-6 py-3',
          'bg-black/30',
          'border-t border-white/10',
          'backdrop-blur-xl'
        )}
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className="text-white/50">
              {Object.values(agentOutputs).reduce((acc, out) => acc + out.length, 0)} total lines
            </span>
            <span className="text-white/50">
              Layout: {layoutMode.replace('-', ' ')}
            </span>
            <span className="text-white/50">
              Theme: {themes[currentTheme]?.name}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/50">
              Session: {sessionName}
            </span>
            <span className="text-white/50">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PremiumTerminalView;
