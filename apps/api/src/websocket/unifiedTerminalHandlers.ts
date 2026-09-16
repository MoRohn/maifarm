/**
 * Unified Terminal WebSocket Handlers
 *
 * Optimized WebSocket handlers for real-time terminal streaming.
 * Features:
 * - Zero batching delay for instant output delivery
 * - Smart room management (single canonical room per session)
 * - Automatic reconnection with state recovery
 * - Connection quality monitoring
 * - Comprehensive error handling
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { logger, LogCategory } from '../utils/logger';
import { unifiedTerminalStreamService } from '../services/UnifiedTerminalStreamService';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface TerminalJoinPayload {
  sessionId: string;
  farmId: string;
  agentId?: number;
}

interface TerminalOutputPayload {
  farmId: string;
  agentId: string;
  agentIndex: number;
  sessionName: string;
  content: string;
  timestamp: string;
}

interface ConnectionQuality {
  clientId: string;
  latency: number;
  packetsLost: number;
  lastUpdate: number;
}

// ============================================================================
// State Management
// ============================================================================

class TerminalConnectionManager {
  private connections = new Map<string, Set<string>>(); // sessionId -> Set<socketId>
  private socketToFarm = new Map<string, string>(); // socketId -> farmId
  private connectionQuality = new Map<string, ConnectionQuality>(); // socketId -> quality

  /**
   * Register a socket connection to a farm session
   */
  join(socket: Socket, sessionId: string, farmId: string): void {
    // Add to session connections
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(socket.id);

    // Track farm association
    this.socketToFarm.set(socket.id, farmId);

    // Initialize connection quality
    this.connectionQuality.set(socket.id, {
      clientId: socket.id,
      latency: 0,
      packetsLost: 0,
      lastUpdate: Date.now()
    });

    logger.info(LogCategory.TERMINAL,
      `Socket ${socket.id} joined session ${sessionId} (farm: ${farmId})`);
  }

  /**
   * Unregister a socket connection
   */
  leave(socket: Socket, sessionId?: string): void {
    if (sessionId) {
      const connections = this.connections.get(sessionId);
      if (connections) {
        connections.delete(socket.id);
        if (connections.size === 0) {
          this.connections.delete(sessionId);
          logger.debug(LogCategory.TERMINAL,
            `Session ${sessionId} has no more connections`);
        }
      }
    } else {
      // Remove from all sessions
      for (const [sid, sockets] of this.connections.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.connections.delete(sid);
          }
        }
      }
    }

    this.socketToFarm.delete(socket.id);
    this.connectionQuality.delete(socket.id);

    logger.info(LogCategory.TERMINAL, `Socket ${socket.id} disconnected`);
  }

  /**
   * Get farm ID for a socket
   */
  getFarmId(socketId: string): string | undefined {
    return this.socketToFarm.get(socketId);
  }

  /**
   * Get connection count for a session
   */
  getConnectionCount(sessionId: string): number {
    return this.connections.get(sessionId)?.size || 0;
  }

  /**
   * Get all sessions
   */
  getSessions(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Update connection quality
   */
  updateQuality(socketId: string, latency: number, packetsLost: number = 0): void {
    const quality = this.connectionQuality.get(socketId);
    if (quality) {
      quality.latency = latency;
      quality.packetsLost += packetsLost;
      quality.lastUpdate = Date.now();
    }
  }

  /**
   * Get connection quality
   */
  getQuality(socketId: string): ConnectionQuality | undefined {
    return this.connectionQuality.get(socketId);
  }
}

const connectionManager = new TerminalConnectionManager();

// ============================================================================
// WebSocket Event Handlers
// ============================================================================

