import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Bell, 
  WifiOff, 
  Settings, 
  QrCode,
  Activity,
  Users,
  TrendingUp,
  Clock,
  Smartphone,
  Monitor,
  Loader,
  ChevronRight
} from 'lucide-react';
import MobileTerminalView from './MobileTerminalView';
import MobilePushNotifications from './MobilePushNotifications';
import MobileOfflineCache from './MobileOfflineCache';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useFarmStore } from '../../../store/farmStore';

// Lazy load heavy components for performance
const MobilePerformanceMonitor = lazy(() => import('./MobilePerformanceMonitor'));

interface MobileDashboardProps {
  farmId?: string;
  tunnelUrl?: string;
  className?: string;
}

interface QuickStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  color: string;
}

export const MobileDashboard: React.FC<MobileDashboardProps> = ({
  farmId,
  tunnelUrl,
  className = ''
}) => {
  const [activeView, setActiveView] = useState<'terminal' | 'notifications' | 'offline' | 'settings' | 'performance'>('terminal');
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [terminalOutputs, setTerminalOutputs] = useState<{ [key: number]: string[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [qrCodeVisible, setQrCodeVisible] = useState(false);
  const [stats, setStats] = useState<QuickStat[]>([]);
  
  const { socket, isConnected } = useWebSocket();
  const farms = useFarmStore(state => state.farms);
  const currentFarm = farmId ? farms.find(f => f.id === farmId) : null;
  
  // Detect device type and orientation
  useEffect(() => {
    const detectDevice = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setDeviceType('mobile');
      } else if (width < 1024) {
        setDeviceType('tablet');
      } else {
        setDeviceType('desktop');
      }
      
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };
    
    detectDevice();
    window.addEventListener('resize', detectDevice);
    window.addEventListener('orientationchange', detectDevice);
    
    return () => {
      window.removeEventListener('resize', detectDevice);
      window.removeEventListener('orientationchange', detectDevice);
    };
  }, []);
  
  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
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
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [farmId, selectedSession]);
  
  // Fetch terminal outputs
  const fetchTerminalOutputs = useCallback(async () => {
    if (!selectedSession) return;
    
    const currentSession = sessions.find(s => s.sessionName === selectedSession);
    if (!currentSession) return;
    
    const outputs: { [key: number]: string[] } = {};
    
    for (let i = 0; i < currentSession.paneCount; i++) {
      try {
        const response = await fetch(`/api/harvest/terminal/${selectedSession}/${i}?lines=100`);
        if (response.ok) {
          const data = await response.json();
          outputs[i] = data.data.terminal || [];
        }
      } catch (error) {
        console.error(`Failed to fetch terminal for agent ${i}:`, error);
        outputs[i] = [`Error loading terminal for agent ${i}`];
      }
    }
    
    setTerminalOutputs(outputs);
  }, [selectedSession, sessions]);
  
  // Send command to agent
  const sendCommand = useCallback(async (agentId: number, command: string) => {
    if (!selectedSession || !command.trim()) return;
    
    try {
      const response = await fetch(`/api/harvest/terminal/${selectedSession}/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      
      if (response.ok) {
        // Refresh terminal output
        setTimeout(fetchTerminalOutputs, 500);
      }
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  }, [selectedSession, fetchTerminalOutputs]);
  
  // Initialize
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);
  
  useEffect(() => {
    if (selectedSession) {
      fetchTerminalOutputs();
      
      // Set up auto-refresh
      const interval = setInterval(fetchTerminalOutputs, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedSession, fetchTerminalOutputs]);
  
  // Calculate stats
  useEffect(() => {
    const agentCount = sessions.reduce((sum, s) => sum + s.paneCount, 0);
    const activeAgents = Object.keys(terminalOutputs).length;
    const totalLines = Object.values(terminalOutputs).reduce((sum, lines) => sum + lines.length, 0);
    
    setStats([
      {
        label: 'Active Agents',
        value: activeAgents,
        icon: <Users className="w-4 h-4" />,
        trend: 'stable',
        color: 'text-green-400'
      },
      {
        label: 'Total Sessions',
        value: sessions.length,
        icon: <Terminal className="w-4 h-4" />,
        color: 'text-blue-400'
      },
      {
        label: 'Output Lines',
        value: totalLines,
        icon: <Activity className="w-4 h-4" />,
        trend: 'up',
        color: 'text-purple-400'
      },
      {
        label: 'Connection',
        value: isConnected ? 'Online' : 'Offline',
        icon: isConnected ? <Monitor className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />,
        color: isConnected ? 'text-green-400' : 'text-red-400'
      }
    ]);
  }, [sessions, terminalOutputs, isConnected]);
  
  // Generate QR Code display
  const renderQRCode = () => {
    if (!tunnelUrl) return null;
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
        onClick={() => setQrCodeVisible(false)}
      >
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
            Scan to Connect
          </h3>
          
          <div className="bg-gray-100 p-4 rounded-lg mb-4">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tunnelUrl)}`}
              alt="QR Code"
              className="w-full h-auto"
            />
          </div>
          
          <p className="text-sm text-gray-600 text-center mb-2">
            {tunnelUrl}
          </p>
          
          <button
            onClick={() => setQrCodeVisible(false)}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </motion.div>
    );
  };
  
  return (
    <div className={`mobile-dashboard ${className} h-full flex flex-col bg-black`}>
      {/* Header */}
      <div className="header bg-gray-900 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-blue-500" />
            <h1 className="text-white font-semibold">
              MaiFarm Mobile
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            {tunnelUrl && (
              <button
                onClick={() => setQrCodeVisible(true)}
                className="p-2 bg-gray-800 rounded"
              >
                <QrCode className="w-4 h-4 text-white" />
              </button>
            )}
            <button
              onClick={() => setActiveView('settings')}
              className={`p-2 rounded ${activeView === 'settings' ? 'bg-blue-600' : 'bg-gray-800'}`}
            >
              <Settings className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        
        {/* Device info */}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
          <span className="capitalize">{deviceType}</span>
          <span>•</span>
          <span className="capitalize">{orientation}</span>
          {currentFarm && (
            <>
              <span>•</span>
              <span>Farm: {currentFarm.name}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="stats-bar bg-gray-900/50 px-4 py-2 overflow-x-auto">
        <div className="flex gap-4">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg whitespace-nowrap"
            >
              <div className={stat.color}>{stat.icon}</div>
              <div>
                <p className="text-xs text-gray-400">{stat.label}</p>
                <p className="text-sm font-semibold text-white flex items-center gap-1">
                  {stat.value}
                  {stat.trend && (
                    <TrendingUp className={`w-3 h-3 ${
                      stat.trend === 'up' ? 'text-green-400' :
                      stat.trend === 'down' ? 'text-red-400 rotate-180' :
                      'text-gray-400'
                    }`} />
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Navigation Tabs */}
      <div className="tabs bg-gray-900 px-2 py-2 border-b border-gray-700 overflow-x-auto">
        <div className="flex gap-2">
          {[
            { id: 'terminal', label: 'Terminal', icon: <Terminal className="w-4 h-4" /> },
            { id: 'notifications', label: 'Alerts', icon: <Bell className="w-4 h-4" /> },
            { id: 'offline', label: 'Offline', icon: <WifiOff className="w-4 h-4" /> },
            { id: 'performance', label: 'Performance', icon: <Activity className="w-4 h-4" /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeView === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              {tab.icon}
              <span className="text-sm">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="content flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex items-center justify-center"
            >
              <div className="text-center">
                <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Loading terminal sessions...</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeView === 'terminal' && (
                <MobileTerminalView
                  farmId={farmId}
                  sessions={sessions}
                  selectedSession={selectedSession}
                  terminalOutputs={terminalOutputs}
                  onSessionChange={setSelectedSession}
                  onSendCommand={sendCommand}
                  onRefresh={() => {
                    fetchSessions();
                    fetchTerminalOutputs();
                  }}
                />
              )}
              
              {activeView === 'notifications' && (
                <MobilePushNotifications />
              )}
              
              {activeView === 'offline' && (
                <MobileOfflineCache />
              )}
              
              {activeView === 'performance' && (
                <Suspense fallback={
                  <div className="h-full flex items-center justify-center">
                    <Loader className="w-6 h-6 text-blue-500 animate-spin" />
                  </div>
                }>
                  <MobilePerformanceMonitor
                    sessions={sessions}
                    terminalOutputs={terminalOutputs}
                  />
                </Suspense>
              )}
              
              {activeView === 'settings' && (
                <div className="p-4">
                  <h2 className="text-white text-lg font-semibold mb-4">Settings</h2>
                  
                  <div className="space-y-3">
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-white font-medium mb-3">Display</h3>
                      <div className="space-y-2">
                        <label className="flex items-center justify-between text-gray-300">
                          <span>Auto-rotate</span>
                          <input type="checkbox" className="toggle" />
                        </label>
                        <label className="flex items-center justify-between text-gray-300">
                          <span>Keep screen on</span>
                          <input type="checkbox" className="toggle" />
                        </label>
                        <label className="flex items-center justify-between text-gray-300">
                          <span>Dark mode</span>
                          <input type="checkbox" defaultChecked className="toggle" />
                        </label>
                      </div>
                    </div>
                    
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-white font-medium mb-3">Connection</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-300">Status</span>
                          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                            {isConnected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        {tunnelUrl && (
                          <div className="pt-2 border-t border-gray-700">
                            <p className="text-gray-400 text-xs mb-1">Tunnel URL</p>
                            <p className="text-white text-sm break-all">{tunnelUrl}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h3 className="text-white font-medium mb-3">About</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Version</span>
                          <span className="text-white">2.0.0</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Device</span>
                          <span className="text-white capitalize">{deviceType}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* QR Code Modal */}
      <AnimatePresence>
        {qrCodeVisible && renderQRCode()}
      </AnimatePresence>
    </div>
  );
};

export default MobileDashboard;