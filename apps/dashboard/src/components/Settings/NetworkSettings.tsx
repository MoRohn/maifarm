import React, { useState, useEffect } from 'react';
import { Wifi, Server, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { websocketService } from '@/services/websocket';
import { useSettingsStore } from '@/store/settingsStore';
import { useToast } from '@/hooks/useToast';

const NetworkSettings: React.FC = () => {
  const toast = useToast();
  const { settings, updateSettings } = useSettingsStore();
  
  const [localSettings, setLocalSettings] = useState({
    serverUrl: (settings.api as any)?.baseUrl || 'http://localhost:4567',
    wsRetryInterval: 5000,
    maxRetries: 10,
    timeout: (settings.api as any)?.timeout || 30000,
  });
  
  const [connectionStatus, setConnectionStatus] = useState({
    status: websocketService.getStatus(),
    isConnecting: websocketService.isConnecting(),
    retryAttempts: websocketService.getConnectionAttempts(),
    maxRetries: websocketService.getMaxRetries(),
  });
  
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  // Update connection status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setConnectionStatus({
        status: websocketService.getStatus(),
        isConnecting: websocketService.isConnecting(),
        retryAttempts: websocketService.getConnectionAttempts(),
        maxRetries: websocketService.getMaxRetries(),
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const handleInputChange = (key: string, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };
  
  const handleSave = () => {
    updateSettings({
      api: {
        baseUrl: localSettings.serverUrl,
        timeout: localSettings.timeout,
      },
    });
    
    // Reconnect with new settings if URL changed
    if (localSettings.serverUrl !== (settings.api as any)?.baseUrl) {
      websocketService.disconnect();
      websocketService.connect(localSettings.serverUrl);
    }
    
    setUnsavedChanges(false);
    toast.success('Network settings saved successfully');
  };
  
  const handleReconnect = () => {
    websocketService.disconnect();
    websocketService.connect(localSettings.serverUrl);
    toast.info('Reconnecting to server...');
  };
  
  const getStatusColor = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'mock':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-red-600 dark:text-red-400';
    }
  };
  
  const getStatusIcon = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5" />;
      case 'mock':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Network Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure server connection and network behavior for MaiFarm.
        </p>
      </div>
      
      {/* Connection Status */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wifi className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Connection Status</h4>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
            <div className={`flex items-center gap-2 font-medium ${getStatusColor()}`}>
              {getStatusIcon()}
              <span className="uppercase">{connectionStatus.status}</span>
            </div>
          </div>
          
          {connectionStatus.isConnecting && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Retry Attempt:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {connectionStatus.retryAttempts}/{connectionStatus.maxRetries}
              </span>
            </div>
          )}
          
          {connectionStatus.status === 'mock' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg"
            >
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Running in offline mode with simulated data. Connect to a server for live updates.
              </p>
            </motion.div>
          )}
          
          <button
            onClick={handleReconnect}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect
          </button>
        </div>
      </div>
      
      {/* Server Configuration */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Server Configuration</h4>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Server URL
            </label>
            <input
              type="text"
              value={localSettings.serverUrl}
              onChange={(e) => handleInputChange('serverUrl', e.target.value)}
              placeholder="http://localhost:4567"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              The URL of your MaiFarm backend server
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Connection Timeout (ms)
            </label>
            <input
              type="number"
              value={localSettings.timeout}
              onChange={(e) => handleInputChange('timeout', parseInt(e.target.value))}
              min="5000"
              max="60000"
              step="1000"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Maximum time to wait for server responses
            </p>
          </div>
        </div>
      </div>
      
      {/* Advanced Settings */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wifi className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-medium text-gray-900 dark:text-white">Advanced Network Settings</h4>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              WebSocket Retry Interval (ms)
            </label>
            <input
              type="number"
              value={localSettings.wsRetryInterval}
              onChange={(e) => handleInputChange('wsRetryInterval', parseInt(e.target.value))}
              min="1000"
              max="30000"
              step="1000"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Time between reconnection attempts
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Maximum Retry Attempts
            </label>
            <input
              type="number"
              value={localSettings.maxRetries}
              onChange={(e) => handleInputChange('maxRetries', parseInt(e.target.value))}
              min="0"
              max="50"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Number of reconnection attempts before switching to offline mode
            </p>
          </div>
        </div>
      </div>
      
      {/* Save Button */}
      {unsavedChanges && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Changes
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default NetworkSettings;