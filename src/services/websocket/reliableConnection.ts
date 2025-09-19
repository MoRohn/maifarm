import { Socket } from 'socket.io-client';

interface ConnectionOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  maxBackoffDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

interface MessageBatch {
  messages: any[];
  timestamp: number;
  batchId: string;
}

export class ReliableWebSocketConnection {
  private socket: Socket;
  private options: Required<ConnectionOptions>;
  private retryCount = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private messageBuffer: any[] = [];
  private messageBatch: MessageBatch | null = null;
  private batchTimer?: NodeJS.Timeout;
  private isReconnecting = false;

  constructor(socket: Socket, options: ConnectionOptions = {}) {
    this.socket = socket;
    this.options = {
      maxRetries: options.maxRetries ?? 10,
      retryDelay: options.retryDelay ?? 1000,
      backoffMultiplier: options.backoffMultiplier ?? 1.5,
      maxBackoffDelay: options.maxBackoffDelay ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 25000,
      heartbeatTimeout: options.heartbeatTimeout ?? 60000
    };

    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private setupEventHandlers() {
    this.socket.on('connect', () => {
      this.retryCount = 0;
      this.isReconnecting = false;
      this.flushMessageBuffer();
      this.startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this.stopHeartbeat();
      if (!this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('pong', () => {
      // Reset heartbeat timeout on pong
      this.startHeartbeat();
    });

    // Handle reconnection errors
    this.socket.on('connect_error', () => {
      if (this.retryCount < this.options.maxRetries) {
        this.scheduleReconnect();
      }
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket.connected) {
        this.socket.emit('ping');

        // Set timeout for pong response
        setTimeout(() => {
          if (!this.socket.connected && !this.isReconnecting) {
            this.scheduleReconnect();
          }
        }, this.options.heartbeatTimeout);
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private scheduleReconnect() {
    if (this.isReconnecting || this.retryCount >= this.options.maxRetries) {
      return;
    }

    this.isReconnecting = true;
    this.retryCount++;

    // Calculate backoff delay with jitter
    const baseDelay = Math.min(
      this.options.retryDelay * Math.pow(this.options.backoffMultiplier, this.retryCount - 1),
      this.options.maxBackoffDelay
    );
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delay = Math.floor(baseDelay + jitter);

    this.reconnectTimer = setTimeout(() => {
      this.socket.connect();
    }, delay);
  }

  // Buffer messages when disconnected
  public emit(event: string, data: any) {
    if (this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      this.messageBuffer.push({ event, data, timestamp: Date.now() });
    }
  }

  // Batch messages to reduce network overhead
  public emitBatched(event: string, data: any) {
    if (!this.messageBatch) {
      this.messageBatch = {
        messages: [],
        timestamp: Date.now(),
        batchId: Math.random().toString(36).substring(7)
      };
    }

    this.messageBatch.messages.push({ event, data });

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Send batch after 100ms or when it reaches 50 messages
    if (this.messageBatch.messages.length >= 50) {
      this.sendBatch();
    } else {
      this.batchTimer = setTimeout(() => this.sendBatch(), 100);
    }
  }

  private sendBatch() {
    if (this.messageBatch && this.messageBatch.messages.length > 0) {
      this.emit('message:batch', this.messageBatch);
      this.messageBatch = null;
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
  }

  private flushMessageBuffer() {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift();
      if (message && Date.now() - message.timestamp < 60000) { // Discard messages older than 1 minute
        this.socket.emit(message.event, message.data);
      }
    }
  }

  public destroy() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.messageBuffer = [];
    this.messageBatch = null;
  }
}