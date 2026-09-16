import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { websocketService } from '@/services/websocket';
import { cn } from '@/utils/cn';

interface ApiAlert {
  id: string;
  type: 'error' | 'warning';
  message: string;
  agentId?: number;
  farmId?: string;
  timestamp: Date;
}

export const ApiErrorDisplay: React.FC = () => {
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);

  useEffect(() => {
    // Subscribe to API errors
    const handleApiError = (message: any) => {
      const data = message.payload || message.data || message;
      const alert: ApiAlert = {
        id: `error-${Date.now()}-${Math.random()}`,
        type: 'error',
        message: data.error || 'Unknown API error',
        agentId: data.agentId,
        farmId: data.farmId,
        timestamp: new Date(data.timestamp || Date.now())
      };
      setAlerts(prev => [...prev, alert]);
      
      // Auto-dismiss after 30 seconds
      setTimeout(() => {
        dismissAlert(alert.id);
      }, 30000);
    };
    
    websocketService.on('agent:api_error', handleApiError);

    // Subscribe to warnings
    const handleWarning = (message: any) => {
      const data = message.payload || message.data || message;
      const alert: ApiAlert = {
        id: `warning-${Date.now()}-${Math.random()}`,
        type: 'warning',
        message: data.warning || 'Unknown warning',
        agentId: data.agentId,
        farmId: data.farmId,
        timestamp: new Date(data.timestamp || Date.now())
      };
      setAlerts(prev => [...prev, alert]);
      
      // Auto-dismiss warnings after 15 seconds
      setTimeout(() => {
        dismissAlert(alert.id);
      }, 15000);
    };
    
    websocketService.on('agent:warning', handleWarning);

    // Subscribe to farm errors
    const handleFarmError = (message: any) => {
      const data = message.payload || message.data || message;
      if (data.errorType === 'api_error') {
        const alert: ApiAlert = {
          id: `farm-error-${Date.now()}-${Math.random()}`,
          type: 'error',
          message: data.error || 'Unknown farm error',
          farmId: data.farmId,
          timestamp: new Date(data.timestamp || Date.now())
        };
        setAlerts(prev => [...prev, alert]);
        
        // Auto-dismiss after 30 seconds
        setTimeout(() => {
          dismissAlert(alert.id);
        }, 30000);
      }
    };
    
    websocketService.on('farm:error', handleFarmError);

    // Set global notification functions
    window.showErrorNotification = (message: string) => {
      const alert: ApiAlert = {
        id: `global-error-${Date.now()}-${Math.random()}`,
        type: 'error',
        message,
        timestamp: new Date()
      };
      setAlerts(prev => [...prev, alert]);
      
      setTimeout(() => {
        dismissAlert(alert.id);
      }, 30000);
    };

    window.showWarningNotification = (message: string) => {
      const alert: ApiAlert = {
        id: `global-warning-${Date.now()}-${Math.random()}`,
        type: 'warning',
        message,
        timestamp: new Date()
      };
      setAlerts(prev => [...prev, alert]);
      
      setTimeout(() => {
        dismissAlert(alert.id);
      }, 15000);
    };

    return () => {
      websocketService.off('agent:api_error', handleApiError);
      websocketService.off('agent:warning', handleWarning);
      websocketService.off('farm:error', handleFarmError);
      delete window.showErrorNotification;
      delete window.showWarningNotification;
    };
  }, []);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg shadow-lg transition-all duration-300',
            'border animate-slideIn',
            alert.type === 'error' 
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          )}
        >
          {alert.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          )}
          
          <div className="flex-1">
            <div className={cn(
              'font-medium text-sm',
              alert.type === 'error' 
                ? 'text-red-800 dark:text-red-200'
                : 'text-yellow-800 dark:text-yellow-200'
            )}>
              {alert.type === 'error' ? 'API Error' : 'Warning'}
              {alert.agentId !== undefined && ` - Agent ${alert.agentId}`}
            </div>
            <p className={cn(
              'mt-1 text-sm',
              alert.type === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-yellow-700 dark:text-yellow-300'
            )}>
              {alert.message}
            </p>
            {alert.message.includes('rate limit') && (
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <RefreshCw className="w-3 h-3" />
                <span>Consider reducing agent count or adding delays</span>
              </div>
            )}
          </div>
          
          <button
            onClick={() => dismissAlert(alert.id)}
            className={cn(
              'p-1 rounded-md transition-colors',
              alert.type === 'error'
                ? 'hover:bg-red-100 dark:hover:bg-red-800/30'
                : 'hover:bg-yellow-100 dark:hover:bg-yellow-800/30'
            )}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

// Add type declarations for global functions
declare global {
  interface Window {
    showErrorNotification?: (message: string) => void;
    showWarningNotification?: (message: string) => void;
  }
}