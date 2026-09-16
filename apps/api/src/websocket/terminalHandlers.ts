import { Server as SocketServer, Socket } from 'socket.io';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { terminalService } from '../services/unified/terminalService';
import { terminalFileWatcherService } from '../services/terminalFileWatcherService';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

// Define TerminalEvent type locally
interface TerminalEvent {
  type: 'output' | 'command' | 'status' | 'session' | 'agent_connected' | 'agent_disconnected';
  sessionId: string;
  agentId?: number;
  data?: any;
  timestamp: Date;
}

// Create terminalOutputWatcher facade
const terminalOutputWatcher = {
  watch: (sessionName: string) => {}, // Stub method
  stopWatching: (sessionName: string) => {}, // Stub method
  isWatching: (sessionName: string) => false,
  setWebSocketServer: (io: SocketServer) => {},
  startWatching: async (sessionName: string, farmId?: string, agentCount?: number) => {
    // Delegate to file watcher instead
    if (farmId) {
      await terminalFileWatcherService.watchFarm(farmId, sessionName);
    }
  }
};
import TerminalStreamFix from './terminalStreamFix';
import TerminalGlobalFix from './terminalGlobalFix';
import { terminalRoomManager } from './terminalRoomManager';
import { logThrottling } from '../utils/logThrottling';

interface TerminalWebSocketHandlers {
  handleTerminalConnect: (socket: Socket) => void;
  handleTerminalDisconnect: (socket: Socket) => void;
  handleTerminalJoinSession: (socket: Socket, data: { sessionId: string; farmId?: string }) => void;
  handleTerminalLeaveSession: (socket: Socket, data: { sessionId: string }) => void;
  handleTerminalHealthPong: (socket: Socket, data: { sessionName: string; agentIndex: number }) => void;
  handleTerminalViewSwitch: (socket: Socket, data: { farmId: string; viewType: 'grid' | 'stacked' | 'single'; selectedAgent?: number }) => void;
  broadcastTerminalEvent: (io: SocketServer, event: TerminalEvent) => void;
  startOutputMonitoring: (sessionId: string, agentCount: number) => void;
  stopOutputMonitoring: (sessionId: string) => void;
}

// Store for active monitoring processes with bounded size
const MAX_MONITORING_PROCESSES = 100;
const monitoringProcesses = new Map<string, NodeJS.Timeout[]>();
const sessionRooms = new Map<string, Set<string>>(); // sessionId -> Set of socketIds

// Constants for cache configuration
const CACHE_TTL = 30000; // 30 seconds cache TTL

// LRU Cache for session name lookups to prevent memory leaks
class SessionNameCache {
  private cache = new Map<string, { name: string; windowTarget: string; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttl: number;
  
  constructor(maxSize = 500, ttl = CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  get(key: string): { name: string; windowTarget: string; timestamp: number } | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }
  
  set(key: string, value: { name: string; windowTarget: string; timestamp: number }): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
  }
}

const sessionNameCache = new SessionNameCache();

// Message batching for WebSocket broadcasts
interface BatchedMessage {
  event: string;
  data: any;
  rooms: string[];
  timestamp: number;
}

class MessageBatcher {
  private batches = new Map<string, BatchedMessage[]>();
  private readonly batchSize = 5; // Reduced from 10 for faster delivery
  private readonly batchTimeout = 50; // Reduced from 100ms for better perceived performance
  private timeouts = new Map<string, NodeJS.Timeout>();
  private retryTimeouts = new Map<string, NodeJS.Timeout>(); // Track retry timeouts to prevent leaks
  private retryCounts = new Map<string, number>(); // Track retry attempts per batch
  private readonly maxRetries = 10; // Max retry attempts before dropping batch
  private readonly baseRetryDelay = 100; // Initial retry delay in ms

  addMessage(event: string, data: any, rooms: string[]): void {
    const batchKey = `${event}:${rooms.join(',')}`;
    
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }
    
    const batch = this.batches.get(batchKey)!;
    batch.push({ event, data, rooms, timestamp: Date.now() });
    
    // Flush if batch is full
    if (batch.length >= this.batchSize) {
      this.flushBatch(batchKey);
      return;
    }
    
