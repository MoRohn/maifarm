import { websocketService } from './websocket';
import { useToast } from '@/hooks/useToast';
import { useSettingsStore } from '@/store/settingsStore';

export class NotificationService {
  private static instance: NotificationService;
  private toastHandlers: Map<string, (data: any) => void> = new Map();
  
  private constructor() {
    this.setupWebSocketListeners();
  }
  
  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }
  
  private setupWebSocketListeners() {
    // Farm status notifications
    websocketService.on('farm:created', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.farmStart.channels.inApp) {
        this.showNotification(`Farm "${message.payload?.name}" has been created`, 'success');
      }
    });
    
    websocketService.on('farm:completed', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.farmComplete.channels.inApp) {
        this.showNotification(`Farm "${message.payload?.name}" completed successfully!`, 'success', {
          action: {
            label: 'View Results',
            onClick: () => window.location.href = `/harvest/${message.payload?.id}`,
          },
        });
      }
    });
    
    websocketService.on('farm:failed', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.agentError.channels.inApp) {
        this.showNotification(`Farm "${message.payload?.name}" failed: ${message.payload?.error}`, 'error');
      }
    });
    
    // Agent error notifications
    websocketService.on('agent:error', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.agentError.channels.inApp) {
        const payload = message.payload;
        const errorTypeMap = {
          'api_key': '🔑 API Key',
          'cli_missing': '⚙️ CLI',
          'permission': '🔒 Permission',
          'timeout': '⏱️ Timeout',
          'crash': '💥 Crash',
          'unknown': '❓ Unknown'
        };
        
        const errorIcon = errorTypeMap[payload?.type] || '❌';
        const contextInfo = payload?.context ? ` (Context: ${payload.context.substring(0, 50)}...)` : '';
        
        this.showNotification(
          `${errorIcon} Agent "${payload?.agentName || payload?.name}" error: ${payload?.message || payload?.error}${contextInfo}`,
          'error',
          {
            action: {
              label: 'View Details',
              onClick: () => {
                console.log('Agent Error Details:', payload);
                // TODO: Open error details modal
              }
            }
          }
        );
      }
    });
    
    // Agent warning notifications
    websocketService.on('agent:warning', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.agentError.channels.inApp) { // Using agentError settings for now
        const payload = message.payload;
        const warningTypeMap = {
          'timeout': '⏱️ Timeout',
          'unknown': '⚠️ Warning'
        };
        
        const warningIcon = warningTypeMap[payload?.type] || '⚠️';
        
        this.showNotification(
          `${warningIcon} Agent "${payload?.agentName || payload?.name}" warning: ${payload?.message}`,
          'warning',
          {
            action: {
              label: 'Dismiss',
              onClick: () => {
                console.log('Warning dismissed:', payload);
              }
            }
          }
        );
      }
    });
    
    // Resource alerts
    websocketService.on('resource:alert', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.resourceAlert.channels.inApp) {
        this.showNotification(
          `Resource alert: ${message.payload?.message}`,
          'warning'
        );
      }
    });
    
    // AI discoveries
    websocketService.on('ai:discovery', (message) => {
      const settings = useSettingsStore.getState().notifications;
      if (settings?.types.aiDiscovery.channels.inApp) {
        this.showNotification(
          `AI Discovery: ${message.payload?.discovery}`,
          'info',
          {
            action: {
              label: 'Learn More',
              onClick: () => console.log('View discovery details:', message.payload),
            },
          }
        );
      }
    });
    
    // Connection status - commented out to avoid duplicate notifications
    // websocketService.on('connect', () => {
    //   this.showNotification('Connected to MaiFarm server', 'success');
    // });
    
    websocketService.on('disconnect', () => {
      if (websocketService.getStatus() !== 'mock') {
        this.showNotification('Disconnected from server', 'warning');
      }
    });
    
    // Server errors
    websocketService.on('error', (message) => {
      this.showNotification(`Server error: ${message.payload?.message || 'Unknown error'}`, 'error');
    });
  }
  
  private showNotification(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info',
    options?: { action?: { label: string; onClick: () => void } }
  ) {
    const toast = useToast.getState();
    toast[type](message, options);
  }
  
  // Public methods for manual notifications
  success(message: string, options?: { action?: { label: string; onClick: () => void } }) {
    this.showNotification(message, 'success', options);
  }
  
  error(message: string, options?: { action?: { label: string; onClick: () => void } }) {
    this.showNotification(message, 'error', options);
  }
  
  warning(message: string, options?: { action?: { label: string; onClick: () => void } }) {
    this.showNotification(message, 'warning', options);
  }
  
  info(message: string, options?: { action?: { label: string; onClick: () => void } }) {
    this.showNotification(message, 'info', options);
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();