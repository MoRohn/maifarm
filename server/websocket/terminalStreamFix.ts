/**
 * Terminal Stream Fix
 * Fixes the WebSocket room joining and terminal output streaming issues
 */

import { Socket, Server as SocketIOServer } from 'socket.io';
import { terminalService } from '../services/unified/terminalService';

// Alias for compatibility
const terminalStreamService = terminalService;
import { logger } from '../utils/logger';

export class TerminalStreamFix {
  private static sessionClientMap = new Map<string, Set<string>>();
  
  /**
   * Enhanced terminal session join handler that ensures proper room joining
   */
  static handleJoinSession(socket: Socket, io: SocketIOServer, data: {
    sessionId: string;
    farmId?: string;
  }) {
    const { sessionId, farmId } = data;
    
    logger.info(`[TerminalStreamFix] Socket ${socket.id} joining session ${sessionId} for farm ${farmId}`);
    
    // Generate all possible room variations to ensure compatibility
    const rooms = new Set<string>();
    
    // Add the main session room
    rooms.add(`terminal:${sessionId}`);
    
    // Add farm-based room if farmId provided
    if (farmId) {
      rooms.add(`terminal:${farmId}`);
      rooms.add(`terminal:farm-${farmId}`);
      
      // Extract short ID for variations
      const shortId = farmId.substring(0, 8);
      rooms.add(`terminal:quick_${shortId}`);
      rooms.add(`terminal:farm-${shortId}`);
      rooms.add(`terminal:goWild-${shortId}`);
    }
    
    // Handle session ID variations
    if (sessionId.includes('-') || sessionId.includes('_')) {
      const parts = sessionId.split(/[-_]/);
      if (parts.length >= 2) {
        const prefix = parts[0];
        const id = parts[1];
        const shortId = id.substring(0, 8);
        
        // Add all prefix variations
        rooms.add(`terminal:farm-${shortId}`);
        rooms.add(`terminal:quick_${shortId}`);
        rooms.add(`terminal:goWild-${shortId}`);
        rooms.add(`terminal:farm-${id}`);
        rooms.add(`terminal:quick_${id}`);
        rooms.add(`terminal:goWild-${id}`);
      }
    }
    
    // Join all room variations
    let joinedRooms = 0;
    for (const room of rooms) {
      socket.join(room);
      joinedRooms++;
      logger.debug(`[TerminalStreamFix] Socket ${socket.id} joined room: ${room}`);
    }
    
    // Track this client
    if (!this.sessionClientMap.has(sessionId)) {
      this.sessionClientMap.set(sessionId, new Set());
    }
    this.sessionClientMap.get(sessionId)!.add(socket.id);
    
    // Send confirmation
    socket.emit('terminal:joined', {
      sessionId,
      farmId,
      roomsJoined: joinedRooms,
      timestamp: new Date()
    });
    
    // Start streaming for this session if not already started
    this.ensureStreaming(sessionId, farmId || sessionId);
    
    // Send initial output if available
    this.sendInitialOutput(socket, sessionId, farmId);
    
    logger.info(`[TerminalStreamFix] Socket ${socket.id} successfully joined ${joinedRooms} rooms for session ${sessionId}`);
  }
  
  /**
   * Ensure terminal streaming is active for the session
   */
  private static async ensureStreaming(sessionId: string, farmId: string) {
    try {
      // Check if streaming is already active
      const streamingStatus = await terminalStreamService.getStreamingStatus(sessionId);
      
      if (!streamingStatus || !streamingStatus.active) {
        logger.info(`[TerminalStreamFix] Starting streaming for session ${sessionId}`);
        
        // Determine agent count (default to 2 for Quick Tasks)
        let agentCount = 2;
        if (sessionId.includes('goWild')) {
          agentCount = 3; // GoWild typically has 3 agents
        }
        
        // Start streaming
        await terminalStreamService.startStreaming(sessionId, farmId, agentCount);
      } else {
        logger.debug(`[TerminalStreamFix] Streaming already active for session ${sessionId}`);
      }
    } catch (error) {
      logger.error(`[TerminalStreamFix] Failed to ensure streaming for ${sessionId}:`, error);
    }
  }
  
