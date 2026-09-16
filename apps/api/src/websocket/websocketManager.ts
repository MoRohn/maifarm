import WebSocketServer from './socketServer';
import { unifiedWebSocketManager } from './UnifiedWebSocketManager';
import { logger, LogCategory } from '../utils/logger';

class WebSocketManagerClass {
  private static instance: WebSocketManagerClass;
  private server: WebSocketServer | null = null;
  private useUnified = true; // Flag to use unified manager

  static getInstance(): WebSocketManagerClass {
    if (!WebSocketManagerClass.instance) {
      WebSocketManagerClass.instance = new WebSocketManagerClass();
    }
    return WebSocketManagerClass.instance;
  }

  setServer(server: WebSocketServer): void {
    this.server = server;

    // If we have the server's HTTP server, initialize unified manager
    if (this.useUnified && server.io) {
      // The unified manager is already initialized in socketServer
      logger.info(LogCategory.WEBSOCKET, 'WebSocketManager using UnifiedWebSocketManager');
    }
  }

  broadcast(event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.broadcast(event, data);
    } else if (this.server) {
      this.server.broadcast(event, data);
    }
  }

  sendToUser(userId: string, event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.broadcastToUser(userId, event, data);
    } else if (this.server) {
      // Fallback to broadcast
      this.server.broadcast(event, data);
    }
  }

  broadcastToFarm(farmId: string, event: string, data: any): void {
    if (this.useUnified) {
      // Use optimized room-based broadcasting
      unifiedWebSocketManager.broadcastToFarm(farmId, event, data);
    } else if (this.server) {
      // Fallback to old method
      this.server.broadcast(event, { ...data, farmId });
    }
  }

  // Alias for broadcastToFarm for backward compatibility
  emitToFarm(farmId: string, event: string, data: any): void {
    this.broadcastToFarm(farmId, event, data);
  }

  // New method for room-based broadcasting
  broadcastToRoom(roomName: string, event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.broadcastToRoom(roomName, event, data);
    } else if (this.server) {
      // Fallback to broadcast with room info
      this.server.broadcast(event, { ...data, room: roomName });
    }
  }

  // Alias for broadcastToRoom for backward compatibility
  sendToRoom(roomName: string, event: string, data: any): void {
    this.broadcastToRoom(roomName, event, data);
  }

  // New method to emit to specific socket
  emitToSocket(socketId: string, event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.emitToSocket(socketId, event, data);
    } else if (this.server) {
      // Fallback - try to find socket and emit
      const socket = this.server.io?.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }

  // New method to broadcast to multiple sockets
  broadcastToSockets(socketIds: string[], event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.broadcastToSockets(socketIds, event, data);
    } else if (this.server) {
      // Fallback - emit to each socket
      for (const socketId of socketIds) {
        this.emitToSocket(socketId, event, data);
      }
    }
  }

  getServer(): WebSocketServer | null {
    return this.server;
  }

  /**
   * Broadcast with acknowledgment for guaranteed delivery
   * Returns success status and delivery counts
   */
  async broadcastWithAck(
    event: string,
    data: any,
    options: { farmId?: string; retryAttempts?: number; timeout?: number } = {}
  ): Promise<{ success: boolean; delivered: number; failed: number }> {
    const { farmId, retryAttempts = 1, timeout = 5000 } = options;

    try {
      // Get all connected sockets in the farm room (or all sockets if no farmId)
      const io = this.io;
      if (!io) {
        return { success: false, delivered: 0, failed: 0 };
      }

      const roomName = farmId ? `farm:${farmId}` : undefined;
      const sockets = roomName
        ? await io.in(roomName).fetchSockets()
        : await io.fetchSockets();

      let delivered = 0;
      let failed = 0;

      // Send to each socket with timeout
      const sendPromises = sockets.map(async (socket) => {
        for (let attempt = 0; attempt < retryAttempts; attempt++) {
          try {
            await Promise.race([
              new Promise<void>((resolve, reject) => {
                socket.emit(event, data, (ack: any) => {
                  if (ack?.error) reject(new Error(ack.error));
                  else resolve();
                });
                // If no callback expected, resolve immediately
                setTimeout(resolve, 100);
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
              )
            ]);
            delivered++;
            return;
          } catch {
            if (attempt === retryAttempts - 1) {
              failed++;
            }
          }
        }
      });

      await Promise.allSettled(sendPromises);

      return {
        success: failed === 0,
        delivered,
        failed
      };
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'broadcastWithAck failed:', error);
      return { success: false, delivered: 0, failed: 1 };
    }
  }

  // Add getter for Socket.IO instance to enable room-based broadcasting
  get io() {
    if (this.useUnified) {
      return unifiedWebSocketManager.io;
    }
    return this.server?.io || null;
  }
}

export const WebSocketManager = WebSocketManagerClass.getInstance();
export const websocketManager = WebSocketManager;