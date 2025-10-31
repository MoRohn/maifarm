import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal as TerminalIcon,
  Copy,
  Download,
  Search,
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
  CheckCircle,
  LayoutDashboard,
  Monitor,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Tooltip } from '../common/Tooltip';
import { HarvestDashboardView } from './HarvestDashboardView';
import { ConnectionStatusBadge } from '../common/ConnectionStatusBadge';
import { AgentActivityIndicator } from '../common/AgentActivityIndicator';

interface Agent {
  id: number;
  name: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  output: string[];
  paneId?: number;
  agentNumber?: number;
  metrics?: {
    cpu: number;
    memory: number;
    tasksCompleted: number;
    successRate: number;
    avgResponseTime: number;
  };
}

type AgentStatus = Agent['status'];
const KNOWN_AGENT_STATUSES: AgentStatus[] = [
  'initializing',
  'active',
  'processing',
  'idle',
  'error',
  'completed'
];

type ExtendedAgentStatus = AgentStatus | 'orphaned' | 'recovering' | 'offline';

interface TerminalOutputPayload {
  agentIndex?: number;
  agentId?: number | string;
  paneId?: number;
  lines?: string[];
  output?: string | string[];
  content?: string;
}

interface AgentInfoPayload {
  farmId?: string;
  agents?: Array<{
    id?: number;
    agentId?: number | string;
    paneId?: number | string;
    name?: string;
    status?: ExtendedAgentStatus;
  }>;
}

interface TerminalJoinedPayload {
  cachedOutputs?: TerminalOutputPayload[];
}

interface CentralTerminalViewProps {
  farmId?: string;
  sessionName?: string;
  agents: Agent[];
  className?: string;
  onAgentSelect?: (agentId: number) => void;
  farmName?: string;
  farmStatus?: string;
  harvest?: unknown;
  onClose?: () => void;
}

type LayoutMode = 'fullscreen' | 'split-horizontal' | 'split-vertical' | 'grid' | 'focus';
type TerminalTheme = 'pro-dark' | 'pro-light' | 'cyberpunk' | 'ocean' | 'forest' | 'sunset';