export function createUnifiedTerminalHandlers(io: SocketServer) {
  /**
   * Handle terminal connection
   */
  function handleTerminalConnect(socket: Socket): void {
    logger.info(LogCategory.TERMINAL, `Terminal client connected: ${socket.id}`);

    // Send connection confirmation
    socket.emit('terminal:status', {
      connected: true,
      timestamp: new Date().toISOString(),
      clientId: socket.id
    });

    // Setup heartbeat for connection quality monitoring
    const heartbeatInterval = setInterval(() => {
      const startTime = Date.now();
      socket.emit('terminal:heartbeat', { timestamp: startTime });
    }, 5000);

    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
    });
  }

  /**
   * Handle terminal disconnection
   */
  function handleTerminalDisconnect(socket: Socket): void {
    logger.info(LogCategory.TERMINAL, `Terminal client disconnected: ${socket.id}`);

    // Clean up connection tracking
    connectionManager.leave(socket);
  }

  /**
   * Handle session join
   */
  async function handleTerminalJoinSession(
    socket: Socket,
    payload: TerminalJoinPayload
  ): Promise<void> {
    const { sessionId, farmId } = payload;

    logger.info(LogCategory.TERMINAL,
      `Join request: socket=${socket.id}, session=${sessionId}, farm=${farmId}`);

    try {
      // Normalize session ID
      const normalizedSession = normalizeSessionId(sessionId, farmId);

      // Join socket.io rooms
      const farmRoom = `farm:${farmId}`;
      const sessionRoom = `terminal:${normalizedSession}`;

      socket.join(farmRoom);
      socket.join(sessionRoom);

      // Register connection
      connectionManager.join(socket, normalizedSession, farmId);

      // Get room sizes for logging
      const farmRoomSize = io.sockets.adapter.rooms.get(farmRoom)?.size || 0;
      const sessionRoomSize = io.sockets.adapter.rooms.get(sessionRoom)?.size || 0;

      // Send confirmation
      socket.emit('terminal:joined', {
        success: true,
        sessionId: normalizedSession,
        farmId,
        rooms: [farmRoom, sessionRoom],
        timestamp: new Date().toISOString()
      });

      logger.info(LogCategory.TERMINAL,
        `Socket ${socket.id} successfully joined session ${normalizedSession}. Rooms: ${farmRoom} (${farmRoomSize} clients), ${sessionRoom} (${sessionRoomSize} clients)`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Failed to join session: ${error}`);

      socket.emit('terminal:error', {
        code: 'JOIN_FAILED',
        message: 'Failed to join terminal session',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle session leave
   */
  function handleTerminalLeaveSession(
    socket: Socket,
    payload: { sessionId: string }
  ): void {
    const { sessionId } = payload;

    logger.info(LogCategory.TERMINAL,
      `Leave request: socket=${socket.id}, session=${sessionId}`);

    // Leave rooms
    socket.leave(`terminal:${sessionId}`);

    const farmId = connectionManager.getFarmId(socket.id);
    if (farmId) {
      socket.leave(`farm:${farmId}`);
    }

    // Unregister connection
    connectionManager.leave(socket, sessionId);

    // Send confirmation
    socket.emit('terminal:left', {
      success: true,
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle heartbeat pong (for connection quality)
   */
  function handleHeartbeatPong(
    socket: Socket,
    payload: { timestamp: number }
  ): void {
    const latency = Date.now() - payload.timestamp;
    connectionManager.updateQuality(socket.id, latency);

    // Send quality update if latency is high
    if (latency > 100) {
      socket.emit('terminal:quality', {
        status: latency > 500 ? 'poor' : 'good',
        latency,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle request for terminal state (cached output)
   */
  async function handleRequestState(
    socket: Socket,
    payload: { sessionId: string; farmId: string; agentId?: number }
  ): Promise<void> {
    const { sessionId, farmId, agentId } = payload;

    logger.debug(LogCategory.TERMINAL,
      `State request: session=${sessionId}, agent=${agentId}`);

    // For now, just acknowledge
    // In future, can send cached output here
    socket.emit('terminal:state', {
      sessionId,
      farmId,
      agentId,
      hasCache: false,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================================================
  // Setup Event Listeners
  // ============================================================================

  io.on('connection', (socket) => {
    handleTerminalConnect(socket);

    socket.on('terminal:join_session', (data) => {
      handleTerminalJoinSession(socket, data);
    });

    socket.on('terminal:leave_session', (data) => {
      handleTerminalLeaveSession(socket, data);
    });

    socket.on('terminal:heartbeat_pong', (data) => {
      handleHeartbeatPong(socket, data);
    });

    socket.on('terminal:request_state', (data) => {
      handleRequestState(socket, data);
    });

    socket.on('disconnect', () => {
      handleTerminalDisconnect(socket);
    });
  });

  // ============================================================================
  // Output Streaming Integration
  // ============================================================================

  /**
   * Setup output streaming from UnifiedTerminalStreamService
   */
  unifiedTerminalStreamService.on('output', (data: {
    farmId: string;
    agentId: string;
    agentIndex: number;
    content: string;
  }) => {
    const { farmId, agentId, agentIndex, content } = data;

    const farmRoom = `farm:${farmId}`;

    // Log broadcast attempt with room members count
    const roomSize = io.sockets.adapter.rooms.get(farmRoom)?.size || 0;
    logger.info(LogCategory.TERMINAL,
      `Broadcasting terminal output to room ${farmRoom} (${roomSize} clients): agent=${agentIndex}, bytes=${content.length}`);

    // Stream immediately to farm room (zero delay)
    io.to(farmRoom).emit('terminal:output', {
      farmId,
      agentId,
      agentIndex,
      content,
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Periodically broadcast connection stats
   */
  setInterval(() => {
    const sessions = connectionManager.getSessions();

    for (const sessionId of sessions) {
      const connectionCount = connectionManager.getConnectionCount(sessionId);

      io.to(`terminal:${sessionId}`).emit('terminal:stats', {
        sessionId,
        connections: connectionCount,
        timestamp: new Date().toISOString()
      });
    }
  }, 30000); // Every 30 seconds

  return {
    handleTerminalConnect,
    handleTerminalDisconnect,
    handleTerminalJoinSession,
    handleTerminalLeaveSession,
    connectionManager
  };
}

// ============================================================================
// Utilities
// ============================================================================

function normalizeSessionId(sessionId: string, farmId: string): string {
  // If sessionId is already properly formatted, use it
  if (sessionId.startsWith('farm-') || sessionId.startsWith('quick-')) {
    return sessionId;
  }

  // Extract short farm ID (first 8 chars)
  const shortFarmId = farmId.includes('-') ? farmId.substring(0, 8) : farmId;

  return `farm-${shortFarmId}`;
}

// ============================================================================
// Exports
// ============================================================================

export const TERMINAL_EVENTS = {
  // Client events
  CONNECT: 'terminal:connect',
  DISCONNECT: 'terminal:disconnect',
  JOIN_SESSION: 'terminal:join_session',
  LEAVE_SESSION: 'terminal:leave_session',
  REQUEST_STATE: 'terminal:request_state',
  HEARTBEAT_PONG: 'terminal:heartbeat_pong',
  SEND_COMMAND: 'terminal:send_command',

  // Server events
  STATUS: 'terminal:status',
  JOINED: 'terminal:joined',
  LEFT: 'terminal:left',
  OUTPUT: 'terminal:output',
  STATE: 'terminal:state',
  ERROR: 'terminal:error',
  QUALITY: 'terminal:quality',
  STATS: 'terminal:stats',
  HEARTBEAT: 'terminal:heartbeat'
} as const;

export type TerminalEventType = typeof TERMINAL_EVENTS[keyof typeof TERMINAL_EVENTS];
