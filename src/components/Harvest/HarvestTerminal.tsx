import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { Terminal, RefreshCw, Send, Maximize2, Minimize2, Copy, Download, Grid, LayoutList, Pause, Play, MessageSquare } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';

interface TerminalSession {
  sessionName: string;
  paneCount: number;
  windowName: string;
  active: boolean;
  farmId?: string;
  metadata?: any;
}


interface HarvestTerminalProps {
  farmId?: string;
  className?: string;
}

export const HarvestTerminal: React.FC<HarvestTerminalProps> = ({ farmId, className = '' }) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number>(0);
  const [terminalOutputs, setTerminalOutputs] = useState<{ [key: number]: string[] }>({});
  const [command, setCommand] = useState('');
  const [agentCommands, setAgentCommands] = useState<{ [key: number]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid');
  const [pausedAgents, setPausedAgents] = useState<{ [key: number]: boolean }>({});
  const [showPromptForAgent, setShowPromptForAgent] = useState<{ [key: number]: boolean }>({});
  const [sessionCheckCount, setSessionCheckCount] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const gridTerminalRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { socket, isConnected, reconnect } = useWebSocket({ 
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:4567',
    reconnect: true,
    reconnectAttempts: 5,
    reconnectDelay: 2000
  });

  // Fetch available sessions
  const fetchSessions = useCallback(async (source: string = 'unknown') => {
    try {
      setSessionCheckCount(prev => prev + 1);
      // Build URL with farmId if provided
      const url = farmId 
        ? `/api/harvest/terminal/sessions?farmId=${encodeURIComponent(farmId)}`
        : '/api/harvest/terminal/sessions';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let sessionList = data.data || [];
        
        // Filter sessions by farmId if provided
        if (farmId && sessionList.length > 0) {
          // Look for sessions that match our farm ID pattern
          sessionList = sessionList.filter((session: TerminalSession) => {
            // Direct farmId match
            if (session.farmId === farmId) return true;
            // Check if session name contains farmId (first 8 chars)
            const shortFarmId = farmId.substring(0, 8);
            if (session.sessionName && session.sessionName.includes(shortFarmId)) return true;
            // Check for pattern matching
            const pattern = new RegExp(`farm[_-]${shortFarmId}`, 'i');
            return session.sessionName && pattern.test(session.sessionName);
          });
        }
        
        setSessions(sessionList);
        
        // Auto-select the most recent session if none selected
        if (!selectedSession && sessionList.length > 0) {
          // Sessions should already be sorted by creation time (most recent first)
          console.log(`[HarvestTerminal] Auto-selecting most recent session: ${sessionList[0].sessionName}`);
          setSelectedSession(sessionList[0].sessionName);
          // Fetch terminal output immediately when selecting
          setTimeout(() => fetchTerminalOutput(), 100);
        }
        
        // If we found sessions, stop loading
        if (sessionList.length > 0) {
          setIsSessionsLoading(false);
        }
      } else {
        console.error('[HarvestTerminal] Failed to fetch sessions:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[HarvestTerminal] Error fetching sessions:', error);
    }
  }, [selectedSession, farmId]);

  // Debounced version of fetchSessions - reduced delay for faster detection
  const debouncedFetchSessions = useMemo(
    () => debounce((source: string) => {
      fetchSessions(source);
    }, 300), // 300ms debounce for faster response
    [fetchSessions]
  );

  // Clean terminal output by removing redundant prompts and empty lines
  const cleanTerminalOutput = useCallback((rawLines: string[]): string[] => {
    if (!rawLines || rawLines.length === 0) return [];
    
    // Filter out empty lines and duplicate prompts
    const cleaned = rawLines.filter((line, index) => {
      // Skip empty lines at the beginning
      if (index === 0 && !line.trim()) return false;
      
      // Skip duplicate consecutive prompts (like "rohnspringfield@mac ~ %")
      if (index > 0 && line === rawLines[index - 1] && line.includes('@') && line.includes('%')) {
        return false;
      }
      
      // Keep lines that have actual content or are meaningful prompts
      return true;
    });
    
    // Check for Claude Code welcome message or important output
    const hasClaudeWelcome = cleaned.some(line => 
      line.includes('Welcome to Claude Code') || 
      line.includes('claude') ||
      line.includes('/help for help')
    );
    
    // If we have Claude welcome, keep all content
    if (hasClaudeWelcome) {
      return cleaned;
    }
    
    // If we only have prompt lines and no actual output, show a single clean prompt
    const hasRealContent = cleaned.some(line => 
      line.trim() && 
      !line.match(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+ .* [%$#]$/)
    );
    
    if (!hasRealContent && cleaned.length > 0) {
      // Return just one clean prompt line
      const promptLine = cleaned.find(line => line.includes('@') && (line.includes('%') || line.includes('$')));
      return promptLine ? [promptLine] : ['Initializing agent...'];
    }
    
    return cleaned;
  }, []);

  // Fetch terminal output for all agents
  const fetchTerminalOutput = useCallback(async () => {
    if (!selectedSession) return;
    
    setIsLoading(true);
    try {
      const currentSession = sessions.find(s => s.sessionName === selectedSession);
      if (!currentSession) return;
      
      // Fetch terminal output for all agents
      const outputs: { [key: number]: string[] } = {};
      for (let i = 0; i < currentSession.paneCount; i++) {
        try {
          // Capture more lines to show the full launch process
          const response = await fetch(`/api/harvest/terminal/${selectedSession}/${i}?lines=500`);
          if (response.ok) {
            const data = await response.json();
            const rawOutput = data.data.terminal || [];
            outputs[i] = cleanTerminalOutput(rawOutput);
          }
        } catch (error) {
          console.error(`Error fetching terminal output for agent ${i}:`, error);
          outputs[i] = [`Error loading terminal for agent ${i}`];
        }
      }
      setTerminalOutputs(prev => ({ ...prev, ...outputs }));
    } catch (error) {
      console.error('Error fetching terminal output:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSession, sessions, cleanTerminalOutput]);

  // Send command to specific agent
  const sendCommand = async (agentId: number = selectedAgent, customCommand?: string) => {
    const commandToSend = customCommand || command || agentCommands[agentId];
    if (!selectedSession || !commandToSend?.trim()) return;
    
    try {
      const response = await fetch(`/api/harvest/terminal/${selectedSession}/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandToSend })
      });
      
      if (response.ok) {
        if (customCommand) {
          setAgentCommands(prev => ({ ...prev, [agentId]: '' }));
        } else {
          setCommand('');
        }
        // Refresh terminal after sending command
        setTimeout(fetchTerminalOutput, 500);
      } else {
        console.error('Failed to send command');
      }
    } catch (error) {
      console.error('Error sending command:', error);
    }
  };

  // Toggle pause/continue for specific agent
  const toggleAgentPause = async (agentId: number) => {
    const isPaused = pausedAgents[agentId];
    const commandToSend = isPaused ? 'fg' : '\x1a'; // Ctrl+Z for pause, fg for continue
    
    try {
      await sendCommand(agentId, commandToSend);
      setPausedAgents(prev => ({ ...prev, [agentId]: !isPaused }));
    } catch (error) {
      console.error('Error toggling agent pause:', error);
    }
  };

  // Toggle prompt visibility for specific agent
  const togglePromptForAgent = (agentId: number) => {
    setShowPromptForAgent(prev => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  // Copy terminal output to clipboard
  const copyToClipboard = (agentId?: number) => {
    let text = '';
    if (agentId !== undefined && terminalOutputs[agentId]) {
      text = terminalOutputs[agentId].join('\n');
    } else {
      // Copy all outputs
      text = Object.entries(terminalOutputs)
        .map(([id, output]) => `=== Agent ${id} ===\n${output.join('\n')}`)
        .join('\n\n');
    }
    navigator.clipboard.writeText(text).then(() => {
      console.log('Terminal output copied to clipboard');
    });
  };

  // Download terminal output
  const downloadOutput = () => {
    const text = Object.entries(terminalOutputs)
      .map(([id, output]) => `=== Agent ${id} ===\n${output.join('\n')}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harvest-terminal-${selectedSession}-all-agents.txt`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('Terminal output downloaded');
  };

  // Setup auto-refresh
  useEffect(() => {
    if (autoRefresh && selectedSession) {
      refreshIntervalRef.current = setInterval(fetchTerminalOutput, 3000);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedSession, fetchTerminalOutput]);

  // Initial load and refresh when farmId changes or component mounts
  useEffect(() => {
    console.log('[HarvestTerminal] Component mounted/updated with farmId:', farmId);
    setIsSessionsLoading(true);
    setSessionCheckCount(0);
    
    // Immediate initial check without debouncing
    fetchSessions('initial');
    
    // Set up single interval with reasonable frequency
    const sessionRefreshInterval = setInterval(() => {
      if (sessionCheckCount < 20) { // Limit total attempts
        debouncedFetchSessions('interval');
      } else {
        clearInterval(sessionRefreshInterval);
        setIsSessionsLoading(false);
      }
    }, 3000); // Check every 3 seconds
    
    return () => {
      clearInterval(sessionRefreshInterval);
    };
  }, [farmId]); // Only re-run when farmId changes

  // Load terminal when session/agent changes
  useEffect(() => {
    if (selectedSession) {
      fetchTerminalOutput();
    }
  }, [selectedSession, selectedAgent]); // Remove fetchTerminalOutput from deps to prevent infinite loops

  // Auto-scroll to bottom when terminal output changes
  useEffect(() => {
    // Single view auto-scroll
    if (terminalRef.current && viewMode === 'single' && terminalOutputs[selectedAgent]?.length > 0) {
      // Double requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
          }
        });
      });
    }
    
    // Grid view auto-scroll for each terminal window
    if (viewMode === 'grid') {
      Object.keys(terminalOutputs).forEach((agentId) => {
        const id = Number(agentId);
        const ref = gridTerminalRefs.current[id];
        if (ref && terminalOutputs[id]?.length > 0) {
          // Double requestAnimationFrame to ensure DOM is fully updated
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const currentRef = gridTerminalRefs.current[id];
              if (currentRef) {
                currentRef.scrollTop = currentRef.scrollHeight;
              }
            });
          });
        }
      });
    }
  }, [terminalOutputs, selectedAgent, viewMode]);

  // WebSocket listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTerminalUpdate = (data: any) => {
      if (data.sessionName === selectedSession && data.agentId === selectedAgent) {
        fetchTerminalOutput();
      }
    };

    const handleFarmLaunched = (data: any) => {
      // Farm launched - check for new sessions with the correct farmId
      console.log('[HarvestTerminal] Farm launched event received:', data);
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventSession = data.tmuxSession || data.payload?.tmuxSession;
      const agentCount = data.agentCount || data.payload?.agentCount || 5;
      
      if (eventFarmId === farmId || (eventFarmId && farmId && eventFarmId.startsWith(farmId.substring(0, 8)))) {
        console.log('[HarvestTerminal] This is our farm! Session name:', eventSession);
        setIsSessionsLoading(true);
        
        // If we know the session name, we can immediately add it
        if (eventSession) {
          console.log('[HarvestTerminal] Creating session entry for:', eventSession);
          // Create a temporary session entry so UI can show it immediately
          const tempSession: TerminalSession = {
            sessionName: eventSession,
            paneCount: agentCount,
            windowName: 'agents',
            active: true,
            farmId: eventFarmId
          };
          setSessions(prev => {
            // Check if session already exists
            if (prev.some(s => s.sessionName === eventSession)) {
              return prev;
            }
            return [tempSession, ...prev];
          });
          
          // Auto-select this session
          setSelectedSession(eventSession);
        }
        
        // Check for sessions multiple times with increasing delays
        setTimeout(() => {
          fetchSessions('farm:launched-immediate');
          setTimeout(() => {
            debouncedFetchSessions('farm:launched');
          }, 1000);
          setTimeout(() => {
            debouncedFetchSessions('farm:launched-retry');
          }, 2500);
          // Final check after 5 seconds
          setTimeout(() => {
            debouncedFetchSessions('farm:launched-final');
            setIsSessionsLoading(false);
          }, 5000);
        }, 500);
      }
    };

    const handleFarmStatus = (data: any) => {
      if (data.status === 'running' || data.status === 'active') {
        debouncedFetchSessions('farm:status');
      }
    };

    const handleTmuxReady = (data: any) => {
      // Tmux ready - refresh sessions with a small delay to ensure tmux is fully initialized
      console.log('[HarvestTerminal] Tmux ready event received:', data);
      setTimeout(() => {
        debouncedFetchSessions('tmux:ready');
        // Try again after a short delay to ensure we catch the session
        setTimeout(() => {
          debouncedFetchSessions('tmux:ready-retry');
        }, 1500);
      }, 500);
      setIsSessionsLoading(false);
    };

    const handleFarmCleanup = (data: any) => {
      // Farm cleanup - refresh sessions
      debouncedFetchSessions('farm:cleanup');
    };

    socket.on('harvest:terminal:update', handleTerminalUpdate);
    socket.on('harvest:terminal:command', handleTerminalUpdate);
    socket.on('farm:launched', handleFarmLaunched);
    socket.on('farm:status', handleFarmStatus);
    socket.on('multi-claude:status', handleFarmStatus);
    socket.on('farm:tmux:ready', handleTmuxReady);
    socket.on('farm:cleanup:completed', handleFarmCleanup);
    socket.on('farm:deleted', handleFarmCleanup);

    return () => {
      socket.off('harvest:terminal:update', handleTerminalUpdate);
      socket.off('harvest:terminal:command', handleTerminalUpdate);
      socket.off('farm:launched', handleFarmLaunched);
      socket.off('farm:status', handleFarmStatus);
      socket.off('multi-claude:status', handleFarmStatus);
      socket.off('farm:tmux:ready', handleTmuxReady);
      socket.off('farm:cleanup:completed', handleFarmCleanup);
      socket.off('farm:deleted', handleFarmCleanup);
    };
  }, [socket, isConnected, selectedSession, selectedAgent, fetchTerminalOutput, fetchSessions]);

  const currentSession = sessions.find(s => s.sessionName === selectedSession);

  return (
    <div className={`harvest-terminal ${isFullscreen ? 'fixed inset-0 z-[60] lg:left-64' : ''} ${className}`}>
      <div className="bg-gray-900 rounded-lg shadow-xl h-full flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 rounded-t-lg border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Terminal className="w-5 h-5 text-green-400" />
              <h3 className="text-white font-medium">Harvest Terminal</h3>
              
              {/* Session selector or message */}
              {!isConnected && (
                <span className="text-red-400 text-sm flex items-center">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Reconnecting to server...
                  <button 
                    onClick={reconnect}
                    className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
                  >
                    Retry
                  </button>
                </span>
              )}
              {isConnected && isSessionsLoading ? (
                <span className="text-gray-400 text-sm flex items-center">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Checking for sessions... (attempt #{sessionCheckCount})
                </span>
              ) : sessions.length > 0 ? (
                <select
                  value={selectedSession || ''}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
                >
                  <option value="">Select Session</option>
                  {sessions.map(session => (
                    <option key={session.sessionName} value={session.sessionName}>
                      {session.sessionName} ({session.paneCount} agents)
                      {session.farmId && ` - Farm: ${session.farmId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">
                    {isSessionsLoading ? 'Detecting sessions...' : 'No sessions found'}
                  </span>
                  <button
                    onClick={() => {
                      console.log('[HarvestTerminal] Manual refresh triggered');
                      setIsSessionsLoading(true);
                      setSessionCheckCount(0);
                      fetchSessions('manual-refresh');
                    }}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Refresh sessions"
                  >
                    <RefreshCw className={`w-4 h-4 text-gray-400 hover:text-white ${isSessionsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
              
              {/* Agent selector for single view mode */}
              {viewMode === 'single' && currentSession && currentSession.paneCount > 1 && (
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(Number(e.target.value))}
                  className="bg-gray-700 text-white px-3 py-1 rounded text-sm"
                >
                  {Array.from({ length: currentSession.paneCount }, (_, i) => (
                    <option key={i} value={i}>
                      Agent {i}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Controls */}
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              {currentSession && currentSession.paneCount > 1 && (
                <button
                  onClick={() => setViewMode(viewMode === 'grid' ? 'single' : 'grid')}
                  className="p-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                  title={viewMode === 'grid' ? 'Single View' : 'Grid View'}
                >
                  {viewMode === 'grid' ? (
                    <LayoutList className="w-4 h-4 text-white" />
                  ) : (
                    <Grid className="w-4 h-4 text-white" />
                  )}
                </button>
              )}
              
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`p-2 rounded ${autoRefresh ? 'bg-green-600' : 'bg-gray-700'} hover:bg-opacity-80 transition-colors`}
                title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              >
                <RefreshCw className={`w-4 h-4 text-white ${autoRefresh ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={() => copyToClipboard()}
                className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                title="Copy output"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
              
              <button
                onClick={downloadOutput}
                className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                title="Download output"
              >
                <Download className="w-4 h-4 text-white" />
              </button>
              
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-white" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Terminal Display */}
        {viewMode === 'grid' && currentSession && currentSession.paneCount > 1 ? (
          // Grid View
          <div className="flex-1 bg-black p-2 overflow-y-auto">
            <div className={`grid gap-2 ${
              currentSession.paneCount <= 2 ? 'grid-cols-1 lg:grid-cols-2' :
              currentSession.paneCount <= 4 ? 'grid-cols-2' :
              currentSession.paneCount <= 6 ? 'grid-cols-2 lg:grid-cols-3' :
              'grid-cols-2 lg:grid-cols-4'
            }`}>
              {Array.from({ length: currentSession.paneCount }, (_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
                  <div className="bg-gray-800 px-3 py-2 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                      <span className="text-sm font-semibold text-white">Agent {i}</span>
                      <span className="text-xs text-gray-400 ml-1">({terminalOutputs[i]?.length || 0} lines)</span>
                      {farmId && (
                        <span className="text-xs text-gray-500">• Farm {farmId.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => toggleAgentPause(i)}
                        className={`p-1 rounded transition-colors ${
                          pausedAgents[i] ? 'bg-yellow-600 hover:bg-yellow-700' : 'hover:bg-gray-700'
                        }`}
                        title={pausedAgents[i] ? 'Continue' : 'Pause'}
                      >
                        {pausedAgents[i] ? (
                          <Play className="w-3 h-3 text-white" />
                        ) : (
                          <Pause className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => togglePromptForAgent(i)}
                        className={`p-1 rounded transition-colors ${
                          showPromptForAgent[i] ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-gray-700'
                        }`}
                        title="Toggle prompt"
                      >
                        <MessageSquare className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        onClick={() => copyToClipboard(i)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Copy output"
                      >
                        <Copy className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  </div>
                  <div 
                    ref={(el) => { gridTerminalRefs.current[i] = el; }}
                    className="h-80 overflow-y-auto font-mono text-xs bg-black p-2"
                    style={{ minHeight: '20rem', maxHeight: '20rem' }}
                  >
                    {isLoading ? (
                      <div className="text-gray-500">Loading...</div>
                    ) : terminalOutputs[i]?.length > 0 ? (
                      <div className="space-y-0">
                        {terminalOutputs[i].map((line, idx) => {
                          // Highlight important lines
                          let className = "text-green-400";
                          if (line.includes('IMPORTANT:') || line.includes('ERROR:')) {
                            className = "text-yellow-400";
                          } else if (line.includes('Welcome to Claude Code')) {
                            className = "text-cyan-400 font-semibold";
                          } else if (line.includes('Agent Role')) {
                            className = "text-purple-400";
                          }
                          return (
                            <div key={idx} className="whitespace-pre-wrap leading-tight">
                              <span className={className}>{line || '\u00A0'}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-gray-600 text-center py-8">
                        <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
                        <div className="text-sm">Waiting for output...</div>
                        <div className="text-xs mt-1 text-gray-500">Agent {i}</div>
                      </div>
                    )}
                  </div>
                  {/* Prompt input for each agent (hidden by default) */}
                  {showPromptForAgent[i] && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="flex items-center space-x-1">
                        <span className="text-green-400 font-mono text-xs">$</span>
                        <input
                          type="text"
                          value={agentCommands[i] || ''}
                          onChange={(e) => setAgentCommands(prev => ({ ...prev, [i]: e.target.value }))}
                          onKeyPress={(e) => e.key === 'Enter' && sendCommand(i, agentCommands[i])}
                          placeholder="Command..."
                          className="flex-1 bg-gray-800 text-white px-2 py-1 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        <button
                          onClick={() => sendCommand(i, agentCommands[i])}
                          disabled={!agentCommands[i]?.trim()}
                          className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Single View
          <div className="flex-1 flex flex-col bg-black">
            {/* Single view controls bar */}
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-400">Agent {selectedAgent}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleAgentPause(selectedAgent)}
                  className={`p-1.5 rounded transition-colors ${
                    pausedAgents[selectedAgent] ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  title={pausedAgents[selectedAgent] ? 'Continue' : 'Pause'}
                >
                  {pausedAgents[selectedAgent] ? (
                    <Play className="w-4 h-4 text-white" />
                  ) : (
                    <Pause className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => togglePromptForAgent(selectedAgent)}
                  className={`p-1.5 rounded transition-colors ${
                    showPromptForAgent[selectedAgent] ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  title="Toggle prompt"
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            
            {/* Terminal output */}
            <div 
              ref={terminalRef}
              className="flex-1 p-4 overflow-y-auto font-mono text-sm scroll-smooth"
              style={{ minHeight: '400px' }}
            >
              {isLoading ? (
                <div className="text-gray-400 text-center py-8">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                  <div>Loading terminal output...</div>
                </div>
              ) : terminalOutputs[selectedAgent]?.length > 0 ? (
                <div className="space-y-0">
                  {terminalOutputs[selectedAgent].map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap leading-relaxed">
                      <span className="text-green-400">{line || '\u00A0'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-12">
                  <Terminal className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <div className="text-lg mb-2">
                    {selectedSession 
                      ? 'Waiting for agent output...'
                      : sessions.length === 0
                        ? 'No terminal sessions detected'
                        : 'Select a session to view terminal output'}
                  </div>
                  <div className="text-sm opacity-70 mb-4">
                    {selectedSession 
                      ? `Agent ${selectedAgent} is initializing or hasn't produced output yet`
                      : sessions.length === 0
                        ? farmId 
                          ? `Searching for sessions matching farm: ${farmId.slice(0, 8)}...`
                          : 'Waiting for Claude Code agents to launch...'
                        : 'Launch a farm to see agent terminals'}
                  </div>
                  {sessions.length === 0 && (
                    <button
                      onClick={() => {
                        console.log('[HarvestTerminal] Retry detection from empty state');
                        setIsSessionsLoading(true);
                        fetchSessions('empty-state-retry');
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                    >
                      Retry Detection
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Command Input (shown when prompt is toggled on) */}
        {selectedSession && viewMode === 'single' && showPromptForAgent[selectedAgent] && (
          <div className="bg-gray-800 px-4 py-3 rounded-b-lg border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-green-400 font-mono">$</span>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendCommand()}
                placeholder={`Enter command for Agent ${selectedAgent}...`}
                className="flex-1 bg-gray-900 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={() => sendCommand()}
                disabled={!command.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HarvestTerminal;