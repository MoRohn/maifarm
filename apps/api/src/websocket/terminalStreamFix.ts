/**
 * Terminal Stream Fix
 * Fixes the WebSocket room joining and terminal output streaming issues
 */

import { Socket, Server as SocketIOServer } from 'socket.io';
import { terminalService } from '../services/unified/terminalService';
import { unifiedTerminalStreamService } from '../services/UnifiedTerminalStreamService';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

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
   * Enhanced with proper agent count detection from pending sessions
   */
  private static async ensureStreaming(sessionId: string, farmId: string) {
    try {
      // Check if streaming is already active
      const farmStatus = unifiedTerminalStreamService.getFarmStatus(farmId);

      if (!farmStatus || !farmStatus.agents || farmStatus.agents.length === 0) {
        logger.info(`[TerminalStreamFix] Starting streaming for session ${sessionId} (farm: ${farmId})`);

        // Clean session and farm IDs
        const cleanSessionId = sessionId.replace(/^(farm-)?/, 'farm-');
        const cleanFarmId = farmId.replace(/^(farm-)?/, '').substring(0, 36);

        // First, check if tmux session already exists and get real pane count
        let agentCount: number | undefined;

        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Check actual tmux pane count
          const { stdout } = await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t ${cleanSessionId} 2>/dev/null | wc -l`);
          const actualPaneCount = parseInt(stdout.trim()) || 0;

          if (actualPaneCount > 0) {
            agentCount = actualPaneCount;
            logger.info(`[TerminalStreamFix] Using actual tmux pane count: ${agentCount}`);
          }
        } catch (error) {
          // Session doesn't exist yet, continue with other methods
          logger.debug(`[TerminalStreamFix] Tmux session not found, will use other methods`);
        }

        // If no actual pane count, try to get from farm service
        if (!agentCount) {
          // Fallback to farm service or mode detection
          try {
            const { farmService } = await import('../services/unified/farmService');
            const farm = await farmService.getFarmById(cleanFarmId);

            if (farm && farm.agentCount) {
              agentCount = farm.agentCount;
              logger.info(`[TerminalStreamFix] Using agent count from farm: ${agentCount}`);
            }
          } catch (error) {
            logger.debug(`[TerminalStreamFix] Could not get farm details: ${error.message}`);
          }

          // Mode-based fallbacks if still no count
          if (!agentCount) {
            if (sessionId.includes('goWild') || farmId.includes('goWild')) {
              agentCount = 5; // GoWild default
            } else if (sessionId.includes('quick') || farmId.includes('quick')) {
              agentCount = 2; // Quick task default
            } else {
              // Default to 3 for testing
              agentCount = 3;
            }
            logger.info(`[TerminalStreamFix] Using default agent count: ${agentCount}`);
          }
        }

        // Build agent names array
        const agentNames: string[] = [];
        for (let i = 0; i < agentCount; i++) {
          agentNames.push(`Agent ${i + 1}`);
        }

        logger.info(`[TerminalStreamFix] Starting streaming for ${cleanSessionId} with ${agentCount} agents`);

        // Try to start tmux streaming (may fail if tmux session doesn't exist)
        try {
          await unifiedTerminalStreamService.registerFarm(cleanFarmId, cleanSessionId, agentCount, agentNames);
          logger.info(`[TerminalStreamFix] Tmux streaming started successfully`);
        } catch (error) {
          logger.warn(`[TerminalStreamFix] Tmux streaming failed (might be testing):`, error);
        }

        // ALWAYS start the file watcher to emit WebSocket events
        // This works even without tmux sessions (for testing)
        try {
          const { terminalFileWatcherService } = await import('../services/terminalFileWatcherService');
          // Pass the clean farmId (same as what streaming service uses)
          await terminalFileWatcherService.watchFarm(cleanFarmId, cleanSessionId);
          logger.info(`[TerminalStreamFix] Started file watcher for farm ${cleanFarmId} (session: ${cleanSessionId})`);
        } catch (error) {
          logger.error(`[TerminalStreamFix] Failed to start file watcher:`, error);
        }
      } else {
        logger.debug(`[TerminalStreamFix] Streaming already active for session ${sessionId} with ${farmStatus.agents?.length || 0} agents`);
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
