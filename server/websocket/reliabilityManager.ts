import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface QueuedMessage {
  id: string;
  socketId: string;
  event: string;
  data: any;
  timestamp: Date;
  attempts: number;
  acknowledged: boolean;
}

interface ConnectionHealth {
  socketId: string;
  connected: boolean;
  lastPing: Date;
  lastPong: Date;
  latency: number;
  missedPings: number;
  messageQueueSize: number;
  reconnectCount?: number;
}

class ReliabilityManager {
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private socketQueues: Map<string, Set<string>> = new Map();
  private connectionHealth: Map<string, ConnectionHealth> = new Map();
  private acknowledgmentTimeout = 5000; // 5 seconds
  private maxRetries = 3;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup of old messages
    this.startCleanup();
  }

  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const maxAge = 60000; // 1 minute

      // Clean up old acknowledged messages
      for (const [messageId, message] of this.messageQueue) {
        if (message.acknowledged) {
          const age = now.getTime() - message.timestamp.getTime();
          if (age > maxAge) {
            this.messageQueue.delete(messageId);
            this.socketQueues.get(message.socketId)?.delete(messageId);
          }
        }
      }

      // Clean up disconnected socket queues
      for (const [socketId, health] of this.connectionHealth) {
        if (!health.connected) {
          const timeSinceDisconnect = now.getTime() - health.lastPong.getTime();
          if (timeSinceDisconnect > 300000) { // 5 minutes
            this.clearSocketQueue(socketId);
            this.connectionHealth.delete(socketId);
          }
        }
      }
    }, 30000); // Run every 30 seconds
  }

  // Initialize health tracking for a new connection
  initializeHealth(socketId: string) {
    this.connectionHealth.set(socketId, {
      socketId,
      connected: true,
      lastPing: new Date(),
      lastPong: new Date(),
      latency: 0,
      missedPings: 0,
      messageQueueSize: 0,
      reconnectCount: 0
    });

    // Initialize message queue for this socket
    if (!this.socketQueues.has(socketId)) {
      this.socketQueues.set(socketId, new Set());
    }
  }

  // Update connection health metrics
  updateConnectionHealth(socketId: string, updates: Partial<ConnectionHealth>) {
    const health = this.connectionHealth.get(socketId);
    if (health) {
      Object.assign(health, updates);
      health.messageQueueSize = this.socketQueues.get(socketId)?.size || 0;
    }
  }

  // Queue a message with acknowledgment tracking
  queueMessage(socket: Socket, event: string, data: any, requireAck = true): string {
    const messageId = uuidv4();
    const message: QueuedMessage = {
      id: messageId,
      socketId: socket.id,
      event,
      data,
      timestamp: new Date(),
      attempts: 0,
      acknowledged: !requireAck // If no ack required, mark as acknowledged immediately
    };

    this.messageQueue.set(messageId, message);
    
    if (!this.socketQueues.has(socket.id)) {
      this.socketQueues.set(socket.id, new Set());
    }
    this.socketQueues.get(socket.id)!.add(messageId);

    // Send the message with metadata
    this.sendMessage(socket, message);

    // If acknowledgment is required, set up retry mechanism
    if (requireAck) {
      this.setupRetry(socket, messageId);
    }

    return messageId;
  }

  // Send or resend a message
  private sendMessage(socket: Socket, message: QueuedMessage) {
    message.attempts++;
    
    // Add message metadata for client acknowledgment
    const enrichedData = {
      ...message.data,
      _messageId: message.id,
      _requiresAck: !message.acknowledged,
      _attempt: message.attempts
    };

    socket.emit(message.event, enrichedData);
  }

  // Setup retry mechanism for a message
  private setupRetry(socket: Socket, messageId: string) {
    setTimeout(() => {
      const message = this.messageQueue.get(messageId);
      if (message && !message.acknowledged && message.attempts < this.maxRetries) {
        console.log(`[ReliabilityManager] Retrying message ${messageId} (attempt ${message.attempts + 1}/${this.maxRetries})`);
        this.sendMessage(socket, message);
        this.setupRetry(socket, messageId); // Setup next retry
      } else if (message && !message.acknowledged) {
        console.warn(`[ReliabilityManager] Message ${messageId} failed after ${this.maxRetries} attempts`);
        this.handleFailedMessage(message);
      }
    }, this.acknowledgmentTimeout * Math.pow(2, this.messageQueue.get(messageId)?.attempts || 0)); // Exponential backoff
  }

  // Handle a failed message
  private handleFailedMessage(message: QueuedMessage) {
    // Mark as failed (acknowledged to prevent further retries)
    message.acknowledged = true;
    
    // Emit failure event for monitoring
    console.error(`[ReliabilityManager] Message delivery failed: ${message.id}`, {
      event: message.event,
      attempts: message.attempts,
      socketId: message.socketId
    });

    // Could implement dead letter queue or alerting here
  }

  // Acknowledge receipt of a message
  acknowledgeMessage(messageId: string): boolean {
    const message = this.messageQueue.get(messageId);
    if (message) {
      message.acknowledged = true;
      return true;
    }
    return false;
  }

  // Resend queued messages for a reconnected client
  resendQueuedMessages(socket: Socket) {
    const queuedMessageIds = this.socketQueues.get(socket.id);
    if (!queuedMessageIds || queuedMessageIds.size === 0) {
      return;
    }

    console.log(`[ReliabilityManager] Resending ${queuedMessageIds.size} queued messages for ${socket.id}`);
    
    const messages: QueuedMessage[] = [];
    for (const messageId of queuedMessageIds) {
      const message = this.messageQueue.get(messageId);
      if (message && !message.acknowledged) {
        messages.push(message);
      }
    }

    // Sort by timestamp to maintain order
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Resend messages with a small delay between each
    messages.forEach((message, index) => {
      setTimeout(() => {
        this.sendMessage(socket, message);
      }, index * 50); // 50ms between messages
    });
  }

  // Clear all messages for a socket
  clearSocketQueue(socketId: string) {
    const queuedMessageIds = this.socketQueues.get(socketId);
    if (queuedMessageIds) {
      for (const messageId of queuedMessageIds) {
        this.messageQueue.delete(messageId);
      }
      this.socketQueues.delete(socketId);
    }
  }

  // Cleanup connection (called after disconnect)
  cleanupConnection(socketId: string) {
    // Don't immediately clear queue - wait for cleanup interval
    // This allows for quick reconnects
    this.updateConnectionHealth(socketId, { connected: false });
  }

  // Get health status for all connections
  getHealthStatus(): ConnectionHealth[] {
    return Array.from(this.connectionHealth.values());
  }

  // Get metrics for monitoring
  getMetrics() {
    const totalMessages = this.messageQueue.size;
    const unacknowledged = Array.from(this.messageQueue.values()).filter(m => !m.acknowledged).length;
    const failedMessages = Array.from(this.messageQueue.values()).filter(m => m.attempts >= this.maxRetries).length;
    
    return {
      totalMessages,
      unacknowledged,
      failedMessages,
      connections: this.connectionHealth.size,
      healthyConnections: Array.from(this.connectionHealth.values()).filter(h => h.connected && h.latency < 200).length
    };
  }

  // Cleanup on shutdown
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const reliabilityManager = new ReliabilityManager();