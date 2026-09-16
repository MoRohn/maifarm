import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import clsx from 'clsx';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  className = '', 
  showDetails = false,
  compact = false 
}) => {
  const { isConnected, reconnect } = useWebSocket();
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastDisconnectTime, setLastDisconnectTime] = useState<Date | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!isConnected && !lastDisconnectTime) {
      setLastDisconnectTime(new Date());
    } else if (isConnected) {
      setLastDisconnectTime(null);
      setReconnectAttempts(0);
      setIsReconnecting(false);
    }
  }, [isConnected]);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);
    
    try {
      await reconnect();
      // Success handled in useEffect
    } catch (error) {
      console.error('Manual reconnect failed:', error);
      setIsReconnecting(false);
    }
  };

  const getDisconnectDuration = () => {
    if (!lastDisconnectTime) return '';
    const now = new Date();
    const seconds = Math.floor((now.getTime() - lastDisconnectTime.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  if (compact) {
    return (
      <div className={clsx('flex items-center', className)}>
        {isConnected ? (
          <div title="Connected">
            <Wifi className="w-4 h-4 text-green-500" />
          </div>
        ) : (
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Disconnected - Click to reconnect"
          >
            {isReconnecting ? (
              <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={clsx('connection-status', className)}>
      {isConnected ? (
        <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
          <Wifi className="w-5 h-5" />
          <span className="text-sm font-medium">Connected</span>
        </div>
      ) : (
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <WifiOff className="w-5 h-5" />
            <div>
              <span className="text-sm font-medium">Disconnected</span>
              {showDetails && lastDisconnectTime && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {getDisconnectDuration()} ago
                  {reconnectAttempts > 0 && ` • ${reconnectAttempts} attempts`}
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-apple transition-all',
              isReconnecting
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
            )}
          >
            {isReconnecting ? (
              <span className="flex items-center space-x-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Reconnecting...</span>
              </span>
            ) : (
              'Reconnect'
            )}
          </button>
        </div>
      )}
      
      {!isConnected && showDetails && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-apple">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-xs text-yellow-700 dark:text-yellow-300">
              <p>Real-time updates are paused while disconnected.</p>
              <p className="mt-1">Your work is saved locally and will sync when reconnected.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;