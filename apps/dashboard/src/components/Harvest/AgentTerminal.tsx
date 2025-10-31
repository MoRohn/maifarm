import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Send, Copy, Maximize2, Minimize2,
  User, Activity, ChevronUp, ChevronDown, Command, RefreshCw
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '@/hooks/useWebSocket';
import { AnsiParser } from '@/utils/ansiParser';

type AgentStatus = 'starting' | 'ready' | 'working' | 'idle' | 'error';

interface AgentTerminalProps {
  farmId: string;
  agentId: number;
  agentName?: string;
  agentUid?: string;
  status?: AgentStatus;
  className?: string;
  onCommand?: (command: string) => void;
}

type MsgType =
  | 'normal'
  | 'command'
  | 'status'
  | 'warning'
  | 'limit'
  | 'model'
  | 'rate-limit'
  | 'notice'
  | 'thinking';

interface TerminalMessage {
  content: string;
  type: MsgType;
  timestamp: string;
  isPinned?: boolean;
}

const MAX_MESSAGES = 1000;

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

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasJoinedRef = useRef(false);
  const copyToastRef = useRef<number | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  const apiUrl = useMemo(
    () => (import.meta.env.VITE_API_URL as string) || 'http://localhost:4567',
    []
  );

  const { subscribe, socket, connected } = useWebSocket({ url: apiUrl });

  // --- Force Refresh Terminal Output ---
  const forceRefreshTerminal = useCallback(async () => {
    try {
      console.log(`[AgentTerminal] Force refreshing terminal for agent ${agentId}`);

      // Call backend API to force refresh
      const response = await fetch(`${apiUrl}/api/terminal-refresh/${farmId}/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[AgentTerminal] Force refresh successful:`, data);
        lastRefreshRef.current = Date.now();
      } else {
        console.warn(`[AgentTerminal] Force refresh failed:`, response.status);
      }
    } catch (error) {
      console.error(`[AgentTerminal] Force refresh error:`, error);
    }
  }, [apiUrl, farmId, agentId]);

  // --- Session Join (guarded) ---
  const joinTerminalSession = useCallback(() => {
    if (!socket || !connected || hasJoinedRef.current) return;

    const sessionName = `farm-${farmId.substring(0, 8)}`;

    console.log(`[AgentTerminal] Joining terminal session for farm ${farmId}, agent ${agentId}`);
    console.log(`[AgentTerminal] Session name: ${sessionName}`);

    socket.emit('terminal:join_session', { sessionId: sessionName, farmId });
    socket.emit('terminal:join_agent', {
      sessionId: sessionName,
      farmId,
      agentId: Number(agentId),
      agentIndex: Number(agentId)
    });
    socket.emit('terminal:request_state', {
      sessionId: sessionName,
      farmId,
      agentId: Number(agentId)
    });

    console.log(`[AgentTerminal] Emitted join events for farm ${farmId}, agent ${agentId}`);

    hasJoinedRef.current = true;

    // Force refresh immediately after joining
    setTimeout(() => {
      forceRefreshTerminal();
    }, 1000);
  }, [socket, connected, farmId, agentId, forceRefreshTerminal]);

  useEffect(() => {
    joinTerminalSession();
    if (!connected) {
      console.log(`[AgentTerminal] Disconnected, resetting join flag for farm ${farmId}, agent ${agentId}`);
      hasJoinedRef.current = false;
    }
  }, [connected, joinTerminalSession, farmId, agentId]);

  // --- Automated Periodic Refresh ---
  useEffect(() => {
    if (!connected || !farmId || agentId === null) return;

    // Set up periodic refresh every 3 seconds
    const REFRESH_INTERVAL = 3000;

    refreshIntervalRef.current = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;

      // Only refresh if it's been at least 2 seconds since last refresh
      if (timeSinceLastRefresh >= 2000) {
        console.log(`[AgentTerminal] Auto-refreshing terminal for agent ${agentId}`);
        forceRefreshTerminal();
      }
    }, REFRESH_INTERVAL);

    console.log(`[AgentTerminal] Started auto-refresh for agent ${agentId} (every ${REFRESH_INTERVAL}ms)`);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
        console.log(`[AgentTerminal] Stopped auto-refresh for agent ${agentId}`);
      }
    };
  }, [connected, farmId, agentId, forceRefreshTerminal]);

  // --- Visibility Change Refresh (refresh when tab becomes visible) ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && connected) {
        console.log(`[AgentTerminal] Tab became visible, force refreshing agent ${agentId}`);
        forceRefreshTerminal();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connected, forceRefreshTerminal, agentId]);

  // --- Helpers ---
  const normalizeAgentId = (raw: unknown): number | null => {
    if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
    if (typeof raw === 'string') {
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  };

  const deriveType = (clean: string): { type: MsgType; pinned?: boolean } => {
    if (clean.includes('[CLAUDE LIMIT]')) return { type: 'limit', pinned: true };
    if (clean.includes('[MODEL CHANGE]')) return { type: 'model', pinned: true };
    if (clean.includes('[RATE LIMIT]')) return { type: 'rate-limit', pinned: true };
    if (clean.includes('[CLAUDE CMD]')) return { type: 'command' };
    if (clean.includes('[Status:')) return { type: 'status' };
    if (clean.includes('⚠️') || clean.includes('[Warning]')) return { type: 'warning' };
    if (clean.includes('📌') || clean.includes('[Notice]')) return { type: 'notice' };
    if (clean.includes('🤔') || /Thinking\.\.\./i.test(clean)) return { type: 'thinking' };
    if (clean.trim().startsWith('>')) return { type: 'command' };
    return { type: 'normal' };
  };

  // --- Subscriptions (terminal output / commands / status) ---
  useEffect(() => {
    const sessionName = `farm-${farmId.substring(0, 8)}`;

    const handleTerminalUpdate = (raw: any) => {
      const payload = raw?.payload ?? raw;
      const incomingId =
        normalizeAgentId(payload?.agentId) ??
        normalizeAgentId(payload?.agentIndex) ??
        normalizeAgentId(payload?.paneIndex);

      // ADD: Debug logging for all received events
      console.log('[AgentTerminal] Received terminal:output event:', {
        farmId,
        myAgentId: agentId,
        payloadFarmId: payload?.farmId,
        payloadAgentId: payload?.agentId,
        payloadAgentIndex: payload?.agentIndex,
        incomingId,
        contentLength: payload?.lines?.length || payload?.output?.length || 0,
        rawPayload: payload
      });

      if (incomingId === null || incomingId < 0) {
        console.log('[AgentTerminal] Skipping event: invalid incoming agent ID');
        return;
      }

      // match farm + agent
      const farmMatch =
        payload?.farmId === farmId || String(payload?.sessionId || '').includes(farmId);

      if (!farmMatch) {
        console.log('[AgentTerminal] Skipping event: farm ID mismatch', {
          payloadFarmId: payload?.farmId,
          myFarmId: farmId
        });
        return;
      }

      if (incomingId !== agentId) {
        console.log('[AgentTerminal] Skipping event: agent ID mismatch', {
          incomingId,
          myAgentId: agentId
        });
        return;
      }

      console.log('[AgentTerminal] Processing terminal output for agent', agentId);

      let content: string[] = [];
      if (Array.isArray(payload?.lines)) content = payload.lines as string[];
      else if (Array.isArray(payload?.output)) content = payload.output as string[];
      else if (typeof payload?.output === 'string') content = payload.output.split('\n');
      else if (typeof payload?.content === 'string') content = payload.content.split('\n');

      if (!content.length) return;

      const nowIso = new Date().toISOString();

      const newMessages: TerminalMessage[] = content
        .map((line) => {
          const cleanForDetection = AnsiParser.stripAnsi(line || '');
          const { type, pinned } = deriveType(cleanForDetection);
          const cleanContent = AnsiParser.cleanTerminalOutput(line || '');
          if (!cleanContent.trim()) return null;
          return {
            content: cleanContent,
            type,
            timestamp: nowIso,
            isPinned: pinned
          } as TerminalMessage;
        })
        .filter(Boolean) as TerminalMessage[];

      if (!newMessages.length) return;

      setPinnedMessages((prev) => {
        const merged = [...prev, ...newMessages.filter((m) => m.isPinned)];
        return merged.slice(-3);
      });

      setTerminalContent((prev) => {
        const merged = [...prev, ...newMessages];
        return merged.length > MAX_MESSAGES ? merged.slice(-MAX_MESSAGES) : merged;
      });
    };

    const handleCommandEcho = (raw: any) => {
      const payload = raw?.payload ?? raw;
      if (payload?.farmId !== farmId) return;
      if (normalizeAgentId(payload?.agentId) !== agentId) return;

      setTerminalContent((prev) => [
        ...prev,
        {
          content: `> ${payload?.command ?? ''}`,
          type: 'command',
          timestamp: new Date().toISOString()
        }
      ]);
    };

    const handleAgentStatus = (raw: any) => {
      const payload = raw?.payload ?? raw;
      if (payload?.farmId !== farmId) return;
      if (normalizeAgentId(payload?.agentId) !== agentId) return;

      setTerminalContent((prev) => [
        ...prev,
        {
          content: `[Status: ${payload?.status ?? 'unknown'}]`,
          type: 'status',
          timestamp: new Date().toISOString()
        }
      ]);
    };

    // Listen for room join confirmations
    const handleRoomsJoined = (data: any) => {
      console.log(`[AgentTerminal] Successfully joined rooms for farm ${farmId}, agent ${agentId}:`, data);
    };

    const handleTerminalJoined = (data: any) => {
      console.log(`[AgentTerminal] Terminal joined confirmation for farm ${farmId}, agent ${agentId}:`, data);
    };

    const handleAgentReady = (data: any) => {
      console.log(`[AgentTerminal] Agent ready for farm ${farmId}, agent ${agentId}:`, data);
    };

    const unsubscribeA = subscribe('agent:terminal', handleTerminalUpdate);
    const unsubscribeB = subscribe('terminal:output', handleTerminalUpdate);
    const unsubscribeC = subscribe('agent:command', handleCommandEcho);
    const unsubscribeD = subscribe('agent:status', handleAgentStatus);
    const unsubscribeE = subscribe('terminal:rooms_joined', handleRoomsJoined);
    const unsubscribeF = subscribe('terminal:joined', handleTerminalJoined);
    const unsubscribeG = subscribe('terminal:agent_ready', handleAgentReady);

    // Fetch initial history on mount
    (async () => {
      try {
        const resp = await fetch(`${apiUrl}/api/farms/${farmId}/terminal/${agentId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const lines: string[] = data?.data?.terminal ?? [];
        const nowIso = new Date().toISOString();
        setTerminalContent(
          (lines || []).map((line) => ({
            content: AnsiParser.cleanTerminalOutput(String(line || '')),
            type: 'normal',
            timestamp: nowIso
          }))
        );
      } catch {
        // non-fatal
      }
    })(); // :contentReference[oaicite:9]{index=9}

    return () => {
      unsubscribeA();
      unsubscribeB();
      unsubscribeC();
      unsubscribeD();
      unsubscribeE();
      unsubscribeF();
      unsubscribeG();
      if (socket?.connected) {
        socket.emit('terminal:leave_session', { sessionId: sessionName });
      }
      hasJoinedRef.current = false;
    };
  }, [farmId, agentId, apiUrl, subscribe, socket]);

  // --- Auto-scroll to bottom ---
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [terminalContent]);

  // --- Focus input when opened ---
  useEffect(() => {
    if (!showCommandInput) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(t);
  }, [showCommandInput]);

  // --- Command send / history nav ---
  const handleSendCommand = async () => {
    const cmd = commandInput.trim();
    if (!cmd) return;
    try {
      const resp = await fetch(`${apiUrl}/api/farms/${farmId}/terminal/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      if (resp.ok) {
        setCommandHistory((prev) => [...prev, cmd]);
        setCommandInput('');
        setHistoryIndex(-1);
        onCommand?.(cmd);
      } else {
        throw new Error('Command failed');
      }
    } catch {
      setTerminalContent((prev) => [
        ...prev,
        { content: `[Error: Failed to send command]`, type: 'warning', timestamp: new Date().toISOString() }
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendCommand();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - nextIndex] || '');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - nextIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  const copyTerminalContent = async () => {
    const text = terminalContent.map((m) => AnsiParser.stripAnsi(m.content)).join('\n');
    await navigator.clipboard.writeText(text);
    if (copyToastRef.current) window.clearTimeout(copyToastRef.current);
    // lightweight inline toast via pinned notice
    setPinnedMessages((prev) =>
      [...prev, { content: '📋 Copied terminal output', type: 'notice', timestamp: new Date().toISOString() }].slice(-3)
    );
    copyToastRef.current = window.setTimeout(() => {
      setPinnedMessages((prev) => prev.filter((m) => m.content !== '📋 Copied terminal output'));
    }, 1600);
  };

  const statusColor = (() => {
    switch (status) {
      case 'ready':
        return 'text-green-500';
      case 'working':
        return 'text-blue-500';
      case 'idle':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  })();

  const statusIcon = (() => {
    const pulse = status === 'ready' || status === 'working';
    return <Activity className={clsx('w-3 h-3', pulse && 'animate-pulse')} />;
  })();

  return (
    <motion.div
      className={clsx(
        'bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col h-full min-h-0',
        isExpanded ? 'fixed inset-4 z-50' : 'relative',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-sm font-mono text-gray-300">{agentName || `Agent ${agentId}`}</span>
            {agentUid && <span className="text-xs text-gray-500 font-mono">({agentUid.substring(0, 8)})</span>}
          </div>
          <div className={clsx('flex items-center gap-1', statusColor)}>
            {statusIcon}
            <span className="text-xs capitalize">{status}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={forceRefreshTerminal}
            className="p-1 hover:bg-gray-700 rounded transition-colors group"
            title="Refresh terminal output"
          >
            <RefreshCw className="w-4 h-4 text-gray-400 group-hover:text-blue-400 group-active:animate-spin" />
          </button>
          <button
            onClick={() => setShowCommandInput((s) => !s)}
            className={clsx(
              'p-1 rounded transition-colors flex items-center gap-1',
              showCommandInput ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'
            )}
            title={showCommandInput ? 'Hide command input' : 'Show command input'}
          >
            <Command className="w-4 h-4" />
            {showCommandInput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button onClick={copyTerminalContent} className="p-1 hover:bg-gray-700 rounded transition-colors" title="Copy">
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setIsExpanded((e) => !e)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4 text-gray-400" /> : <Maximize2 className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Pinned */}
      {pinnedMessages.length > 0 && (
        <div className="bg-gray-800 border-b border-gray-700 p-2 space-y-1">
          {pinnedMessages.map((msg, i) => (
            <div
              key={`pin-${i}`}
              className={clsx(
                'text-xs font-mono px-2 py-1 rounded',
                msg.type === 'limit' && 'bg-orange-900/50 text-orange-300',
                msg.type === 'model' && 'bg-blue-900/50 text-blue-300',
                msg.type === 'rate-limit' && 'bg-red-900/50 text-red-300',
                msg.type === 'notice' && 'bg-cyan-900/40 text-cyan-300'
              )}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        ref={terminalRef}
        className={clsx(
          'bg-black p-3 md:p-4 font-mono text-xs overflow-y-auto flex-1 min-h-0',
          isExpanded ? 'max-h-full' : 'max-h-[400px]'
        )}
        style={{
          scrollBehavior: 'smooth',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
          minHeight: isExpanded ? 'calc(100vh - 12rem)' : '200px',
          maxHeight: isExpanded ? 'calc(100vh - 8rem)' : 'clamp(250px, 40vh, 400px)',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {terminalContent.length === 0 ? (
          <div className="text-gray-600">Waiting for agent output...</div>
        ) : (
          terminalContent.map((msg, index) => {
            const cls =
              msg.type === 'command'
                ? 'text-green-400'
                : msg.type === 'status'
                ? 'text-yellow-400'
                : msg.type === 'warning'
                ? 'text-orange-400'
                : msg.type === 'limit'
                ? 'text-orange-300 font-bold'
                : msg.type === 'model'
                ? 'text-blue-300 font-bold'
                : msg.type === 'rate-limit'
                ? 'text-red-400 font-bold'
                : msg.type === 'notice'
                ? 'text-cyan-400'
                : msg.type === 'thinking'
                ? 'text-purple-400 italic'
                : 'text-gray-300';
            return (
              <div key={index} className={clsx('whitespace-pre-wrap leading-relaxed', cls, msg.isPinned && 'bg-gray-900/30')}>
                {msg.content || '\u00A0'}
              </div>
            );
          })
        )}
      </div>

      {/* Command Input */}
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
              <p className="text-xs text-gray-500 font-mono mb-2">Send commands to Agent {agentId}</p>
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-mono text-sm">$</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter command…"
                  className="flex-1 bg-gray-900 text-gray-300 font-mono text-sm outline-none placeholder-gray-600 px-2 py-1.5 rounded border border-gray-700 focus:border-blue-600 transition-colors"
                  disabled={status === 'starting' || status === 'error'}
                  aria-label="Terminal command input"
                />
                <button
                  onClick={handleSendCommand}
                  disabled={!commandInput.trim() || status === 'starting' || status === 'error'}
                  className={clsx(
                    'p-1.5 rounded transition-colors flex items-center gap-1',
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
                  <span className="font-mono">↑↓ history • {commandHistory.length} cmds</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
