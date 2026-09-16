import { Socket, io } from 'socket.io-client';
import { useWebSocketStore } from '@/store/websocketStore';

interface MobileWebSocketConfig {
  url: string;
  enableCompression?: boolean;
  enableBinaryOptimization?: boolean;
  batterySaveMode?: boolean;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  messageQueueSize?: number;
}

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
}

/**
 * Mobile-optimized WebSocket manager with battery saving and network resilience
 */
export class MobileOptimizedWebSocketManager {
  private socket: Socket | null = null;
  private config: Required<MobileWebSocketConfig>;
  private messageQueue: QueuedMessage[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectCount = 0;
  private isBackground = false;
  private lastActivity = Date.now();
  private batteryLevel = 1;
  private networkType: 'wifi' | '4g' | '3g' | '2g' | 'offline' = 'wifi';
  private subscriptions = new Map<string, Set<Function>>();
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;
  // FIX: Store event handlers for cleanup to prevent memory leaks
  private visibilityHandler: (() => void) | null = null;
  private pagehideHandler: (() => void) | null = null;
  private pageshowHandler: ((e: PageTransitionEvent) => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(config: MobileWebSocketConfig) {
    this.config = {
      url: config.url,
      enableCompression: config.enableCompression ?? true,
      enableBinaryOptimization: config.enableBinaryOptimization ?? true,
      batterySaveMode: config.batterySaveMode ?? false,
      autoReconnect: config.autoReconnect ?? true,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      messageQueueSize: config.messageQueueSize ?? 100,
    };

    this.setupLifecycleListeners();
    this.setupNetworkListeners();
    this.setupBatteryMonitoring();
  }

  /**
   * Connect to WebSocket server with mobile optimizations
   */
  async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // Already connected
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    this.isConnecting = true;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        // Determine transport based on network conditions
        const transports = this.getOptimalTransports();

        this.socket = io(this.config.url, {
          transports,
          reconnection: false, // We handle reconnection manually
          timeout: this.getConnectionTimeout(),
          query: this.getConnectionQuery(),

          // iOS-specific optimizations
          forceNew: false,
          multiplex: true,

          // Compression settings
          perMessageDeflate: this.config.enableCompression && this.networkType !== '2g',

          // Parser options for binary optimization
          parser: this.config.enableBinaryOptimization ? undefined : undefined,
        });

        this.setupSocketHandlers();

        // Set connection timeout
        const timeout = setTimeout(() => {
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, this.getConnectionTimeout());

        this.socket.once('connect', () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.reconnectCount = 0;
          this.startHeartbeat();
          this.flushMessageQueue();

          // Update store
          const store = useWebSocketStore.getState();
          store.setConnected(true);

          console.log('[MobileWS] Connected successfully');
          resolve();
        });

        this.socket.once('connect_error', (error) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          console.error('[MobileWS] Connection error:', error.message);
          this.handleReconnection();
          reject(error);
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // FIX: Clean up event listeners to prevent memory leaks
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.pagehideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pagehideHandler);
      this.pagehideHandler = null;
    }
    if (this.pageshowHandler && typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.pageshowHandler);
      this.pageshowHandler = null;
    }
    if (this.onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }

    const store = useWebSocketStore.getState();
    store.setConnected(false);

