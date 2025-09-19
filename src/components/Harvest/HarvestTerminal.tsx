import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  RefreshCw, 
  Send, 
  Maximize2, 
  Minimize2, 
  Copy, 
  Download, 
  Grid, 
  LayoutList, 
  Pause, 
  Play, 
  TreePine,
  Layers,
  Monitor,
  Activity,
  ChevronRight,
  Cpu
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFarmStore } from '@/store/farmStore';
import { getAgentName, createAgentNameMapping } from '@/utils/agentNameMapper';
import { getAgentNameByIndex } from '@/utils/farmAgentNames';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { terminalSubscriptionManager } from '@/utils/terminalSubscriptionManager';
import { Tooltip } from '../common/Tooltip';
import { AgentBar } from './AgentBar';
import { HtmlPreview } from './HtmlPreview';
import { FarmLandscape } from './FarmLandscape';
import { AnsiParser, stripAnsi, detectOutputType, getOutputColor, parseToSegments } from '@/utils/ansiParser';
import { HarvestTerminalErrorBoundary } from './HarvestTerminalErrorBoundary';
import { WorkflowVisualization } from './WorkflowVisualization';

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
  defaultView?: 'farm' | 'grid' | 'single' | 'stacked';
}

// Safe ANSI renderer component that handles errors gracefully
const SafeAnsiRenderer: React.FC<{ content: string }> = ({ content }) => {
  try {
    // Sanitize the content first
    if (!content || typeof content !== 'string') {
      return <span>{'\u00A0'}</span>;
    }
    
    // Limit content length to prevent performance issues
    const truncatedContent = content.length > 10000 
      ? content.substring(0, 10000) + '...[truncated]'
      : content;
    
    // Try to parse ANSI codes
    const parsed = AnsiParser.parseToHtml(truncatedContent);
    
    // Additional safety check - ensure parsed result is a string
    if (typeof parsed !== 'string') {
      console.error('[SafeAnsiRenderer] AnsiParser returned non-string:', typeof parsed);
      return <span>{stripAnsi(content) || '\u00A0'}</span>;
    }
    
    // Check for potentially dangerous patterns
    if (parsed.includes('<script') || parsed.includes('javascript:') || parsed.includes('onerror=')) {
      console.warn('[SafeAnsiRenderer] Potentially dangerous content detected, using stripped version');
      return <span>{stripAnsi(content) || '\u00A0'}</span>;
    }
    
    // Render the parsed HTML
    return <span dangerouslySetInnerHTML={{ __html: parsed }} />;
  } catch (error) {
    // If anything goes wrong, fall back to plain text
    console.error('[SafeAnsiRenderer] Error rendering ANSI content:', error);
    try {
      // Try to at least strip ANSI codes
      return <span>{stripAnsi(content) || '\u00A0'}</span>;
    } catch (stripError) {
      // Last resort - just show raw content or placeholder
      console.error('[SafeAnsiRenderer] Error stripping ANSI:', stripError);
      return <span>{content || '\u00A0'}</span>;
    }
  }
};

