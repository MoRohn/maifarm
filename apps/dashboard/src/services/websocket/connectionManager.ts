import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../../utils/safeStorage';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
  DEGRADED = 'degraded' // New state for poor connection quality
}

interface ConnectionOptions {
  url: string;
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  onStateChange?: (state: ConnectionState) => void;
  silent?: boolean; // Suppress console logs during initial connection
  enableFallback?: boolean; // Enable long-polling fallback
  queueOfflineMessages?: boolean; // Queue messages when offline
}

export class WebSocketConnectionManager {
  private socket: Socket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private retryCount = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private options: Required<ConnectionOptions>;
  private isInitialConnection = true;
  private connectionEstablished = false;
  private messageQueue: Array<{ event: string; data: any }> = [];
  private latencyHistory: number[] = [];
  private lastPingTime = 0;
  private connectionQuality = 100; // 0-100 scale
  // iOS Safari background handling
  private isInBackground = false;
  private backgroundDisconnectExpected = false;
  private visibilityChangeHandler: (() => void) | null = null;
  // FIX: Track pagehide handler for cleanup to prevent memory leak
  private pagehideHandler: (() => void) | null = null;
  // WS8 FIX: Track joined rooms for auto-rejoin on reconnect
  private joinedRooms: Set<string> = new Set();

  constructor(options: ConnectionOptions) {
    this.options = {
      maxRetries: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      silent: true,
      enableFallback: true,
      queueOfflineMessages: true,
      onStateChange: () => {},
      ...options
    };

    // iOS SAFARI FIX: Setup background/foreground handling
    // iOS Safari terminates WebSocket connections after ~30s in background
    this.setupBackgroundHandling();
  }

