import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useWebSocketStore } from '../../store/websocketStore';
import { websocketService } from '../../services/websocket';
import { errorHandler } from '../../services/errorHandler';
import { logger } from '../../services/monitoring/logger';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  className = '',
  showDetails = true,
  position = 'bottom-right'
}) => {
  const { connected } = useWebSocketStore();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    // Monitor online/offline status
    const handleOnline = () => {
      logger.info('Network', 'Connection restored');
      setOfflineMode(false);
      // Don't initiate connection here - App.tsx handles it
    };

    const handleOffline = () => {
      logger.warn('Network', 'Connection lost');
      setOfflineMode(true);
      errorHandler.trackConnectionFailure('Network');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial state
    setOfflineMode(!navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connected]);

  useEffect(() => {
    // Subscribe to WebSocket events
    const handleReconnecting = () => {
      setIsReconnecting(true);
      setReconnectAttempt(prev => prev + 1);
      setShowStatus(true);
    };

    const handleConnected = () => {
      setIsReconnecting(false);
      setReconnectAttempt(0);
      setLastError(null);
      logger.info('WebSocket', 'Connected successfully');
      
      // Immediately hide status when connected
      setShowStatus(false);
    };

    const handleError = (error: any) => {
      setLastError(error.message || 'Connection error');
      setShowStatus(true);
      errorHandler.handleWebSocketError(error);
    };

    // Listen to WebSocket events
    websocketService.on('reconnecting', handleReconnecting as any);
    websocketService.on('connected', handleConnected as any);
    websocketService.on('error', handleError as any);

    // Show status if not connected initially
    if (!connected) {
      setShowStatus(true);
    } else {
      // If connected, hide the status
      setShowStatus(false);
    }

    return () => {
      websocketService.off('reconnecting', handleReconnecting as any);
      websocketService.off('connected', handleConnected as any);
      websocketService.off('error', handleError as any);
    };
  }, [connected]);

  const getStatusIcon = () => {
    if (offlineMode) return <WifiOff className="w-5 h-5" />;
    if (isReconnecting) return <RefreshCw className="w-5 h-5 animate-spin" />;
    if (!connected) return <AlertTriangle className="w-5 h-5" />;
    return <CheckCircle className="w-5 h-5" />;
  };

  const getStatusColor = () => {
    if (offlineMode) return 'bg-gray-500';
    if (isReconnecting) return 'bg-yellow-500';
    if (!connected) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (offlineMode) return 'Offline Mode';
    if (isReconnecting) return `Reconnecting... (${reconnectAttempt})`;
    if (!connected) return 'Disconnected';
    return 'Connected';
  };

  const getStatusMessage = () => {
    if (offlineMode) return 'Using cached data. Some features may be limited.';
    if (isReconnecting) return 'Attempting to reconnect to the server...';
    if (!connected && lastError) return lastError;
    if (!connected) return 'Unable to connect to the server.';
    return 'Real-time updates active.';
  };

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4'
  };

  const handleRetry = () => {
    logger.info('User', 'Manual reconnection attempt');
    // Only reconnect if not already connected
    if (websocketService.getStatus() !== 'connected') {
      websocketService.connect();
    }
  };

  return (
    <AnimatePresence>
      {(!connected || offlineMode || (showStatus && !connected)) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`fixed ${positionClasses[position]} z-50 ${className}`}
        >
          <div className={`
            ${getStatusColor()} 
            text-white rounded-lg shadow-lg 
            ${showDetails ? 'p-4' : 'p-2'}
            transition-all duration-300
          `}>
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              
              {showDetails && (
                <div className="flex-1">
                  <p className="font-semibold text-sm">{getStatusText()}</p>
                  <p className="text-xs opacity-90">{getStatusMessage()}</p>
                </div>
              )}

              {!connected && !isReconnecting && showDetails && (
                <button
                  onClick={handleRetry}
                  className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 
                           rounded text-xs font-medium transition-colors"
                  aria-label="Retry connection"
                >
                  Retry
                </button>
              )}
            </div>

            {showDetails && reconnectAttempt > 3 && (
              <div className="mt-3 pt-3 border-t border-white/20">
                <p className="text-xs">
                  Having trouble? Check your internet connection or contact support.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Minimal status indicator component
export const ConnectionIndicator: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { connected } = useWebSocketStore();
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (connected) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [connected]);

  return (
    <div className={`relative ${className}`}>
      <div
        className={`
          w-3 h-3 rounded-full transition-colors duration-300
          ${connected ? 'bg-green-500' : 'bg-red-500'}
        `}
      />
      {pulse && (
        <div className="absolute inset-0 rounded-full bg-green-500 animate-ping" />
      )}
    </div>
  );
};