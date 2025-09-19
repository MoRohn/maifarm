/**
 * Terminal Global Fix
 * A simpler approach that ensures terminal output always reaches clients
 * by using global broadcasts when room-based broadcasts fail
 */

import { Socket, Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

export class TerminalGlobalFix {
  private static connectedClients = new Map<string, Set<string>>(); // farmId -> socket IDs
  private static socketToFarm = new Map<string, string>(); // socket ID -> farmId
  
  /**
   * Register a client for terminal updates
   */
  static registerClient(socket: Socket, farmId: string) {
    // Track this client
    if (!this.connectedClients.has(farmId)) {
      this.connectedClients.set(farmId, new Set());
    }
    this.connectedClients.get(farmId)!.add(socket.id);
    this.socketToFarm.set(socket.id, farmId);
    
    logger.info(`[TerminalGlobalFix] Registered client ${socket.id} for farm ${farmId}`);
    
    // Send confirmation
    socket.emit('terminal:registered', {
      farmId,
      socketId: socket.id,
      timestamp: new Date()
    });
  }
  
  /**
   * Unregister a client
   */
  static unregisterClient(socketId: string) {
    const farmId = this.socketToFarm.get(socketId);
    if (farmId) {
      const clients = this.connectedClients.get(farmId);
      if (clients) {
        clients.delete(socketId);
        if (clients.size === 0) {
          this.connectedClients.delete(farmId);
        }
      }
      this.socketToFarm.delete(socketId);
      logger.info(`[TerminalGlobalFix] Unregistered client ${socketId} from farm ${farmId}`);
    }
  }
  
  /**
   * Broadcast terminal output using direct socket targeting
   */
  static broadcastTerminalOutput(io: SocketIOServer, data: {
    sessionName: string;
    farmId: string;
    agentId: number;
    output: string;
    lines?: string[];
  }) {
    const payload = {
      sessionName: data.sessionName,
      sessionId: data.sessionName, // Include both for compatibility
      farmId: data.farmId,
      agentId: data.agentId,
      output: data.output,
      lines: data.lines || data.output.split('\n'),
      timestamp: new Date()
    };
    
    // Extract farm ID from session name if needed
    let targetFarmId = data.farmId;
    if (!targetFarmId && data.sessionName) {
      // Try to extract from session name (e.g., farm-12345678 -> 12345678)
      const match = data.sessionName.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/);
      if (match) {
        targetFarmId = match[1];
      }
    }
    
    // Method 1: Direct socket targeting
    let directCount = 0;
    if (targetFarmId) {
      const clients = this.connectedClients.get(targetFarmId);
      if (clients && clients.size > 0) {
        for (const socketId of clients) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.connected) {
            socket.emit('terminal:output', payload);
            directCount++;
          }
        }
        logger.info(`[TerminalGlobalFix] Direct broadcast to ${directCount} clients for farm ${targetFarmId}`);
      }
    }
    
    // Method 2: Room-based broadcast (as backup)
    const rooms = [
      `terminal:${data.sessionName}`,
      `terminal:${targetFarmId}`,
      `terminal:farm-${targetFarmId}`,
      `terminal:quick_${targetFarmId?.substring(0, 8)}`,
      `terminal:goWild-${targetFarmId?.substring(0, 8)}`
    ].filter(Boolean);
    
    let roomCount = 0;
    for (const room of rooms) {
      const roomObj = io.sockets.adapter.rooms.get(room);
      if (roomObj && roomObj.size > 0) {
        io.to(room).emit('terminal:output', payload);
        roomCount += roomObj.size;
      }
    }
    
    if (roomCount > 0) {
      logger.info(`[TerminalGlobalFix] Room broadcast to ${roomCount} clients`);
    }
    
    // Method 3: Global broadcast (last resort)
    if (directCount === 0 && roomCount === 0) {
      io.emit('terminal:output', payload);
      logger.warn(`[TerminalGlobalFix] Using global broadcast for ${data.sessionName}`);
    }
  }
  
  /**
   * Get debug information
   */
  static getDebugInfo(): any {
    const farms: any = {};
    for (const [farmId, clients] of this.connectedClients) {
      farms[farmId] = {
        clientCount: clients.size,
        socketIds: Array.from(clients)
      };
    }
    
    return {
      totalFarms: this.connectedClients.size,
      totalClients: this.socketToFarm.size,
      farms
    };
  }
}

export default TerminalGlobalFix;