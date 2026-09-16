/**
 * Client-side WebSocket Reliability Enhancer
 * Adds reliability features to the client WebSocket connection
 */

import { Socket } from 'socket.io-client';

export interface EnhancerConfig {
  enableAcknowledgments?: boolean;
  enableLatencyTracking?: boolean;
  enableQueueing?: boolean;
  maxQueueSize?: number;
  acknowledgmentTimeout?: number;
}

class WebSocketReliabilityEnhancer {
  private config: Required<EnhancerConfig>;
  private messageQueue: Array<{ event: string; data: any; timestamp: number }> = [];
  private pendingAcks: Map<string, { resolve: Function; timeout: NodeJS.Timeout }> = new Map();
  private latencyHistory: number[] = [];
  private enhancedSockets: WeakSet<Socket> = new WeakSet();
  // FIX: Track queue resend timeouts for proper cleanup
  private queueResendTimeouts: Set<NodeJS.Timeout> = new Set();

  constructor(config: EnhancerConfig = {}) {
    this.config = {
      enableAcknowledgments: true,
      enableLatencyTracking: true,
      enableQueueing: true,
      maxQueueSize: 100,
      acknowledgmentTimeout: 30000,
      ...config
    };
  }

  /**
   * Enhance a socket with reliability features
   */
  public enhanceSocket(socket: Socket): Socket {
    // Avoid double-enhancing
    if (this.enhancedSockets.has(socket)) {
      return socket;
    }

    this.enhancedSockets.add(socket);

    // Add acknowledgment support
    if (this.config.enableAcknowledgments) {
      this.addAcknowledgmentSupport(socket);
    }

    // Add latency tracking
    if (this.config.enableLatencyTracking) {
      this.addLatencyTracking(socket);
    }

    // Add message queueing
    if (this.config.enableQueueing) {
      this.addMessageQueueing(socket);
    }

    // Add connection quality monitoring
    this.addConnectionQualityMonitoring(socket);

    console.log('[ReliabilityEnhancer] Socket enhanced with reliability features');
    return socket;
  }

  /**
   * Add acknowledgment support to socket
   */
  private addAcknowledgmentSupport(socket: Socket) {
    // Intercept emit to add acknowledgment support
    const originalEmit = socket.emit.bind(socket);
    
    socket.emit = (event: string, ...args: any[]) => {
      // Check if this is a message that might need acknowledgment
      const data = args[0];
      if (data && typeof data === 'object' && data.requiresAck) {
        // Create a promise for acknowledgment
        return new Promise((resolve, reject) => {
          const messageId = data.id || this.generateMessageId();
          
          // Set up acknowledgment timeout
          const timeout = setTimeout(() => {
            this.pendingAcks.delete(messageId);
            reject(new Error(`Acknowledgment timeout for message ${messageId}`));
          }, this.config.acknowledgmentTimeout);

          this.pendingAcks.set(messageId, { resolve, timeout });
          
          // Send the message with ID
          originalEmit(event, { ...data, id: messageId }, ...args.slice(1));
        });
      }
      
      // Normal emit
      return originalEmit(event, ...args);
    };

    // Handle acknowledgments
    socket.on('message:ack', (messageId: string) => {
      const pending = this.pendingAcks.get(messageId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(true);
        this.pendingAcks.delete(messageId);
      }
    });

    // Handle batch acknowledgments
    socket.on('messages:ack', (messageIds: string[]) => {
      messageIds.forEach(messageId => {
        const pending = this.pendingAcks.get(messageId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(true);
          this.pendingAcks.delete(messageId);
        }
      });
    });
  }

  /**
   * Add latency tracking to socket
   */
  private addLatencyTracking(socket: Socket) {
    let lastPingTime = 0;
    let pongDebounceTimer: NodeJS.Timeout | null = null;

    // Handle ping from server with debouncing to prevent rapid pings
    socket.on('ping', (data?: { timestamp?: number }) => {
      lastPingTime = data?.timestamp || Date.now();
      
      // Clear any pending pong
      if (pongDebounceTimer) {
        clearTimeout(pongDebounceTimer);
      }
      
      // Debounce pong response to avoid flooding
      pongDebounceTimer = setTimeout(() => {
        socket.emit('pong', { timestamp: lastPingTime });
        pongDebounceTimer = null;
      }, 100); // Small delay to batch rapid pings
    });

    // Track latency updates
    socket.on('connection:latency', (data: { latency: number }) => {
      this.latencyHistory.push(data.latency);
      
      // Keep only last 20 measurements
      if (this.latencyHistory.length > 20) {
        this.latencyHistory.shift();
      }
      
      // Check for high latency (increased threshold)
      if (data.latency > 500) {
        console.warn(`[ReliabilityEnhancer] High latency detected: ${data.latency}ms`);
      }
    });
    
    // Clean up on disconnect
    socket.on('disconnect', () => {
      if (pongDebounceTimer) {
        clearTimeout(pongDebounceTimer);
        pongDebounceTimer = null;
      }
    });
  }