  /**
   * iOS SAFARI FIX: Handle app background/foreground transitions
   * iOS Safari kills WebSocket connections when the app goes to background
   * This gracefully handles the disconnection and reconnects when returning
   */
  private setupBackgroundHandling() {
    // Only run in browser environment
    if (typeof document === 'undefined') return;

    // Detect iOS Safari
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                        !(window as any).MSStream &&
                        /Safari/.test(navigator.userAgent);

    this.visibilityChangeHandler = () => {
      const wasInBackground = this.isInBackground;
      this.isInBackground = document.hidden;

      if (document.hidden) {
        // App going to background
        this.log('log', 'App entering background');

        // On iOS Safari, expect the WebSocket to be terminated
        if (isIOSSafari && this.socket?.connected) {
          this.backgroundDisconnectExpected = true;
          this.log('log', 'iOS Safari: Expecting WebSocket termination in background');
        }
      } else if (wasInBackground) {
        // App returning to foreground
        this.log('log', 'App returning to foreground');

        // Reset the expected disconnect flag
        const wasExpectingDisconnect = this.backgroundDisconnectExpected;
        this.backgroundDisconnectExpected = false;

        // Check if we need to reconnect
        if (!this.socket?.connected && this.connectionEstablished) {
          // Connection was lost while in background, reconnect immediately
          this.log('log', 'Reconnecting after returning from background');
          this.retryCount = 0; // Reset retry count for fresh reconnect
          this.scheduleReconnect();
        } else if (this.socket?.connected) {
          // Connection survived, send a ping to verify it's still alive
          this.socket.emit('pong', { timestamp: Date.now() });
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // FIX: Also handle pagehide for iOS Safari (more reliable for some cases)
    // Store handler for cleanup to prevent memory leak
    this.pagehideHandler = () => {
      if (isIOSSafari && this.socket?.connected) {
        this.backgroundDisconnectExpected = true;
      }
    };
    window.addEventListener('pagehide', this.pagehideHandler);
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }

  private log(level: 'log' | 'warn' | 'error', message: string, ...args: any[]) {
    // Suppress logs during initial connection attempts if silent mode is on
    if (this.options.silent && this.isInitialConnection && !this.connectionEstablished) {
      return;
    }
    
    // Only show connection errors after we've had at least one successful connection
    if (level === 'error' && !this.connectionEstablished) {
      return;
    }

    console[level](`[WebSocket] ${message}`, ...args);
  }

  connect(): Socket | null {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.setState(ConnectionState.CONNECTING);
    this.clearRetryTimer();

    try {
      // FIX: Clean up old socket before creating new one to prevent listener leaks
      if (this.socket) {
        this.removeEventHandlers();
        this.socket.disconnect();
        this.socket = null;
      }

      // Determine transports based on fallback setting
      const transports = this.options.enableFallback
        ? ['websocket', 'polling']
        : ['websocket'];

      // Get auth token from safe storage (handles incognito mode, SSR, etc.)
      const accessToken = getAccessToken();

      // WS8 FIX: Include previously joined rooms for auto-rejoin on reconnect
      const reconnectData = this.joinedRooms.size > 0 ? {
        previousRooms: Array.from(this.joinedRooms),
        isReconnect: this.connectionEstablished
      } : undefined;

      this.socket = io(this.options.url, {
        transports,
        reconnection: false, // We'll handle reconnection manually
        timeout: 20000, // Increased timeout for stability
        path: '/socket.io/',
        autoConnect: true,
        forceNew: false, // Reuse existing connections
        multiplex: true, // Allow multiplexing
        perMessageDeflate: { threshold: 1024 }, // Enable compression for messages > 1KB
        closeOnBeforeunload: false, // Don't close on page navigation
        withCredentials: true,
        auth: {
          token: accessToken,
          userId: 'local-user',
          reconnectData // WS8 FIX: Send previous rooms for auto-rejoin
        },
        query: {
          clientVersion: '2.0.0',
          enableMetrics: 'true'
        }
      });

      this.setupEventHandlers();
      return this.socket;
    } catch (error) {
      this.log('error', 'Failed to create socket connection:', error);
      this.setState(ConnectionState.ERROR);
      this.scheduleReconnect();
      // Return null instead of throwing to prevent unhandled promise rejection
      return null;
    }
  }

  /**
   * Remove all event listeners to prevent memory leaks
   * CRITICAL: Must be called before reconnecting or disposing socket
   */
  private removeEventHandlers() {
    if (!this.socket) return;

    // Remove all event listeners
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    this.socket.off('ping');
    this.socket.off('connection:warning');
    this.socket.off('connection:latency');
    this.socket.off('message:ack_request');
    this.socket.off('error');

    this.log('log', 'Event handlers removed');
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Remove any existing handlers first to prevent duplicates
    this.removeEventHandlers();

    this.socket.on('connect', () => {
      this.log('log', 'Connected successfully');
      this.setState(ConnectionState.CONNECTED);
      this.retryCount = 0;
      this.connectionEstablished = true;
      this.isInitialConnection = false;
      this.clearRetryTimer();

      // Flush queued messages
      if (this.options.queueOfflineMessages && this.messageQueue.length > 0) {
        this.log('log', `Flushing ${this.messageQueue.length} queued messages`);
        this.flushMessageQueue();
      }

      // Setup ping/pong handlers for latency tracking
      this.setupLatencyTracking();
    });

    this.socket.on('disconnect', (reason) => {
      // iOS SAFARI FIX: Don't log as error if disconnect was expected (app in background)
      // This prevents alarming error messages when iOS Safari naturally kills the WebSocket
      if (this.backgroundDisconnectExpected) {
        this.log('log', `Disconnected while in background (expected on iOS Safari): ${reason}`);
        this.backgroundDisconnectExpected = false;
      } else if (this.connectionEstablished) {
        // Only log disconnections after we've had a successful connection
        this.log('warn', `Disconnected: ${reason}`);
      }
      this.setState(ConnectionState.DISCONNECTED);

      // Auto-reconnect unless explicitly disconnected
      // iOS SAFARI FIX: Don't reconnect if app is in background (reconnect happens on foreground)
      if (reason !== 'io client disconnect' && !this.isInBackground) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      // Suppress initial connection errors
      if (!this.isInitialConnection || this.connectionEstablished) {
        this.log('error', 'Connection error:', error.message);
      }

      this.setState(ConnectionState.ERROR);
      this.scheduleReconnect();
    });

    // Handle ping/pong for heartbeat
    this.socket.on('ping', (data?: { timestamp?: number }) => {
      if (data?.timestamp) {
        this.lastPingTime = data.timestamp;
      }
      // Send pong immediately with timestamp
      this.socket?.emit('pong', { timestamp: data?.timestamp || Date.now() });
    });

    // Handle connection warnings
    this.socket.on('connection:warning', (data: { reason: string; missedPings?: number }) => {
      this.log('warn', `Connection warning: ${data.reason}`, data);
      this.setState(ConnectionState.DEGRADED);
    });

    // Handle latency updates
    this.socket.on('connection:latency', (data: { latency: number }) => {
      this.updateLatency(data.latency);
    });

    // FIX: Remove non-working wildcard handler - Socket.io client doesn't support '*'
    // Message acknowledgments are now handled by the server's reliabilityManager
    // which sends explicit ack requests via 'message:ack_request' event
    this.socket.on('message:ack_request', (data: { messageId: string }) => {
      if (data?.messageId) {
        this.socket?.emit('message:ack', data.messageId);
      }
    });

    this.socket.on('error', (error) => {
      // Only log errors after successful connection
      if (this.connectionEstablished) {
        this.log('error', 'Socket error:', error);
      }
    });

    // WS8 FIX: Handle room rejoin confirmation from server
    this.socket.on('rooms:rejoined', (data: { rooms: string[]; count: number }) => {
      this.log('log', `Rejoined ${data.count} rooms after reconnect:`, data.rooms);
    });
  }

  /**
   * WS8 FIX: Track a room join for auto-rejoin on reconnect
   * Call this when successfully joining a room
   */
  trackRoomJoin(roomName: string) {
    if (roomName && roomName !== this.socket?.id) {
      this.joinedRooms.add(roomName);
    }
  }

  /**
   * WS8 FIX: Track a room leave
   * Call this when leaving a room
   */
  trackRoomLeave(roomName: string) {
    this.joinedRooms.delete(roomName);
  }

  /**
   * WS8 FIX: Get currently tracked rooms
   */
  getTrackedRooms(): string[] {
    return Array.from(this.joinedRooms);
  }

  /**
   * WS8 FIX: Clear all tracked rooms
   */
  clearTrackedRooms() {
    this.joinedRooms.clear();
  }

  private scheduleReconnect() {
    if (this.retryCount >= this.options.maxRetries) {
      this.log('error', `Max reconnection attempts (${this.options.maxRetries}) reached`);
      this.setState(ConnectionState.ERROR);
      return;
    }

    this.clearRetryTimer();

    // CRITICAL FIX: Improved exponential backoff with decorrelated jitter
    // This prevents "thundering herd" when multiple clients hit maxDelay simultaneously
    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(1.5, this.retryCount), // Gentler growth factor
      this.options.maxDelay
    );

    // Use decorrelated jitter algorithm (AWS best practice)
    // This spreads retries more evenly to avoid synchronized reconnection storms
    const minJitter = baseDelay * 0.5; // 50% of base as minimum variance
    const maxJitter = baseDelay * 1.5; // 150% of base as maximum variance
    const delay = Math.floor(minJitter + Math.random() * (maxJitter - minJitter));

    this.retryCount++;
    
    // Only log reconnection attempts after we've had a successful connection
    // and reduce logging frequency for multiple attempts
    if (this.connectionEstablished && (this.retryCount <= 3 || this.retryCount % 5 === 0)) {
      this.log('log', `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.retryCount}/${this.options.maxRetries})`);
    }
    
    this.setState(ConnectionState.RECONNECTING);

    this.retryTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  disconnect() {
    this.clearRetryTimer();
    this.retryCount = 0;

    // iOS SAFARI FIX: Clean up visibility change listener
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }

    // FIX: Clean up pagehide listener to prevent memory leak
    if (this.pagehideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pagehideHandler);
      this.pagehideHandler = null;
    }

    if (this.socket) {
      // Remove event listeners before disconnecting to prevent memory leaks
      this.removeEventHandlers();
      this.socket.disconnect();
      this.socket = null;
    }

    this.setState(ConnectionState.DISCONNECTED);
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.socket?.connected === true;
  }

  resetConnection() {
    // Clean up existing connection completely
    this.clearRetryTimer();

    if (this.socket) {
      this.removeEventHandlers();
      this.socket.disconnect();
      this.socket = null;
    }

    // Reset all state
    this.retryCount = 0;
    this.isInitialConnection = true;
    this.connectionEstablished = false;
    this.messageQueue = [];
    this.latencyHistory = [];
    this.connectionQuality = 100;
    this.setState(ConnectionState.DISCONNECTED);

    // Create new connection
    this.connect();
  }
  
  // Queue messages when offline
  queueMessage(event: string, data: any) {
    if (this.options.queueOfflineMessages && !this.isConnected()) {
      this.messageQueue.push({ event, data });
      this.log('log', `Queued message: ${event}`);
      return true;
    }
    return false;
  }
  
  // Flush queued messages when reconnected
  private flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.socket?.connected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.socket.emit(message.event, message.data);
      }
    }
  }
  
  // Setup latency tracking
  private setupLatencyTracking() {
    if (!this.socket) return;

    // NOTE: Ping handler is already registered in setupEventHandlers()
    // Do NOT register a duplicate ping handler here to avoid multiple pong responses
  }
  
  // Update latency metrics
  private updateLatency(latency: number) {
    this.latencyHistory.push(latency);
    
    // Keep only last 20 measurements
    if (this.latencyHistory.length > 20) {
      this.latencyHistory.shift();
    }
    
    // Calculate average latency
    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    
    // Update connection quality based on latency
    if (avgLatency < 50) {
      this.updateConnectionQuality('excellent');
    } else if (avgLatency < 150) {
      this.updateConnectionQuality('good');
    } else if (avgLatency < 300) {
      this.updateConnectionQuality('fair');
    } else {
      this.updateConnectionQuality('poor');
    }
  }
  
  // Update connection quality
  private updateConnectionQuality(quality: 'excellent' | 'good' | 'fair' | 'poor' | 'warning') {
    const qualityMap = {
      excellent: 100,
      good: 80,
      fair: 60,
      poor: 40,
      warning: 20
    };
    
    this.connectionQuality = qualityMap[quality];
    
    // Set degraded state if quality is poor
    if (this.connectionQuality <= 40 && this.state === ConnectionState.CONNECTED) {
      this.setState(ConnectionState.DEGRADED);
    } else if (this.connectionQuality > 40 && this.state === ConnectionState.DEGRADED) {
      this.setState(ConnectionState.CONNECTED);
    }
  }
  
  // Get connection metrics
  getMetrics() {
    return {
      state: this.state,
      quality: this.connectionQuality,
      latency: this.latencyHistory.length > 0 
        ? Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length)
        : null,
      queuedMessages: this.messageQueue.length,
      retryCount: this.retryCount,
      uptime: this.connectionEstablished ? Date.now() - this.lastPingTime : 0
    };
  }
}