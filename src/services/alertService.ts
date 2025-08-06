import { EventEmitter } from 'events';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 means no auto-dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: Date;
}

export interface AlertOptions {
  type: AlertType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

class AlertService extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private nextId = 1;

  constructor() {
    super();
    this.setMaxListeners(100); // Support many components listening
  }

  /**
   * Show a new alert
   */
  show(options: AlertOptions): string {
    const id = `alert-${this.nextId++}`;
    const alert: Alert = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      duration: options.duration ?? 5000, // Default 5 seconds
      action: options.action,
      timestamp: new Date(),
    };

    this.alerts.set(id, alert);
    this.emit('alert:show', alert);

    // Auto-dismiss if duration is set
    if (alert.duration && alert.duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, alert.duration);
    }

    return id;
  }

  /**
   * Show a success alert
   */
  success(title: string, message?: string, duration?: number): string {
    return this.show({ type: 'success', title, message, duration });
  }

  /**
   * Show an error alert
   */
  error(title: string, message?: string, duration?: number): string {
    return this.show({ type: 'error', title, message, duration: duration ?? 0 }); // Errors don't auto-dismiss by default
  }

  /**
   * Show a warning alert
   */
  warning(title: string, message?: string, duration?: number): string {
    return this.show({ type: 'warning', title, message, duration });
  }

  /**
   * Show an info alert
   */
  info(title: string, message?: string, duration?: number): string {
    return this.show({ type: 'info', title, message, duration });
  }

  /**
   * Dismiss an alert
   */
  dismiss(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      this.alerts.delete(id);
      this.emit('alert:dismiss', alert);
    }
  }

  /**
   * Dismiss all alerts
   */
  dismissAll(): void {
    const alerts = Array.from(this.alerts.values());
    this.alerts.clear();
    alerts.forEach(alert => {
      this.emit('alert:dismiss', alert);
    });
  }

  /**
   * Get all active alerts
   */
  getAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Subscribe to alert events
   */
  onAlert(callback: (alert: Alert) => void): () => void {
    this.on('alert:show', callback);
    return () => this.off('alert:show', callback);
  }

  /**
   * Subscribe to dismiss events
   */
  onDismiss(callback: (alert: Alert) => void): () => void {
    this.on('alert:dismiss', callback);
    return () => this.off('alert:dismiss', callback);
  }
}

// Export singleton instance
export const alertService = new AlertService();

// WebSocket integration
export const setupWebSocketAlerts = (wsService: any) => {
  // Listen for WebSocket events and show alerts
  wsService.on('error', (error: any) => {
    alertService.error('WebSocket Error', error?.message ?? 'Unknown error');
  });

  wsService.on('connected', () => {
    alertService.success('Connected', 'Successfully connected to server');
  });

  wsService.on('disconnected', () => {
    alertService.warning('Disconnected', 'Lost connection to server. Retrying...');
  });

  wsService.on('metrics:update', (data: any) => {
    // Don't show alerts for regular metrics updates
    // Only show if there's something significant
    if (data?.alert) {
      alertService.show({
        type: data.alert.type || 'info',
        title: data.alert.title ?? 'Alert',
        message: data.alert.message,
        duration: data.alert.duration
      });
    }
  });

  wsService.on('farm:status', (data: any) => {
    if (data.status === 'failed') {
      alertService.error(`Farm ${data.farmId} Failed`, 'Check logs for details');
    } else if (data.status === 'completed') {
      alertService.success(`Farm ${data.farmId} Completed`, 'All tasks finished successfully');
    }
  });

  wsService.on('agent:error', (data: any) => {
    alertService.error(`Agent Error: ${data?.agentId ?? 'Unknown'}`, data?.error ?? 'Unknown error');
  });
};