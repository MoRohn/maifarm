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

  // New method for room-based broadcasting
  broadcastToRoom(roomName: string, event: string, data: any): void {
    if (this.useUnified) {
      unifiedWebSocketManager.broadcastToRoom(roomName, event, data);
    } else if (this.server) {
      // Fallback to broadcast with room info
      this.server.broadcast(event, { ...data, room: roomName });
    }
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