    // Set timeout for batch if not already set
    if (!this.timeouts.has(batchKey)) {
      const timeout = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.batchTimeout);
      this.timeouts.set(batchKey, timeout);
    }
  }
  
  private flushBatch(batchKey: string): void {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear timeout
    const timeout = this.timeouts.get(batchKey);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(batchKey);
    }

    // CRITICAL: Check if io is initialized before emitting
    // This prevents race condition where messages are batched before socket setup
    if (!io) {
      // Track retry attempts with exponential backoff
      const retryCount = (this.retryCounts.get(batchKey) || 0) + 1;
      this.retryCounts.set(batchKey, retryCount);

      if (retryCount > this.maxRetries) {
        // Max retries exceeded - log and drop batch to prevent memory leak
        console.error(`[MessageBatcher] Socket.io not initialized after ${this.maxRetries} attempts, dropping ${batch.length} messages for ${batchKey}`);
        this.batches.delete(batchKey);
        this.retryCounts.delete(batchKey);
        return;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc. (capped at 5s)
      const delay = Math.min(this.baseRetryDelay * Math.pow(2, retryCount - 1), 5000);
      console.warn(`[MessageBatcher] Socket.io not initialized, retry ${retryCount}/${this.maxRetries} in ${delay}ms`);

      // Clear existing retry timeout for this batch before scheduling new one
      const existingRetryTimeout = this.retryTimeouts.get(batchKey);
      if (existingRetryTimeout) {
        clearTimeout(existingRetryTimeout);
      }

      // Track retry timeout to prevent memory leaks during cleanup
      const retryTimeout = setTimeout(() => {
        this.retryTimeouts.delete(batchKey); // Clear on execution
        this.flushBatch(batchKey);
      }, delay);
      this.retryTimeouts.set(batchKey, retryTimeout);

      // Re-add batch to map for retry
      this.batches.set(batchKey, batch);
      return;
    }

    // Socket.io is initialized - clear retry counter on success
    this.retryCounts.delete(batchKey);

    // Emit batched messages
    if (batch.length === 1) {
      // Single message - emit normally
      const msg = batch[0];
      msg.rooms.forEach(room => {
        io.to(room).emit(msg.event, msg.data);
      });
    } else {
      // Multiple messages - emit as batch
      const rooms = batch[0].rooms;
      rooms.forEach(room => {
        io.to(room).emit('terminal:batch', {
          messages: batch.map(msg => ({ event: msg.event, data: msg.data })),
          count: batch.length,
          timestamp: Date.now()
        });
      });
    }

    // Clear batch
    this.batches.delete(batchKey);
  }
  
  cleanup(): void {
    // Clear all batch timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    // Clear all retry timeouts to prevent memory leaks
    for (const retryTimeout of this.retryTimeouts.values()) {
      clearTimeout(retryTimeout);
    }
    this.retryTimeouts.clear();

    this.batches.clear();
    this.retryCounts.clear();
  }
}

const messageBatcher = new MessageBatcher();
let io: SocketServer; // Store reference for batcher

// Using the imported terminalOutputCache from services
// The service provides proper caching with setClientCount method

// Create a simple mock for terminalOutputCache if not available
const terminalOutputCache = {
  // In-memory cache for terminal outputs (session -> agent -> outputs)
  cache: new Map<string, Map<number, { output: string; lines: string[] }[]>>(),

  getCachedOutput: (sessionName: string) => {
    const sessionCache = terminalOutputCache.cache.get(sessionName);
    if (!sessionCache) return [];

    const result: Array<{ agentId: number; outputs: any[] }> = [];
    for (const [agentId, outputs] of sessionCache) {
      result.push({ agentId, outputs });
    }
    return result;
  },

  addOutput: (sessionName: string, agentId: number, output: string, lines: string[]) => {
    // Get or create session cache
    if (!terminalOutputCache.cache.has(sessionName)) {
      terminalOutputCache.cache.set(sessionName, new Map());
    }

    const sessionCache = terminalOutputCache.cache.get(sessionName)!;

    // Get or create agent outputs array
    if (!sessionCache.has(agentId)) {
      sessionCache.set(agentId, []);
    }

    const agentOutputs = sessionCache.get(agentId)!;

    // Add new output (keep last 100 entries per agent)
    agentOutputs.push({ output, lines });
    if (agentOutputs.length > 100) {
      agentOutputs.shift();
    }
  },

  setClientCount: (sessionName: string, count: number) => {
    // No-op for now - could be used for cache eviction strategy
  },

  clear: (sessionName: string) => {
    terminalOutputCache.cache.delete(sessionName);
  }
};