    console.log('[MobileWS] Disconnected');
  }

  /**
   * Send a message with mobile optimizations
   */
  emit(event: string, data: any, options?: {
    priority?: 'high' | 'normal' | 'low';
    queueIfOffline?: boolean;
    compress?: boolean;
  }): void {
    const { priority = 'normal', queueIfOffline = true, compress = true } = options || {};

    // If in battery save mode, batch low priority messages
    if (this.config.batterySaveMode && priority === 'low') {
      this.queueMessage(event, data, priority);
      return;
    }

    if (this.socket?.connected) {
      // Apply compression for large payloads
      const payload = compress && JSON.stringify(data).length > 1024
        ? this.compressData(data)
        : data;

      this.socket.emit(event, payload);
      this.lastActivity = Date.now();
    } else if (queueIfOffline) {
      this.queueMessage(event, data, priority);
    }
  }

  /**
   * Subscribe to WebSocket events
   */
  on(event: string, callback: Function): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());

      // Register with socket if connected
      if (this.socket) {
        this.socket.on(event, (data) => this.handleEvent(event, data));
      }
    }

    this.subscriptions.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(event);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(event);
          this.socket?.off(event);
        }
      }
    };
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      console.log('[MobileWS] Disconnected:', reason);

      const store = useWebSocketStore.getState();
      store.setConnected(false);

      if (reason === 'io server disconnect') {
        // Server initiated disconnect, attempt reconnection
        this.handleReconnection();
      } else if (reason === 'transport close' || reason === 'transport error') {
        // Network issue, attempt reconnection with backoff
        this.handleReconnection();
      }
    });

    this.socket.on('error', (error) => {
      console.error('[MobileWS] Socket error:', error);
    });

    // Re-register subscribed events
    this.subscriptions.forEach((callbacks, event) => {
      if (callbacks.size > 0) {
        this.socket!.on(event, (data) => this.handleEvent(event, data));
      }
    });

    // Handle pong for heartbeat
    this.socket.on('pong', () => {
      this.lastActivity = Date.now();
    });
  }

  /**
   * Handle incoming events
   */
  private handleEvent(event: string, data: any): void {
    const callbacks = this.subscriptions.get(event);
    if (callbacks) {
      // Decompress data if needed
      const payload = this.isCompressed(data) ? this.decompressData(data) : data;

      callbacks.forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[MobileWS] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Queue messages for later delivery
   */
  private queueMessage(event: string, data: any, priority: 'high' | 'normal' | 'low'): void {
    // Enforce queue size limit
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      // Remove oldest low priority message
      const lowPriorityIndex = this.messageQueue.findIndex(m => m.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.messageQueue.splice(lowPriorityIndex, 1);
      } else if (priority !== 'high') {
        // Don't queue if we're full and it's not high priority
        return;
      } else {
        // Remove oldest message to make room for high priority
        this.messageQueue.shift();
      }
    }

    this.messageQueue.push({
      event,
      data,
      timestamp: Date.now(),
      priority,
      retryCount: 0,
    });

    // Sort by priority and timestamp
    this.messageQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    if (!this.socket?.connected || this.messageQueue.length === 0) return;

    console.log(`[MobileWS] Flushing ${this.messageQueue.length} queued messages`);

    const messagesToSend = [...this.messageQueue];
    this.messageQueue = [];

    messagesToSend.forEach(message => {
      try {
        this.socket!.emit(message.event, message.data);
      } catch (error) {
        console.error('[MobileWS] Error sending queued message:', error);

        // Re-queue if it's a high priority message and hasn't exceeded retry limit
        if (message.priority === 'high' && message.retryCount < 3) {
          message.retryCount++;
          this.messageQueue.push(message);
        }
      }
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnection(): void {
    if (!this.config.autoReconnect || this.reconnectCount >= this.config.reconnectAttempts) {
      console.log('[MobileWS] Max reconnection attempts reached');
      return;
    }

    this.clearReconnectTimer();

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(1.5, this.reconnectCount),
      this.config.maxReconnectDelay
    );

    console.log(`[MobileWS] Reconnecting in ${delay}ms (attempt ${this.reconnectCount + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++;
      this.connect().catch(error => {
        console.error('[MobileWS] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Adjust heartbeat interval based on battery and network
    const interval = this.getHeartbeatInterval();

    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', { timestamp: Date.now() });
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
   * Get optimal heartbeat interval based on conditions
   */
  private getHeartbeatInterval(): number {
    let interval = this.config.heartbeatInterval;

    // Increase interval in battery save mode
    if (this.config.batterySaveMode || this.batteryLevel < 0.2) {
      interval *= 2;
    }

    // Increase interval on slow networks
    if (this.networkType === '2g' || this.networkType === '3g') {
      interval *= 1.5;
    }

    // Reduce interval if app is in background
    if (this.isBackground) {
      interval *= 3;
    }

    return Math.min(interval, 300000); // Max 5 minutes
  }

  /**
   * Get optimal transports based on network conditions
   */
  private getOptimalTransports(): string[] {
    if (this.networkType === 'wifi' || this.networkType === '4g') {
      return ['websocket', 'polling'];
    }
    // For slower connections, prefer polling
    return ['polling', 'websocket'];
  }

  /**
   * Get connection timeout based on network
   */
  private getConnectionTimeout(): number {
    switch (this.networkType) {
      case 'wifi':
        return 10000;
      case '4g':
        return 15000;
      case '3g':
        return 20000;
      case '2g':
        return 30000;
      default:
        return 20000;
    }
  }

  /**
   * Get connection query parameters
   */
  private getConnectionQuery(): Record<string, string> {
    return {
      client: 'mobile',
      platform: this.detectPlatform(),
      network: this.networkType,
      battery: this.batteryLevel.toString(),
      background: this.isBackground.toString(),
    };
  }

  /**
   * Detect platform
   */
  private detectPlatform(): string {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iphone';
    if (/iPad/.test(ua)) return 'ipad';
    if (/Android/.test(ua)) return 'android';
    return 'web';
  }

  /**
   * Setup lifecycle listeners
   * FIX: Store handlers for cleanup to prevent memory leaks
   */
  private setupLifecycleListeners(): void {
    // Page visibility
    this.visibilityHandler = () => {
      this.isBackground = document.hidden;

      if (this.isBackground) {
        // Reduce activity when in background
        this.stopHeartbeat();

        if (this.config.batterySaveMode) {
          // Disconnect after 30 seconds in background
          setTimeout(() => {
            if (this.isBackground) {
              this.disconnect();
            }
          }, 30000);
        }
      } else {
        // Resume when returning to foreground
        if (this.socket?.connected) {
          this.startHeartbeat();
        } else if (this.config.autoReconnect) {
          this.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // iOS-specific events
    this.pagehideHandler = () => {
      // Save state before suspension
      this.saveState();
    };
    window.addEventListener('pagehide', this.pagehideHandler);

    this.pageshowHandler = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Restored from bfcache
        this.restoreState();
        if (!this.socket?.connected && this.config.autoReconnect) {
          this.connect();
        }
      }
    };
    window.addEventListener('pageshow', this.pageshowHandler);
  }

  /**
   * Setup network listeners
   * FIX: Store handlers for cleanup to prevent memory leaks
   */
  private setupNetworkListeners(): void {
    // Online/offline events
    this.onlineHandler = () => {
      console.log('[MobileWS] Network online');
      if (!this.socket?.connected && this.config.autoReconnect) {
        this.connect();
      }
    };
    window.addEventListener('online', this.onlineHandler);

    this.offlineHandler = () => {
      console.log('[MobileWS] Network offline');
      this.networkType = 'offline';
    };
    window.addEventListener('offline', this.offlineHandler);

    // Network Information API
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;

      const updateNetworkType = () => {
        const effectiveType = connection.effectiveType;
        this.networkType = effectiveType === 'wifi' ? 'wifi' :
                          effectiveType === '4g' ? '4g' :
                          effectiveType === '3g' ? '3g' :
                          effectiveType === '2g' ? '2g' : 'wifi';

        console.log('[MobileWS] Network type:', this.networkType);

        // Adjust connection parameters based on network
        if (this.socket?.connected && this.networkType === '2g') {
          // Reduce activity on very slow connections
          this.config.batterySaveMode = true;
        }
      };

      updateNetworkType();
      connection.addEventListener('change', updateNetworkType);
    }
  }

  /**
   * Setup battery monitoring
   * CRITICAL FIX: Battery API is deprecated on iOS/macOS Safari - use safe detection
   */
  private setupBatteryMonitoring(): void {
    // Battery Status API is deprecated and unavailable on iOS/macOS Safari
    // Only attempt on Chromium-based browsers where it's still supported
    const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/Safari/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    // Skip battery monitoring on Safari (iOS/macOS) - API not supported
    if (isSafari || !isChromium) {
      // Default to full battery when API unavailable
      this.batteryLevel = 1.0;
      return;
    }

    // Safe check for getBattery
    if (typeof navigator.getBattery !== 'function') return;

    (async () => {
      try {
        const battery = await navigator.getBattery();
        const updateBatteryInfo = () => {
          this.batteryLevel = battery.level;

          // Enable battery save mode automatically at low battery
          if (battery.level < 0.15) {
            this.config.batterySaveMode = true;
            console.log('[MobileWS] Low battery - enabling battery save mode');
          }
        };

        updateBatteryInfo();
        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
      } catch (error) {
        // Battery API not available - use defaults
        console.debug('[MobileWS] Battery API unavailable, using defaults');
        this.batteryLevel = 1.0;
      }
    })();
  }

  /**
   * Compress data for transmission
   */
  private compressData(data: any): any {
    // Simple compression by removing whitespace from JSON
    // In production, use a proper compression library
    const json = JSON.stringify(data);
    const compressed = json.replace(/\s+/g, ' ');
    return {
      _compressed: true,
      data: compressed,
    };
  }

  /**
   * Decompress received data
   */
  private decompressData(data: any): any {
    if (data._compressed) {
      return JSON.parse(data.data);
    }
    return data;
  }

  /**
   * Check if data is compressed
   */
  private isCompressed(data: any): boolean {
    return data && typeof data === 'object' && data._compressed === true;
  }

  /**
   * Save state before app suspension
   */
  private saveState(): void {
    const state = {
      timestamp: Date.now(),
      queue: this.messageQueue,
      reconnectCount: this.reconnectCount,
    };

    try {
      sessionStorage.setItem('mobileWsState', JSON.stringify(state));
    } catch (error) {
      console.error('[MobileWS] Error saving state:', error);
    }
  }

  /**
   * Restore state after app resumption
   */
  private restoreState(): void {
    try {
      const saved = sessionStorage.getItem('mobileWsState');
      if (saved) {
        const state = JSON.parse(saved);

        // Only restore if state is recent (within 5 minutes)
        if (Date.now() - state.timestamp < 300000) {
          this.messageQueue = state.queue || [];
          this.reconnectCount = state.reconnectCount || 0;

          console.log('[MobileWS] State restored');
        }

        sessionStorage.removeItem('mobileWsState');
      }
    } catch (error) {
      console.error('[MobileWS] Error restoring state:', error);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    reconnectCount: number;
    queueSize: number;
    networkType: string;
    batteryLevel: number;
    isBackground: boolean;
  } {
    return {
      connected: this.socket?.connected || false,
      reconnectCount: this.reconnectCount,
      queueSize: this.messageQueue.length,
      networkType: this.networkType,
      batteryLevel: this.batteryLevel,
      isBackground: this.isBackground,
    };
  }
}

// Create singleton instance
let mobileWsManager: MobileOptimizedWebSocketManager | null = null;

export const getMobileWebSocketManager = (url?: string): MobileOptimizedWebSocketManager => {
  if (!mobileWsManager && url) {
    mobileWsManager = new MobileOptimizedWebSocketManager({
      url,
      enableCompression: true,
      enableBinaryOptimization: true,
      batterySaveMode: false, // Will be enabled automatically at low battery
      autoReconnect: true,
      reconnectAttempts: 10,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
      messageQueueSize: 100,
    });
  }

  if (!mobileWsManager) {
    throw new Error('MobileWebSocketManager not initialized. Provide URL on first call.');
  }

  return mobileWsManager;
};