// Performance optimization constants
const MAX_TERMINAL_LINES = 1000; // Limit terminal output to prevent memory issues
const TRIM_THRESHOLD = 1200; // Start trimming when we exceed this

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
  // Default to showing all agents in grid mode if there are multiple agents (up to 12 max)
  const defaultSelectedAgents = agents.length > 0
    ? agents.slice(0, Math.min(12, agents.length)).map(agent => agent.id)
    : [];
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
  const maxRetries = 5;
  const [streamingAgents, setStreamingAgents] = useState<Record<number, { name: string; status?: ExtendedAgentStatus }>>({});
  const [agentActivity, setAgentActivity] = useState<Record<number, number>>({});

  const activeAgentIds = useMemo(() => new Set(agents.map(agent => agent.id)), [agents]);

  useEffect(() => {
    setStreamingAgents(prev => {
      let mutated = false;
      const next: typeof prev = {};

      activeAgentIds.forEach(id => {
        const info = prev[id];
        if (!info) return;
        const trimmedName = info.name?.trim() ?? '';
        if (trimmedName !== info.name) {
          mutated = true;
        }

        next[id] = trimmedName
          ? { ...info, name: trimmedName }
          : info;
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        mutated = true;
      }

      return mutated ? next : prev;
    });
  }, [activeAgentIds]);

  const agentDisplayNames = useMemo(() => {
    const uniqueNames = new Map<number, string>();
    const counts = new Map<string, number>();

    agents.forEach((agent, index) => {
      const streamingName = streamingAgents[agent.id]?.name?.trim();
      const agentName = agent.name?.trim();
      const fallbackFromNumber = typeof agent.agentNumber === 'number'
        ? `Agent ${agent.agentNumber}`
        : `Agent ${index + 1}`;

      const candidate = streamingName || agentName || fallbackFromNumber;
      const normalized = candidate.replace(/\s+/g, ' ').trim();
      const baseName = normalized || fallbackFromNumber;
      const count = counts.get(baseName) ?? 0;
      counts.set(baseName, count + 1);

      const uniqueName = count === 0
        ? baseName
        : `${baseName} (${count + 1})`;

      uniqueNames.set(agent.id, uniqueName);
    });

    return uniqueNames;
  }, [agents, streamingAgents]);

  const getAgentStatusDetails = useCallback((agent: Agent): { value: AgentStatus; label: string } => {
    const rawStatus = streamingAgents[agent.id]?.status || agent.status;

    if (rawStatus === 'orphaned' || rawStatus === 'recovering') {
      return { value: 'processing', label: 'recovering' };
    }

    if (rawStatus === 'offline') {
      return { value: 'idle', label: 'offline' };
    }

    if (rawStatus && KNOWN_AGENT_STATUSES.includes(rawStatus as AgentStatus)) {
      return { value: rawStatus as AgentStatus, label: rawStatus };
    }

    return { value: 'idle', label: rawStatus || 'idle' };
  }, [streamingAgents]);

  const getStatusIndicatorClass = useCallback((status: AgentStatus) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-400';
      case 'processing':
      case 'initializing':
        return 'bg-blue-400';
      case 'completed':
        return 'bg-emerald-400';
      case 'error':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  }, []);

  const getStatusBadgeClass = useCallback((status: AgentStatus) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'processing':
      case 'initializing':
        return 'bg-blue-500/20 text-blue-300';
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'error':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  }, []);

  const fillSelection = useCallback((current: number[], limit: number, options?: { ensureFull?: boolean }) => {
    const availableIds = agents.map(agent => agent.id);
    if (!availableIds.length) {
      return [];
    }

    const boundedLimit = Math.max(1, Math.min(limit, availableIds.length));
    const ensureFull = options?.ensureFull ?? true;
    const next: number[] = [];

    current.forEach(id => {
      if (next.length >= boundedLimit) return;
      if (availableIds.includes(id) && !next.includes(id)) {
        next.push(id);
      }
    });

    if (ensureFull) {
      for (const id of availableIds) {
        if (next.length >= boundedLimit) break;
        if (!next.includes(id)) {
          next.push(id);
        }
      }
    }

    if (!next.length) {
      next.push(availableIds[0]);
    }

    return next.slice(0, boundedLimit);
  }, [agents]);

  // Trigger terminal verification with exponential backoff retry
  useEffect(() => {
    if (!farmId || !sessionName) return;

    let retryTimer: NodeJS.Timeout;
    let isMounted = true;

    const verifyTerminalStream = async (attempt: number = 0) => {
      if (!isMounted) return;

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
          console.log('[CentralTerminalView] Terminal verification success:', data);
        } else if (attempt < maxRetries) {
          // Retry with exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
          console.log(`[CentralTerminalView] Terminal verification failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          retryTimer = setTimeout(() => verifyTerminalStream(attempt + 1), delay);
        } else {
          console.error('[CentralTerminalView] Terminal verification failed after max retries');
        }
      } catch (error) {
        console.error('[CentralTerminalView] Terminal verification error:', error);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
          retryTimer = setTimeout(() => verifyTerminalStream(attempt + 1), delay);
        }
      }
    };

    // Start verification after short delay
    const initialTimer = setTimeout(() => verifyTerminalStream(0), 500);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearTimeout(retryTimer);
    };
  }, [farmId, sessionName, agents.length]);
  
  const socketReady = socket?.connected ?? isConnected;

  // Subscribe to terminal WebSocket events
  useEffect(() => {
    console.log('[CentralTerminalView] WebSocket effect:', {
      socket: !!socket,
      isConnected: socketReady,
      sessionName,
      farmId
    });

    if (!socket || !socketReady || !sessionName || !farmId) {
      console.warn('[CentralTerminalView] Cannot join session - missing:', {
        socket: !socket,
        connected: !socketReady,
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

    // Poll for terminal output every 2 seconds as fallback
    const pollInterval = setInterval(() => {
      console.log('[CentralTerminalView] Polling for terminal output');
      socket.emit('terminal:request_output', {
        sessionId: sessionName,
        farmId,
        agentCount: agents.length
      });
    }, 2000);

    // Clean up polling on unmount
    const cleanup = () => {
      clearInterval(pollInterval);
    };

    // Handle terminal output
    const handleTerminalOutput = (data: TerminalOutputPayload) => {
      console.log('[CentralTerminalView] Received terminal output:', data);
      
      // Extract agent ID from various possible formats
      const rawAgentId = data.agentIndex ?? data.agentId ?? data.paneId;
      let agentIndex = typeof rawAgentId === 'number'
        ? rawAgentId
        : (typeof rawAgentId === 'string'
            ? parseInt(rawAgentId.replace(/[^0-9]/g, ''), 10)
            : 0);

      if (Number.isNaN(agentIndex)) {
        agentIndex = 0;
      }
      
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
      } else if (typeof data.content === 'string') {
        newLines = data.content
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean);
      }
      
      if (newLines.length > 0) {
        setAgentOutputs(prev => {
          const currentLines = prev[agentIndex] || [];
          const updatedLines = [...currentLines, ...newLines];

          // Trim old lines if we exceed the threshold
          if (updatedLines.length > TRIM_THRESHOLD) {
            return {
              ...prev,
              [agentIndex]: updatedLines.slice(-MAX_TERMINAL_LINES)
            };
          }

          return {
            ...prev,
            [agentIndex]: updatedLines
          };
        });

        const now = Date.now();
        setAgentActivity(prev => ({
          ...prev,
          [agentIndex]: now
        }));

        // Auto-scroll if enabled
        if (autoScroll && terminalRefs.current[agentIndex]) {
          setTimeout(() => {
            if (terminalRefs.current[agentIndex]) {
              terminalRefs.current[agentIndex]!.scrollTop = terminalRefs.current[agentIndex]!.scrollHeight;
            }
          }, 50);
        }
      }
    };

    // Listen for terminal output events
    socket.on('terminal:output', handleTerminalOutput);
    socket.on('harvest:terminal:output', handleTerminalOutput);
    socket.on('terminal:force_output', handleTerminalOutput); // Handle forced emissions
    
    const handleAgentInfo = (data: AgentInfoPayload) => {
      if (!data || (data.farmId && data.farmId !== farmId)) {
        return;
      }

      const updates: Record<number, { name: string; status?: ExtendedAgentStatus }> = {};
      (data.agents || []).forEach(agentInfo => {
        const rawId = agentInfo.id ?? agentInfo.agentId ?? agentInfo.paneId;
        if (rawId === undefined || rawId === null) return;

        const normalizedId = typeof rawId === 'number'
          ? rawId
          : (() => {
              const numeric = parseInt(String(rawId).replace(/[^0-9]/g, ''), 10);
              return Number.isNaN(numeric) ? undefined : numeric;
            })();

        if (normalizedId === undefined) return;

        updates[normalizedId] = {
          name: typeof agentInfo.name === 'string' && agentInfo.name.trim() ? agentInfo.name.trim() : `Agent ${normalizedId + 1}`,
          status: agentInfo.status
        };
      });

      if (Object.keys(updates).length > 0) {
        setStreamingAgents(prev => ({ ...prev, ...updates }));
      }
    };

    socket.on('farm:agents:info', handleAgentInfo);
    socket.on('terminal:agents:info', handleAgentInfo);

    // Also listen for terminal:joined event which may include cached data
    const handleTerminalJoined = (data: TerminalJoinedPayload) => {
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
      cleanup();
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('harvest:terminal:output', handleTerminalOutput);
      socket.off('terminal:force_output', handleTerminalOutput);
      socket.off('terminal:joined', handleTerminalJoined);
      socket.off('farm:agents:info', handleAgentInfo);
      socket.off('terminal:agents:info', handleAgentInfo);
      socket.emit('terminal:leave_session', { sessionId: sessionName, farmId });
    };
  }, [socket, socketReady, sessionName, farmId, autoScroll, agents.length]);
  
  // Update selected agents when agents list changes
  const updateSelectedAgents = useCallback((ids: number[], options?: { ensureFull?: boolean }) => {
    const normalized = fillSelection(ids, ids.length || 1, {
      ensureFull: options?.ensureFull ?? true
    });

    setSelectedAgents(prev => {
      if (prev.length === normalized.length && prev.every((value, index) => value === normalized[index])) {
        return prev;
      }
      return normalized;
    });
  }, [fillSelection]);

  useEffect(() => {
    if (!agents.length) {
      updateSelectedAgents([]);
      return;
    }

    if (layoutMode === 'grid' && agents.length > 1) {
      // Support up to 12 agents in grid view
      const maxGridAgents = Math.min(12, agents.length);
      updateSelectedAgents(agents.slice(0, maxGridAgents).map(agent => agent.id));
      return;
    }

    if ((layoutMode === 'split-horizontal' || layoutMode === 'split-vertical') && agents.length > 0) {
      updateSelectedAgents(agents.slice(0, Math.min(2, agents.length)).map(agent => agent.id));
      return;
    }

    updateSelectedAgents([agents[0].id]);
  }, [agents, layoutMode, updateSelectedAgents]);

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
    setSelectedAgents(prev => {
      switch (mode) {
        case 'fullscreen':
        case 'focus':
          return fillSelection(prev.length ? [prev[0]] : [], 1);
        case 'split-horizontal':
        case 'split-vertical':
          return fillSelection(prev, 2);
        case 'grid': {
          // Support more agents in grid view - show all available agents up to 12
          const maxGridAgents = Math.min(agents.length, 12);
          return fillSelection(prev, maxGridAgents);
        }
        default:
          return fillSelection(prev, prev.length || 1);
      }
    });
  };

  // Handle agent selection based on layout mode
  const handleAgentSelect = (agentId: number) => {
    if (!agents.some(agent => agent.id === agentId)) {
      return;
    }

    setSelectedAgents(prev => {
      switch (layoutMode) {
        case 'focus':
        case 'fullscreen':
          return fillSelection([agentId], 1);
        case 'split-horizontal':
        case 'split-vertical': {
          const alreadySelected = prev.includes(agentId);
          const base = alreadySelected
            ? prev.filter(id => id !== agentId)
            : [...prev, agentId];
          return fillSelection(base, 2, { ensureFull: false });
        }
        case 'grid': {
          // Support up to 12 agents in grid view
          const limit = Math.min(12, agents.length || 12);
          let base: number[];
          if (prev.includes(agentId)) {
            base = prev.filter(id => id !== agentId);
          } else if (prev.length >= limit) {
            base = [...prev.slice(prev.length - (limit - 1)), agentId];
          } else {
            base = [...prev, agentId];
          }
          return fillSelection(base, limit, { ensureFull: false });
        }
        default: {
          const base = prev.includes(agentId) ? prev : [...prev, agentId];
          return fillSelection(base, base.length || 1, { ensureFull: false });
        }
      }
    });

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

  const getAgentDisplayName = (agent: Agent): string => {
    if (agentDisplayNames.has(agent.id)) {
      return agentDisplayNames.get(agent.id)!;
    }

    const trimmedName = agent.name?.trim();
    if (trimmedName) {
      return trimmedName;
    }

    if (typeof agent.agentNumber === 'number') {
      return `Agent ${agent.agentNumber}`;
    }

    const index = agents.findIndex(a => a.id === agent.id);
    return `Agent ${index >= 0 ? index + 1 : agent.id}`;
  };

  const getOutputKey = (agent: Agent): number => {
    if (typeof agent.paneId === 'number' && !Number.isNaN(agent.paneId)) {
      return agent.paneId;
    }
    return agent.id;
  };

  const totalLines = useMemo(() => {
    const socketLines = Object.values(agentOutputs).reduce((sum, lines) => sum + (lines?.length || 0), 0);
    if (socketLines > 0) {
      return socketLines;
    }
    return agents.reduce((acc, agent) => acc + (agent.output?.length || 0), 0);
  }, [agentOutputs, agents]);

  const latestActivityTimestamp = useMemo(() => {
    const timestamps = Object.values(agentActivity);
    if (timestamps.length === 0) {
      return undefined;
    }
    return Math.max(...timestamps);
  }, [agentActivity]);

  const latestActivityLabel = latestActivityTimestamp
    ? new Date(latestActivityTimestamp).toLocaleTimeString()
    : 'Waiting for output';

  const activeAgentCount = useMemo(() => {
    const streamingCount = Object.keys(streamingAgents).length;
    return streamingCount || agents.length;
  }, [streamingAgents, agents.length]);

  // Copy terminal output
  const copyOutput = async (agentId: number) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      const outputKey = getOutputKey(agent);
      const outputLines = agentOutputs[outputKey] || agent.output;
      const text = (outputLines || []).join('\n');
      await navigator.clipboard.writeText(text);
    }
  };

  // Download terminal output
  const downloadOutput = (agentId: number) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      const outputKey = getOutputKey(agent);
      const outputLines = agentOutputs[outputKey] || agent.output;
      const text = (outputLines || []).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getAgentDisplayName(agent)}-output-${Date.now()}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Refresh terminal connection (force rejoin and request state)
  const refreshTerminal = useCallback((agentId: number) => {
    if (socket && farmId) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        const sessionName = `farm-${farmId.substring(0, 8)}`;

        // Rejoin terminal session
        socket.emit('terminal:join_session', {
          sessionId: sessionName,
          farmId: farmId
        });

        // Request fresh terminal state
        socket.emit('terminal:request_state', {
          sessionId: sessionName,
          farmId,
          agentId: agentId
        });

        console.log(`[CentralTerminalView] Manually refreshed terminal for agent ${agentId}`);
      }
    }
  }, [socket, farmId, agents]);

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
    const outputKey = getOutputKey(agent);
    // Use WebSocket output if available, fallback to agent.output
    const agentOutput = agentOutputs[outputKey]
      || agentOutputs[agent.id]
      || agentOutputs[agents.indexOf(agent)]
      || agent.output
      || [];
    const filteredOutput = filterOutput(agentOutput);
    const displayName = getAgentDisplayName(agent);
    const { value: statusValue, label: statusLabel } = getAgentStatusDetails(agent);

    // Dynamic height based on layout mode for better space utilization
    const heightClass = layoutMode === 'grid'
      ? selectedAgents.length > 4
        ? 'max-h-[400px]' // Smaller for 5+ agents in grid
        : 'max-h-[500px]'  // Standard for 2-4 agents
      : 'max-h-[600px]';   // Full size for single/split views

    return (
      <motion.div
        key={agent.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex flex-col overflow-hidden rounded-xl h-full',
          heightClass,
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
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors cursor-pointer" />
            </div>

            {/* Enhanced Agent Activity Indicator */}
            <AgentActivityIndicator
              agentId={agent.id}
              agentName={displayName}
              status={statusValue}
              lastActivity={agentActivity[agent.id]}
              outputLineCount={filteredOutput.length}
              size="sm"
              showPulse={true}
              className="flex-1 min-w-0"
            />
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
            <Tooltip content="Refresh terminal connection">
              <button
                onClick={() => refreshTerminal(agent.id)}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  'hover:bg-white/10',
                  theme.text
                )}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={el => terminalRefs.current[agent.id] = el}
          className={cn(
            'flex-1 overflow-y-auto p-4 font-mono min-h-[150px]',
            // Dynamic max height based on grid density
            layoutMode === 'grid' && selectedAgents.length > 4
              ? 'max-h-[300px]'  // Compact for dense grids (5+ agents)
              : layoutMode === 'grid'
                ? 'max-h-[400px]'  // Standard for 2-4 agents
                : 'max-h-[500px]', // Full for single/split views
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
        >
          {filteredOutput.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Activity className={cn('w-8 h-8 mx-auto mb-3', theme.accent, isConnected ? 'animate-pulse' : 'opacity-40')} />
                <p className={cn('text-sm', theme.text, 'opacity-60')}>
                  {!isConnected ? 'Connecting to server...' : 'Waiting for output...'}
                </p>
                {!isConnected && (
                  <p className={cn('text-xs mt-2', theme.text, 'opacity-40')}>
                    WebSocket disconnected - attempting reconnection
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence mode="popLayout">
              {filteredOutput.map((line, idx) => {
                const level = getLogLevel(line);
                return (
                  <motion.div 
                    key={`${agent.id}-${idx}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'flex items-start gap-3 group hover:bg-white/5 px-2 -mx-2 rounded transition-colors',
                      getLogColor(level)
                    )}
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
                  </motion.div>
                );
              })}
              </AnimatePresence>
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
    const seen = new Set<number>();
    const visibleAgents: Agent[] = [];

    selectedAgents.forEach(id => {
      const agent = agents.find(item => item.id === id);
      if (agent && !seen.has(agent.id)) {
        seen.add(agent.id);
        visibleAgents.push(agent);
      }
    });

    if (!visibleAgents.length && agents.length > 0) {
      visibleAgents.push(agents[0]);
    }

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
      
      case 'grid': {
        // Dynamic grid layout based on agent count
        const agentCount = visibleAgents.length;
        const gridCols = agentCount <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                        agentCount <= 4 ? 'grid-cols-2' :
                        agentCount <= 6 ? 'grid-cols-2 xl:grid-cols-3' :
                        agentCount <= 9 ? 'grid-cols-2 xl:grid-cols-3' :
                        'grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

        // Limit to showing max 12 agents in grid view for performance
        const maxAgents = Math.min(12, agentCount);

        return (
          <div className={cn('grid gap-4 h-full auto-rows-fr', gridCols)}>
            {visibleAgents.slice(0, maxAgents).map(agent => (
              <div key={agent.id} className="min-h-0 flex">
                {renderTerminal(agent, false)}
              </div>
            ))}
          </div>
        );
      }
      
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

          {/* Connection Status Badge */}
          <ConnectionStatusBadge
            isConnected={socketReady}
            isConnecting={socket !== null && !socketReady}
            lastUpdate={latestActivityTimestamp}
            size="md"
            showLabel={true}
          />

          {/* Agent Pills - Only show in terminal view */}
          {viewMode === 'terminal' && agents.length <= 6 && (
            <div className="flex items-center gap-2">
              {agents.map(agent => {
                const { value: statusValue } = getAgentStatusDetails(agent);
                const outputKey = getOutputKey(agent);
                const outputLines = agentOutputs[outputKey] || agent.output || [];
                const lastActivity = agentActivity[agent.id];

                return (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentSelect(agent.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative',
                      selectedAgents.includes(agent.id)
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        getStatusIndicatorClass(statusValue)
                      )} />
                      {getAgentDisplayName(agent)}
                      {outputLines.length > 0 && (
                        <span className="text-[10px] opacity-70">
                          ({outputLines.length})
                        </span>
                      )}
                    </div>
                    {/* Activity pulse indicator */}
                    {lastActivity && Date.now() - lastActivity < 3000 && (
                      <motion.div
                        className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full"
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [1, 0.5, 1]
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity
                        }}
                      />
                    )}
                  </button>
                );
              })}
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
            onChange={(event) => {
              const value = event.target.value as 'all' | 'info' | 'warning' | 'error';
              setFilterLevel(value);
            }}
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
                  onChange={(event) => {
                    const value = event.target.value as 'small' | 'medium' | 'large';
                    setFontSize(value);
                  }}
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
              {totalLines} total lines
            </span>
            <span className="text-gray-500">
              Agents: {activeAgentCount}
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
              Last activity: {latestActivityLabel}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