  /**
   * Send any available initial output to the newly connected client
   */
  private static async sendInitialOutput(socket: Socket, sessionId: string, farmId?: string) {
    try {
      // Send a message to indicate terminal is ready and waiting
      socket.emit('terminal:ready', {
        sessionId,
        farmId,
        message: 'Terminal connected. Waiting for agent output...',
        timestamp: new Date()
      });
      
      // The actual output will come through the file watchers
      logger.debug(`[TerminalStreamFix] Sent ready signal for session ${sessionId}`);
    } catch (error) {
      logger.error(`[TerminalStreamFix] Failed to send initial signal:`, error);
    }
  }
  
  /**
   * Enhanced leave session handler
   */
  static handleLeaveSession(socket: Socket, data: { sessionId: string }) {
    const { sessionId } = data;
    
    // Remove from tracking
    if (this.sessionClientMap.has(sessionId)) {
      this.sessionClientMap.get(sessionId)!.delete(socket.id);
      
      if (this.sessionClientMap.get(sessionId)!.size === 0) {
        this.sessionClientMap.delete(sessionId);
        logger.info(`[TerminalStreamFix] No more clients for session ${sessionId}`);
      }
    }
    
    // Leave all related rooms
    const rooms = Array.from(socket.rooms).filter(room => room.startsWith('terminal:'));
    for (const room of rooms) {
      socket.leave(room);
    }
    
    socket.emit('terminal:left', { sessionId, timestamp: new Date() });
  }
  
  /**
   * Broadcast terminal output with proper room targeting
   */
  static broadcastOutput(io: SocketServer, data: {
    sessionName: string;
    farmId: string;
    agentId: number;
    output: string;
    lines?: string[];
  }) {
    // Generate all possible room names
    const rooms = new Set<string>();
    
    // Add primary rooms
    rooms.add(`terminal:${data.sessionName}`);
    rooms.add(`terminal:${data.farmId}`);
    
    // Add variations based on session name
    if (data.sessionName.includes('-') || data.sessionName.includes('_')) {
      const parts = data.sessionName.split(/[-_]/);
      if (parts.length >= 2) {
        const id = parts[1];
        const shortId = id.substring(0, 8);
        rooms.add(`terminal:farm-${shortId}`);
        rooms.add(`terminal:quick_${shortId}`);
        rooms.add(`terminal:goWild-${shortId}`);
        rooms.add(`terminal:farm-${id}`);
        rooms.add(`terminal:quick_${id}`);
      }
    }
    
    // Broadcast to all relevant rooms
    let totalClients = 0;
    const sentRooms: string[] = [];
    
    for (const room of rooms) {
      const roomObj = io.sockets.adapter.rooms.get(room);
      if (roomObj && roomObj.size > 0) {
        io.to(room).emit('terminal:output', {
          sessionName: data.sessionName,
          sessionId: data.sessionName, // Include both for compatibility
          farmId: data.farmId,
          agentId: data.agentId,
          output: data.output,
          lines: data.lines || data.output.split('\n'),
          timestamp: new Date()
        });
        totalClients += roomObj.size;
        sentRooms.push(`${room}(${roomObj.size})`);
      }
    }
    
    if (totalClients > 0) {
      logger.info(`[TerminalStreamFix] Broadcast output to ${totalClients} clients in rooms: ${sentRooms.join(', ')}`);
    } else {
      logger.warn(`[TerminalStreamFix] No clients to broadcast to for session ${data.sessionName}`);
      
      // Fallback: Try global broadcast
      io.emit('terminal:output', {
        sessionName: data.sessionName,
        sessionId: data.sessionName,
        farmId: data.farmId,
        agentId: data.agentId,
        output: data.output,
        lines: data.lines || data.output.split('\n'),
        timestamp: new Date()
      });
      logger.info(`[TerminalStreamFix] Used global broadcast as fallback`);
    }
  }
  
  /**
   * Get debugging info about current sessions and rooms
   */
  static getDebugInfo(io: SocketServer): any {
    const rooms = io.sockets.adapter.rooms;
    const terminalRooms: any = {};
    
    for (const [roomName, sockets] of rooms) {
      if (roomName.startsWith('terminal:')) {
        terminalRooms[roomName] = {
          size: sockets.size,
          sockets: Array.from(sockets)
        };
      }
    }
    
    return {
      sessionClients: Object.fromEntries(this.sessionClientMap),
      terminalRooms,
      totalSessions: this.sessionClientMap.size,
      totalRooms: Object.keys(terminalRooms).length
    };
  }
}

export default TerminalStreamFix;