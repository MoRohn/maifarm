/**
 * Terminal Room Manager
 * Unified room management for terminal WebSocket connections
 * Ensures consistent room naming and proper message delivery
 */

import { Socket, Server as SocketServer } from 'socket.io';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/structuredLogger';

interface RoomMapping {
  farmId: string;
  sessionName: string;
  normalizedRoom: string;
  alternateRooms: string[];
  clientCount: number;
}

export class TerminalRoomManager {
  private static instance: TerminalRoomManager;
  private roomMappings: Map<string, RoomMapping> = new Map();
  private clientToRooms: Map<string, Set<string>> = new Map(); // socketId -> room names
  
  private constructor() {
    logger.info(LogCategory.TERMINAL, 'TerminalRoomManager initialized');
  }
  
  static getInstance(): TerminalRoomManager {
    if (!TerminalRoomManager.instance) {
      TerminalRoomManager.instance = new TerminalRoomManager();
    }
    return TerminalRoomManager.instance;
  }
  
  /**
   * Generate all room variations for a session/farm
   */
  private generateRoomVariations(sessionName: string, farmId?: string): string[] {
    const rooms = new Set<string>();
    
    // Add base session room
    const normalizedSession = this.normalizeSessionName(sessionName);
    rooms.add(`terminal:${normalizedSession}`);
    rooms.add(`terminal:${sessionName}`); // Keep original too
    
    // Extract farm ID from session if not provided
    let targetFarmId = farmId;
    if (!targetFarmId) {
      const match = sessionName.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/i);
      if (match) {
        targetFarmId = match[1];
      }
    }
    
    if (targetFarmId) {
      const shortId = targetFarmId.substring(0, 8);
      
      // Add all possible variations
      rooms.add(`terminal:${targetFarmId}`);
      rooms.add(`terminal:${shortId}`);
      rooms.add(`terminal:farm-${shortId}`);
      rooms.add(`terminal:farm-${targetFarmId}`);
      rooms.add(`terminal:quick_${shortId}`);
      rooms.add(`terminal:quick_${targetFarmId}`);
      rooms.add(`terminal:goWild-${shortId}`);
      rooms.add(`terminal:goWild-${targetFarmId}`);
    }
    