export const HarvestTerminal: React.FC<HarvestTerminalProps> = ({ 
  farmId, 
  className = '',
  defaultView = 'grid'  // Default to grid view to show multiple agents
}) => {
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
  const [viewMode, setViewMode] = useState<'farm' | 'grid' | 'single' | 'stacked' | 'workflow'>(defaultView);
  const [pausedAgents, setPausedAgents] = useState<{ [key: number]: boolean }>({});
  const [showPromptForAgent, setShowPromptForAgent] = useState<{ [key: number]: boolean }>({});
  const [sessionCheckCount, setSessionCheckCount] = useState(0);
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const [lastLines, setLastLines] = useState<Map<number, string>>(new Map());
  const [htmlPreviews, setHtmlPreviews] = useState<Array<{filePath: string; agentId: number; agentName: string}>>([]);
  const [showHtmlPreview, setShowHtmlPreview] = useState<{filePath: string; agentId: number; agentName: string; farmId: string} | null>(null);
  const [terminalTheme, setTerminalTheme] = useState<'professional-dark' | 'professional-light' | 'default'>('professional-dark');
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const gridTerminalRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscriptionKeysRef = useRef<string[]>([]);
  const messageDedupeCache = useRef<Map<string, number>>(new Map()); // Cache for deduplicating messages

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
            
            // Enhanced logging for GoWild detection
            const isGoWild = farmData.metadata?.isGoWild || 
                           farmData.mode === 'goWild' || 
                           farmData.config?.goWildMode?.enabled;
            
            if (isGoWild) {
              console.log('[HarvestTerminal] 🌟 GoWild Farm Detected:', {
                farmId: farmData.id,
                mode: farmData.mode,
                agentCount: farmData.agents?.length || 0,
                agentTypes: farmData.agents?.map((a: any) => typeof a) || [],
                metadata: farmData.metadata,
                config: farmData.config
              });
            }
            setCurrentFarm(farmData);
            // Create agent name mapping from fetched farm data
            if (farmData.agents && farmData.agents.length > 0) {
              // Handle both object agents and string agent IDs (GoWild case)
              const isGoWildFarm = farmData.metadata?.isGoWild || 
                                   farmData.mode === 'goWild' || 
                                   farmData.agents.some((a: any) => typeof a === 'string');
              
              if (isGoWildFarm && farmData.agents.every((a: any) => typeof a === 'string')) {
                // GoWild farms with string agent IDs - create simple mapping
                const simpleMapping: any = {};
                farmData.agents.forEach((agentId: string, index: number) => {
                  simpleMapping[index] = getAgentNameByIndex(index);
                });
                setAgentNameMapping(simpleMapping);
                console.log('[HarvestTerminal] Created GoWild agent mapping with', farmData.agents.length, 'string agents');
              } else {
                // Standard farms with agent objects
                const mapping = createAgentNameMapping(farmData);
                setAgentNameMapping(mapping);
                console.log('[HarvestTerminal] Created standard agent name mapping with', farmData.agents.length, 'agents');
              }
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
    // Validate agentIndex
    if (typeof agentIndex !== 'number' || isNaN(agentIndex) || agentIndex < 0) {
      console.warn('[HarvestTerminal] Invalid agentIndex:', agentIndex);
      return `Agent ${agentIndex || 0}`;
    }
    
    // First try to use the mapping from the farm data
    if (agentNameMapping) {
      const mappedName = getAgentName(agentIndex, agentNameMapping);
      // If we get a valid farm animal name, use it
      if (mappedName && !mappedName.startsWith('Agent-') && !mappedName.startsWith('Agent ')) {
        return mappedName;
      }
    }
    
    // If no mapping or invalid mapping, check if we have farm data with agents
    if (currentFarm && currentFarm.agents && currentFarm.agents[agentIndex]) {
      const agent = currentFarm.agents[agentIndex];
      
      // Handle both object agents and string agent IDs (GoWild case)
      if (typeof agent === 'string') {
        // GoWild farms may have string agent IDs
        return getAgentNameByIndex(agentIndex);
      } else if (typeof agent === 'object' && agent) {
        // Standard farm with agent objects
        if (agent.name && agent.name !== `Agent ${agent.id?.slice(0, 8)}` && !agent.name.startsWith('Agent ')) {
          return agent.name;
        }
      }
    }
    
    // Fallback to farm animal names based on index
    return getAgentNameByIndex(agentIndex);
  }, [agentNameMapping, currentFarm]);

  // Use stable WebSocket connection with enhanced terminal configuration
  const { socket, isConnected, reconnect } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567',
    reconnect: true,
    reconnectAttempts: 15,
    reconnectDelay: 1500
  });
  
  // Set up terminal subscription manager
  useEffect(() => {
    if (socket && isConnected) {
      console.log('[HarvestTerminal] Setting up TerminalSubscriptionManager with socket');
      terminalSubscriptionManager.setSocket(socket);
    }
  }, [socket, isConnected]);
  
  // Use tab visibility to manage connection
  const { isVisible, wasInBackground } = useTabVisibility({
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
          const shortFarmId = farmId.substring(0, 8);
          sessionList = sessionList.filter((session: TerminalSession) => {
            // Direct farmId match
            if (session.farmId === farmId) return true;
            if (session.farmId === shortFarmId) return true;
            
            // Session name based matching
            if (session.sessionName) {
              const normalizedName = session.sessionName.toLowerCase();
              const shortIdLower = shortFarmId.toLowerCase();
              
              // Handle quick task sessions - they use their session name as farmId
              if (normalizedName.startsWith('quick_') && farmId.startsWith('quick_')) return true;
              if (normalizedName.includes('quicktask') && farmId.startsWith('quick-task-')) return true;
              
              // Standard farm session matching
              if (normalizedName.includes(shortIdLower)) return true;
              if (normalizedName === farmId) return true;
            }
            return false;
          });
        }
        
        setSessions(sessionList);
        setIsSessionsLoading(false);
        
        // Auto-select first session if none selected - use setState callback to get fresh value
        setSelectedSession(currentSelected => {
          if (sessionList.length > 0 && !currentSelected) {
            const firstSession = sessionList[0];
            console.log('[HarvestTerminal] Auto-selecting first session:', firstSession.sessionName);
            return firstSession.sessionName;
          }
          return currentSelected;
        });
      }
    } catch (error) {
      console.error('[HarvestTerminal] Error fetching sessions:', error);
      setIsSessionsLoading(false);
    }
  }, [farmId]); // Remove selectedSession from dependencies to avoid closure issues

  // Fetch initial terminal output via HTTP
  const fetchTerminalOutput = useCallback(async () => {
    if (!selectedSession) return;
    
    const currentSession = sessions.find(s => s.sessionName === selectedSession);
    if (!currentSession) return;
    
    setIsLoading(true);
    try {
      const outputs: { [key: number]: string[] } = {};
      
      for (let i = 0; i < currentSession.paneCount; i++) {
        const response = await fetch(`/api/terminal/output?session=${encodeURIComponent(selectedSession)}&pane=${i}`);
        if (response.ok) {
          const data = await response.json();
          outputs[i] = data.data || [];
        }
      }
      
      setTerminalOutputs(outputs);
    } catch (error) {
      console.error('[HarvestTerminal] Error fetching terminal output:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSession, sessions]);
  
  // Setup robust WebSocket terminal streaming using TerminalSubscriptionManager
  useEffect(() => {
    // Validate all required conditions
    if (!socket || !isConnected || !selectedSession || selectedSession.trim() === '') {
      console.log('[HarvestTerminal] Skipping subscription setup - missing requirements:', {
        hasSocket: !!socket,
        isConnected,
        selectedSession: selectedSession || 'null',
        selectedSessionLength: selectedSession?.length || 0
      });
      return;
    }
    
    console.log(`[HarvestTerminal] Setting up robust terminal subscription for: ${selectedSession}`);
    
    // Clear previous output when switching sessions
    setTerminalOutputs({});
    
    // Clean up previous subscriptions
    subscriptionKeysRef.current.forEach(key => {
      terminalSubscriptionManager.unsubscribe(key);
    });
    subscriptionKeysRef.current = [];
    
    // Create subscription callback for handling terminal output
    const handleTerminalOutput = (data: {
      sessionName?: string;
      sessionId?: string;
      sessionIdFallback?: string;
      farmId?: string;
      agentId: number | string;  // Accept both types for compatibility
      lines?: string[];
      output?: string;
      timestamp?: number | Date;
    }) => {
      // Create a deduplication key based on content and agent
      const dedupeKey = `${data.agentId}-${data.output || (data.lines && data.lines.join('')) || ''}`;
      const now = Date.now();
      
      // Check if we've seen this exact message recently (within 500ms)
      if (messageDedupeCache.current.has(dedupeKey)) {
        const lastSeen = messageDedupeCache.current.get(dedupeKey)!;
        if (now - lastSeen < 500) {
          console.log('[HarvestTerminal] Duplicate message detected, skipping');
          return; // Skip duplicate message
        }
      }
      
      // Store this message in the cache
      messageDedupeCache.current.set(dedupeKey, now);
      
      // Clean up old entries from cache (keep only last 100 entries)
      if (messageDedupeCache.current.size > 100) {
        const entries = Array.from(messageDedupeCache.current.entries());
        const toKeep = entries.slice(-100);
        messageDedupeCache.current = new Map(toKeep);
      }
      
      // CRITICAL FIX: Validate and normalize agentId FIRST
      let agentIndex: number;
      
      // Handle both string and number agentId types
      if (typeof data.agentId === 'string') {
        // Try to parse agentId as a number
        const parsed = parseInt(data.agentId, 10);
        if (isNaN(parsed)) {
          console.error('[HarvestTerminal] ⚠️ Invalid agentId (not a number):', data.agentId);
          return; // Exit early if we can't parse the agentId
        }
        agentIndex = parsed;
      } else if (typeof data.agentId === 'number') {
        agentIndex = data.agentId;
      } else {
        console.error('[HarvestTerminal] ⚠️ Invalid agentId type:', typeof data.agentId, data.agentId);
        return; // Exit early if agentId is neither string nor number
      }
      
      // Validate agentIndex is within reasonable bounds (0-999)
      if (agentIndex < 0 || agentIndex > 999) {
        console.error('[HarvestTerminal] ⚠️ AgentId out of bounds:', agentIndex);
        return;
      }
      
      // Enhanced session matching logic for quick tasks and farms
      const sessionMatches = (
        data.sessionName === selectedSession ||
        data.sessionId === selectedSession ||
        data.farmId === selectedSession ||
        data.sessionIdFallback === selectedSession ||
        (data.sessionName?.startsWith('quick_') && selectedSession?.startsWith('quick_')) ||
        (data.farmId?.startsWith('quick_') && selectedSession?.startsWith('quick_'))
      );
      
      // Enhanced monitoring for GoWild terminal data
      const isGoWildSession = data.sessionName?.includes('goWild') || 
                             data.sessionId?.includes('goWild') ||
                             selectedSession?.includes('goWild');
      
      if (isGoWildSession) {
        console.log('[HarvestTerminal] 🌟 GoWild Terminal Output:', {
          sessionName: data.sessionName,
          sessionId: data.sessionId,
          farmId: data.farmId,
          originalAgentId: data.agentId,
          originalAgentIdType: typeof data.agentId,
          parsedAgentIndex: agentIndex,
          hasOutput: !!data.output,
          hasLines: !!data.lines,
          outputLength: data.output?.length || 0,
          linesCount: data.lines?.length || 0,
          selectedSession,
          sessionMatches,
          dataStructure: Object.keys(data)
        });
        
        // Monitor for potential issues
        if (typeof data.agentId === 'string') {
          console.warn('[HarvestTerminal] ⚠️ GoWild agentId is string, converted to:', agentIndex);
        }
      } else {
        console.log('[HarvestTerminal] 🎯 TERMINAL OUTPUT RECEIVED:', {
          sessionName: data.sessionName,
          sessionId: data.sessionId,
          farmId: data.farmId,
          originalAgentId: data.agentId,
          parsedAgentIndex: agentIndex,
          hasOutput: !!data.output,
          hasLines: !!data.lines,
          outputLength: data.output?.length || 0,
          linesCount: data.lines?.length || 0,
          selectedSession,
          sessionMatches
        });
      }
      
      // Only process output if it matches our selected session
      if (!sessionMatches) {
        console.log('[HarvestTerminal] Ignoring output - session mismatch');
        return;
      }
      
      // Convert output to lines array (handle both formats)
      let linesToAdd: string[] = [];
      if (data.lines && Array.isArray(data.lines)) {
        linesToAdd = data.lines;
      } else if (data.output && typeof data.output === 'string') {
        linesToAdd = data.output.split('\n');
      } else {
        console.warn('[HarvestTerminal] Received terminal output with no valid data');
        return;
      }
      
      console.log(`[HarvestTerminal] Processing ${linesToAdd.length} lines for agent ${agentIndex}`, {
        agentIndex,
        originalAgentId: data.agentId,
        sessionName: data.sessionName,
        firstLine: linesToAdd[0]?.substring(0, 50) // Log first 50 chars of first line
      });
      
      // Deduplicate lines to prevent showing the same output multiple times
      setTerminalOutputs(prev => {
        const updated = { ...prev };
        if (!updated[agentIndex]) {
          updated[agentIndex] = [];
          console.log(`[HarvestTerminal] Created new output array for agent ${agentIndex}`);
        }
        
        const previousLength = updated[agentIndex].length;
        const existingLines = updated[agentIndex];
        
        // Check if the last line matches the first new line (duplicate detection)
        let newLinesToAdd = linesToAdd;
        if (existingLines.length > 0 && linesToAdd.length > 0) {
          const lastExistingLine = existingLines[existingLines.length - 1];
          const firstNewLine = linesToAdd[0];
          
          // If they match, we might be getting duplicate data
          if (lastExistingLine === firstNewLine) {
            console.log(`[HarvestTerminal] Detected potential duplicate at agent ${agentIndex}, skipping first line`);
            newLinesToAdd = linesToAdd.slice(1);
          }
        }
        
        // Also check if we're getting the exact same set of lines (complete duplicate)
        if (existingLines.length >= linesToAdd.length) {
          const recentLines = existingLines.slice(-linesToAdd.length);
          const isDuplicate = recentLines.every((line, index) => line === linesToAdd[index]);
          if (isDuplicate) {
            console.log(`[HarvestTerminal] Detected complete duplicate output for agent ${agentIndex}, skipping`);
            return prev; // Don't update if it's a complete duplicate
          }
        }
        
        updated[agentIndex] = [...existingLines, ...newLinesToAdd];
        console.log(`[HarvestTerminal] Updated agent ${agentIndex}: ${previousLength} -> ${updated[agentIndex].length} lines`);
        
        // Keep only last 1000 lines per agent
        if (updated[agentIndex].length > 1000) {
          updated[agentIndex] = updated[agentIndex].slice(-1000);
        }
        return updated;
      });
    };
    
    // Subscribe to terminal sessions using the robust subscription manager
    const sessionVariations = new Set<string>(); // Use Set to avoid duplicates
    
    // If we have a farmId, create the most specific session variation first
    if (farmId) {
      // Extract different ID formats
      const shortFarmId = farmId.substring(0, 8);
      const fullFarmId = farmId;
      
      // Determine the session type and add only the most relevant patterns
      // This prevents duplicate subscriptions that cause the same output to appear multiple times
      if (selectedSession) {
        // If we have a selected session, prioritize it
        sessionVariations.add(selectedSession);
      } else {
        // Add patterns based on farm type - only add the most likely ones
        // Standard farm session pattern (most common)
        sessionVariations.add(`farm-${shortFarmId}`);
        
        // Only add other patterns if they match the farm type
        if (farmId.startsWith('qt-') || farmId.includes('quick')) {
          sessionVariations.add(`quick_${shortFarmId}`);
          sessionVariations.add(`quick-task-${shortFarmId}`);
        } else if (currentFarm?.mode === 'goWild' || currentFarm?.metadata?.isGoWild) {
          sessionVariations.add(`goWild-${shortFarmId}`);
        }
        
        // Add the farmId as fallback
        sessionVariations.add(farmId);
      }
    }
    
    // Always include the selected session if it exists
    if (selectedSession) {
      sessionVariations.add(selectedSession);
      
      // Also add variations of selected session for better matching
      if (selectedSession.includes('-')) {
        const parts = selectedSession.split('-');
        if (parts.length >= 2) {
          // Try last part as potential ID
          const potentialId = parts[parts.length - 1];
          if (potentialId.length >= 8) {
            sessionVariations.add(potentialId);
            sessionVariations.add(potentialId.substring(0, 8));
          }
        }
      }
    }
    
    console.log(`[HarvestTerminal] Creating subscriptions for ${sessionVariations.size} unique session variations:`, Array.from(sessionVariations));
    
    // Create subscriptions for all session variations
    const variationsArray = Array.from(sessionVariations);
    variationsArray.forEach((sessionId, index) => {
      if (sessionId && sessionId.trim()) {
        console.log(`[HarvestTerminal] [${index + 1}/${variationsArray.length}] Creating subscription for: ${sessionId}`);
        
        const subscriptionKey = terminalSubscriptionManager.subscribe(
          sessionId.trim(),
          farmId,
          handleTerminalOutput
        );
        
        subscriptionKeysRef.current.push(subscriptionKey);
        console.log(`[HarvestTerminal] Created subscription ${subscriptionKey} for session ${sessionId}`);
      } else {
        console.warn(`[HarvestTerminal] Skipping invalid session ID at index ${index}:`, sessionId);
      }
    });
    
    console.log(`[HarvestTerminal] Created ${subscriptionKeysRef.current.length} terminal subscriptions`);
    
    // Cleanup function
    return () => {
      console.log(`[HarvestTerminal] Cleaning up ${subscriptionKeysRef.current.length} terminal subscriptions`);
      subscriptionKeysRef.current.forEach(key => {
        terminalSubscriptionManager.unsubscribe(key);
      });
      subscriptionKeysRef.current = [];
    };
  }, [socket, isConnected, selectedSession, farmId]);

  // Send command to specific agent
  const sendCommand = async (agentIndex: number) => {
    const cmd = agentCommands[agentIndex];
    if (!cmd || !selectedSession) return;
    
    try {
      const response = await fetch('/api/terminal/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedSession,
          pane: agentIndex,
          command: cmd
        })
      });
      
      if (response.ok) {
        setAgentCommands(prev => ({ ...prev, [agentIndex]: '' }));
        // Refresh output after sending command
        setTimeout(() => fetchTerminalOutput(), 500);
      }
    } catch (error) {
      console.error('[HarvestTerminal] Error sending command:', error);
    }
  };

  // Toggle agent pause
  const toggleAgentPause = (agentIndex: number) => {
    setPausedAgents(prev => ({
      ...prev,
      [agentIndex]: !prev[agentIndex]
    }));
  };

  // Copy terminal output to clipboard
  const copyToClipboard = async (agentIndex: number) => {
    const output = terminalOutputs[agentIndex];
    if (output) {
      const text = output.join('\n');
      await navigator.clipboard.writeText(text);
    }
  };

  // Launch agents for the farm using MaiFarmer orchestration
  const launchAgents = async () => {
    if (!farmId) return;
    
    try {
      // Check if farm is GoWild mode
      const isGoWild = currentFarm?.mode === 'goWild' || farmId.includes('goWild');
      
      const response = await fetch(`/api/farms/${farmId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentCount: isGoWild ? 5 : 3,  // More agents for GoWild
          useFarmers: true,  // Use MaiFarmer orchestration
          farmers: isGoWild 
            ? ['buzz-bee', 'daisy-donkey', 'harvest-hound', 'wilbur-pig', 'clucky-chicken']
            : ['buzz-bee', 'daisy-donkey', 'harvest-hound'],
          orchestrator: 'maifarmer'  // Explicitly specify MaiFarmer
        })
      });
      
      if (response.ok) {
        // Refresh sessions after launch
        setTimeout(() => {
          fetchSessions('launch', true);
        }, 2000);
      }
    } catch (error) {
      console.error('[HarvestTerminal] Error launching agents:', error);
    }
  };

  // Initial load and when farmId changes
  useEffect(() => {
    fetchSessions('initial', true);
  }, [fetchSessions, farmId]);

  // Fetch terminal output when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchTerminalOutput();
    }
  }, [selectedSession, fetchTerminalOutput]);
  
  // Auto-refresh terminal output as fallback for WebSocket streaming
  useEffect(() => {
    if (autoRefresh && selectedSession && isVisible) {
      // Use polling as backup even if WebSocket is connected
      // This ensures we get updates even if WebSocket events are missed
      console.log('[HarvestTerminal] Setting up auto-refresh for session:', selectedSession);
      refreshIntervalRef.current = setInterval(() => {
        console.log('[HarvestTerminal] Auto-refresh triggered');
        fetchTerminalOutput();
      }, 2000); // Poll every 2 seconds for better responsiveness
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedSession, isConnected, isVisible, socket, fetchTerminalOutput]);

  // Get current session
  const currentSession = sessions.find(s => s.sessionName === selectedSession);
  
  // Ensure we have the correct agent count from the farm if session doesn't have it
  const effectivePaneCount = currentSession?.paneCount || 
    (currentFarm?.agents?.length) || 
    (currentFarm?.config?.numberOfAgents) || 
    2; // Default to 2 agents if nothing else is available

  return (
    <>
      <div className={`harvest-terminal ${isFullscreen ? 'fixed inset-0 z-[60] lg:left-64' : 'h-full'} ${className}`}>
        <div className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 rounded-3xl shadow-2xl h-full flex flex-col overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
          {/* Header with Glass Effect */}
          <div className="backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 px-4 py-3 rounded-t-3xl border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-2 backdrop-blur-xl bg-white/60 dark:bg-gray-700/60 rounded-xl">
                  <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                
                {/* Session Selector with Glass Effect */}
                {sessions.length > 0 && (
                  <select
                    value={selectedSession || ''}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="backdrop-blur-xl bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-white px-3 py-1.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-200/50 dark:border-gray-600/50 transition-all duration-300"
                  >
                    <option value="">Select a session</option>
                    {sessions.map(session => (
                      <option key={session.sessionName} value={session.sessionName}>
                        {session.sessionName} ({session.paneCount} agents)
                      </option>
                    ))}
                  </select>
                )}
                
                {/* Status */}
                {currentSession && (
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-gray-400">Agents:</span>
                    <span className="text-green-400 font-bold">{currentSession.paneCount}</span>
                  </div>
                )}
              </div>
              
              {/* Controls with Glass Effect */}
              <div className="flex items-center space-x-2">
                {/* View Mode Toggle with Glass Effect */}
                <div className="flex items-center backdrop-blur-xl bg-white/70 dark:bg-gray-700/70 rounded-2xl p-0.5 border border-gray-200/50 dark:border-gray-600/50 shadow-lg">
                    <Tooltip content="Farm View" position="bottom">
                      <button
                        onClick={() => setViewMode('farm')}
                        className={`p-1.5 rounded-xl transition-all duration-300 ${
                          viewMode === 'farm' 
                            ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-lg' 
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <TreePine className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Grid View" position="bottom">
                      <button
                        onClick={() => currentSession && setViewMode('grid')}
                        disabled={!currentSession}
                        className={`p-1.5 rounded-xl transition-all duration-300 ${
                          viewMode === 'grid' 
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-lg' 
                            : currentSession
                              ? 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Stacked View" position="bottom">
                      <button
                        onClick={() => currentSession && setViewMode('stacked')}
                        disabled={!currentSession}
                        className={`p-1.5 rounded transition-colors ${
                          viewMode === 'stacked' 
                            ? 'bg-blue-600 text-white' 
                            : currentSession
                              ? 'text-gray-400 hover:text-white'
                              : 'text-gray-600 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <Layers className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Single Agent View" position="bottom">
                      <button
                        onClick={() => currentSession && setViewMode('single')}
                        disabled={!currentSession}
                        className={`p-1.5 rounded transition-colors ${
                          viewMode === 'single' 
                            ? 'bg-blue-600 text-white' 
                            : currentSession
                              ? 'text-gray-400 hover:text-white'
                              : 'text-gray-600 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <Monitor className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Workflow View" position="bottom">
                      <button
                        onClick={() => setViewMode('workflow')}
                        className={`p-1.5 rounded-xl transition-all duration-300 ${
                          viewMode === 'workflow' 
                            ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-lg' 
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                
                <Tooltip content="Refresh Output" position="bottom">
                  <button
                    onClick={() => fetchTerminalOutput()}
                    disabled={isLoading}
                    className="p-2 backdrop-blur-xl bg-white/80 dark:bg-gray-700/80 rounded-xl hover:bg-white/90 dark:hover:bg-gray-700/90 transition-all duration-300 disabled:opacity-50 border border-gray-200/50 dark:border-gray-600/50 shadow-lg"
                  >
                    <RefreshCw className={`w-4 h-4 text-gray-600 dark:text-gray-300 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </Tooltip>
                
                <Tooltip content={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'} position="bottom">
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`p-2 backdrop-blur-xl rounded-xl transition-all duration-300 border shadow-lg ${
                      autoRefresh 
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                        : 'bg-white/80 dark:bg-gray-700/80 hover:bg-white/90 dark:hover:bg-gray-700/90 border-gray-200/50 dark:border-gray-600/50 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {autoRefresh ? (
                      <Play className="w-4 h-4" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </button>
                </Tooltip>
                
                <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} position="bottom">
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 backdrop-blur-xl bg-white/80 dark:bg-gray-700/80 rounded-xl hover:bg-white/90 dark:hover:bg-gray-700/90 transition-all duration-300 border border-gray-200/50 dark:border-gray-600/50 shadow-lg"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Terminal Display */}
          {viewMode === 'farm' ? (
            // Farm View
            <div className="flex-1 overflow-hidden">
              <FarmLandscape
                farmId={farmId || 'default'}
                farmName={currentFarm?.name || 'Digital Farm'}
                agents={currentSession ? Array.from({ length: currentSession.paneCount }, (_, i) => ({
                  id: i,
                  name: getAgentDisplayName(i),
                  status: pausedAgents[i] ? 'idle' : 'working',
                  uid: `agent-${i}`
                })) : []}
                weather={currentFarm?.status === 'active' ? 'sunny' : 'cloudy'}
                onLaunchAgents={launchAgents}
              />
            </div>
          ) : !currentSession ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {isSessionsLoading ? 'Loading sessions...' : 'No terminal sessions available - Switch to Farm View'}
            </div>
          ) : viewMode === 'grid' ? (
            // Professional Grid View with Apple Glass Effect
            <div className="flex-1 bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-black p-3 sm:p-4 md:p-6 overflow-y-auto min-h-0">
              <div className={`grid gap-2 sm:gap-3 md:gap-4 ${
                effectivePaneCount <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                effectivePaneCount <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
                effectivePaneCount <= 6 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              } auto-rows-fr`}>
                {Array.from({ length: effectivePaneCount }, (_, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border border-gray-200/50 dark:border-gray-700/50 rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300"
                  >
                    <div className="backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 px-4 py-3 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-700/50">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-sm font-medium text-gray-200">{getAgentDisplayName(i)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => toggleAgentPause(i)}
                          className={`p-1 rounded ${pausedAgents[i] ? 'bg-yellow-600' : 'hover:bg-gray-700'}`}
                        >
                          {pausedAgents[i] ? <Play className="w-3 h-3 text-white" /> : <Pause className="w-3 h-3 text-gray-400" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(i)}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div 
                      ref={el => gridTerminalRefs.current[i] = el}
                      className={`p-2 sm:p-3 md:p-4 overflow-y-auto font-mono text-xs flex-1 min-h-[200px] max-h-[400px] ${
                        terminalTheme === 'professional-dark' ? 'bg-black/80 text-blue-300' :
                        terminalTheme === 'professional-light' ? 'bg-gray-100 text-gray-800' :
                        'bg-gradient-to-br from-blue-950/50 to-black/80 text-cyan-300'
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: terminalTheme === 'professional-dark' ? '#374151 #111827' : 
                                       terminalTheme === 'professional-light' ? '#d1d5db #f3f4f6' :
                                       '#1e40af #030712',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        height: 'clamp(200px, 30vh, 400px)'
                      }}
                    >
                      {terminalOutputs[i]?.map((line, idx) => (
                        <div key={idx} className="whitespace-pre-wrap leading-relaxed break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
                          <SafeAnsiRenderer content={line || '\u00A0'} />
                        </div>
                      )) || (
                        <div className="text-gray-500 flex items-center space-x-2">
                          <Activity className="w-3 h-3 animate-pulse" />
                          <span>Awaiting output...</span>
                        </div>
                      )}
                    </div>
                    {/* Professional Command Input */}
                    <div className="bg-gray-800/40 backdrop-blur-sm px-2 sm:px-3 md:px-4 py-2 sm:py-3 border-t border-gray-700/30">
                      <div className="flex items-center space-x-2">
                        <ChevronRight className="w-3 h-3 text-blue-400" />
                        <input
                          type="text"
                          value={agentCommands[i] || ''}
                          onChange={(e) => setAgentCommands(prev => ({ ...prev, [i]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && sendCommand(i)}
                          className="flex-1 bg-transparent text-gray-200 text-xs outline-none placeholder-gray-500"
                          placeholder="Enter command..."
                        />
                        <button
                          onClick={() => sendCommand(i)}
                          className="p-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/20"
                        >
                          <Send className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : viewMode === 'stacked' ? (
            // Professional Stacked View
            <div className="flex-1 bg-gradient-to-br from-gray-950 via-gray-900 to-black p-3 sm:p-4 md:p-6 overflow-y-auto min-h-0">
              <div className="space-y-2 sm:space-y-3 md:space-y-4">
                {Array.from({ length: effectivePaneCount }, (_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-gray-900/50 backdrop-blur-sm border border-gray-700/30 rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300"
                  >
                    <div className="bg-gradient-to-r from-gray-800/60 to-gray-900/60 backdrop-blur-sm px-5 py-3 flex items-center justify-between border-b border-gray-700/30">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium text-gray-200">{getAgentDisplayName(i)}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20">Active</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleAgentPause(i)}
                          className={`p-1 rounded ${pausedAgents[i] ? 'bg-yellow-600' : 'hover:bg-gray-700'}`}
                        >
                          {pausedAgents[i] ? <Play className="w-3 h-3 text-white" /> : <Pause className="w-3 h-3 text-gray-400" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(i)}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </button>
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedAgents);
                            if (newExpanded.has(i)) {
                              newExpanded.delete(i);
                            } else {
                              newExpanded.add(i);
                            }
                            setExpandedAgents(newExpanded);
                          }}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          {expandedAgents.has(i) ? <Minimize2 className="w-3 h-3 text-gray-400" /> : <Maximize2 className="w-3 h-3 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                    <div className={`p-3 sm:p-4 md:p-5 font-mono text-xs overflow-y-auto transition-all duration-300 ${
                      expandedAgents.has(i) ? 'min-h-[300px] max-h-[500px]' : 'min-h-[150px] max-h-[250px]'
                    } ${
                      terminalTheme === 'professional-dark' ? 'bg-black/80 text-blue-300' :
                      terminalTheme === 'professional-light' ? 'bg-gray-100 text-gray-800' :
                      'bg-gradient-to-br from-blue-950/50 to-black/80 text-cyan-300'
                    }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: terminalTheme === 'professional-dark' ? '#374151 #111827' : 
                                       terminalTheme === 'professional-light' ? '#d1d5db #f3f4f6' :
                                       '#1e40af #030712',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        height: expandedAgents.has(i) ? 'clamp(300px, 40vh, 500px)' : 'clamp(150px, 25vh, 250px)'
                      }}
                    >
                      {terminalOutputs[i]?.map((line, idx) => (
                        <div key={idx} className="whitespace-pre-wrap leading-relaxed hover:bg-white/5 px-1 -mx-1 rounded transition-colors break-words overflow-wrap-anywhere">
                          <SafeAnsiRenderer content={line || '\u00A0'} />
                        </div>
                      )) || (
                        <div className="text-gray-500 flex items-center space-x-2">
                          <Activity className="w-3 h-3 animate-pulse" />
                          <span>Awaiting output...</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : viewMode === 'workflow' ? (
            // Workflow View
            <div className="flex-1 overflow-hidden">
              <WorkflowVisualization
                agents={currentSession ? Array.from({ length: currentSession.paneCount }, (_, i) => ({
                  id: `agent-${i}`,
                  name: getAgentDisplayName(i),
                  status: pausedAgents[i] ? 'idle' : 'active',
                  progress: 0,
                  messages: terminalOutputs[i]?.slice(-5) || []
                })) : []}
                onLaunchAgents={launchAgents}
                onSendCommand={(agentId: string, cmd: string) => {
                  const agentIndex = parseInt(agentId.replace('agent-', ''));
                  setAgentCommands(prev => ({ ...prev, [agentIndex]: cmd }));
                  sendCommand(agentIndex);
                }}
                farmId={farmId}
              />
            </div>
          ) : (
            // Professional Single View
            <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-black overflow-hidden">
              {/* Process Selector */}
              <div className="bg-gray-900/60 backdrop-blur-sm px-6 py-3 border-b border-gray-700/30">
                <div className="flex items-center space-x-3 overflow-x-auto">
                  {Array.from({ length: effectivePaneCount }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedAgent(i)}
                      className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-200 ${
                        selectedAgent === i
                          ? 'bg-blue-600/80 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-gray-800/40 text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700/30'
                      }`}
                    >
                      {getAgentDisplayName(i)}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Professional Single Terminal */}
              <div className={`flex-1 p-6 overflow-y-auto font-mono text-sm min-h-0 ${
                terminalTheme === 'professional-dark' ? 'bg-black/80 text-blue-300' :
                terminalTheme === 'professional-light' ? 'bg-gray-100 text-gray-800' :
                'bg-gradient-to-br from-blue-950/50 to-black/80 text-cyan-300'
              }`}
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: terminalTheme === 'professional-dark' ? '#374151 #111827' : 
                                 terminalTheme === 'professional-light' ? '#d1d5db #f3f4f6' :
                                 '#1e40af #030712'
                }}
              >
                {terminalOutputs[selectedAgent]?.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap leading-relaxed hover:bg-white/5 px-2 -mx-2 rounded transition-colors break-words overflow-wrap-anywhere">
                    <SafeAnsiRenderer content={line || '\u00A0'} />
                  </div>
                )) || (
                  <div className="text-gray-500 flex items-center justify-center h-full">
                    <div className="text-center">
                      <Activity className="w-8 h-8 mx-auto mb-3 animate-pulse" />
                      <p>Awaiting output from {getAgentDisplayName(selectedAgent)}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Professional Command Input */}
              <div className="bg-gray-900/60 backdrop-blur-sm px-6 py-4 border-t border-gray-700/30">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 text-blue-400">
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-sm font-medium">{getAgentDisplayName(selectedAgent)}</span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        sendCommand(selectedAgent);
                        setCommand('');
                      }
                    }}
                    className="flex-1 bg-gray-800/40 backdrop-blur-sm text-gray-200 px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-700/30 placeholder-gray-500"
                    placeholder="Enter command..."
                  />
                  <button
                    onClick={() => {
                      sendCommand(selectedAgent);
                      setCommand('');
                    }}
                    className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/20 flex items-center space-x-2"
                  >
                    <Send className="w-4 h-4 text-white" />
                    <span className="text-sm font-medium text-white">Send</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HTML Preview Modal */}
      <AnimatePresence>
        {showHtmlPreview && (
          <HtmlPreview
            filePath={showHtmlPreview.filePath}
            farmId={showHtmlPreview.farmId || farmId || ''}
            agentId={showHtmlPreview.agentId}
            agentName={showHtmlPreview.agentName}
            onClose={() => setShowHtmlPreview(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// Export wrapped version with error boundary for safety
export const HarvestTerminalWithErrorBoundary: React.FC<HarvestTerminalProps> = (props) => {
  return (
    <HarvestTerminalErrorBoundary farmId={props.farmId}>
      <HarvestTerminal {...props} />
    </HarvestTerminalErrorBoundary>
  );
};