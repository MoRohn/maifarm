import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { CanvasAddon } from 'xterm-addon-canvas';
import 'xterm/css/xterm.css';
import {
  Terminal, RefreshCw, Send, Maximize2, Minimize2, Copy, Download,
  Grid, LayoutList, Pause, Play, MessageSquare, FileText,
  Command, Search, Settings, Moon, Sun, Zap, Activity,
  Layers, Globe, Smartphone, Monitor, ChevronDown, ChevronRight,
  Eye, EyeOff, Lock, Unlock, AlertCircle, CheckCircle,
  Cpu, HardDrive, Wifi, WifiOff, Cloud, CloudOff
} from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFarmStore } from '../../store/farmStore';
import { getAgentName, createAgentNameMapping } from '../../utils/agentNameMapper';
import { useTabVisibility } from '../../hooks/useTabVisibility';
import { Tooltip } from '../common/Tooltip';
import { AgentBar } from './AgentBar';
import { HtmlPreview } from './HtmlPreview';
import { useSettingsStore } from '../../store/settingsStore';

// Terminal themes
const TERMINAL_THEMES = {
  matrix: {
    name: 'Matrix',
    background: '#0a0a0a',
    foreground: '#00ff00',
    cursor: '#00ff00',
    selection: '#00ff0033',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0066ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff'
  },
  cyberpunk: {
    name: 'Cyberpunk',
    background: '#0f0f23',
    foreground: '#ff00ff',
    cursor: '#ff00ff',
    selection: '#ff00ff33',
    black: '#0f0f23',
    red: '#ff0040',
    green: '#00ff88',
    yellow: '#ffdd00',
    blue: '#00d9ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff'
  },
  dracula: {
    name: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2'
  },
  solarized: {
    name: 'Solarized Dark',
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496',
    selection: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5'
  },
  monokai: {
    name: 'Monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2'
  },
  retro: {
    name: 'Retro Amber',
    background: '#0c0c0c',
    foreground: '#ffb000',
    cursor: '#ffb000',
    selection: '#ffb00033',
    black: '#0c0c0c',
    red: '#ff6600',
    green: '#ffb000',
    yellow: '#ffdd00',
    blue: '#ff9900',
    magenta: '#ff6600',
    cyan: '#ffcc00',
    white: '#ffb000'
  },
  nord: {
    name: 'Nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selection: '#434c5e',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0'
  }
};

interface TerminalSession {
  sessionName: string;
  paneCount: number;
  windowName: string;
  active: boolean;
  farmId?: string;
  metadata?: any;
}

interface HarvestTerminalProProps {
  farmId?: string;
  className?: string;
  legacyMode?: boolean;
  onThemeChange?: (theme: string) => void;
  enableMobileView?: boolean;
  enableCloudflare?: boolean;
}

interface AgentTerminal {
  terminal: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  element?: HTMLDivElement;
}

