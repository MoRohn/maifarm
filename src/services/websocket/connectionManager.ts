import { io, Socket } from 'socket.io-client';

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

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.setState(ConnectionState.CONNECTING);
    this.clearRetryTimer();

    try {
      // Determine transports based on fallback setting
      const transports = this.options.enableFallback 
        ? ['websocket', 'polling'] 
        : ['websocket'];
      
      this.socket = io(this.options.url, {
        transports,
        reconnection: false, // We'll handle reconnection manually
        timeout: 20000, // Increased timeout for stability
        path: '/socket.io/',
        autoConnect: true,
        forceNew: false, // Reuse existing connections
        multiplex: true, // Allow multiplexing
        perMessageDeflate: true, // Enable compression
        closeOnBeforeunload: false, // Don't close on page navigation
        withCredentials: true,
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
      throw error;
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

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
      // Only log disconnections after we've had a successful connection
      if (this.connectionEstablished) {
        this.log('warn', `Disconnected: ${reason}`);
      }
      this.setState(ConnectionState.DISCONNECTED);
      
      // Auto-reconnect unless explicitly disconnected
      if (reason !== 'io client disconnect') {
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
    
    // Handle message acknowledgment requests
    this.socket.on('*', (event: string, data: any) => {
      if (data?.messageId) {
        // Send acknowledgment for messages that require it
        this.socket?.emit('message:ack', data.messageId);
      }
    });

    this.socket.on('error', (error) => {
      // Only log errors after successful connection
      if (this.connectionEstablished) {
        this.log('error', 'Socket error:', error);
      }
    });
    
    // Handle connection quality warnings
    this.socket.on('connection:warning', (data) => {
      this.log('warn', 'Connection warning:', data);
      this.updateConnectionQuality('warning');
    });
    
    // Handle latency updates
    this.socket.on('connection:latency', (data) => {
      this.updateLatency(data.latency);
    });
  }

  private scheduleReconnect() {
    if (this.retryCount >= this.options.maxRetries) {
      this.log('error', `Max reconnection attempts (${this.options.maxRetries}) reached`);
      this.setState(ConnectionState.ERROR);
      return;
    }

    this.clearRetryTimer();
    
    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(2, this.retryCount),
      this.options.maxDelay
    );
    const jitter = Math.random() * 0.3 * baseDelay;
    const delay = baseDelay + jitter;

    this.retryCount++;
    
    // Only log reconnection attempts after we've had a successful connection
    if (this.connectionEstablished) {
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
    
    if (this.socket) {
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
    this.disconnect();
    this.retryCount = 0;
    this.isInitialConnection = true;
    this.connectionEstablished = false;
    this.messageQueue = [];
    this.latencyHistory = [];
    this.connectionQuality = 100;
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
    
    // Handle ping from server
    this.socket.on('ping', (data?: { timestamp?: number }) => {
      // Immediately respond with pong
      this.socket?.emit('pong', data);
      
      // Track ping time for latency calculation
      if (data?.timestamp) {
        this.lastPingTime = data.timestamp;
      }
    });
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
      uptime: this.connectionEstablished ? Date.now() - (this.socket?.io?.engine?.lastPing || 0) : 0
    };
  }
}