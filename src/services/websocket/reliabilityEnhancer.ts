import { Socket } from 'socket.io-client';

export interface ReliableMessage {
  messageId?: string;
  event: string;
  data: any;
  timestamp: Date;
  retry?: number;
}

export interface ConnectionFeatures {
  acknowledgments?: boolean;
  queueing?: boolean;
  healthCheck?: boolean;
  compression?: boolean;
}

export class WebSocketReliabilityEnhancer {
  private socket: Socket | null = null;
  private pendingAcks: Map<string, NodeJS.Timeout> = new Map();
  private receivedMessages: Set<string> = new Set();
  private features: ConnectionFeatures = {};
  private onReconnectCallbacks: Array<() => void> = [];

  constructor() {
    // Cleanup old received messages periodically
    setInterval(() => this.cleanupReceivedMessages(), 60000); // Every minute
  }

  /**
   * Enhance a socket connection with reliability features
   */
  enhanceSocket(socket: Socket): Socket {
    this.socket = socket;
    this.setupReliabilityHandlers();
    return socket;
  }

  /**
   * Setup reliability event handlers
   */
  private setupReliabilityHandlers() {
    if (!this.socket) return;

    // Handle connection establishment
    this.socket.on('connected', (data: any) => {
      console.log('[WebSocket] Connected with features:', data.features);
      this.features = data.features || {};
      
      // Execute reconnect callbacks
      if (this.onReconnectCallbacks.length > 0) {
        console.log('[WebSocket] Executing reconnect callbacks');
        this.onReconnectCallbacks.forEach(callback => callback());
        this.onReconnectCallbacks = [];
      }
    });

    // Handle messages that require acknowledgment
    this.socket.onAny((eventName: string, ...args: any[]) => {
      const data = args[0];
      
      // Check if this message requires acknowledgment
      if (data?.messageId && this.features.acknowledgments) {
        // Prevent duplicate processing
        if (this.receivedMessages.has(data.messageId)) {
          console.log(`[WebSocket] Duplicate message ignored: ${data.messageId}`);
          return;
        }
        
        this.receivedMessages.add(data.messageId);
        
        // Send acknowledgment
        this.socket?.emit('message:ack', data.messageId);
        
        // Log retry attempts
        if (data.retry && data.retry > 0) {
          console.log(`[WebSocket] Received retry ${data.retry} for message ${data.messageId}`);
        }
      }
    });

    // Handle connection warnings
    this.socket.on('connection:warning', (data: any) => {
      console.warn('[WebSocket] Connection warning:', data);
      
      // Show user notification if available
      if ((window as any).showWarningNotification) {
        (window as any).showWarningNotification(`Connection issue: ${data.reason}`);
      }
    });

    // Handle connection test
    this.socket.on('connection:test', (data: any) => {
      console.log('[WebSocket] Connection test received:', data);
      // Respond to test if needed
      if (data.requireResponse) {
        this.socket?.emit('connection:test:response', {
          testId: data.id,
          timestamp: new Date()
        });
      }
    });
  }

  /**
   * Send a message with optional acknowledgment requirement
   */
  sendReliableMessage(event: string, data: any, requireAck: boolean = false): string | null {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot send message: not connected');
      return null;
    }

    const messageId = requireAck ? this.generateMessageId() : null;
    
    const message: ReliableMessage = {
      messageId: messageId || undefined,
      event,
      data,
      timestamp: new Date()
    };

    // Send the message
    this.socket.emit(event, message);

    // Setup acknowledgment timeout if required
    if (requireAck && messageId) {
      const timeout = setTimeout(() => {
        console.warn(`[WebSocket] No acknowledgment received for message ${messageId}`);
        // Could implement retry logic here
      }, 5000); // 5 second timeout

      this.pendingAcks.set(messageId, timeout);
    }

    return messageId;
  }

  /**
   * Handle acknowledgment from server
   */
  handleAcknowledgment(messageId: string) {
    const timeout = this.pendingAcks.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAcks.delete(messageId);
      console.log(`[WebSocket] Message acknowledged: ${messageId}`);
    }
  }

  /**
   * Register a callback to be executed on reconnection
   */
  onReconnect(callback: () => void) {
    this.onReconnectCallbacks.push(callback);
  }

  /**
   * Clear reconnect callbacks
   */
  clearReconnectCallbacks() {
    this.onReconnectCallbacks = [];
  }

  /**
   * Get connection features
   */
  getFeatures(): ConnectionFeatures {
    return this.features;
  }

  /**
   * Check if a feature is enabled
   */
  hasFeature(feature: keyof ConnectionFeatures): boolean {
    return this.features[feature] === true;
  }

  /**
   * Cleanup old received messages to prevent memory leak
   */
  private cleanupReceivedMessages() {
    const maxSize = 1000;
    if (this.receivedMessages.size > maxSize) {
      const toDelete = this.receivedMessages.size - maxSize;
      const iterator = this.receivedMessages.values();
      for (let i = 0; i < toDelete; i++) {
        const messageId = iterator.next().value;
        if (messageId) {
          this.receivedMessages.delete(messageId);
        }
      }
      console.log(`[WebSocket] Cleaned up ${toDelete} old message IDs`);
    }
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics about reliability
   */
  getStatistics() {
    return {
      pendingAcks: this.pendingAcks.size,
      receivedMessages: this.receivedMessages.size,
      features: this.features,
      reconnectCallbacks: this.onReconnectCallbacks.length
    };
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    // Clear all pending acknowledgment timeouts
    this.pendingAcks.forEach(timeout => clearTimeout(timeout));
    this.pendingAcks.clear();
    
    // Clear received messages
    this.receivedMessages.clear();
    
    // Clear callbacks
    this.onReconnectCallbacks = [];
    
    // Remove socket reference
    this.socket = null;
  }
}

// Singleton instance
export const reliabilityEnhancer = new WebSocketReliabilityEnhancer();

// Export for debugging in development
if (import.meta.env.DEV) {
  (window as any).wsReliabilityEnhancer = reliabilityEnhancer;
}