// Helper function to detect window target (XenoSync uses 'agents', standard uses '0')
const detectWindowTarget = async (sessionName: string): Promise<string> => {
  try {
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux list-windows -t "${sessionName}" -F "#{window_name}" 2>/dev/null || echo ""`);
    const windows = stdout.trim().split('\n').filter(Boolean);
    
    // XenoSync uses 'agents' window, standard orchestrator uses '0' or default
    return windows.includes('agents') ? 'agents' : '0';
  } catch (error) {
    console.warn(`[TerminalHandlers] Could not detect window target for ${sessionName}, defaulting to '0':`, (error as any)?.message);
    return '0';
  }
};

// Enhanced session name finder with caching and XenoSync support
const findActualSessionName = async (requestedSessionName: string, farmId?: string): Promise<{ sessionName: string | null; windowTarget: string }> => {
  const cacheKey = `${requestedSessionName}:${farmId || ''}`;
  const cached = sessionNameCache.get(cacheKey);
  
  // Return cached result if still valid (includes windowTarget)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { sessionName: cached.name, windowTarget: cached.windowTarget };
  }
  
  try {
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""`);
    const sessions = stdout.trim().split('\n').filter(Boolean);
    
    let foundSession = null;
    
    // First try exact match
    if (sessions.includes(requestedSessionName)) {
      foundSession = requestedSessionName;
    } else if (farmId) {
      // Try various session name patterns
      const farmShortId = farmId.substring(0, 8);
      const variations = [
        `farm-${farmId}`,        // Full farm ID
        `farm-${farmShortId}`,   // Short farm ID
        `quick_${farmShortId}`,  // Quick task
        `goWild-${farmShortId}`, // GoWild mode
        requestedSessionName     // Fallback
      ];
      
      for (const variation of variations) {
        if (sessions.includes(variation)) {
          foundSession = variation;
          console.log(`[TerminalHandlers] Found actual session: ${variation} (requested: ${requestedSessionName})`);
          break;
        }
      }
    }
    
    if (foundSession) {
      // Detect window target and cache both together
      const windowTarget = await detectWindowTarget(foundSession);
      sessionNameCache.set(cacheKey, { name: foundSession, windowTarget, timestamp: Date.now() });
      return { sessionName: foundSession, windowTarget };
    }
    
    console.warn(`[TerminalHandlers] No session found for: ${requestedSessionName} (farmId: ${farmId})`);
    return { sessionName: null, windowTarget: '0' };
  } catch (error) {
    console.error('[TerminalHandlers] Error finding actual session name:', error);
    return { sessionName: null, windowTarget: '0' };
  }
};

// Helper function to clean up orphaned processes
const cleanupOrphanedProcesses = () => {
  if (monitoringProcesses.size > MAX_MONITORING_PROCESSES) {
    const sessionsToCleanup: string[] = [];
    
    // Find sessions that no longer have active rooms
    for (const sessionId of monitoringProcesses.keys()) {
      if (!sessionRooms.has(sessionId) || sessionRooms.get(sessionId)!.size === 0) {
        sessionsToCleanup.push(sessionId);
      }
    }
    
    // Clean up orphaned processes
    sessionsToCleanup.forEach(sessionId => {
      const intervals = monitoringProcesses.get(sessionId);
      if (intervals) {
        intervals.forEach(interval => clearInterval(interval));
        monitoringProcesses.delete(sessionId);
      }
    });
    
    console.log(`[TerminalHandlers] Cleaned up ${sessionsToCleanup.length} orphaned monitoring processes`);
  }
};

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  cleanupOrphanedProcesses();
  
  // Clean up expired cache entries
  if (sessionNameCache.size > 100) {
    console.log(`[TerminalHandlers] Cache cleanup: ${sessionNameCache.size} entries`);
  }
}, 60000); // Every minute

