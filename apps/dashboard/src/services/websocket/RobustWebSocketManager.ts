/**
 * RobustWebSocketManager - Production-grade WebSocket manager for mobile
 * Handles network changes, message queuing, automatic reconnection, and battery optimization
 */

import { io, Socket } from 'socket.io-client';

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
  retries: number;
  priority: 'high' | 'normal' | 'low';
}

interface ConnectionStats {
  connected: boolean;
  reconnectAttempts: number;
  lastConnected: Date | null;
  lastDisconnected: Date | null;
  totalMessages: number;
  queuedMessages: number;
  failedMessages: number;
  latency: number;
}

interface RobustWebSocketOptions {
  url: string;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  heartbeatInterval?: number;
  reconnectOnVisibility?: boolean;
  queueOfflineMessages?: boolean;
  maxQueueSize?: number;
  batterySaver?: boolean;
  debug?: boolean;
}

export class RobustWebSocketManager {
  private socket: Socket | null = null;
  private options: Required<RobustWebSocketOptions>;
  private messageQueue: QueuedMessage[] = [];
  private isOnline: boolean = navigator.onLine;
  private isVisible: boolean = !document.hidden;
  private connectionStats: ConnectionStats;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentRetryDelay: number;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private batteryLevel: number = 1;
  private lowPowerMode: boolean = false;

  constructor(options: RobustWebSocketOptions) {
    this.options = {
      url: options.url,
      maxRetries: options.maxRetries ?? 10,
      retryDelay: options.retryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      reconnectOnVisibility: options.reconnectOnVisibility ?? true,
      queueOfflineMessages: options.queueOfflineMessages ?? true,
      maxQueueSize: options.maxQueueSize ?? 100,
      batterySaver: options.batterySaver ?? true,
      debug: options.debug ?? false,
    };

    this.currentRetryDelay = this.options.retryDelay;

    this.connectionStats = {
      connected: false,
      reconnectAttempts: 0,
      lastConnected: null,
      lastDisconnected: null,
      totalMessages: 0,
      queuedMessages: 0,
      failedMessages: 0,
      latency: 0,
    };

    this.setupEventListeners();
    this.setupBatteryMonitoring();
  }

  /**
   * Setup browser event listeners
   */
  private setupEventListeners(): void {
    // Network status changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Page visibility changes
    if (this.options.reconnectOnVisibility) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // iOS-specific network change detection
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', this.handleConnectionChange);
    }