    return Array.from(rooms);
  }
  
  /**
   * Normalize session name to a standard format
   */
  private normalizeSessionName(sessionName: string): string {
    // Extract the farm ID from any format
    const match = sessionName.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/i);
    if (match) {
      const farmId = match[1];
      const shortId = farmId.substring(0, 8);
      // Always use farm- prefix as the normalized format
      return `farm-${shortId}`;
    }
    return sessionName;
  }
  
  /**
   * Join a client to all appropriate rooms
   */
  joinSession(socket: Socket, sessionName: string, farmId?: string): string[] {
    logger.info(LogCategory.TERMINAL, `Client ${socket.id} joining session ${sessionName}`);
    
    // Generate all room variations
    const rooms = this.generateRoomVariations(sessionName, farmId);
    const normalizedRoom = `terminal:${this.normalizeSessionName(sessionName)}`;
    
    // Track rooms for this client
    if (!this.clientToRooms.has(socket.id)) {
      this.clientToRooms.set(socket.id, new Set());
    }
    
    // Join all room variations
    let joinedCount = 0;
    for (const room of rooms) {
      socket.join(room);
      this.clientToRooms.get(socket.id)!.add(room);
      joinedCount++;
    }
    
    // Update or create room mapping
    const targetFarmId = farmId || this.extractFarmId(sessionName);
    const mapping: RoomMapping = {
      farmId: targetFarmId,
      sessionName,
      normalizedRoom,
      alternateRooms: rooms.filter(r => r !== normalizedRoom),
      clientCount: 1
    };
    
    // Update client count if mapping exists
    const existing = this.roomMappings.get(normalizedRoom);
    if (existing) {
      existing.clientCount++;
    } else {
      this.roomMappings.set(normalizedRoom, mapping);
    }
    
    logger.info(LogCategory.TERMINAL, 
      `Client ${socket.id} joined ${joinedCount} rooms for session ${sessionName}`);
    
    // Send confirmation
    socket.emit('terminal:room:joined', {
      sessionName,
      farmId: targetFarmId,
      normalizedRoom,
      roomsJoined: rooms,
      timestamp: new Date()
    });
    
    return rooms;
  }
  
  /**
   * Leave all rooms for a client
   */
  leaveSession(socket: Socket, sessionName?: string): void {
    const clientRooms = this.clientToRooms.get(socket.id);
    if (!clientRooms) return;
    
    // Leave specific session or all rooms
    const roomsToLeave = sessionName 
      ? Array.from(clientRooms).filter(r => r.includes(sessionName))
      : Array.from(clientRooms);
    
    for (const room of roomsToLeave) {
      socket.leave(room);
      clientRooms.delete(room);
      
      // Update client count in mappings
      for (const [key, mapping] of this.roomMappings) {
        if (mapping.alternateRooms.includes(room) || mapping.normalizedRoom === room) {
          mapping.clientCount = Math.max(0, mapping.clientCount - 1);
          if (mapping.clientCount === 0) {
            this.roomMappings.delete(key);
          }
          break;
        }
      }
    }
    
    if (clientRooms.size === 0) {
      this.clientToRooms.delete(socket.id);
    }
    
    logger.info(LogCategory.TERMINAL, 
      `Client ${socket.id} left ${roomsToLeave.length} rooms`);
  }
  
  /**
   * Broadcast terminal output to all relevant rooms
   */
  broadcastOutput(
    io: SocketServer, 
    sessionName: string, 
    farmId: string,
    agentId: number,
    output: string,
    lines?: string[]
  ): number {
    const payload = {
      sessionName,
      sessionId: sessionName, // Include both for compatibility
      farmId,
      agentId,
      output,
      lines: lines || output.split('\n'),
      timestamp: Date.now()
    };
    
    // Get all room variations
    const rooms = this.generateRoomVariations(sessionName, farmId);
    
    // Track how many clients received the message
    const deliveredTo = new Set<string>();
    
    // Broadcast to all room variations
    for (const room of rooms) {
      const roomObj = io.sockets.adapter.rooms.get(room);
      if (roomObj && roomObj.size > 0) {
        io.to(room).emit('terminal:output', payload);
        roomObj.forEach(socketId => deliveredTo.add(socketId));
      }
    }
    
    // Also send directly to known clients as fallback
    for (const [socketId, clientRooms] of this.clientToRooms) {
      // Check if this client should receive the message
      const shouldReceive = Array.from(clientRooms).some(room => {
        return rooms.includes(room) || 
               room.includes(farmId) || 
               room.includes(sessionName);
      });
      
      if (shouldReceive && !deliveredTo.has(socketId)) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.connected) {
          socket.emit('terminal:output', payload);
          deliveredTo.add(socketId);
        }
      }
    }
    
    const deliveryCount = deliveredTo.size;
    
    if (deliveryCount > 0) {
      logger.debug(LogCategory.TERMINAL, 
        `Broadcast terminal output to ${deliveryCount} clients for ${sessionName} agent ${agentId}`);
    } else {
      logger.warn(LogCategory.TERMINAL, 
        `No clients to receive terminal output for ${sessionName} agent ${agentId}`);
    }
    
    return deliveryCount;
  }
  
  /**
   * Extract farm ID from session name
   */
  private extractFarmId(sessionName: string): string {
    const match = sessionName.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/i);
    return match ? match[1] : sessionName;
  }
  
  /**
   * Get debug information
   */
  getDebugInfo(): any {
    const mappings: any[] = [];
    for (const [key, mapping] of this.roomMappings) {
      mappings.push({
        key,
        farmId: mapping.farmId,
        sessionName: mapping.sessionName,
        clientCount: mapping.clientCount,
        alternateRooms: mapping.alternateRooms.length
      });
    }
    
    return {
      totalMappings: this.roomMappings.size,
      totalClients: this.clientToRooms.size,
      mappings,
      clientRooms: Array.from(this.clientToRooms.entries()).map(([socketId, rooms]) => ({
        socketId,
        roomCount: rooms.size,
        rooms: Array.from(rooms)
      }))
    };
  }
  
  /**
   * Clean up disconnected client
   */
  handleDisconnect(socketId: string): void {
    const clientRooms = this.clientToRooms.get(socketId);
    if (clientRooms) {
      // Update client counts
      for (const room of clientRooms) {
        for (const [key, mapping] of this.roomMappings) {
          if (mapping.alternateRooms.includes(room) || mapping.normalizedRoom === room) {
            mapping.clientCount = Math.max(0, mapping.clientCount - 1);
            if (mapping.clientCount === 0) {
              this.roomMappings.delete(key);
            }
            break;
          }
        }
      }
      
      this.clientToRooms.delete(socketId);
      logger.info(LogCategory.TERMINAL, `Cleaned up rooms for disconnected client ${socketId}`);
    }
  }
}

// Export singleton instance
export const terminalRoomManager = TerminalRoomManager.getInstance();