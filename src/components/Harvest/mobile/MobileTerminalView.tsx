import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  Terminal, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  Copy, 
  Pause, 
  Play, 
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Menu,
  X,
  Wifi,
  WifiOff,
  Battery,
  Bell,
  Home,
  Grid,
  Activity,
  Mic,
  MicOff,
  Vibrate,
  Volume2
} from 'lucide-react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useFarmStore } from '../../../store/farmStore';
import { getAgentName, createAgentNameMapping } from '../../../utils/agentNameMapper';

interface MobileTerminalViewProps {
  farmId?: string;
  sessions: any[];
  selectedSession: string | null;
  terminalOutputs: { [key: number]: string[] };
  onSessionChange: (sessionName: string) => void;
  onSendCommand: (agentId: number, command: string) => void;
  onRefresh: () => void;
  className?: string;
}

interface SwipeableAgent {
  id: number;
  name: string;
  output: string[];
  lastLine: string;
  isActive: boolean;
  isPaused: boolean;
}

export const MobileTerminalView: React.FC<MobileTerminalViewProps> = ({
  farmId,
  sessions,
  selectedSession,
  terminalOutputs,
  onSessionChange,
  onSendCommand,
  onRefresh,
  className = ''
}) => {
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'swipe' | 'grid' | 'stack'>('swipe');
  const [isCommandPanelOpen, setIsCommandPanelOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [enableHaptic, setEnableHaptic] = useState(true);
  const [enableSound, setEnableSound] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pullToRefreshRef = useRef<HTMLDivElement>(null);
  const voiceRecognitionRef = useRef<any>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  
  // Get farm data for agent name mapping
  const farms = useFarmStore(state => state.farms);
  const currentFarm = farmId ? farms.find(f => f.id === farmId) : null;
  const agentNameMapping = currentFarm ? createAgentNameMapping(currentFarm) : null;
  
  const { socket, isConnected } = useWebSocket();
  
  // Current session data
  const currentSession = sessions.find(s => s.sessionName === selectedSession);
  const agentCount = currentSession?.paneCount || 0;
  
  // Create agent data array
  const agents: SwipeableAgent[] = useMemo(() => {
    if (!currentSession) return [];
    
    return Array.from({ length: agentCount }, (_, i) => ({
      id: i,
      name: agentNameMapping ? getAgentName(i, agentNameMapping, `Agent ${i}`) : `Agent ${i}`,
      output: terminalOutputs[i] || [],
      lastLine: terminalOutputs[i]?.slice(-1)[0] || 'Initializing...',
      isActive: true,
      isPaused: false
    }));
  }, [currentSession, agentCount, terminalOutputs, agentNameMapping]);
  
  // Trigger haptic feedback
  const triggerHaptic = useCallback((pattern: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!enableHaptic || !('vibrate' in navigator)) return;
    
    const patterns = {
      light: [10],
      medium: [30],
      heavy: [50, 30, 50]
    };
    
    navigator.vibrate(patterns[pattern]);
  }, [enableHaptic]);
  
  // Play sound effect
  const playSound = useCallback((type: 'swipe' | 'tap' | 'notification' = 'tap') => {
    if (!enableSound) return;
    
    // Create a simple oscillator for sound effects
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const frequencies = {
      swipe: 440,
      tap: 523,
      notification: 659
    };
    
    oscillator.frequency.value = frequencies[type];
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  }, [enableSound]);
  
  // Handle swipe gestures
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (viewMode !== 'swipe') return;
    
    const newIndex = direction === 'left' 
      ? Math.min(currentAgentIndex + 1, agents.length - 1)
      : Math.max(currentAgentIndex - 1, 0);
    
    if (newIndex !== currentAgentIndex) {
      setCurrentAgentIndex(newIndex);
      triggerHaptic('light');
      playSound('swipe');
    }
  }, [currentAgentIndex, agents.length, viewMode, triggerHaptic, playSound]);
  
  // Handle pinch to zoom
  const handlePinchZoom = useCallback((scale: number) => {
    setZoomLevel(Math.max(0.5, Math.min(2, scale)));
  }, []);
  
  // Handle pull to refresh
  const handlePullToRefresh = useCallback(async () => {
    if (isPullRefreshing) return;
    
    setIsPullRefreshing(true);
    triggerHaptic('medium');
    
    await onRefresh();
    
    setTimeout(() => {
      setIsPullRefreshing(false);
    }, 1000);
  }, [isPullRefreshing, onRefresh, triggerHaptic]);
  
  // Voice input handling
  const startVoiceInput = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in your browser');
      return;
    }
    
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      setIsVoiceInputActive(true);
      triggerHaptic('light');
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setCommandInput(transcript);
      setIsVoiceInputActive(false);
    };
    
    recognition.onerror = () => {
      setIsVoiceInputActive(false);
      triggerHaptic('heavy');
    };
    
    recognition.onend = () => {
      setIsVoiceInputActive(false);
    };
    
    voiceRecognitionRef.current = recognition;
    recognition.start();
  }, [triggerHaptic]);
  
  const stopVoiceInput = useCallback(() => {
    if (voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop();
      setIsVoiceInputActive(false);
    }
  }, []);
  
  // Battery monitoring
  useEffect(() => {
    const updateBattery = async () => {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        setBatteryLevel(Math.round(battery.level * 100));
        
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }
    };
    
    updateBattery();
  }, []);
  
  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartY.current || !touchStartX.current) return;
    
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    
    // Pull to refresh
    if (deltaY > 100 && window.scrollY === 0) {
      handlePullToRefresh();
    }
    
    // Swipe detection
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      handleSwipe(deltaX < 0 ? 'left' : 'right');
      touchStartX.current = null;
    }
  }, [handlePullToRefresh, handleSwipe]);
  
  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null;
    touchStartX.current = null;
  }, []);
  
  // Quick action buttons
  const quickCommands = ['ls', 'pwd', 'git status', 'npm test', 'clear'];
  
  return (
    <div 
      ref={containerRef}
      className={`mobile-terminal-view ${className} relative h-full bg-black overflow-hidden`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Status Bar */}
      <div className="status-bar bg-gray-900 px-4 py-2 flex items-center justify-between text-xs text-white sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1">
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <span className="font-semibold">MaiFarm Terminal</span>
        </div>
        
        <div className="flex items-center gap-2">
          {isOffline ? (
            <WifiOff className="w-4 h-4 text-red-500" />
          ) : (
            <Wifi className="w-4 h-4 text-green-500" />
          )}
          {batteryLevel !== null && (
            <div className="flex items-center gap-1">
              <Battery className="w-4 h-4" />
              <span className="text-xs">{batteryLevel}%</span>
            </div>
          )}
          <Bell className="w-4 h-4" />
        </div>
      </div>
      
      {/* Pull to Refresh Indicator */}
      <AnimatePresence>
        {isPullRefreshing && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-12 left-0 right-0 z-40 flex justify-center"
          >
            <div className="bg-blue-600 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Refreshing...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main Content Area */}
      <div className="main-content flex-1 overflow-hidden">
        {viewMode === 'swipe' ? (
          // Swipeable Agent View
          <div className="relative h-full">
            <AnimatePresence mode="wait">
              {agents[currentAgentIndex] && (
                <motion.div
                  key={currentAgentIndex}
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute inset-0 p-4"
                  style={{ transform: `scale(${zoomLevel})` }}
                >
                  <div className="bg-gray-900 rounded-lg h-full flex flex-col">
                    <div className="header bg-gray-800 p-3 rounded-t-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span className="font-semibold text-white">
                          {agents[currentAgentIndex].name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => triggerHaptic('light')}
                          className="p-1.5 bg-gray-700 rounded"
                        >
                          <Copy className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="terminal-output flex-1 overflow-y-auto p-3 font-mono text-xs">
                      {agents[currentAgentIndex].output.map((line, idx) => (
                        <div key={idx} className="text-green-400 whitespace-pre-wrap">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Agent Dots Indicator */}
            <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-2">
              {agents.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentAgentIndex(idx);
                    triggerHaptic('light');
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentAgentIndex 
                      ? 'bg-blue-500 w-8' 
                      : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          // Grid View
          <div className="grid grid-cols-2 gap-2 p-2 overflow-y-auto">
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setCurrentAgentIndex(agent.id);
                  setViewMode('swipe');
                  triggerHaptic('light');
                }}
                className="bg-gray-900 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-xs font-semibold text-white truncate">
                    {agent.name}
                  </span>
                </div>
                <div className="text-xs text-gray-400 font-mono truncate">
                  {agent.lastLine}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          // Stack View
          <div className="p-2 space-y-2 overflow-y-auto">
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => {
                    const newExpanded = new Set(expandedAgents);
                    if (newExpanded.has(agent.id)) {
                      newExpanded.delete(agent.id);
                    } else {
                      newExpanded.add(agent.id);
                    }
                    setExpandedAgents(newExpanded);
                    triggerHaptic('light');
                  }}
                  className="w-full p-3 bg-gray-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-sm font-semibold text-white">
                      {agent.name}
                    </span>
                  </div>
                  <ChevronRight 
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      expandedAgents.has(agent.id) ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                
                <AnimatePresence>
                  {expandedAgents.has(agent.id) && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 font-mono text-xs text-green-400 max-h-40 overflow-y-auto">
                        {agent.output.slice(-10).map((line, idx) => (
                          <div key={idx} className="whitespace-pre-wrap">
                            {line}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      
      {/* Bottom Navigation Bar */}
      <div className="bottom-nav bg-gray-900 border-t border-gray-700 px-4 py-2 flex items-center justify-around">
        <button
          onClick={() => {
            setViewMode('swipe');
            triggerHaptic('light');
          }}
          className={`p-2 rounded ${viewMode === 'swipe' ? 'bg-blue-600' : ''}`}
        >
          <Terminal className="w-5 h-5 text-white" />
        </button>
        
        <button
          onClick={() => {
            setViewMode('grid');
            triggerHaptic('light');
          }}
          className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-600' : ''}`}
        >
          <Grid className="w-5 h-5 text-white" />
        </button>
        
        <button
          onClick={() => {
            setViewMode('stack');
            triggerHaptic('light');
          }}
          className={`p-2 rounded ${viewMode === 'stack' ? 'bg-blue-600' : ''}`}
        >
          <Activity className="w-5 h-5 text-white" />
        </button>
        
        <button
          onClick={() => {
            setIsCommandPanelOpen(true);
            triggerHaptic('light');
          }}
          className="p-2 bg-green-600 rounded"
        >
          <MessageSquare className="w-5 h-5 text-white" />
        </button>
      </div>
      
      {/* Command Input Panel */}
      <AnimatePresence>
        {isCommandPanelOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t-2 border-blue-600 z-50"
          >
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Enter command..."
                  className="flex-1 bg-gray-800 text-white px-3 py-2 rounded"
                />
                <button
                  onClick={isVoiceInputActive ? stopVoiceInput : startVoiceInput}
                  className={`p-2 rounded ${isVoiceInputActive ? 'bg-red-600' : 'bg-gray-700'}`}
                >
                  {isVoiceInputActive ? (
                    <MicOff className="w-5 h-5 text-white" />
                  ) : (
                    <Mic className="w-5 h-5 text-white" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (commandInput.trim()) {
                      onSendCommand(currentAgentIndex, commandInput);
                      setCommandInput('');
                      setIsCommandPanelOpen(false);
                      triggerHaptic('medium');
                      playSound('tap');
                    }
                  }}
                  className="p-2 bg-green-600 rounded"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
              
              {/* Quick Commands */}
              <div className="flex gap-2 overflow-x-auto">
                {quickCommands.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => {
                      setCommandInput(cmd);
                      triggerHaptic('light');
                    }}
                    className="px-3 py-1 bg-gray-700 rounded text-xs text-white whitespace-nowrap"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => {
                  setIsCommandPanelOpen(false);
                  triggerHaptic('light');
                }}
                className="mt-3 w-full py-2 bg-gray-800 rounded text-white"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Side Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="absolute top-0 left-0 bottom-0 w-3/4 bg-gray-900 border-r border-gray-700 z-50"
          >
            <div className="p-4">
              <h3 className="text-white font-semibold mb-4">Settings</h3>
              
              <div className="space-y-3">
                <label className="flex items-center justify-between text-white">
                  <span className="flex items-center gap-2">
                    <Vibrate className="w-4 h-4" />
                    Haptic Feedback
                  </span>
                  <input
                    type="checkbox"
                    checked={enableHaptic}
                    onChange={(e) => setEnableHaptic(e.target.checked)}
                    className="toggle"
                  />
                </label>
                
                <label className="flex items-center justify-between text-white">
                  <span className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    Sound Effects
                  </span>
                  <input
                    type="checkbox"
                    checked={enableSound}
                    onChange={(e) => setEnableSound(e.target.checked)}
                    className="toggle"
                  />
                </label>
                
                <div className="pt-3 border-t border-gray-700">
                  <h4 className="text-gray-400 text-sm mb-2">Sessions</h4>
                  {sessions.map((session) => (
                    <button
                      key={session.sessionName}
                      onClick={() => {
                        onSessionChange(session.sessionName);
                        setIsMenuOpen(false);
                        triggerHaptic('light');
                      }}
                      className={`block w-full text-left p-2 rounded mb-1 ${
                        session.sessionName === selectedSession
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium">{session.sessionName}</div>
                      <div className="text-xs opacity-75">
                        {session.paneCount} agents
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileTerminalView;