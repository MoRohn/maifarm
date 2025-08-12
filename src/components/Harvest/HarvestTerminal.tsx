import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Terminal, RefreshCw, Send, Maximize2, Minimize2, Copy, Download, Grid, LayoutList, Pause, Play, MessageSquare, FileText } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFarmStore } from '../../store/farmStore';
import { getAgentName, createAgentNameMapping } from '../../utils/agentNameMapper';
import { useTabVisibility } from '../../hooks/useTabVisibility';
import { Tooltip } from '../common/Tooltip';
import { AgentBar } from './AgentBar';
import { HtmlPreview } from './HtmlPreview';

// Lazy load HarvestTerminalPro for better performance
const HarvestTerminalPro = lazy(() => import('./HarvestTerminalPro'));

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
  legacyMode?: boolean;
  forceProMode?: boolean;
}

// Legacy component for backward compatibility
const LegacyHarvestTerminal: React.FC<HarvestTerminalProps> = ({ farmId, className = '' }) => {
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
  const [viewMode, setViewMode] = useState<'grid' | 'single' | 'stacked'>('stacked');
  const [pausedAgents, setPausedAgents] = useState<{ [key: number]: boolean }>({});
  const [showPromptForAgent, setShowPromptForAgent] = useState<{ [key: number]: boolean }>({});
  const [sessionCheckCount, setSessionCheckCount] = useState(0);
  const [lastFarmLaunchEvent, setLastFarmLaunchEvent] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const [lastLines, setLastLines] = useState<Map<number, string>>(new Map());
  const [htmlPreviews, setHtmlPreviews] = useState<Array<{filePath: string; agentId: number; agentName: string}>>([]);
  const [showHtmlPreview, setShowHtmlPreview] = useState<{filePath: string; agentId: number; agentName: string} | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const gridTerminalRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get farm data for agent name mapping
  const farms = useFarmStore(state => state.farms);
  const [currentFarm, setCurrentFarm] = useState<any>(null);
  const [agentNameMapping, setAgentNameMapping] = useState<any>(null);
  
  // Fetch farm data with agents for name mapping
  useEffect(() => {
    const fetchFarmWithAgents = async () => {
      if (!farmId || farmId.startsWith('quick-task-')) return;
      
      try {
        const response = await fetch(`/api/farms/${farmId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const farmData = data.data;
            setCurrentFarm(farmData);
            // Create agent name mapping from fetched farm data
            if (farmData.agents && farmData.agents.length > 0) {
              const mapping = createAgentNameMapping(farmData);
              setAgentNameMapping(mapping);
              console.log('[HarvestTerminal] Created agent name mapping with', farmData.agents.length, 'agents');
            }
          }
        }
      } catch (error) {
        console.error('[HarvestTerminal] Error fetching farm with agents:', error);
        // Fallback to store data if fetch fails
        const storeFarm = farms.find(f => f.id === farmId);
        if (storeFarm) {
          setCurrentFarm(storeFarm);
          if (storeFarm.agents && storeFarm.agents.length > 0) {
            setAgentNameMapping(createAgentNameMapping(storeFarm));
          }
        }
      }
    };
    
    fetchFarmWithAgents();
  }, [farmId, farms]);
  
  // Helper function to get agent display name
  const getAgentDisplayName = useCallback((agentIndex: number): string => {
    if (agentNameMapping) {
      return getAgentName(agentIndex, agentNameMapping, `Agent ${agentIndex}`);
    }
    return `Agent ${agentIndex}`;
  }, [agentNameMapping]);

  // Use stable WebSocket connection with default settings
  // The singleton manager ensures we reuse the same connection
  const { socket, isConnected, reconnect } = useWebSocket();
  
  // Use tab visibility to manage connection
  const { isVisible, wasInBackground, backgroundDurationFormatted } = useTabVisibility({
    onVisible: () => {
      console.log('[HarvestTerminal] Tab became visible');
      if (wasInBackground && !isConnected) {
        console.log('[HarvestTerminal] Reconnecting after being in background');
        reconnect();
      }
      // Refresh terminal output when returning from background
      if (selectedSession) {
        fetchTerminalOutput();
      }
    },
    onHidden: () => {
      console.log('[HarvestTerminal] Tab became hidden');
      // Send a keep-alive to prevent timeout
      if (socket && socket.connected) {
        socket.emit('harvest:keepalive', { 
          farmId, 
          sessionName: selectedSession,
          tabHidden: true,
          timestamp: Date.now()
        });
      }
    },
    throttleMs: 500 // Prevent rapid changes
  });

  // Fetch available sessions
  const fetchSessions = useCallback(async (source: string = 'unknown', forceCleanup: boolean = false) => {
    try {
      setSessionCheckCount(prev => prev + 1);
      
      // Optionally trigger cleanup first (only on first load or manual refresh)
      if (forceCleanup || source === 'initial' || source === 'manual-refresh') {
        console.log('[HarvestTerminal] Triggering session cleanup');
        try {
          await fetch('/api/terminal/cleanup', { method: 'POST' });
        } catch (cleanupErr) {
          console.error('[HarvestTerminal] Cleanup failed:', cleanupErr);
        }
      }
      
      // Build URL with farmId if provided
      const url = farmId 
        ? `/api/terminal/sessions?farmId=${encodeURIComponent(farmId)}`
        : '/api/terminal/sessions';
      
      console.log(`[HarvestTerminal] Fetching sessions from: ${url} (source: ${source})`);
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let sessionList = data.data || [];
        
        // Filter sessions by farmId if provided
        if (farmId && sessionList.length > 0) {
          // Look for sessions that match our farm ID pattern
          const originalCount = sessionList.length;
          const shortFarmId = farmId.substring(0, 8);
          const isQuickTask = farmId.startsWith('quick-task-');
          
          sessionList = sessionList.filter((session: TerminalSession) => {
            // Direct farmId match
            if (session.farmId === farmId) return true;
            // Check if extracted farmId matches shortened version
            if (session.farmId === shortFarmId) return true;
            
            if (session.sessionName) {
              // Handle Quick Task sessions
              if (isQuickTask) {
                // Quick tasks use pattern: quick_XXXXXXXX
                // farmId format: quick-task-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXXXXXX
                if (session.sessionName.startsWith('quick_') || session.sessionName.startsWith('quick-')) {
                  // Extract the task ID part from farmId (after quick-task-)
                  const taskIdPart = farmId.replace('quick-task-', '').substring(0, 8);
                  if (session.sessionName.includes(taskIdPart)) {
                    return true;
                  }
                  // Also check if the session metadata indicates it's a quick task
                  if (session.metadata?.isQuickTask) {
                    return true;
                  }
                }
              } else {
                // Handle regular farm sessions
                // Check for both dash and underscore patterns
                if (session.sessionName === `farm-${shortFarmId}` || 
                    session.sessionName === `farm_${shortFarmId}`) return true;
                // Check if it contains the shortFarmId anywhere
                if (session.sessionName.includes(shortFarmId)) return true;
              }
            }
            return false;
          });
          
          // Log filtering results for debugging
          console.log(`[HarvestTerminal] Filtered ${originalCount} sessions to ${sessionList.length} for farmId: ${farmId} (isQuickTask: ${isQuickTask})`);
          if (sessionList.length === 0) {
            if (isQuickTask) {
              const taskIdPart = farmId.replace('quick-task-', '').substring(0, 8);
              console.log(`[HarvestTerminal] No Quick Task sessions found matching pattern: quick_${taskIdPart} or quick-${taskIdPart}`);
            } else {
              console.log(`[HarvestTerminal] No farm sessions found matching farmId: ${farmId} (short: ${farmId.substring(0, 8)})`);
            }
          }
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

  // No debounce for immediate session detection
  const debouncedFetchSessions = useCallback((source: string) => {
    if (isConnected) { // Only fetch if connected
      fetchSessions(source);
    }
  }, [fetchSessions, isConnected]);

  // Clean terminal output by removing redundant prompts and empty lines
  const cleanTerminalOutput = useCallback((rawLines: string[]): string[] => {
    if (!rawLines || rawLines.length === 0) return [];
    
    // Filter out empty lines, duplicate prompts, and MaiFarm system messages
    const cleaned = rawLines.filter((line, index) => {
      // Skip empty lines at the beginning
      if (index === 0 && !line.trim()) return false;
      
      // Skip duplicate consecutive prompts
      if (index > 0 && line === rawLines[index - 1] && line.includes('@') && line.includes('%')) {
        return false;
      }
      
      // Replace username@hostname with MF for MaiFarm and shorten IDs
      if (line.includes('@') && (line.includes('%') || line.includes('$'))) {
        // First replace username@hostname with MF
        line = line.replace(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+/, 'MF');
        
        // Then shorten any IDs in the prompt (farm IDs, session IDs, etc.)
        // Look for patterns like farm-xxxxxxxx, quick_xxxxxxxx, or any UUID-like strings
        line = line.replace(/\b(farm[-_]|quick[-_]|session[-_])?([a-f0-9]{8})([a-f0-9-]*)\b/gi, (match: string, prefix: string, firstPart: string) => {
          // If it has a prefix (farm-, quick-, etc.), keep prefix and first 5 chars of ID
          if (prefix) {
            return prefix + firstPart.substring(0, 5);
          }
          // For standalone IDs, just show first 5 chars
          return firstPart.substring(0, 5);
        });
        
        rawLines[index] = line;
      }
      
      // Filter out heartbeat messages and MaiFarm automated system messages
      if (line.includes('HEARTBEAT_') || 
          line.includes('echo "HEARTBEAT') ||
          line.includes('echo HEARTBEAT') ||
          line.includes('KEEPALIVE_') ||
          line.includes('echo "KEEPALIVE') ||
          line.includes('CONNECTION_CHECK') ||
          line.includes('AGENT_STATUS_') ||
          line.includes('FARM_SYNC_') ||
          line.includes('MAIFARM_INTERNAL_') ||
          line.includes('# MaiFarm automated') ||
          line.includes('# Internal system message') ||
          (line.includes('echo') && line.includes('$$')) || // Filter echo commands with process IDs
          (line.includes('echo') && line.includes('$(date')) || // Filter echo commands with date
          // Filter out Claude's prompt input boxes and related UI elements
          line.includes('╭──────────────────────────────────────╮') ||
          line.includes('╰──────────────────────────────────────╯') ||
          line.includes('╭─────────────────────────────────────╮') ||
          line.includes('╰─────────────────────────────────────╯') ||
          line.includes('│                                      │') ||
          line.includes('│                                     │') ||
          (line.includes('bypass permissions') && line.includes('shift+tab')) ||
          (line.includes('shift+tab to') && line.includes('cycle')) ||
          line.includes('to cycle)') ||
          // Filter out any lines that are just box drawing characters with spaces
          /^[╭╮╯╰│\s─]+$/.test(line) ||
          // Filter out lines that contain only box characters and "to cycle" text
          (/^[╭╮╯╰│\s─]*to cycle\)[╭╮╯╰│\s─]*$/.test(line))
      ) {
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
      !line.match(/^(MF|[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+) .* [%$#]$/)
    );
    
    if (!hasRealContent && cleaned.length > 0) {
      // Return just one clean prompt line, preferring MF prompt
      const promptLine = cleaned.find(line => 
        (line.startsWith('MF ') && (line.includes('%') || line.includes('$'))) ||
        (line.includes('@') && (line.includes('%') || line.includes('$')))
      );
      return promptLine ? [promptLine] : ['Initializing agent...'];
    }
    
    return cleaned;
  }, []);

  // Update last line for an agent
  const updateLastLine = useCallback((agentId: number, output: string[]) => {
    if (output.length > 0) {
      const lastLine = output[output.length - 1];
      setLastLines(prev => new Map(prev).set(agentId, lastLine));
    }
  }, []);
  
  // Update last lines whenever terminal outputs change
  useEffect(() => {
    Object.entries(terminalOutputs).forEach(([id, output]) => {
      const agentId = Number(id);
      if (output && output.length > 0) {
        updateLastLine(agentId, output);
        
        // Check for HTML file opens in the output
        detectHtmlFileOpens(agentId, output);
      }
    });
  }, [terminalOutputs, updateLastLine]);
  
  // Detect when agents open HTML files
  const detectHtmlFileOpens = useCallback((agentId: number, output: string[]) => {
    // Look for patterns indicating HTML file was opened
    const htmlPatterns = [
      /Bash\(open:?\s*([^)]+\.html[^)]*)\)/i,  // Bash(open: file.html)
      /opening?\s+['"]?([^'"]+\.html)['"]?/i,   // opening "file.html"
      /open\s+['"]?([^'"]+\.html)['"]?/i,        // open file.html
      /created?\s+['"]?([^'"]+\.html)['"]?/i,    // created file.html
      /wrote?\s+['"]?([^'"]+\.html)['"]?/i,      // wrote file.html
    ];
    
    output.forEach(line => {
      for (const pattern of htmlPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const filePath = match[1].trim();
          const agentName = getAgentDisplayName(agentId);
          
          // Check if we already have this file in previews
          const alreadyExists = htmlPreviews.some(
            p => p.filePath === filePath && p.agentId === agentId
          );
          
          if (!alreadyExists) {
            console.log(`[HarvestTerminal] Detected HTML file open: ${filePath} by ${agentName}`);
            setHtmlPreviews(prev => [...prev, { filePath, agentId, agentName }]);
            
            // Auto-show the preview
            setShowHtmlPreview({ filePath, agentId, agentName });
          }
          break;
        }
      }
    });
  }, [htmlPreviews, getAgentDisplayName]);

  // Toggle agent expansion in stacked view
  const toggleAgentExpansion = useCallback((agentId: number) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
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
          const response = await fetch(`/api/terminal/${selectedSession}/${i}?lines=500`);
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
      // Add the command to terminal output immediately for better UX
      setTerminalOutputs(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), `$ ${commandToSend}`]
      }));
      
      const response = await fetch(`/api/terminal/${selectedSession}/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandToSend })
      });
      
      if (response.ok) {
        // Clear the appropriate input field
        if (customCommand) {
          setAgentCommands(prev => ({ ...prev, [agentId]: '' }));
        } else {
          setCommand('');
        }
        
        // Also emit via WebSocket for faster response
        if (socket && socket.connected) {
          socket.emit('terminal:send_command', {
            sessionId: selectedSession,
            agentId,
            command: commandToSend,
            timestamp: Date.now()
          });
        }
        
        // Refresh terminal after a short delay
        setTimeout(fetchTerminalOutput, 250);
      } else {
        console.error('Failed to send command');
        // Remove the command from output if it failed
        setTerminalOutputs(prev => ({
          ...prev,
          [agentId]: prev[agentId].slice(0, -1)
        }));
      }
    } catch (error) {
      console.error('Error sending command:', error);
      // Remove the command from output if it failed
      setTerminalOutputs(prev => ({
        ...prev,
        [agentId]: prev[agentId]?.slice(0, -1) || []
      }));
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
        .map(([id, output]) => `=== ${getAgentDisplayName(Number(id))} ===\n${output.join('\n')}`)
        .join('\n\n');
    }
    navigator.clipboard.writeText(text).then(() => {
      console.log('Terminal output copied to clipboard');
    });
  };

  // Download terminal output
  const downloadOutput = () => {
    const text = Object.entries(terminalOutputs)
      .map(([id, output]) => `=== ${getAgentDisplayName(Number(id))} ===\n${output.join('\n')}`)
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

  // Setup auto-refresh with connection check and keep-alive
  useEffect(() => {
    if (autoRefresh && selectedSession && isConnected) {
      refreshIntervalRef.current = setInterval(() => {
        // Only refresh if tab is visible and connected
        if (isVisible && isConnected) {
          fetchTerminalOutput();
          
          // Send keep-alive ping to prevent WebSocket timeout
          if (socket && socket.connected) {
            socket.emit('harvest:keepalive', { 
              farmId, 
              sessionName: selectedSession,
              timestamp: Date.now()
            });
          }
        } else if (!isVisible) {
          // Tab is hidden, send less frequent keep-alive
          if (socket && socket.connected) {
            socket.emit('harvest:keepalive', { 
              farmId, 
              sessionName: selectedSession,
              tabHidden: true,
              timestamp: Date.now()
            });
          }
        } else if (!isConnected) {
          // Try to reconnect if disconnected
          console.log('[HarvestTerminal] WebSocket disconnected, attempting reconnect...');
          reconnect();
        }
      }, isVisible ? 2000 : 10000); // 2s when visible, 10s when hidden
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedSession, isConnected, isVisible, fetchTerminalOutput, socket, farmId, reconnect]);

  // Initial load and refresh when farmId changes or component mounts
  useEffect(() => {
    console.log('[HarvestTerminal] Component mounted/updated with farmId:', farmId);
    setIsSessionsLoading(true);
    setSessionCheckCount(0);
    
    // Check for pre-populated session from cache
    const cachedSession = sessionStorage.getItem(`farm_session_${farmId}`);
    if (cachedSession) {
      try {
        const sessionData = JSON.parse(cachedSession);
        console.log('[HarvestTerminal] Found cached session:', sessionData);
        
        // Pre-populate session immediately
        const tempSession: TerminalSession = {
          sessionName: sessionData.sessionName,
          paneCount: sessionData.agentCount || 5,
          windowName: 'agents',
          active: true,
          farmId: farmId
        };
        setSessions([tempSession]);
        setSelectedSession(sessionData.sessionName);
        setIsSessionsLoading(false);
        
        // Still fetch actual sessions to verify
        setTimeout(() => fetchSessions('cached-verify'), 100);
      } catch (error) {
        console.error('[HarvestTerminal] Error parsing cached session:', error);
      }
    }
    
    // Immediate initial check without debouncing
    fetchSessions('initial');
    
    // Set up more aggressive refresh interval for faster detection
    const sessionRefreshInterval = setInterval(() => {
      if (sessionCheckCount < 30 && isConnected) { // Increased max checks
        debouncedFetchSessions('interval');
      } else {
        clearInterval(sessionRefreshInterval);
        setIsSessionsLoading(false);
      }
    }, 1000); // Check every 1 second for faster detection
    
    return () => {
      clearInterval(sessionRefreshInterval);
    };
  }, [farmId]); // Only re-run when farmId changes

  // Join/leave terminal sessions via WebSocket for live updates
  useEffect(() => {
    if (!socket || !isConnected || !selectedSession) return;
    
    // Join the terminal session for live updates
    console.log(`[HarvestTerminal] Joining terminal session: ${selectedSession}`);
    socket.emit('terminal:join_session', { 
      sessionId: selectedSession, 
      farmId: farmId 
    });
    
    // Load initial terminal output
    fetchTerminalOutput();
    
    // Cleanup: leave the session when unmounting or changing sessions
    return () => {
      console.log(`[HarvestTerminal] Leaving terminal session: ${selectedSession}`);
      socket.emit('terminal:leave_session', { 
        sessionId: selectedSession 
      });
    };
  }, [socket, isConnected, selectedSession, farmId]); // Join/leave when session changes
  
  // Load terminal when agent changes in single view mode
  useEffect(() => {
    if (selectedSession && viewMode === 'single') {
      fetchTerminalOutput();
    }
  }, [selectedAgent, viewMode]); // Fetch when agent changes in single view

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

  // WebSocket listeners and session management
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTerminalUpdate = (data: any) => {
      // Handle terminal updates for the current session
      const updateSessionName = data.sessionName || data.farmId;
      const updateAgentId = data.agentId;
      
      // Check if this update is for our current session
      if (selectedSession && updateSessionName) {
        // Match by session name or by farmId
        const shortFarmId = farmId?.substring(0, 8);
        const isOurSession = updateSessionName === selectedSession || 
                            updateSessionName.includes(shortFarmId) ||
                            (data.farmId === farmId);
        
        if (isOurSession) {
          // Update terminal output for the specific agent
          if (updateAgentId !== undefined) {
            setTerminalOutputs(prev => {
              const current = prev[updateAgentId] || [];
              
              // Handle different data formats
              let newLines: string[] = [];
              if (data.newLines && Array.isArray(data.newLines)) {
                newLines = data.newLines;
              } else if (data.content) {
                newLines = data.content.split('\n').filter((line: string) => line.trim());
              } else if (data.data?.lines && Array.isArray(data.data.lines)) {
                newLines = data.data.lines;
              }
              
              if (newLines.length > 0) {
                // Clean the new lines before adding
                const cleanedNewLines = cleanTerminalOutput(newLines);
                return {
                  ...prev,
                  [updateAgentId]: [...current, ...cleanedNewLines].slice(-500) // Keep last 500 lines
                };
              }
              return prev;
            });
          } else {
            // General update - refetch all
            fetchTerminalOutput();
          }
        }
      }
    };

    const handleFarmLaunched = (data: any) => {
      // Farm launched - check for new sessions with the correct farmId
      console.log('[HarvestTerminal] Farm launched event received:', data);
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventSession = data.tmuxSession || data.payload?.tmuxSession || data.sessionName || data.payload?.sessionName;
      const agentCount = data.agentCount || data.payload?.agentCount || data.agents || data.payload?.agents || 5;
      
      // Check if this event is for our farm
      const shortFarmId = farmId?.substring(0, 8);
      const eventShortFarmId = eventFarmId?.substring(0, 8);
      const isOurFarm = eventFarmId === farmId || 
                        eventShortFarmId === shortFarmId ||
                        (eventSession && shortFarmId && eventSession.includes(shortFarmId));
      
      if (isOurFarm) {
        console.log('[HarvestTerminal] This is our farm! Session name:', eventSession, 'FarmId:', eventFarmId);
        setIsSessionsLoading(true);
        setLastFarmLaunchEvent(eventSession || eventFarmId);
        
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
        
        // Immediate and rapid session checks for faster detection
        fetchSessions('farm:launched-immediate');
        setTimeout(() => fetchSessions('farm:launched-1'), 250);
        setTimeout(() => fetchSessions('farm:launched-2'), 500);
        setTimeout(() => fetchSessions('farm:launched-3'), 1000);
        setTimeout(() => {
          fetchSessions('farm:launched-final');
          setIsSessionsLoading(false);
        }, 2000); // Final check after 2 seconds
      }
    };

    const handleFarmStatus = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      const shortFarmId = farmId?.substring(0, 8);
      const eventShortFarmId = eventFarmId?.substring(0, 8);
      
      if ((eventFarmId === farmId || eventShortFarmId === shortFarmId) &&
          (data.status === 'active' || data.status === 'active')) {
        console.log('[HarvestTerminal] Farm status update for our farm:', data.status);
        debouncedFetchSessions('farm:status');
      }
    };

    const handleTmuxReady = (data: any) => {
      // Tmux ready - immediate session fetch for instant display
      console.log('[HarvestTerminal] Tmux ready event received:', data);
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventSession = data.sessionName || data.payload?.sessionName;
      
      // Check if this is for our farm
      const shortFarmId = farmId?.substring(0, 8);
      const eventShortFarmId = eventFarmId?.substring(0, 8);
      const isOurFarm = eventFarmId === farmId || 
                        eventShortFarmId === shortFarmId ||
                        (eventSession && shortFarmId && eventSession.includes(shortFarmId));
      
      if (isOurFarm) {
        console.log('[HarvestTerminal] Tmux ready for our farm:', eventSession);
        // If we have the session name, add it immediately
        if (eventSession) {
          const paneCount = data.paneCount || data.payload?.paneCount || data.agentCount || data.payload?.agentCount || 5;
          const tempSession: TerminalSession = {
            sessionName: eventSession,
            paneCount: paneCount,
            windowName: 'agents',
            active: true,
            farmId: eventFarmId || farmId
          };
          setSessions(prev => {
            // Check if session already exists
            if (prev.some(s => s.sessionName === eventSession)) {
              return prev;
            }
            return [tempSession, ...prev];
          });
          setSelectedSession(eventSession);
        }
        
        fetchSessions('tmux:ready');
        // Quick follow-up to ensure we catch the session
        setTimeout(() => fetchSessions('tmux:ready-retry'), 250);
        setIsSessionsLoading(false);
      }
    };

    const handleFarmCleanup = (data: any) => {
      // Farm cleanup - refresh sessions
      debouncedFetchSessions('farm:cleanup');
    };

    // Also listen for terminal output events from the monitoring system
    const handleTerminalOutput = (data: any) => {
      handleTerminalUpdate(data);
    };

    socket.on('harvest:terminal:update', handleTerminalUpdate);
    // Handle session prepared event for immediate UI update
    const handleSessionPrepared = (data: any) => {
      console.log('[HarvestTerminal] Session prepared event:', data);
      if (data.farmId === farmId || data.sessionName?.includes(farmId?.substring(0, 8))) {
        // Add the session immediately to the UI
        const preparedSession: TerminalSession = {
          sessionName: data.sessionName,
          paneCount: data.agentCount || 5,
          windowName: 'agents',
          active: true,
          farmId: data.farmId
        };
        setSessions(prev => {
          if (!prev.some(s => s.sessionName === data.sessionName)) {
            return [preparedSession, ...prev];
          }
          return prev;
        });
        setSelectedSession(data.sessionName);
        setIsSessionsLoading(false);
      }
    };
    
    // Handle real-time terminal output streaming
    const handleStreamingOutput = (data: any) => {
      if (data.sessionName === selectedSession && data.lines && data.lines.length > 0) {
        setTerminalOutputs(prev => ({
          ...prev,
          [data.agentId]: [...(prev[data.agentId] || []), ...data.lines].slice(-1000)
        }));
      }
    };
    
    // Handle streaming ready event
    const handleStreamingReady = (data: any) => {
      console.log('[HarvestTerminal] Terminal streaming ready:', data);
      if (data.sessionName === selectedSession) {
        // Join the terminal room for targeted updates
        socket.emit('terminal:join', { room: `terminal:${data.sessionName}` });
        // Stop polling if streaming is active
        setAutoRefresh(false);
      }
    };

    socket.on('session:prepared', handleSessionPrepared);
    socket.on('terminal:output', handleStreamingOutput); // Real-time streaming output
    socket.on('terminal:streaming:ready', handleStreamingReady);
    socket.on('harvest:terminal:command', handleTerminalUpdate);
    socket.on('agent:terminal', handleTerminalUpdate); // Listen for agent terminal updates
    socket.on('terminal:update', handleTerminalUpdate); // Listen for general terminal updates
    socket.on('terminal:event', handleTerminalOutput); // Listen for terminal events
    socket.on('farm:launched', handleFarmLaunched);
    socket.on('farm:agents:launching', handleFarmLaunched); // Also listen to agents launching
    socket.on('farm:status', handleFarmStatus);
    socket.on('multi-claude:status', handleFarmStatus);
    socket.on('farm:tmux:ready', handleTmuxReady);
    socket.on('farm:cleanup:completed', handleFarmCleanup);
    socket.on('farm:deleted', handleFarmCleanup);

    return () => {
      socket.off('session:prepared', handleSessionPrepared);
      socket.off('terminal:output', handleStreamingOutput);
      socket.off('terminal:streaming:ready', handleStreamingReady);
      socket.off('harvest:terminal:update', handleTerminalUpdate);
      socket.off('harvest:terminal:command', handleTerminalUpdate);
      socket.off('agent:terminal', handleTerminalUpdate);
      socket.off('terminal:update', handleTerminalUpdate);
      socket.off('terminal:event', handleTerminalOutput);
      socket.off('farm:launched', handleFarmLaunched);
      socket.off('farm:agents:launching', handleFarmLaunched);
      socket.off('farm:status', handleFarmStatus);
      socket.off('multi-claude:status', handleFarmStatus);
      socket.off('farm:tmux:ready', handleTmuxReady);
      socket.off('farm:cleanup:completed', handleFarmCleanup);
      socket.off('farm:deleted', handleFarmCleanup);
    };
  }, [socket, isConnected, selectedSession, selectedAgent, fetchTerminalOutput, fetchSessions, cleanTerminalOutput]);

  const currentSession = sessions.find(s => s.sessionName === selectedSession);

  return (
    <>
      <div className={`harvest-terminal ${isFullscreen ? 'fixed inset-0 z-[60] lg:left-64' : ''} ${className}`}>
        <div className="bg-gray-900 rounded-lg shadow-xl h-full flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 rounded-t-lg border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Terminal className="w-5 h-5 text-green-400" />
              
              {/* Session selector or message */}
              {!isConnected && (
                <Tooltip content="Click to reconnect">
                  <button 
                    onClick={() => {
                      console.log('[HarvestTerminal] Manual reconnect triggered');
                      reconnect();
                      // Also try to fetch sessions after reconnecting
                      setTimeout(() => {
                        fetchSessions('manual-reconnect');
                        fetchTerminalOutput();
                      }, 1000);
                    }}
                    className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  </button>
                </Tooltip>
              )}
              {isConnected && isSessionsLoading ? (
                <span className="text-gray-400 text-sm flex items-center">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Checking for sessions... (attempt #{sessionCheckCount})
                </span>
              ) : sessions.length > 0 ? (
                // Show the single session info without dropdown
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">{sessions[0].sessionName}</span>
                  <span className="text-sm text-gray-400">({sessions[0].paneCount} agents)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">
                    {isSessionsLoading ? 'Detecting sessions...' : 'No sessions found'}
                  </span>
                  <Tooltip content="Refresh terminal sessions" position="bottom">
                    <button
                      onClick={() => {
                        console.log('[HarvestTerminal] Manual refresh triggered with cleanup');
                        setIsSessionsLoading(true);
                        setSessionCheckCount(0);
                        fetchSessions('manual-refresh', true);
                      }}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 text-gray-400 hover:text-white ${isSessionsLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </Tooltip>
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
                      {getAgentDisplayName(i)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Controls */}
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              {currentSession && currentSession.paneCount > 1 && (
                <Tooltip content={
                  viewMode === 'grid' ? 'Switch to stacked view' : 
                  viewMode === 'stacked' ? 'Switch to single agent view' : 
                  'Switch to grid view (all agents)'
                } position="bottom">
                  <button
                    onClick={() => {
                      if (viewMode === 'grid') setViewMode('stacked');
                      else if (viewMode === 'stacked') setViewMode('single');
                      else setViewMode('grid');
                    }}
                    className="p-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                  >
                    {viewMode === 'grid' ? (
                      <Grid className="w-4 h-4 text-white" />
                    ) : viewMode === 'stacked' ? (
                      <LayoutList className="w-4 h-4 text-white" />
                    ) : (
                      <Terminal className="w-4 h-4 text-white" />
                    )}
                  </button>
                </Tooltip>
              )}
              
              <Tooltip content={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh (updates every 2 seconds)'} position="bottom">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`p-2 rounded ${autoRefresh ? 'bg-green-600' : 'bg-gray-700'} hover:bg-opacity-80 transition-colors`}
                >
                  <RefreshCw className={`w-4 h-4 text-white ${autoRefresh ? 'animate-spin' : ''}`} />
                </button>
              </Tooltip>
              
              <Tooltip content="Copy terminal output to clipboard" position="bottom">
                <button
                  onClick={() => copyToClipboard()}
                  className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  <Copy className="w-4 h-4 text-white" />
                </button>
              </Tooltip>
              
              <Tooltip content="Download terminal output as text file" position="bottom">
                <button
                  onClick={downloadOutput}
                  className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>
              </Tooltip>
              
              <Tooltip content={isFullscreen ? 'Exit fullscreen mode' : 'Enter fullscreen mode'} position="bottom">
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 text-white" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-white" />
                  )}
                </button>
              </Tooltip>
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
                      <span className="text-sm font-semibold text-white">{getAgentDisplayName(i)}</span>
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
                      <Tooltip content="Copy this agent's output" position="bottom">
                        <button
                          onClick={() => copyToClipboard(i)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <div 
                    ref={(el) => { gridTerminalRefs.current[i] = el; }}
                    className="h-80 overflow-y-auto font-mono text-xs bg-black p-2"
                    style={{ minHeight: '20rem', maxHeight: '20rem' }}
                  >
                    {isLoading ? (
                      <div className="space-y-2 p-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <div className="text-green-400 text-xs">Initializing agent {i}...</div>
                        </div>
                        <div className="space-y-1">
                          <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4"></div>
                          <div className="h-3 bg-gray-800 rounded animate-pulse w-1/2"></div>
                          <div className="h-3 bg-gray-800 rounded animate-pulse w-5/6"></div>
                        </div>
                      </div>
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
                        <div className="text-xs mt-1 text-gray-500">{getAgentDisplayName(i)}</div>
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
                        <Tooltip content="Send command to agent" position="left">
                          <button
                            onClick={() => sendCommand(i, agentCommands[i])}
                            disabled={!agentCommands[i]?.trim()}
                            className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'stacked' && currentSession && currentSession.paneCount > 1 ? (
          // Stacked View
          <div className="flex-1 bg-black p-4 overflow-y-auto">
            <div className="space-y-3">
              {Array.from({ length: currentSession.paneCount }, (_, i) => {
                const agentOutput = terminalOutputs[i] || [];
                const lastLine = lastLines.get(i) || 'Initializing...';
                
                return (
                  <AgentBar
                    key={i}
                    agentId={i}
                    agentName={getAgentDisplayName(i)}
                    lastLine={lastLine}
                    fullOutput={agentOutput}
                    expanded={expandedAgents.has(i)}
                    isActive={!pausedAgents[i]}
                    isPaused={pausedAgents[i]}
                    onToggle={() => toggleAgentExpansion(i)}
                    onPause={() => toggleAgentPause(i)}
                    onResume={() => toggleAgentPause(i)}
                    onCopy={() => copyToClipboard(i)}
                    onSendCommand={(cmd) => sendCommand(i, cmd)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          // Single View
          <div className="flex-1 flex flex-col bg-black">
            {/* Single view controls bar */}
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-400">{getAgentDisplayName(selectedAgent)}</span>
              <div className="flex items-center space-x-2">
                <Tooltip content={pausedAgents[selectedAgent] ? 'Resume agent execution' : 'Pause agent execution'} position="bottom">
                  <button
                    onClick={() => toggleAgentPause(selectedAgent)}
                    className={`p-1.5 rounded transition-colors ${
                      pausedAgents[selectedAgent] ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {pausedAgents[selectedAgent] ? (
                      <Play className="w-4 h-4 text-white" />
                    ) : (
                      <Pause className="w-4 h-4 text-white" />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="Toggle command prompt" position="bottom">
                  <button
                    onClick={() => togglePromptForAgent(selectedAgent)}
                    className={`p-1.5 rounded transition-colors ${
                      showPromptForAgent[selectedAgent] ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-white" />
                  </button>
                </Tooltip>
              </div>
            </div>
            
            {/* Terminal output */}
            <div 
              ref={terminalRef}
              className="flex-1 p-4 overflow-y-auto font-mono text-sm scroll-smooth"
              style={{ minHeight: '400px' }}
            >
              {isLoading ? (
                <div className="p-8">
                  <div className="flex items-center justify-center mb-4">
                    <Terminal className="w-8 h-8 text-green-400 animate-pulse" />
                  </div>
                  <div className="space-y-2 max-w-2xl mx-auto">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <div className="text-green-400">Connecting to {getAgentDisplayName(selectedAgent)}...</div>
                    </div>
                    <div className="space-y-1 pl-4">
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-3/4"></div>
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-1/2"></div>
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-5/6"></div>
                      <div className="h-4 bg-gray-800/50 rounded animate-pulse w-2/3"></div>
                    </div>
                  </div>
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
                      ? `${getAgentDisplayName(selectedAgent)} is initializing or hasn't produced output yet`
                      : sessions.length === 0
                        ? farmId 
                          ? `Searching for sessions matching farm: ${farmId.slice(0, 8)}...`
                          : 'Waiting for Claude Code agents to launch...'
                        : 'Launch a farm to see agent terminals'}
                  </div>
                  {sessions.length === 0 && (
                    <Tooltip content="Retry detecting terminal sessions" position="top">
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
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Command Input - Always visible for easy access */}
        {selectedSession && currentSession && (
          <div className="bg-gray-800 px-4 py-3 rounded-b-lg border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <span className="text-green-400 font-mono">$</span>
              {viewMode !== 'single' && currentSession.paneCount > 1 && (
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(Number(e.target.value))}
                  className="bg-gray-700 text-white px-2 py-1.5 rounded text-sm"
                >
                  {Array.from({ length: currentSession.paneCount }, (_, i) => (
                    <option key={i} value={i}>
                      {getAgentDisplayName(i)}
                    </option>
                  ))}
                </select>
              )}
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendCommand();
                    // Focus remains on input for rapid command entry
                    e.currentTarget.focus();
                  }
                }}
                placeholder={`Enter command for ${getAgentDisplayName(selectedAgent)}...`}
                className="flex-1 bg-gray-900 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
              <Tooltip content="Send command to agent (Enter)" position="left">
                <button
                  onClick={() => {
                    sendCommand();
                    // Refocus input after click
                    inputRef.current?.focus();
                  }}
                  disabled={!command.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span className="text-sm">Send</span>
                </button>
              </Tooltip>
            </div>
            {/* Quick command suggestions */}
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-xs text-gray-400">Quick:</span>
              {['ls', 'pwd', 'git status', 'npm test', 'clear'].map(cmd => (
                <button
                  key={cmd}
                  onClick={() => {
                    setCommand(cmd);
                    sendCommand(selectedAgent, cmd);
                    inputRef.current?.focus();
                  }}
                  className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    
    {/* HTML Preview Modal */}
    {showHtmlPreview && farmId && (
      <HtmlPreview
        filePath={showHtmlPreview.filePath}
        farmId={farmId}
        agentId={showHtmlPreview.agentId}
        agentName={showHtmlPreview.agentName}
        onClose={() => setShowHtmlPreview(null)}
      />
    )}
    
    {/* HTML Files Notification */}
    {htmlPreviews.length > 0 && !showHtmlPreview && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-20 right-4 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm"
      >
        <div className="flex items-center space-x-2 mb-2">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h4 className="font-semibold text-gray-900 dark:text-white">HTML Files Detected</h4>
        </div>
        <div className="space-y-2">
          {htmlPreviews.slice(-3).map((preview, idx) => (
            <button
              key={idx}
              onClick={() => setShowHtmlPreview(preview)}
              className="block w-full text-left p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {preview.filePath.split('/').pop()}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                by {preview.agentName}
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    )}
    </>
  );
};

// Main HarvestTerminal component - Always use Pro mode
export const HarvestTerminal: React.FC<HarvestTerminalProps> = (props) => {
  const { legacyMode, forceProMode, ...restProps } = props;
  
  // Always use Pro mode - it's the new default
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg">
        <div className="text-center">
          <Terminal className="w-12 h-12 text-green-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400">Loading Harvest Terminal Pro...</p>
        </div>
      </div>
    }>
      <HarvestTerminalPro {...restProps} />
    </Suspense>
  );
};

export default HarvestTerminal;