  /**
   * Add message queueing support
   */
  private addMessageQueueing(socket: Socket) {
    // IMPORTANT: Use the already-enhanced emit (from addAcknowledgmentSupport)
    // instead of binding directly to socket.emit to preserve the chain
    const currentEmit = socket.emit.bind(socket);

    // FIX: Events that should NOT be queued - internal socket.io events
    // Queueing these would cause replay issues on reconnect
    const nonQueueableEvents = new Set([
      'ping', 'pong', 'connect', 'disconnect', 'error',
      'connect_error', 'connection:quality', 'connection:warning',
      'message:ack', 'messages:ack'
    ]);

    // Override emit to queue messages when disconnected
    socket.emit = (event: string, ...args: any[]) => {
      if (!socket.connected) {
        // CRITICAL FIX: Don't queue internal events or events that shouldn't be replayed
        if (nonQueueableEvents.has(event)) {
          // Pass through without queueing - these events don't make sense to replay
          return currentEmit(event, ...args);
        }

        // Queue the message
        if (this.messageQueue.length < this.config.maxQueueSize) {
          this.messageQueue.push({
            event,
            data: args[0],
            timestamp: Date.now()
          });
          console.log(`[ReliabilityEnhancer] Message queued: ${event}`);
          return socket;
        } else {
          console.warn('[ReliabilityEnhancer] Message queue full, dropping message');
        }
      }

      // Call the current emit (which may include ack support) instead of original
      return currentEmit(event, ...args);
    };

    // Flush queue on reconnection
    socket.on('connect', () => {
      if (this.messageQueue.length > 0) {
        console.log(`[ReliabilityEnhancer] Flushing ${this.messageQueue.length} queued messages`);
        const queue = [...this.messageQueue];
        this.messageQueue = [];

        queue.forEach((msg, index) => {
          // FIX: Track timeout handles for cleanup
          const timeoutHandle = setTimeout(() => {
            this.queueResendTimeouts.delete(timeoutHandle);
            socket.emit(msg.event, msg.data);
          }, index * 50); // 50ms delay between messages
          this.queueResendTimeouts.add(timeoutHandle);
        });
      }
    });

    // FIX: Clear queue resend timeouts on disconnect
    socket.on('disconnect', () => {
      this.queueResendTimeouts.forEach(timeout => clearTimeout(timeout));
      this.queueResendTimeouts.clear();
    });
  }

  /**
   * Add connection quality monitoring
   */
  private addConnectionQualityMonitoring(socket: Socket) {
    let connectionQuality = 100;
    let missedPings = 0;

    // Monitor connection warnings
    socket.on('connection:warning', (data: { reason: string; missedPings?: number }) => {
      if (data.missedPings) {
        missedPings = data.missedPings;
        connectionQuality = Math.max(0, 100 - (missedPings * 20));
      }
      
      console.warn(`[ReliabilityEnhancer] Connection warning: ${data.reason} (quality: ${connectionQuality}%)`);
      
      // Emit custom event for UI components
      socket.emit('connection:quality', { quality: connectionQuality, warning: data });
    });

    // Monitor disconnections
    socket.on('disconnect', (reason) => {
      console.log(`[ReliabilityEnhancer] Disconnected: ${reason}`);
      connectionQuality = 0;
      
      // Clear pending acknowledgments
      this.pendingAcks.forEach(pending => {
        clearTimeout(pending.timeout);
        pending.resolve(false);
      });
      this.pendingAcks.clear();
    });

    // Reset on reconnection
    socket.on('connect', () => {
      connectionQuality = 100;
      missedPings = 0;
      console.log('[ReliabilityEnhancer] Reconnected successfully');
    });
  }

  /**
   * Get current metrics
   */
  public getMetrics() {
    const avgLatency = this.latencyHistory.length > 0
      ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      : null;

    return {
      queuedMessages: this.messageQueue.length,
      pendingAcknowledgments: this.pendingAcks.size,
      averageLatency: avgLatency,
      latencyHistory: [...this.latencyHistory]
    };
  }

  /**
   * Clear all queued data
   */
  public cleanup() {
    // Clear message queue
    this.messageQueue = [];

    // Clear pending acknowledgments
    this.pendingAcks.forEach(pending => {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    });
    this.pendingAcks.clear();

    // FIX: Clear queue resend timeouts
    this.queueResendTimeouts.forEach(timeout => clearTimeout(timeout));
    this.queueResendTimeouts.clear();

    // Clear latency history
    this.latencyHistory = [];

    console.log('[ReliabilityEnhancer] Cleaned up all reliability data');
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `cli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const reliabilityEnhancer = new WebSocketReliabilityEnhancer();