export const HarvestTerminalPro: React.FC<HarvestTerminalProProps> = ({
  farmId,
  className = '',
  legacyMode = false,
  onThemeChange,
  enableMobileView = true,
  enableCloudflare = false
}) => {
  // State management
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'single' | 'stacked'>('stacked');
  const [currentTheme, setCurrentTheme] = useState<keyof typeof TERMINAL_THEMES>('matrix');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [performanceMetrics, setPerformanceMetrics] = useState({
    fps: 60,
    latency: 0,
    throughput: 0,
    memoryUsage: 0
  });
  const [sessionRecording, setSessionRecording] = useState(false);
  const [recordedCommands, setRecordedCommands] = useState<string[]>([]);
  
  // Terminal references
  const terminalsRef = useRef<Map<number, AgentTerminal>>(new Map());
  const containerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Get farm data
  const farms = useFarmStore(state => state.farms);
  const currentFarm = farmId ? farms.find(f => f.id === farmId) : null;
  const agentNameMapping = currentFarm ? createAgentNameMapping(currentFarm) : null;
  
  // Settings
  const settings = useSettingsStore();
  const enableAnimations = settings.settings?.system?.performance?.animationsEnabled ?? true;
  const terminalFontSize = settings.settings?.user?.theme?.fontSize === 'small' ? 12 : 
                          settings.settings?.user?.theme?.fontSize === 'large' ? 16 : 14;
  
  // WebSocket connection
  const { socket, isConnected, reconnect } = useWebSocket();
  
  // Tab visibility hook
  const { isVisible, wasInBackground } = useTabVisibility({
    onVisible: () => {
      if (wasInBackground && !isConnected) {
        reconnect();
      }
    }
  });
  
  // Helper function to get agent display name
  const getAgentDisplayName = useCallback((agentIndex: number): string => {
    if (agentNameMapping) {
      return getAgentName(agentIndex, agentNameMapping, `Agent ${agentIndex}`);
    }
    return `Agent ${agentIndex}`;
  }, [agentNameMapping]);
  
  // Initialize XTerm terminal for an agent
  const initializeTerminal = useCallback((agentId: number, container: HTMLDivElement) => {
    if (terminalsRef.current.has(agentId)) {
      return terminalsRef.current.get(agentId)!;
    }
    
    const theme = TERMINAL_THEMES[currentTheme];
    const terminal = new XTerm({
      theme: {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        selection: theme.selection,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.black,
        brightRed: theme.red,
        brightGreen: theme.green,
        brightYellow: theme.yellow,
        brightBlue: theme.blue,
        brightMagenta: theme.magenta,
        brightCyan: theme.cyan,
        brightWhite: theme.white
      },
      fontSize: terminalFontSize,
      fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 10000,
      rendererType: 'canvas'
    });
    
    // Add addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const canvasAddon = new CanvasAddon();
    
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(canvasAddon);
    
    // Open terminal in container
    terminal.open(container);
    fitAddon.fit();
    
    // Welcome message with theme
    terminal.writeln(`\x1b[1;${theme.foreground === '#00ff00' ? '32' : '37'}m╔════════════════════════════════════════╗\x1b[0m`);
    terminal.writeln(`\x1b[1;${theme.foreground === '#00ff00' ? '32' : '37'}m║     HARVEST TERMINAL PRO v2.0          ║\x1b[0m`);
    terminal.writeln(`\x1b[1;${theme.foreground === '#00ff00' ? '32' : '37'}m║     ${getAgentDisplayName(agentId).padEnd(34)} ║\x1b[0m`);
    terminal.writeln(`\x1b[1;${theme.foreground === '#00ff00' ? '32' : '37'}m╚════════════════════════════════════════╝\x1b[0m`);
    terminal.writeln('');
    terminal.writeln(`\x1b[36mTheme: ${theme.name}\x1b[0m`);
    terminal.writeln(`\x1b[33mPress Cmd/Ctrl+K for command palette\x1b[0m`);
    terminal.writeln('');
    
    // Store terminal reference
    const agentTerminal: AgentTerminal = {
      terminal,
      fitAddon,
      searchAddon,
      element: container
    };
    
    terminalsRef.current.set(agentId, agentTerminal);
    
    // Handle terminal input
    terminal.onData((data) => {
      if (socket && isConnected && selectedSession) {
        socket.emit('terminal:input', {
          sessionId: selectedSession,
          agentId,
          data
        });
        
        // Record commands if recording
        if (sessionRecording) {
          setRecordedCommands(prev => [...prev, `[${getAgentDisplayName(agentId)}] ${data}`]);
        }
      }
    });
    
    return agentTerminal;
  }, [currentTheme, getAgentDisplayName, socket, isConnected, selectedSession, sessionRecording, terminalFontSize]);
  
  // Update terminal theme
  const updateTerminalTheme = useCallback((themeName: keyof typeof TERMINAL_THEMES) => {
    const theme = TERMINAL_THEMES[themeName];
    
    terminalsRef.current.forEach((agentTerminal) => {
      agentTerminal.terminal.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        selection: theme.selection,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.black,
        brightRed: theme.red,
        brightGreen: theme.green,
        brightYellow: theme.yellow,
        brightBlue: theme.blue,
        brightMagenta: theme.magenta,
        brightCyan: theme.cyan,
        brightWhite: theme.white
      };
    });
    
    setCurrentTheme(themeName);
    onThemeChange?.(themeName);
    
    // Save theme preference
    settings.updateSettings({
      ...settings.settings,
      user: {
        ...settings.settings.user,
        terminalTheme: themeName
      }
    } as any);
  }, [onThemeChange, settings]);
  
  // Fetch terminal sessions
  const fetchSessions = useCallback(async () => {
    try {
      const url = farmId 
        ? `/api/harvest/terminal/sessions?farmId=${encodeURIComponent(farmId)}`
        : '/api/harvest/terminal/sessions';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data || []);
        
        // Auto-select first session
        if (!selectedSession && data.data?.length > 0) {
          setSelectedSession(data.data[0].sessionName);
        }
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, [farmId, selectedSession]);
  
  // Connect to Cloudflare tunnel
  const connectCloudflare = useCallback(async () => {
    if (!enableCloudflare) return;
    
    setCloudflareStatus('connecting');
    
    try {
      const response = await fetch('/api/cloudflare/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmId,
          sessionId: selectedSession
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setCloudflareStatus('connected');
        
        // Show tunnel URL for mobile access
        if (data.tunnelUrl) {
          console.log('Cloudflare tunnel URL:', data.tunnelUrl);
          // Could show QR code here for mobile scanning
        }
      } else {
        setCloudflareStatus('disconnected');
      }
    } catch (error) {
      console.error('Error connecting to Cloudflare:', error);
      setCloudflareStatus('disconnected');
    }
  }, [enableCloudflare, farmId, selectedSession]);
  
  // Update performance metrics
  const updatePerformanceMetrics = useCallback(() => {
    // Calculate FPS
    let fps = 60;
    let lastTime = performance.now();
    let frames = 0;
    
    const measureFPS = () => {
      frames++;
      const currentTime = performance.now();
      if (currentTime >= lastTime + 1000) {
        fps = Math.round((frames * 1000) / (currentTime - lastTime));
        frames = 0;
        lastTime = currentTime;
      }
      requestAnimationFrame(measureFPS);
    };
    measureFPS();
    
    // Update metrics
    setPerformanceMetrics(prev => ({
      ...prev,
      fps,
      latency: socket?.io?.engine?.transport?.ws?.readyState === 1 ? 
        Math.round(socket.io.engine.transport.ws.bufferedAmount / 1024) : 0,
      throughput: Math.random() * 100, // Mock throughput
      memoryUsage: performance.memory ? 
        Math.round(performance.memory.usedJSHeapSize / 1048576) : 0
    }));
  }, [socket]);
  
  // Command palette actions
  const commandPaletteActions = useMemo(() => [
    {
      id: 'theme-matrix',
      label: 'Switch to Matrix Theme',
      icon: <Terminal className="w-4 h-4" />,
      action: () => updateTerminalTheme('matrix')
    },
    {
      id: 'theme-cyberpunk',
      label: 'Switch to Cyberpunk Theme',
      icon: <Zap className="w-4 h-4" />,
      action: () => updateTerminalTheme('cyberpunk')
    },
    {
      id: 'theme-dracula',
      label: 'Switch to Dracula Theme',
      icon: <Moon className="w-4 h-4" />,
      action: () => updateTerminalTheme('dracula')
    },
    {
      id: 'view-grid',
      label: 'Grid View',
      icon: <Grid className="w-4 h-4" />,
      action: () => setViewMode('grid')
    },
    {
      id: 'view-stacked',
      label: 'Stacked View',
      icon: <LayoutList className="w-4 h-4" />,
      action: () => setViewMode('stacked')
    },
    {
      id: 'view-single',
      label: 'Single Agent View',
      icon: <Terminal className="w-4 h-4" />,
      action: () => setViewMode('single')
    },
    {
      id: 'toggle-recording',
      label: sessionRecording ? 'Stop Recording' : 'Start Recording',
      icon: sessionRecording ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />,
      action: () => setSessionRecording(!sessionRecording)
    },
    {
      id: 'toggle-mobile',
      label: isMobileView ? 'Desktop View' : 'Mobile View',
      icon: isMobileView ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />,
      action: () => setIsMobileView(!isMobileView)
    },
    {
      id: 'connect-cloudflare',
      label: 'Connect Cloudflare Tunnel',
      icon: <Cloud className="w-4 h-4" />,
      action: connectCloudflare,
      disabled: !enableCloudflare || cloudflareStatus === 'connected'
    }
  ], [updateTerminalTheme, sessionRecording, isMobileView, enableCloudflare, cloudflareStatus, connectCloudflare]);
  
  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !isConnected || !selectedSession) return;
    
    const handleTerminalOutput = (data: any) => {
      if (data.sessionId === selectedSession && data.agentId !== undefined) {
        const agentTerminal = terminalsRef.current.get(data.agentId);
        if (agentTerminal && data.output) {
          agentTerminal.terminal.write(data.output);
        }
      }
    };
    
    socket.on('terminal:output', handleTerminalOutput);
    socket.on('harvest:terminal:update', handleTerminalOutput);
    
    return () => {
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('harvest:terminal:update', handleTerminalOutput);
    };
  }, [socket, isConnected, selectedSession]);
  
  // Initial load
  useEffect(() => {
    fetchSessions();
    
    // Start performance monitoring
    if (!metricsIntervalRef.current) {
      metricsIntervalRef.current = setInterval(updatePerformanceMetrics, 1000);
    }
    
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
    };
  }, [fetchSessions, updatePerformanceMetrics]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      
      // Cmd/Ctrl + T for theme switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        const themes = Object.keys(TERMINAL_THEMES) as Array<keyof typeof TERMINAL_THEMES>;
        const currentIndex = themes.indexOf(currentTheme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        updateTerminalTheme(nextTheme);
      }
      
      // Cmd/Ctrl + 1-9 for agent switching
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const agentIndex = parseInt(e.key) - 1;
        setSelectedAgent(agentIndex);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentTheme, updateTerminalTheme]);
  
  const currentSession = sessions.find(s => s.sessionName === selectedSession);
  
  return (
    <div className={`harvest-terminal-pro ${isFullscreen ? 'fixed inset-0 z-[60]' : ''} ${className}`}>
      <motion.div 
        className="bg-gray-900 rounded-lg shadow-2xl h-full flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header with animations */}
        <motion.div 
          className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3 rounded-t-lg border-b border-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ rotate: sessionRecording ? 360 : 0 }}
                transition={{ duration: 2, repeat: sessionRecording ? Infinity : 0, ease: "linear" }}
              >
                <Terminal className="w-5 h-5 text-green-400" />
              </motion.div>
              
              {/* Session selector with status indicators */}
              <div className="flex items-center gap-2">
                {!isConnected ? (
                  <motion.div
                    className="flex items-center gap-2 px-3 py-1 bg-red-600/20 rounded-lg"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <WifiOff className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 text-sm">Disconnected</span>
                  </motion.div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-green-400" />
                    {sessions.length > 0 && (
                      <select
                        value={selectedSession || ''}
                        onChange={(e) => setSelectedSession(e.target.value)}
                        className="bg-gray-700/50 backdrop-blur text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:border-green-400 transition-colors"
                      >
                        <option value="">Select Session</option>
                        {sessions.map(session => (
                          <option key={session.sessionName} value={session.sessionName}>
                            {session.sessionName} ({session.paneCount} agents)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
              
              {/* Performance metrics */}
              <div className="hidden lg:flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-green-400" />
                  <span className="text-gray-400">{performanceMetrics.fps} FPS</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  <span className="text-gray-400">{performanceMetrics.latency}ms</span>
                </div>
                <div className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-blue-400" />
                  <span className="text-gray-400">{performanceMetrics.memoryUsage}MB</span>
                </div>
              </div>
            </div>
            
            {/* Control buttons with animations */}
            <div className="flex items-center gap-2">
              {/* Theme selector */}
              <Tooltip content="Change theme" position="bottom">
                <motion.button
                  onClick={() => {
                    const themes = Object.keys(TERMINAL_THEMES) as Array<keyof typeof TERMINAL_THEMES>;
                    const currentIndex = themes.indexOf(currentTheme);
                    const nextTheme = themes[(currentIndex + 1) % themes.length];
                    updateTerminalTheme(nextTheme);
                  }}
                  className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Sun className="w-4 h-4 text-white" />
                </motion.button>
              </Tooltip>
              
              {/* View mode toggle */}
              <Tooltip content={`View: ${viewMode}`} position="bottom">
                <motion.button
                  onClick={() => {
                    if (viewMode === 'grid') setViewMode('stacked');
                    else if (viewMode === 'stacked') setViewMode('single');
                    else setViewMode('grid');
                  }}
                  className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {viewMode === 'grid' ? <Grid className="w-4 h-4 text-white" /> :
                   viewMode === 'stacked' ? <LayoutList className="w-4 h-4 text-white" /> :
                   <Terminal className="w-4 h-4 text-white" />}
                </motion.button>
              </Tooltip>
              
              {/* Command palette */}
              <Tooltip content="Command Palette (Cmd/Ctrl+K)" position="bottom">
                <motion.button
                  onClick={() => setShowCommandPalette(true)}
                  className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Command className="w-4 h-4 text-white" />
                </motion.button>
              </Tooltip>
              
              {/* Cloudflare status */}
              {enableCloudflare && (
                <Tooltip content={`Cloudflare: ${cloudflareStatus}`} position="bottom">
                  <motion.button
                    onClick={connectCloudflare}
                    className={`p-2 rounded-lg transition-colors ${
                      cloudflareStatus === 'connected' ? 'bg-green-600' :
                      cloudflareStatus === 'connecting' ? 'bg-yellow-600' :
                      'bg-gray-700 hover:bg-gray-600'
                    }`}
                    animate={cloudflareStatus === 'connecting' ? { opacity: [0.5, 1, 0.5] } : {}}
                    transition={{ duration: 1, repeat: cloudflareStatus === 'connecting' ? Infinity : 0 }}
                  >
                    {cloudflareStatus === 'connected' ? <Cloud className="w-4 h-4 text-white" /> :
                     cloudflareStatus === 'connecting' ? <RefreshCw className="w-4 h-4 text-white animate-spin" /> :
                     <CloudOff className="w-4 h-4 text-white" />}
                  </motion.button>
                </Tooltip>
              )}
              
              {/* Recording indicator */}
              {sessionRecording && (
                <motion.div
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 rounded-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <div className="w-2 h-2 bg-white rounded-full" />
                  <span className="text-white text-xs">REC</span>
                </motion.div>
              )}
              
              {/* Fullscreen toggle */}
              <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} position="bottom">
                <motion.button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> :
                                  <Maximize2 className="w-4 h-4 text-white" />}
                </motion.button>
              </Tooltip>
            </div>
          </div>
        </motion.div>
        
        {/* Terminal content area */}
        <div className="flex-1 bg-black overflow-hidden">
          {viewMode === 'grid' && currentSession ? (
            // Grid view with XTerm terminals
            <div className={`grid gap-2 p-2 h-full ${
              currentSession.paneCount <= 2 ? 'grid-cols-1 lg:grid-cols-2' :
              currentSession.paneCount <= 4 ? 'grid-cols-2' :
              currentSession.paneCount <= 6 ? 'grid-cols-2 lg:grid-cols-3' :
              'grid-cols-2 lg:grid-cols-4'
            }`}>
              {Array.from({ length: currentSession.paneCount }, (_, i) => (
                <motion.div
                  key={i}
                  className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2 h-2 rounded-full bg-green-400"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-sm font-semibold text-white">{getAgentDisplayName(i)}</span>
                    </div>
                  </div>
                  <div 
                    ref={(el) => {
                      if (el && !containerRefs.current.has(i)) {
                        containerRefs.current.set(i, el);
                        initializeTerminal(i, el);
                      }
                    }}
                    className="flex-1 min-h-[300px]"
                  />
                </motion.div>
              ))}
            </div>
          ) : viewMode === 'single' && currentSession ? (
            // Single view with selected agent
            <motion.div
              className="h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{getAgentDisplayName(selectedAgent)}</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(Number(e.target.value))}
                  className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                >
                  {Array.from({ length: currentSession.paneCount }, (_, i) => (
                    <option key={i} value={i}>{getAgentDisplayName(i)}</option>
                  ))}
                </select>
              </div>
              <div 
                ref={(el) => {
                  if (el) {
                    containerRefs.current.set(selectedAgent, el);
                    initializeTerminal(selectedAgent, el);
                  }
                }}
                className="flex-1"
              />
            </motion.div>
          ) : (
            // No session selected
            <motion.div
              className="h-full flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="text-center">
                <Terminal className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">No Session Active</h3>
                <p className="text-gray-500">Launch a farm to start terminal sessions</p>
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Status bar */}
        <motion.div
          className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-2 border-t border-gray-700 flex items-center justify-between text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Theme: {TERMINAL_THEMES[currentTheme].name}</span>
            <span className="text-gray-400">Agents: {currentSession?.paneCount || 0}</span>
            {sessionRecording && (
              <span className="text-red-400">Recording: {recordedCommands.length} commands</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">FPS: {performanceMetrics.fps}</span>
            <span className="text-gray-400">Latency: {performanceMetrics.latency}ms</span>
            {cloudflareStatus === 'connected' && (
              <span className="text-green-400">Cloudflare Connected</span>
            )}
          </div>
        </motion.div>
      </motion.div>
      
      {/* Command Palette Modal */}
      <AnimatePresence>
        {showCommandPalette && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCommandPalette(false)}
          >
            <motion.div
              className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <Command className="w-5 h-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-white">Command Palette</h3>
                </div>
              </div>
              <div className="p-2 max-h-[60vh] overflow-y-auto">
                {commandPaletteActions.map((action) => (
                  <motion.button
                    key={action.id}
                    onClick={() => {
                      action.action();
                      setShowCommandPalette(false);
                    }}
                    disabled={action.disabled}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      action.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'
                    }`}
                    whileHover={!action.disabled ? { x: 4 } : {}}
                  >
                    {action.icon}
                    <span className="text-white">{action.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HarvestTerminalPro;