export const createTerminalWebSocketHandlers = (ioInstance: SocketServer): TerminalWebSocketHandlers => {
  io = ioInstance; // Store reference for message batcher
  
  const handleTerminalHealthPong = (socket: Socket, data: { sessionName: string; agentIndex: number }) => {
    const { sessionName, agentIndex } = data;
    console.log(`[TerminalHandlers] Health pong received from ${socket.id} for ${sessionName}:${agentIndex}`);

    // Send acknowledgment
    socket.emit('terminal:health-ack', {
      sessionName,
      agentIndex,
      timestamp: new Date()
    });
  };
  
  const handleTerminalViewSwitch = async (socket: Socket, data: { farmId: string; viewType: 'grid' | 'stacked' | 'single'; selectedAgent?: number }) => {
    const { farmId, viewType, selectedAgent } = data;
    console.log(`[TerminalHandlers] View switch requested: ${viewType} for farm ${farmId}`);

    // Acknowledge the switch
    socket.emit('terminal:view-switch-ack', {
      farmId,
      viewType,
      selectedAgent,
      timestamp: new Date()
    });
  };
  
  const handleTerminalConnect = (socket: Socket) => {
    console.log(`Terminal client connected: ${socket.id}`);
    
    // Send current terminal status
    socket.emit('terminal:status', {
      connected: true,
      timestamp: new Date(),
      clientId: socket.id
    });
    
    // Register health check handlers
    socket.on('terminal:health-pong', (data) => {
      handleTerminalHealthPong(socket, data);
    });
    
    socket.on('terminal:view-switch', (data) => {
      handleTerminalViewSwitch(socket, data);
    });
  };

  const handleTerminalDisconnect = (socket: Socket) => {
    console.log(`Terminal client disconnected: ${socket.id}`);
    
    // Unregister from global fix
    TerminalGlobalFix.unregisterClient(socket.id);
    
    // Clean up room manager
    terminalRoomManager.handleDisconnect(socket.id);
    
    // Remove socket from all session rooms with proper cleanup
    const roomsToCleanup: string[] = [];
    sessionRooms.forEach((sockets, sessionId) => {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          // Stop monitoring if no clients are watching
          stopOutputMonitoring(sessionId);
          roomsToCleanup.push(sessionId);
        }
      }
    });
    
    // Clean up empty session rooms to prevent memory leaks
    roomsToCleanup.forEach(sessionId => {
      sessionRooms.delete(sessionId);
    });
    
    // Clean up any monitoring processes that might be orphaned
    cleanupOrphanedProcesses();
  };

  const handleTerminalJoinSession = async (socket: Socket, data: { sessionId: string; farmId?: string }) => {
    const { sessionId, farmId } = data;
    console.log(`[TerminalHandlers] JOIN SESSION: ${socket.id} joining ${sessionId} (farmId: ${farmId})`);
    
    // CRITICAL FIX: Consistent session ID handling for ALL modes
    let actualSessionId = sessionId;
    let shortId = sessionId;
    
    // All modes (Quick Task, Farm, GoWild) now use 'farm-' prefix consistently
    // Handle full farm IDs from frontend (e.g., 18631134-0de1-4938-9d4c-7b21c65bd198)
    if (farmId && farmId.includes('-')) {
      // For UUID format, take the first 8 characters
      shortId = farmId.substring(0, 8);
      actualSessionId = `farm-${shortId}`;
      console.log(`[TerminalHandlers] Extracted short ID ${shortId} from farm ID ${farmId}`);
    } else if (sessionId.includes('-') && sessionId.length > 20) {
      // Handle session IDs that are full UUIDs
      const parts = sessionId.split('-');
      if (parts.length > 1 && parts[0].startsWith('farm')) {
        // Extract everything after 'farm-' prefix and take first 8 chars
        const idPart = sessionId.replace(/^farm-/, '');
        shortId = idPart.substring(0, 8);
        actualSessionId = `farm-${shortId}`;
      } else if (parts.length > 1) {
        shortId = parts[1]?.substring(0, 8) || parts[0]?.substring(0, 8);
        actualSessionId = `farm-${shortId}`;
        console.log(`[TerminalHandlers] Extracted short ID ${shortId} from session ${sessionId}`);
      }
    }
    
    // Join only necessary rooms - avoid duplicates
    const roomsToJoin = new Set<string>();
    
    // Primary terminal room for the actual session
    roomsToJoin.add(`terminal:${actualSessionId}`);
    
    // Add the short ID room for output watcher compatibility
    roomsToJoin.add(`farm-${shortId}`);
    
    // Join unique rooms only
    roomsToJoin.forEach(room => {
      socket.join(room);
    });
    
    console.log(`[TerminalHandlers] Socket ${socket.id} joined ${roomsToJoin.size} rooms for session ${actualSessionId}`);
    
    // Join farmId room if provided
    if (farmId) {
      socket.join(`harvest:${farmId}`);
      socket.join(`farm:${farmId}`);
      console.log(`[TerminalHandlers] Socket ${socket.id} joined farm rooms: ${farmId}`);
    }
    
    // Get list of all joined rooms for confirmation
    const joinedRooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    console.log(`[TerminalHandlers] Socket ${socket.id} is now in rooms:`, joinedRooms);
    
    // Use the unified room manager for additional features
    terminalRoomManager.joinSession(socket, sessionId, farmId);
    
    // Immediately send confirmation that join was successful
    socket.emit('terminal:joined', {
      sessionId,
      farmId,
      joinedRooms,
      timestamp: new Date(),
      success: true,
      message: `Successfully joined ${joinedRooms.length} rooms`
    });
    
    // CRITICAL FIX: Send any cached output immediately
    // Try multiple session ID variations to find cached output
    const sessionVariations = [
      sessionId,
      actualSessionId,
      `farm-${shortId}`,
      shortId
    ];
    
    let cachedOutputs: Array<{ agentId: number; outputs: any[] }> = [];
    for (const sessionVariant of sessionVariations) {
      const outputs = terminalOutputCache.getCachedOutput(sessionVariant);
      if (outputs.length > 0) {
        cachedOutputs = outputs;
        logThrottling.debug(`found-cached-${sessionVariant}`, `Found cached outputs using session variant: ${sessionVariant}`);
        break;
      }
    }
    
    if (cachedOutputs.length > 0) {
      logThrottling.debug(`deliver-cached-${actualSessionId}`, `Delivering ${cachedOutputs.length} cached outputs to new client`);
      
      for (const { agentId, outputs } of cachedOutputs) {
        for (const cachedOutput of outputs) {
          socket.emit('terminal:output', {
            sessionId: actualSessionId,
            agentId: cachedOutput.agentId,
            output: cachedOutput.output,
            lines: cachedOutput.lines,
            timestamp: cachedOutput.timestamp,
            cached: true
          });
        }
      }
      
      // DON'T clear the cache immediately - other clients may join later
      // The cache will be cleaned up by its TTL mechanism
      // Only log that we delivered cached messages
      console.log(`[TerminalHandlers] Delivered cached output to client ${socket.id}`);
    } else {
      logThrottling.debug(`no-cached-output-${actualSessionId}`, `No cached output found for session`);
    }
    
    // Update client count for this session
    const currentRoom = io.sockets.adapter.rooms.get(`terminal:${sessionId}`);
    const clientCount = currentRoom ? currentRoom.size : 0;
    terminalOutputCache.setClientCount(sessionId, clientCount);
    
    // Also register with global fix for redundancy
    const targetFarmId = farmId || sessionId.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/)?.[1];
    if (targetFarmId) {
      TerminalGlobalFix.registerClient(socket, targetFarmId);
    }
    
    // Also use the enhanced join handler from TerminalStreamFix for additional features
    TerminalStreamFix.handleJoinSession(socket, io, data);
    
    logThrottling.debug(`terminal-join-success-${sessionId}`, `Socket ${socket.id} fully configured for session ${sessionId}`);
    
    // Send a test message to verify room delivery - only in debug mode
    if (process.env.NODE_ENV === 'development') {
      io.to(`terminal:${sessionId}`).emit('terminal:test', {
        message: 'Room delivery test',
        timestamp: new Date()
      });
    }
    
    // CRITICAL FIX: Start file watcher for terminal output
    console.log(`[TerminalHandlers] Starting file watcher for farm ${farmId || sessionId}`);
    if (farmId) {
      terminalFileWatcherService.watchFarm(farmId, actualSessionId).catch(err => {
        console.error(`[TerminalHandlers] Failed to start file watcher:`, err);
      });
    }

    // Immediately capture and send existing terminal output
    setTimeout(async () => {
      const { sessionName } = await findActualSessionName(sessionId, farmId);
      if (sessionName) {
        logThrottling.debug(`capture-existing-${sessionName}`, `Capturing existing output for new client`);
        
        try {
          const output = await captureAgentOutput(sessionId, 0, farmId);
          if (output && output.length > 0) {
            logThrottling.debug(`send-existing-${sessionId}`, `Sending ${output.length} lines of existing output to new client`);
            
            // Send directly to the specific socket as well as broadcasting
            socket.emit('terminal:output', {
              sessionId,
              sessionName,
              farmId,
              agentId: 0,
              lines: output,
              output: output.join('\n'),
              timestamp: new Date()
            });
            
            const event = {
              type: 'output' as const,
              sessionId,
              agentId: 0,
              data: {
                lines: output,
                timestamp: new Date()
              },
              timestamp: new Date()
            };
            
            broadcastTerminalEvent(io, event);
          }
        } catch (error) {
          logThrottling.error(`capture-existing-error-${sessionId}`, `Error capturing existing output: ${(error as any)?.message}`);
        }
      }
    }, 100); // Small delay to ensure socket is fully set up
  };

  const handleTerminalLeaveSession = (socket: Socket, data: { sessionId: string }) => {
    const { sessionId } = data;
    
    console.log(`Socket ${socket.id} leaving terminal session: ${sessionId}`);
    
    // Use room manager to leave session
    terminalRoomManager.leaveSession(socket, sessionId);
    
    // Remove from session tracking
    if (sessionRooms.has(sessionId)) {
      sessionRooms.get(sessionId)!.delete(socket.id);
      
      // Stop monitoring if no clients are watching
      if (sessionRooms.get(sessionId)!.size === 0) {
        stopOutputMonitoring(sessionId);
        sessionRooms.delete(sessionId);
      }
    }
    
    // Confirm leave
    socket.emit('terminal:left', {
      sessionId,
      timestamp: new Date()
    });
  };

  const broadcastTerminalEvent = (io: SocketServer, event: TerminalEvent) => {
    const room = `terminal:${event.sessionId}`;
    const agentRoom = `agent:${event.sessionId}:${event.agentId || 0}`;
    
    // CRITICAL: Normalize agentId to ensure it's always a number
    const normalizedAgentId = typeof event.agentId === 'string' 
      ? parseInt(event.agentId, 10) 
      : (event.agentId || 0);
    
    // Get room size
    const roomClients = io.sockets.adapter.rooms.get(room);
    const clientCount = roomClients ? roomClients.size : 0;
    
    // CRITICAL FIX: Reduce verbose logging to debug level
    if (clientCount === 0) {
      console.debug(`[TerminalHandlers] No clients in room ${room} for terminal output`);
    } else {
      console.debug(`[TerminalHandlers] Broadcasting to ${clientCount} clients in room ${room}`);
    }
    
    // Enhanced event data with all necessary fields
    const baseEventData = {
      type: event.type,
      sessionId: event.sessionId,
      sessionName: event.sessionId, // Include both formats
      agentId: normalizedAgentId,    // Always numeric
      agentIndex: normalizedAgentId, // Some clients use agentIndex
      timestamp: event.timestamp
    };
    
    switch (event.type) {
      case 'output':
        const outputData = {
          ...baseEventData,
          data: event.data,
          lines: event.data?.lines || [],
          output: event.data?.lines?.join('\n') || '', // String format
        };
        
        // CRITICAL FIX: Always cache messages for late-joining clients
        // Cache the output regardless of connected clients
        terminalOutputCache.addOutput(
          event.sessionId, 
          normalizedAgentId, 
          outputData.output, 
          outputData.lines
        );
        
        // Build rooms list for broadcast
        const rooms = [];
        if (clientCount > 0) {
          rooms.push(room);
        }
        
        // Add agent-specific room
        const agentSpecificRoom = `agent:${event.sessionId}:${normalizedAgentId}`;
        const agentClients = io.sockets.adapter.rooms.get(agentSpecificRoom);
        if (agentClients && agentClients.size > 0) {
          rooms.push(agentSpecificRoom);
        }
        
        // Add farm-based room if available and has clients
        const farmMatch = event.sessionId.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/);
        if (farmMatch) {
          const farmId = farmMatch[1];
          const harvestRoom = `harvest:${farmId}`;
          const harvestClients = io.sockets.adapter.rooms.get(harvestRoom);
          if (harvestClients && harvestClients.size > 0) {
            rooms.push(harvestRoom);
          }
        }
        
        if (rooms.length > 0) {
          // Batch the message to reduce broadcast storms
          messageBatcher.addMessage('terminal:output', outputData, rooms);
          
          // Update client count in cache
          terminalOutputCache.setClientCount(event.sessionId, rooms.length);
          
          logThrottling.debug(`broadcast-to-clients-${event.sessionId}`, `Broadcasting to ${rooms.length} rooms, cached for late joiners`);
        } else {
          logThrottling.debug(`no-clients-cached-${event.sessionId}`, `No clients connected - cached terminal output for later delivery`);
        }
        
        break;
        
      case 'command':
        io.to(room).emit('terminal:command', baseEventData);
        break;
        
      case 'status':
        io.to(room).emit('terminal:agent_status', baseEventData);
        break;
        
      case 'session':
        // Broadcast session events globally with rate limiting
        io.emit('terminal:session', baseEventData);
        break;
        
      case 'agent_connected':
      case 'agent_disconnected':
        io.to(room).emit('terminal:agent_status', {
          ...baseEventData,
          status: event.type === 'agent_connected' ? 'connected' : 'disconnected'
        });
        break;
        
      default:
        // Fallback for unknown event types
        io.to(room).emit('terminal:event', event);
    }
  };

  const startOutputMonitoring = async (sessionId: string, agentCount: number, farmId?: string) => {
    console.log(`[TerminalHandlers] Starting output monitoring for session ${sessionId} with ${agentCount} agents`);
    
    // Find the actual session name and window target
    const { sessionName, windowTarget } = await findActualSessionName(sessionId, farmId);
    const sessionToMonitor = sessionName || sessionId;
    
    console.log(`[TerminalHandlers] Will monitor session: ${sessionToMonitor} (window: ${windowTarget}, requested: ${sessionId})`);
    
    // Use the improved terminal output watcher instead of polling
    if (!terminalOutputWatcher.isWatching(sessionToMonitor)) {
      // Set the WebSocket server if not already set
      terminalOutputWatcher.setWebSocketServer(io);
      
      console.log(`[TerminalHandlers] Starting terminal output watcher for ${sessionToMonitor}`);
      
      // Start watching with efficient change detection
      terminalOutputWatcher.startWatching(sessionToMonitor, undefined, agentCount)
        .then(() => {
          console.log(`Terminal output watcher started for session ${sessionId}`);
        })
        .catch(error => {
          console.error(`Failed to start terminal output watcher for ${sessionId}:`, error);
          
          // Fallback to polling approach if watcher fails
          const intervals: NodeJS.Timeout[] = [];
          
          for (let agentId = 0; agentId < agentCount; agentId++) {
            const interval = setInterval(async () => {
              try {
                const output = await captureAgentOutput(sessionId, agentId, farmId);
                
                if (output && output.length > 0) {
                  const event: TerminalEvent = {
                    type: 'output',
                    sessionId,
                    agentId,
                    data: {
                      lines: output,
                      timestamp: new Date()
                    },
                    timestamp: new Date()
                  };
                  
                  broadcastTerminalEvent(io, event);
                }
              } catch (error) {
                console.error(`Error monitoring output for ${sessionId}:${agentId}:`, error);
              }
            }, 2000);
            
            intervals.push(interval);
          }
          
          monitoringProcesses.set(sessionId, intervals);
        });
    }
  };

  const stopOutputMonitoring = async (sessionId: string, farmId?: string) => {
    console.log(`[TerminalHandlers] Stopping output monitoring for session ${sessionId}`);

    // Stop the file watcher
    if (farmId) {
      terminalFileWatcherService.stopWatching(farmId);
    } else {
      // Try to extract farmId from sessionId
      const farmMatch = sessionId.match(/(?:farm-|quick_|goWild-)([a-f0-9-]+)/);
      if (farmMatch && farmMatch[1]) {
        terminalFileWatcherService.stopWatching(farmMatch[1]);
      }
    }
    
    // Also clear any fallback polling intervals
    const intervals = monitoringProcesses.get(sessionId);
    if (intervals) {
      intervals.forEach(interval => clearInterval(interval));
      monitoringProcesses.delete(sessionId);
    }
  };

  // FIX: Child process timeout constant to prevent hanging
  const CHILD_PROCESS_TIMEOUT = 10000; // 10 seconds max for tmux commands

  // Enhanced helper function to get agent count from tmux session
  // FIX: Added timeout protection to prevent hanging promises
  const getSessionAgentCount = async (sessionId: string): Promise<number> => {
    const { sessionName, windowTarget } = await findActualSessionName(sessionId);
    const actualSession = sessionName || sessionId;

    return new Promise((resolve) => {
      let resolved = false;
      let output = '';

      const countPanes = spawn('tmux', [
        'list-panes',
        '-t', `${actualSession}:${windowTarget}`,
        '-F', '#{pane_index}'
      ], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });

      // FIX: Add timeout to kill hanging process
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[TerminalHandlers] Timeout counting panes for ${actualSession}:${windowTarget}`);
          countPanes.kill('SIGKILL');
          resolve(0);
        }
      }, CHILD_PROCESS_TIMEOUT);

      countPanes.stdout?.on('data', (data: Buffer) => {
        // FIX: Limit output buffer size to prevent memory issues
        if (output.length < 10000) {
          output += data.toString();
        }
      });

      countPanes.on('exit', (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (code === 0) {
          const count = output.trim().split('\n').filter(Boolean).length;
          console.log(`[TerminalHandlers] Found ${count} panes in session ${actualSession}:${windowTarget}`);
          resolve(count);
        } else {
          console.warn(`[TerminalHandlers] Failed to count panes for ${actualSession}:${windowTarget} (exit code: ${code})`);
          resolve(0);
        }
      });

      countPanes.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        console.error(`[TerminalHandlers] Error counting panes for ${actualSession}:`, (error as any)?.message);
        resolve(0);
      });
    });
  };

  // Enhanced helper function to capture agent output with proper window targeting
  // FIX: Added timeout protection to prevent hanging promises
  const captureAgentOutput = async (sessionId: string, agentId: number, farmId?: string): Promise<string[]> => {
    const { sessionName, windowTarget } = await findActualSessionName(sessionId, farmId);
    const actualSession = sessionName || sessionId;

    return new Promise((resolve) => {
      let resolved = false;
      let output = '';
      const paneTarget = `${actualSession}:${windowTarget}.${agentId}`;

      const capture = spawn('tmux', [
        'capture-pane',
        '-t', paneTarget,
        '-p',
        '-S', '-10' // Get last 10 lines
      ], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });

      // FIX: Add timeout to kill hanging process
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[TerminalHandlers] Timeout capturing output from ${paneTarget}`);
          capture.kill('SIGKILL');
          resolve([]);
        }
      }, CHILD_PROCESS_TIMEOUT);

      capture.stdout?.on('data', (data: Buffer) => {
        // FIX: Limit output buffer size to prevent memory issues
        if (output.length < 50000) {
          output += data.toString();
        }
      });

      capture.on('exit', (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (code === 0) {
          const lines = output.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            console.log(`[TerminalHandlers] Captured ${lines.length} lines from ${paneTarget}`);
          }
          resolve(lines);
        } else {
          console.warn(`[TerminalHandlers] Failed to capture output from ${paneTarget} (exit code: ${code})`);
          resolve([]);
        }
      });

      capture.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        console.error(`[TerminalHandlers] Error capturing output from ${paneTarget}:`, (error as any)?.message);
        resolve([]);
      });
    });
  };

  return {
    handleTerminalConnect,
    handleTerminalDisconnect,
    handleTerminalJoinSession,
    handleTerminalLeaveSession,
    handleTerminalHealthPong,
    handleTerminalViewSwitch,
    broadcastTerminalEvent,
    startOutputMonitoring,
    stopOutputMonitoring
  };
};

// Export terminal event types for consistent usage
export const TERMINAL_EVENTS = {
  // Client events
  CONNECT: 'terminal:connect',
  DISCONNECT: 'terminal:disconnect',
  JOIN_SESSION: 'terminal:join_session',
  LEAVE_SESSION: 'terminal:leave_session',
  SEND_COMMAND: 'terminal:send_command',
  
  // Server events
  STATUS: 'terminal:status',
  JOINED: 'terminal:joined',
  LEFT: 'terminal:left',
  EVENT: 'terminal:event',
  OUTPUT: 'terminal:output',
  COMMAND: 'terminal:command',
  AGENT_STATUS: 'terminal:agent_status',
  SESSION: 'terminal:session',
  ERROR: 'terminal:error',
  
  // Connection status events
  CONNECTING: 'terminal:connecting',
  CONNECTED: 'terminal:connected',
  RETRY: 'terminal:retry',
  FAILED: 'terminal:failed',
  VERIFIED: 'terminal:verified'
} as const;

export type TerminalEventType = typeof TERMINAL_EVENTS[keyof typeof TERMINAL_EVENTS];