    // Handle app suspension/resume (mobile)
    window.addEventListener('resume', this.handleAppResume);
    window.addEventListener('pause', this.handleAppPause);
  }

  /**
   * Setup battery monitoring for power optimization
   */
  private async setupBatteryMonitoring(): Promise<void> {
    if (!this.options.batterySaver) return;

    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();

        this.batteryLevel = battery.level;
        this.lowPowerMode = battery.level < 0.2;

        battery.addEventListener('levelchange', () => {
          this.batteryLevel = battery.level;
          this.lowPowerMode = battery.level < 0.2;
          this.adjustForBatteryLevel();
        });
      }
    } catch (error) {
      this.log('Battery API not available');
    }
  }

  /**
   * Adjust connection behavior based on battery level
   */
  private adjustForBatteryLevel(): void {
    if (this.lowPowerMode) {
      // Increase heartbeat interval to save battery
      this.options.heartbeatInterval = 60000; // 1 minute

      // Batch low priority messages
      this.batchLowPriorityMessages();

      this.log('Entering low power mode');
    } else {
      // Restore normal intervals
      this.options.heartbeatInterval = 30000; // 30 seconds

      // Flush any batched messages
      this.flushMessageQueue();

      this.log('Exiting low power mode');
    }
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.log('Connecting to WebSocket...');

      this.socket = io(this.options.url, {
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection manually
        timeout: 10000,
        query: {
          deviceType: this.detectDeviceType(),
          connectionType: this.getConnectionType(),
        },
      });

      this.setupSocketHandlers();

      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);

      this.socket.once('connect', () => {
        clearTimeout(connectionTimeout);
        this.handleConnect();
        resolve();
      });

      this.socket.once('connect_error', (error) => {
        clearTimeout(connectionTimeout);
        this.handleConnectError(error);
        reject(error);
      });
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', this.handleConnect);
    this.socket.on('disconnect', this.handleDisconnect);
    this.socket.on('connect_error', this.handleConnectError);
    this.socket.on('pong', this.handlePong);

    // Forward all other events to registered handlers
    this.socket.onAny((event, ...args) => {
      this.handleIncomingMessage(event, args[0]);
    });
  }

  /**
   * Handle successful connection
   */
  private handleConnect = (): void => {
    this.log('Connected to WebSocket');

    this.connectionStats.connected = true;
    this.connectionStats.lastConnected = new Date();
    this.connectionStats.reconnectAttempts = 0;
    this.currentRetryDelay = this.options.retryDelay;

    // Start heartbeat
    this.startHeartbeat();

    // Flush queued messages
    this.flushMessageQueue();

    // Emit connected event
    this.emitToHandlers('connected', { timestamp: Date.now() });
  };

  /**
   * Handle disconnection
   */
  private handleDisconnect = (reason: string): void => {
    this.log(`Disconnected: ${reason}`);

    this.connectionStats.connected = false;
    this.connectionStats.lastDisconnected = new Date();

    // Stop heartbeat
    this.stopHeartbeat();

    // Emit disconnected event
    this.emitToHandlers('disconnected', { reason, timestamp: Date.now() });

    // Attempt reconnection
    if (this.isOnline && this.isVisible) {
      this.scheduleReconnect();
    }
  };

  /**
   * Handle connection error
   */
  private handleConnectError = (error: Error): void => {
    this.log(`Connection error: ${error.message}`);

    this.connectionStats.failedMessages++;

    // Schedule reconnection with exponential backoff
    this.scheduleReconnect();
  };

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.connectionStats.reconnectAttempts >= this.options.maxRetries) {
      this.log('Max reconnection attempts reached');
      this.emitToHandlers('max_retries_reached', {});
      return;
    }

    this.connectionStats.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.log(`Reconnection attempt ${this.connectionStats.reconnectAttempts}`);
      this.connect().catch(() => {
        // Exponential backoff
        this.currentRetryDelay = Math.min(
          this.currentRetryDelay * 2,
          this.options.maxRetryDelay
        );
      });
    }, this.currentRetryDelay);
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(event: string, data: any): void {
    this.connectionStats.totalMessages++;
    this.emitToHandlers(event, data);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Adjust heartbeat based on battery level
    const interval = this.lowPowerMode
      ? this.options.heartbeatInterval * 2
      : this.options.heartbeatInterval;

    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        const startTime = Date.now();
        this.socket.emit('ping', { timestamp: startTime });
      }
    }, interval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle pong response for latency measurement
   */
  private handlePong = (data: { timestamp: number }): void => {
    const latency = Date.now() - data.timestamp;
    this.connectionStats.latency = latency;

    if (this.options.debug) {
      this.log(`Latency: ${latency}ms`);
    }
  };

  /**
   * Send message with queuing support
   */
  public send(event: string, data: any, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    const message: QueuedMessage = {
      event,
      data,
      timestamp: Date.now(),
      retries: 0,
      priority,
    };

    if (this.socket?.connected && this.isOnline) {
      this.sendMessage(message);
    } else if (this.options.queueOfflineMessages) {
      this.queueMessage(message);
    }
  }

  /**
   * Send message immediately
   */
  private sendMessage(message: QueuedMessage): void {
    if (!this.socket?.connected) {
      this.queueMessage(message);
      return;
    }

    try {
      this.socket.emit(message.event, message.data);
      this.connectionStats.totalMessages++;
    } catch (error) {
      this.log(`Failed to send message: ${error}`);
      this.connectionStats.failedMessages++;

      if (message.retries < 3) {
        message.retries++;
        this.queueMessage(message);
      }
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(message: QueuedMessage): void {
    // Respect max queue size
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      // Remove oldest low priority message
      const lowPriorityIndex = this.messageQueue.findIndex(m => m.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.messageQueue.splice(lowPriorityIndex, 1);
      } else if (message.priority !== 'high') {
        // Don't queue if we're full and it's not high priority
        return;
      }
    }

    this.messageQueue.push(message);
    this.messageQueue.sort((a, b) => {
      // Sort by priority then timestamp
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.timestamp - b.timestamp;
    });

    this.connectionStats.queuedMessages = this.messageQueue.length;
  }

  /**
   * Flush message queue
   */
  private flushMessageQueue(): void {
    if (!this.socket?.connected || this.messageQueue.length === 0) {
      return;
    }

    this.log(`Flushing ${this.messageQueue.length} queued messages`);

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.sendMessage(message);
    }

    this.connectionStats.queuedMessages = 0;
  }

  /**
   * Batch low priority messages to save battery
   */
  private batchLowPriorityMessages(): void {
    const lowPriorityMessages = this.messageQueue.filter(m => m.priority === 'low');

    if (lowPriorityMessages.length > 0) {
      const batchedData = lowPriorityMessages.map(m => ({
        event: m.event,
        data: m.data,
      }));

      // Send as single batch message
      this.send('batch', batchedData, 'normal');

      // Remove individual low priority messages
      this.messageQueue = this.messageQueue.filter(m => m.priority !== 'low');
    }
  }

  /**
   * Register event handler
   */
  public on(event: string, handler: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit to registered handlers
   */
  private emitToHandlers(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          this.log(`Error in event handler for ${event}: ${error}`);
        }
      });
    }
  }

  /**
   * Network event handlers
   */
  private handleOnline = (): void => {
    this.log('Network online');
    this.isOnline = true;

    if (!this.socket?.connected) {
      this.connect();
    }
  };

  private handleOffline = (): void => {
    this.log('Network offline');
    this.isOnline = false;
    this.disconnect();
  };

  private handleVisibilityChange = (): void => {
    this.isVisible = !document.hidden;

    if (this.isVisible && this.isOnline && !this.socket?.connected) {
      this.log('Page visible, reconnecting...');
      this.connect();
    } else if (!this.isVisible && this.lowPowerMode) {
      this.log('Page hidden in low power mode, disconnecting...');
      this.disconnect();
    }
  };

  private handleConnectionChange = (): void => {
    const connectionType = this.getConnectionType();
    this.log(`Connection changed to: ${connectionType}`);

    // Reconnect if we switched to a better connection
    if (connectionType === 'wifi' && !this.socket?.connected) {
      this.connect();
    }
  };

  private handleAppResume = (): void => {
    this.log('App resumed');
    if (this.isOnline && !this.socket?.connected) {
      this.connect();
    }
  };

  private handleAppPause = (): void => {
    this.log('App paused');
    if (this.lowPowerMode) {
      this.disconnect();
    }
  };

  /**
   * Disconnect from server
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.connectionStats.connected = false;
  }

  /**
   * Get connection statistics
   */
  public getStats(): ConnectionStats {
    return { ...this.connectionStats };
  }

  /**
   * Detect device type
   */
  private detectDeviceType(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipod/.test(userAgent)) return 'iphone';
    if (/ipad/.test(userAgent)) return 'ipad';
    if (/android/.test(userAgent)) return 'android';
    if (/mobile/.test(userAgent)) return 'mobile';

    return 'desktop';
  }

  /**
   * Get connection type
   */
  private getConnectionType(): string {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return connection.effectiveType || connection.type || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Logging helper
   */
  private log(message: string): void {
    if (this.options.debug) {
      const timestamp = new Date().toISOString();
      // Use a custom logger in production instead of console.log
      if (typeof window !== 'undefined' && (window as any).__DEBUG_LOG__) {
        (window as any).__DEBUG_LOG__(`[RobustWebSocket ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.disconnect();

    // Remove event listeners
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resume', this.handleAppResume);
    window.removeEventListener('pause', this.handleAppPause);

    if ('connection' in navigator) {
      (navigator as any).connection.removeEventListener('change', this.handleConnectionChange);
    }

    this.eventHandlers.clear();
    this.messageQueue = [];
  }
}

// Export singleton instance getter
let instance: RobustWebSocketManager | null = null;

export function getRobustWebSocketManager(url?: string): RobustWebSocketManager {
  if (!instance && url) {
    instance = new RobustWebSocketManager({
      url,
      maxRetries: 10,
      retryDelay: 1000,
      maxRetryDelay: 30000,
      heartbeatInterval: 30000,
      reconnectOnVisibility: true,
      queueOfflineMessages: true,
      maxQueueSize: 100,
      batterySaver: true,
      debug: process.env.NODE_ENV === 'development',
    });
  }

  if (!instance) {
    throw new Error('RobustWebSocketManager not initialized. Provide URL on first call.');
  }

  return instance;
}