import { useState, useEffect, useCallback, useRef } from 'react';
import { TerminalSession, TerminalAgent } from '@/types/terminal';
import { useWebSocket } from '@/hooks/useWebSocket';

interface UseTerminalSessionProps {
  farmId?: string;
  autoConnect?: boolean;
}

export const useTerminalSession = ({ farmId, autoConnect = true }: UseTerminalSessionProps = {}) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionCheckCount, setSessionCheckCount] = useState(0);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionCheckCountRef = useRef(0);

  const { socket, isConnected } = useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:4567',
    reconnect: true,
    reconnectAttempts: 5,
    reconnectDelay: 2000
  });

  // Store refs for values needed in fetchSessions to avoid recreation
  const activeSessionRef = useRef(activeSession);
  const farmIdRef = useRef(farmId);
  
  // Update refs when values change
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);
  
  useEffect(() => {
    farmIdRef.current = farmId;
  }, [farmId]);

  // Fetch available sessions - no dependencies to prevent recreation
  const fetchSessions = useCallback(async (source: string = 'manual') => {
    try {
      console.log(`[useTerminalSession] Fetching sessions (source: ${source}, farmId: ${farmIdRef.current})`);
      sessionCheckCountRef.current += 1;
      setSessionCheckCount(prev => prev + 1);
      
      // Build URL with optional farmId query parameter
      const url = farmIdRef.current 
        ? `/api/terminal/sessions?farmId=${encodeURIComponent(farmIdRef.current)}`
        : '/api/terminal/sessions';
      
      console.log(`[useTerminalSession] Fetching from URL: ${url}`);
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const sessionList: TerminalSession[] = data.data?.map((session: any) => {
          // Extract farmId from session name if not provided
          let sessionFarmId = session.farmId;
          if (!sessionFarmId && session.sessionName) {
            // Try to extract farmId from session name patterns like "farm_<id>" or "farm-<id>"
            const farmIdMatch = session.sessionName.match(/farm[_-]([a-zA-Z0-9-]+)/);
            if (farmIdMatch) {
              sessionFarmId = farmIdMatch[1];
            }
          }
          
          return {
            id: session.sessionName,
            sessionName: session.sessionName,
            farmId: sessionFarmId,
            paneCount: session.paneCount,
            windowName: session.windowName || 'agents',
            active: session.active,
            status: session.status || 'active',
            createdAt: new Date(session.createdAt || Date.now()),
            agents: Array.from({ length: session.paneCount }, (_, i) => ({
              id: i,
              sessionId: session.sessionName,
              paneId: `${session.sessionName}:${i}`,
              status: 'ready',
              commandHistory: []
            }))
          };
        }) || [];

        console.log(`[useTerminalSession] Got ${sessionList.length} sessions:`, sessionList);
        setSessions(sessionList);
        
        // Auto-select first session if none selected and we have sessions
        if (!activeSessionRef.current && sessionList.length > 0) {
          console.log(`[useTerminalSession] Auto-selecting first session: ${sessionList[0].id}`);
          setActiveSession(sessionList[0].id);
        }
        
        // Filter sessions by farmId if provided
        if (farmIdRef.current) {
          const farmSessions = sessionList.filter(s => {
            // Direct match
            if (s.farmId === farmIdRef.current) return true;
            // Check if session name contains farmId
            if (s.sessionName && s.sessionName.includes(farmIdRef.current!)) return true;
            // Check for pattern matching
            const pattern = new RegExp(`farm[_-]${farmIdRef.current}`, 'i');
            return s.sessionName && pattern.test(s.sessionName);
          });
          
          if (farmSessions.length > 0 && !activeSessionRef.current) {
            console.log(`[useTerminalSession] Auto-selecting farm session: ${farmSessions[0].id}`);
            setActiveSession(farmSessions[0].id);
          } else if (farmSessions.length === 0) {
            console.log(`[useTerminalSession] No sessions found for farm ${farmIdRef.current}`);
          }
        }
        
        setError(null);
        setIsLoading(false);
      } else {
        setError(`Failed to fetch sessions: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching terminal sessions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch sessions');
    }
  }, []); // No dependencies to prevent recreation

  // Get session by ID
  const getSession = useCallback((sessionId: string): TerminalSession | null => {
    return sessions.find(s => s.id === sessionId) || null;
  }, [sessions]);

  // Get agents for a session
  const getSessionAgents = useCallback((sessionId: string): TerminalAgent[] => {
    const session = getSession(sessionId);
    return session?.agents || [];
  }, [getSession]);

  // Create a new session (for farm launches)
  const createSession = useCallback(async (farmId: string, agentCount: number) => {
    try {
      const response = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmId, agentCount })
      });

      if (response.ok) {
        const data = await response.json();
        await fetchSessions('session_created');
        return data.data;
      } else {
        throw new Error(`Failed to create session: ${response.status}`);
      }
    } catch (error) {
      console.error('Error creating terminal session:', error);
      setError(error instanceof Error ? error.message : 'Failed to create session');
      throw error;
    }
  }, [fetchSessions]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/terminal/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSession === sessionId) {
          setActiveSession(null);
        }
      } else {
        throw new Error(`Failed to delete session: ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting terminal session:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete session');
      throw error;
    }
  }, [activeSession]);

  // Update agent status
  const updateAgentStatus = useCallback((sessionId: string, agentId: number, status: TerminalAgent['status']) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          agents: session.agents.map(agent => 
            agent.id === agentId 
              ? { ...agent, status, lastActivity: new Date() }
              : agent
          )
        };
      }
      return session;
    }));
  }, []);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleSessionUpdate = (data: any) => {
      if (data.type === 'session') {
        fetchSessions('websocket');
      }
    };

    const handleAgentStatus = (data: any) => {
      if (data.sessionId && typeof data.agentId === 'number') {
        updateAgentStatus(data.sessionId, data.agentId, data.status);
      }
    };

    const handleFarmLaunched = (data: any) => {
      if (data.farmId === farmIdRef.current) {
        setTimeout(() => fetchSessions('farm_launched'), 1000);
      }
    };

    const handleTmuxReady = (data: any) => {
      if (data.farmId === farmIdRef.current) {
        fetchSessions('tmux_ready');
        setIsLoading(false);
      }
    };

    socket.on('terminal:session', handleSessionUpdate);
    socket.on('terminal:agent_status', handleAgentStatus);
    socket.on('farm:launched', handleFarmLaunched);
    socket.on('farm:tmux:ready', handleTmuxReady);

    return () => {
      socket.off('terminal:session', handleSessionUpdate);
      socket.off('terminal:agent_status', handleAgentStatus);
      socket.off('farm:launched', handleFarmLaunched);
      socket.off('farm:tmux:ready', handleTmuxReady);
    };
  }, [socket, isConnected, updateAgentStatus]); // Removed farmId and fetchSessions to prevent loops

  // Initial session fetch
  useEffect(() => {
    if (autoConnect) {
      console.log('[useTerminalSession] Starting initial fetch and interval');
      fetchSessions('initial');
    }
  }, []); // Run once on mount

  // Set up periodic refresh separately
  useEffect(() => {
    if (autoConnect) {
      console.log('[useTerminalSession] Setting up refresh interval');
      // Set up periodic refresh with intelligent frequency
      const interval = setInterval(() => {
        // Use ref to check count without causing re-renders
        const count = sessionCheckCountRef.current;
        if (count < 20) {
          fetchSessions('interval');
        } else if (count % 5 === 0) {
          fetchSessions('interval_reduced');
        }
      }, 3000);
      
      refreshIntervalRef.current = interval;
      
      return () => {
        console.log('[useTerminalSession] Clearing refresh interval');
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
    
    return undefined;
  }, []); // Run once on mount

  return {
    sessions,
    activeSession,
    isLoading,
    error,
    isConnected,
    sessionCheckCount,
    // Actions
    setActiveSession,
    fetchSessions,
    getSession,
    getSessionAgents,
    createSession,
    deleteSession,
    updateAgentStatus,
    // Computed
    activeSessions: sessions.filter(s => s.active),
    totalAgents: sessions.reduce((sum, s) => sum + s.paneCount, 0)
  };
};