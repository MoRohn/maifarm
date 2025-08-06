import React from 'react';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { WifiOff, Wifi, RefreshCw, AlertCircle } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const { 
    isOnline, 
    pendingSyncs, 
    syncInProgress, 
    lastSyncTime,
    syncNow 
  } = useOfflineSync({ autoSync: true });

  if (isOnline && pendingSyncs === 0) {
    return null; // Don't show indicator when everything is synced
  }

  const getStatusColor = () => {
    if (!isOnline) return 'bg-red-500';
    if (syncInProgress) return 'bg-yellow-500';
    if (pendingSyncs > 0) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="w-4 h-4" />;
    if (syncInProgress) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (pendingSyncs > 0) return <AlertCircle className="w-4 h-4" />;
    return <Wifi className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (syncInProgress) return 'Syncing...';
    if (pendingSyncs > 0) return `${pendingSyncs} pending`;
    return 'Online';
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Never synced';
    
    const now = Date.now();
    const diff = now - lastSyncTime;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg
        text-white transition-all duration-300 ease-in-out
        ${getStatusColor()}
      `}>
        {getStatusIcon()}
        <div className="flex flex-col">
          <span className="text-sm font-medium">{getStatusText()}</span>
          {lastSyncTime && (
            <span className="text-xs opacity-80">
              Synced: {formatLastSyncTime()}
            </span>
          )}
        </div>
        
        {isOnline && pendingSyncs > 0 && !syncInProgress && (
          <button
            onClick={syncNow}
            className="ml-2 p-1 rounded hover:bg-white/20 transition-colors"
            title="Sync now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};