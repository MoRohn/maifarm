import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { harvestService } from '../services/unified/harvestService';
import { coordinationService } from '../services/coordinationService';
import { spawn } from 'child_process';
import { unifiedTerminalStreamService } from '../services/UnifiedTerminalStreamService';
import { getFarmSessionName, getTmuxPaneRef, listTmuxPanes } from '../utils/tmuxHelpers';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

interface HarvestUpdate {
  farmId: string;
  harvestId: string;
  type: 'agent_update' | 'data_collected' | 'progress' | 'completed' | 'error' | 'terminal_output';
  data: any;
  timestamp: Date;
}

interface AgentHarvestData {
  agentId: string;
  sessionName: string;
  paneId: number;
  status: 'active' | 'idle' | 'completed' | 'error';
  output: string[];
  metrics?: {
    linesProcessed: number;
    tasksCompleted: number;
    errors: number;
  };
}

interface TerminalOutput {
  sessionName: string;
  agentId: number | string;
  lines: string[];
  timestamp: number;
  agentIndex?: number;
}

class HarvestWebSocketHandler {
  private io: SocketServer;
  private activeHarvests: Map<string, Set<string>> = new Map(); // farmId -> Set of client IDs
  private terminalPollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private terminalStreamHandlers: Map<string, (payload: { farmId: string; agentId: string; content: string }) => void> = new Map();
  private coordinationWatcher: NodeJS.Timeout | null = null;
  private sessionRecoveryQueue: Map<string, { farmId: string, attempts: number }> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private eventQueue: Map<string, Array<any>> = new Map(); // Queue events during disconnections
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly SESSION_RECOVERY_DELAY = 2000; // 2 seconds
  private readonly MAX_EVENT_QUEUE_SIZE = 100; // MEMORY FIX: Limit event queue per client
  private readonly EVENT_QUEUE_CLEANUP_INTERVAL = 60000; // Clean stale queues every 60 seconds
  private eventQueueCleanupInterval: NodeJS.Timeout | null = null;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupHandlers();
    this.startCoordinationWatcher();
    this.startEventQueueCleanup();
  }

  /**
   * MEMORY FIX: Periodically clean up stale event queues
   * Prevents memory leaks from clients that never reconnect
   */
  private startEventQueueCleanup() {
    this.eventQueueCleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      // Clean up event queues for disconnected clients
      for (const [socketId, events] of this.eventQueue.entries()) {
        // If the socket is not connected, clean up its queue
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          this.eventQueue.delete(socketId);
          logger.debug(`[HarvestWebSocket] Cleaned up stale event queue for ${socketId}`);
        }
      }

      // Clean up session recovery queue for abandoned sessions
      for (const [socketId, recovery] of this.sessionRecoveryQueue.entries()) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket || recovery.attempts >= this.MAX_RECOVERY_ATTEMPTS) {
          this.sessionRecoveryQueue.delete(socketId);
          logger.debug(`[HarvestWebSocket] Cleaned up stale recovery queue for ${socketId}`);
        }
      }

      logger.debug(`[HarvestWebSocket] Event queue cleanup complete. Active queues: ${this.eventQueue.size}`);
    }, this.EVENT_QUEUE_CLEANUP_INTERVAL);
  }

  /**
   * MEMORY FIX: Add event to queue with size limit enforcement
   */
  private addToEventQueue(socketId: string, event: { type: string; data: any }) {
    let queue = this.eventQueue.get(socketId);
    if (!queue) {
      queue = [];
      this.eventQueue.set(socketId, queue);
    }

    // Enforce size limit - remove oldest events if at capacity
    if (queue.length >= this.MAX_EVENT_QUEUE_SIZE) {
      queue.shift(); // Remove oldest event
      logger.warn(`[HarvestWebSocket] Event queue full for ${socketId}, dropping oldest event`);
    }

    queue.push(event);
  }

  private setupHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Harvest WebSocket client connected: ${socket.id}`);

      // Join harvest room for a specific farm
      socket.on('harvest:join', async (data: { farmId: string }) => {
        try {
          const { farmId } = data;

          // Validate farmId
          if (!farmId || typeof farmId !== 'string') {
            socket.emit('harvest:error', {
              error: 'Invalid farm ID',
              code: 'INVALID_FARM_ID'
            });
            return;
          }

          socket.join(`harvest:${farmId}`);

          // Track active harvest connections
          if (!this.activeHarvests.has(farmId)) {
            this.activeHarvests.set(farmId, new Set());
          }
          this.activeHarvests.get(farmId)!.add(socket.id);

          logger.info(`Client ${socket.id} joined harvest room for farm ${farmId}`);

          // Check if we have queued events for this client
          if (this.eventQueue.has(socket.id)) {
            const queuedEvents = this.eventQueue.get(socket.id)!;
            logger.info(`Flushing ${queuedEvents.length} queued events for client ${socket.id}`);
            for (const event of queuedEvents) {
              socket.emit(event.type, event.data);
            }
            this.eventQueue.delete(socket.id);
          }

          // Send initial harvest data with recovery check
          await this.sendInitialHarvestDataWithRecovery(socket, farmId);

          // Ensure terminal stream updates are flowing for this farm
          this.subscribeToTerminalStream(farmId);

          // Start heartbeat for this connection
          this.startHeartbeat(socket, farmId);
        } catch (error) {
          logger.error(`Error in harvest:join handler for socket ${socket.id}:`, error);
          socket.emit('harvest:error', {
            error: 'Failed to join harvest room',
            code: 'JOIN_FAILED',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Leave harvest room
      socket.on('harvest:leave', (data: { farmId: string }) => {
        const { farmId } = data;
        socket.leave(`harvest:${farmId}`);
        
        // Remove from active harvests
        const clients = this.activeHarvests.get(farmId);
        if (clients) {
          clients.delete(socket.id);
          // Don't stop polling immediately - keep it running for a grace period
          if (clients.size === 0) {
            // Schedule polling stop after grace period
            setTimeout(() => {
              // Re-check if still no clients
              const currentClients = this.activeHarvests.get(farmId);
              if (!currentClients || currentClients.size === 0) {
                this.activeHarvests.delete(farmId);
                this.unsubscribeFromTerminalStream(farmId);
                this.stopTerminalPolling(farmId);
              }
            }, 10000); // 10 second grace period
          }
        }
        
        // Stop heartbeat
        this.stopHeartbeat(socket.id);
        
        logger.info(`Client ${socket.id} left harvest room for farm ${farmId}`);
      });

      // Request terminal output for specific agent
      socket.on('harvest:terminal:request', async (data: {
        sessionName: string;
        agentId: string;
        lines?: number
      }) => {
        try {
          // Validate input
          if (!data.sessionName || !data.agentId) {
            socket.emit('harvest:error', {
              error: 'Missing required parameters',
              code: 'INVALID_REQUEST'
            });
            return;
          }

          const output = await this.getTerminalOutput(
            data.sessionName,
            data.agentId,
            data.lines || 100
          );

          socket.emit('harvest:terminal:output', output);
        } catch (error) {
          logger.error(`Error in harvest:terminal:request for socket ${socket.id}:`, error);
          socket.emit('harvest:error', {
            error: 'Failed to fetch terminal output',
            code: 'TERMINAL_FETCH_FAILED',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Send command to agent terminal
      socket.on('harvest:terminal:command', async (data: {
        sessionName: string;
        agentId: string;
        command: string;
      }) => {
        try {
          // Validate input
          if (!data.sessionName || !data.agentId || !data.command) {
            socket.emit('harvest:error', {
              error: 'Missing required parameters',
              code: 'INVALID_REQUEST'
            });
            return;
          }

          await this.sendTerminalCommand(data.sessionName, data.agentId, data.command);

          // Broadcast command execution to all clients in the room
          const farmId = await this.getFarmIdFromSession(data.sessionName);
          if (farmId) {
            this.io.to(`harvest:${farmId}`).emit('harvest:terminal:command:sent', {
              sessionName: data.sessionName,
              agentId: data.agentId,
              command: data.command,
              timestamp: new Date()
            });
          }
        } catch (error) {
          logger.error(`Error in harvest:terminal:command for socket ${socket.id}:`, error);
          socket.emit('harvest:error', {
            error: 'Failed to send terminal command',
            code: 'TERMINAL_COMMAND_FAILED',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Start harvest manually
      socket.on('harvest:start', async (data: { farmId: string; farmName: string }) => {
        try {
          // Use 'system' as userId for WebSocket-initiated harvests
          const harvest = await harvestService.startHarvest(data.farmId, data.farmName, 'system');
          
          // Broadcast harvest started event
          this.broadcastHarvestUpdate({
            farmId: data.farmId,
            harvestId: harvest.id,
            type: 'agent_update',
            data: { status: 'started', harvest },
            timestamp: new Date()
          });
          
          socket.emit('harvest:started', { success: true, harvest });
        } catch (error) {
          logger.error('Failed to start harvest:', error);
          socket.emit('harvest:error', { 
            error: 'Failed to start harvest',
            details: (error as Error).message 
          });
        }
      });

      // Complete harvest manually
      socket.on('harvest:complete', async (data: { harvestId: string }) => {
        try {
          // Use 'system' as userId for WebSocket-initiated completions
          const harvest = await harvestService.completeHarvest(data.harvestId, 'system');

          if (!harvest) {
            socket.emit('harvest:error', {
              error: 'Harvest not found',
              details: `No harvest found with ID ${data.harvestId}`
            });
            return;
          }

          // Get farm ID from harvest
          const farmId = harvest.farmId;
          
          // Broadcast harvest completed event
          this.broadcastHarvestUpdate({
            farmId,
            harvestId: data.harvestId,
            type: 'completed',
            data: { harvest },
            timestamp: new Date()
          });
          
          socket.emit('harvest:completed', { success: true, harvest });
        } catch (error) {
          logger.error('Failed to complete harvest:', error);
          socket.emit('harvest:error', { 
            error: 'Failed to complete harvest',
            details: (error as Error).message 
          });
        }
      });

      // Handle keep-alive to prevent timeout
      socket.on('harvest:keepalive', (data: { 
        farmId?: string; 
        sessionName?: string;
        tabHidden?: boolean;
        timestamp: number 
      }) => {
        // Log keep-alive for debugging
        const status = data.tabHidden ? 'tab hidden' : 'active';
        logger.debug(`[HarvestWebSocket] Keep-alive from ${socket.id} (${status})`);
        
        // Send acknowledgment
        socket.emit('harvest:keepalive:ack', { 
          timestamp: Date.now(),
          received: data.timestamp 
        });
        
        // If tab is hidden, reduce polling frequency for this client
        if (data.tabHidden && data.farmId) {
          // Mark client as backgrounded (could be used for optimization)
          socket.data.isBackgrounded = true;
        } else if (socket.data.isBackgrounded) {
          // Tab is visible again
          socket.data.isBackgrounded = false;
          
          // Send fresh data when returning from background
          if (data.farmId) {
            this.sendInitialHarvestData(socket, data.farmId);
          }
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Harvest WebSocket client disconnected: ${socket.id}`);
        
        // Stop heartbeat
        this.stopHeartbeat(socket.id);
        
        // Mark session for recovery instead of immediate cleanup
        this.activeHarvests.forEach((clients, farmId) => {
          if (clients.has(socket.id)) {
            // Queue for recovery
            this.sessionRecoveryQueue.set(socket.id, { farmId, attempts: 0 });
            
            // Schedule recovery attempt
            setTimeout(() => {
              this.attemptSessionRecovery(socket.id, farmId);
            }, this.SESSION_RECOVERY_DELAY);
            
            clients.delete(socket.id);
            // Don't stop polling immediately - wait for recovery or timeout
            if (clients.size === 0) {
              setTimeout(() => {
                const currentClients = this.activeHarvests.get(farmId);
                if (!currentClients || currentClients.size === 0) {
                  this.activeHarvests.delete(farmId);
                  this.stopTerminalPolling(farmId);
                  logger.info(`[HarvestWebSocket] Stopped polling for farm ${farmId} after disconnect grace period`);
                }
              }, 30000); // 30 second grace period for reconnection
            }
          }
        });
      });
    });
  }

  private async sendInitialHarvestData(socket: Socket, farmId: string) {
    try {
      // Get active agents from coordination (passing farmId to filter)
      const agents = await coordinationService.getActiveAgents(farmId);

      // Get completed work
      const completed = await coordinationService.collectCompletedWork();

      // Get coordination status for the farm
      const coordinationStatus = await coordinationService.getCoordinationStatus(farmId);

      socket.emit('harvest:initial:data', {
        farmId,
        agents,
        completed,
        coordinationStatus,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to send initial harvest data:', error);
      socket.emit('harvest:error', {
        error: 'Failed to load initial data',
        details: (error as Error).message
      });
    }
  }
  
  private async sendInitialHarvestDataWithRecovery(socket: Socket, farmId: string) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await this.sendInitialHarvestData(socket, farmId);
        
        // Remove from recovery queue if successful
        this.sessionRecoveryQueue.delete(socket.id);
        return;
      } catch (error) {
        attempts++;
        logger.warn(`[HarvestWebSocket] Failed to send initial data, attempt ${attempts}/${maxAttempts}:`, error);
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        } else {
          logger.error(`[HarvestWebSocket] Failed to send initial data after ${maxAttempts} attempts`);
          socket.emit('harvest:error', {
            error: 'Failed to load initial data after multiple attempts',
            recoverable: true
          });
        }
      }
    }
  }
  
  private startHeartbeat(socket: Socket, farmId: string) {
    // Clear existing heartbeat if any
    this.stopHeartbeat(socket.id);
    
    const interval = setInterval(() => {
      socket.emit('harvest:heartbeat', {
        farmId,
        timestamp: Date.now(),
        status: 'alive'
      });
    }, this.HEARTBEAT_INTERVAL);
    
    this.heartbeatIntervals.set(socket.id, interval);
    logger.debug(`[HarvestWebSocket] Started heartbeat for client ${socket.id}`);
  }
  
  private stopHeartbeat(socketId: string) {
    const interval = this.heartbeatIntervals.get(socketId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(socketId);
      logger.debug(`[HarvestWebSocket] Stopped heartbeat for client ${socketId}`);
    }
  }
  
  private async attemptSessionRecovery(socketId: string, farmId: string) {
    const recovery = this.sessionRecoveryQueue.get(socketId);
    if (!recovery) return;
    
    recovery.attempts++;
    
    if (recovery.attempts <= this.MAX_RECOVERY_ATTEMPTS) {
      logger.info(`[HarvestWebSocket] Attempting recovery for client ${socketId}, attempt ${recovery.attempts}`);
      
      // Check if client reconnected
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        logger.info(`[HarvestWebSocket] Client ${socketId} reconnected, restoring session`);
        await this.sendInitialHarvestDataWithRecovery(socket, farmId);
        this.sessionRecoveryQueue.delete(socketId);
      } else {
        // Schedule next recovery attempt
        setTimeout(() => {
          this.attemptSessionRecovery(socketId, farmId);
        }, this.SESSION_RECOVERY_DELAY * recovery.attempts); // Exponential backoff
      }
    } else {
      logger.warn(`[HarvestWebSocket] Max recovery attempts reached for client ${socketId}`);
      this.sessionRecoveryQueue.delete(socketId);
    }
  }

  private subscribeToTerminalStream(farmId: string) {
    if (!this.terminalStreamHandlers.has(farmId)) {
      const handler = (payload: { farmId: string; agentId: string; content: string; sessionName?: string; agentIndex?: number }) => {
        if (payload.farmId !== farmId || !payload.content) {
          return;
        }

        const lines = payload.content
          .split(/\r?\n/)
          .filter(line => line.trim().length > 0);

        if (lines.length === 0) {
          return;
        }

        const sessionName = payload.sessionName
          ? payload.sessionName
          : getFarmSessionName(farmId);
        const agentIndex = typeof payload.agentIndex === 'number'
          ? payload.agentIndex
          : parseInt(String(payload.agentId).replace(/[^0-9]/g, ''), 10);
        const outputPayload: TerminalOutput = {
          sessionName,
          agentId: Number.isNaN(agentIndex) ? payload.agentId : agentIndex,
          agentIndex: Number.isNaN(agentIndex) ? undefined : agentIndex,
          lines,
          timestamp: Date.now()
        };

        this.broadcastHarvestUpdate({
          farmId,
          harvestId: '',
          type: 'terminal_output',
          data: {
            outputs: [outputPayload]
          },
          timestamp: new Date()
        });

        this.io.to(`harvest:${farmId}`).emit('harvest:terminal:output', outputPayload);
        this.io.to(`terminal:${sessionName || getFarmSessionName(farmId)}`).emit('terminal:output', outputPayload);

        // Stop fallback polling once live stream data flows
        this.stopTerminalPolling(farmId);
      };

      unifiedTerminalStreamService.on('output', handler);
      this.terminalStreamHandlers.set(farmId, handler);
    }

    const farmStatus = unifiedTerminalStreamService.getFarmStatus(farmId);
    const hasActiveStream = farmStatus?.agents?.some(agent => agent.isActive) ?? false;

    if (!hasActiveStream) {
      this.startTerminalPolling(farmId);
    }
  }

  private unsubscribeFromTerminalStream(farmId: string) {
    const handler = this.terminalStreamHandlers.get(farmId);
    if (handler) {
      if (typeof unifiedTerminalStreamService.off === 'function') {
        unifiedTerminalStreamService.off('output', handler);
      } else {
        unifiedTerminalStreamService.removeListener('output', handler);
      }
      this.terminalStreamHandlers.delete(farmId);
    }
  }

  private startTerminalPolling(farmId: string) {
    // Don't start if already polling
    if (this.terminalPollingIntervals.has(farmId)) {
      return;
    }

    const farmStatus = unifiedTerminalStreamService.getFarmStatus(farmId);
    const hasActiveStream = farmStatus?.agents?.some(agent => agent.isActive) ?? false;

    if (hasActiveStream) {
      return;
    }
    
    // Poll terminal output every 2 seconds
    const interval = setInterval(async () => {
      await this.pollTerminalOutputs(farmId);
    }, 2000);
    
    this.terminalPollingIntervals.set(farmId, interval);
    logger.info(`Started terminal polling for farm ${farmId}`);
  }

  private stopTerminalPolling(farmId: string) {
    const interval = this.terminalPollingIntervals.get(farmId);
    if (interval) {
      clearInterval(interval);
      this.terminalPollingIntervals.delete(farmId);
      logger.info(`Stopped terminal polling for farm ${farmId}`);
    }
  }

  private async pollTerminalOutputs(farmId: string) {
    try {
      const activeSessionNames = unifiedTerminalStreamService.getSessionNamesForFarm(farmId);
      const sessionCandidates = activeSessionNames.length > 0
        ? activeSessionNames
        : [getFarmSessionName(farmId)];

      const outputs: TerminalOutput[] = [];

      for (const sessionName of sessionCandidates) {
        const paneIndexes = await listTmuxPanes(sessionName);

        if (paneIndexes.length === 0) {
          continue;
        }

        for (const paneIndex of paneIndexes) {
          try {
            const paneRef = await getTmuxPaneRef(sessionName, paneIndex);
            const lines = await this.capturePaneOutput(paneRef, 50);

            if (lines.length > 0) {
              outputs.push({
                sessionName,
                agentId: paneIndex,
                agentIndex: paneIndex,
                lines,
                timestamp: Date.now()
              });
            }
          } catch (error) {
            logger.debug(`[HarvestWebSocket] Failed to capture output for ${sessionName} pane ${paneIndex}:`, error);
          }
        }
      }

      if (outputs.length > 0) {
        this.broadcastHarvestUpdate({
          farmId,
          harvestId: '',
          type: 'terminal_output',
          data: { outputs },
          timestamp: new Date()
        });

        const harvestRoom = `harvest:${farmId}`;
        const terminalRoom = `terminal:${getFarmSessionName(farmId)}`;
        for (const output of outputs) {
          this.io.to(harvestRoom).emit('harvest:terminal:output', output);
          this.io.to(terminalRoom).emit('terminal:output', output);
        }
      }
    } catch (error) {
      logger.error(`Failed to poll terminal outputs for farm ${farmId}:`, error);
    }
  }

  private async getTerminalOutput(
    sessionName: string, 
    agentId: string, 
    lines: number = 100
  ): Promise<TerminalOutput> {
    const paneIndex = parseInt(agentId, 10);
    if (Number.isNaN(paneIndex)) {
      return {
        sessionName,
        agentId,
        lines: [],
        timestamp: Date.now()
      };
    }

    try {
      const paneRef = await getTmuxPaneRef(sessionName, paneIndex);
      const outputLines = await this.capturePaneOutput(paneRef, lines);

      return {
        sessionName,
        agentId,
        lines: outputLines,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.debug(`[HarvestWebSocket] Failed to resolve pane ${sessionName} index ${agentId}:`, error);
      return {
        sessionName,
        agentId,
        lines: [],
        timestamp: Date.now()
      };
    }
  }

  private async sendTerminalCommand(
    sessionName: string,
    agentId: string,
    command: string
  ): Promise<void> {
    const paneIndex = parseInt(agentId, 10);
    if (Number.isNaN(paneIndex)) {
      throw new Error('Invalid agent id');
    }

    const paneRef = await getTmuxPaneRef(sessionName, paneIndex);

    return new Promise((resolve, reject) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', paneRef,
        command,
        'C-m'
      ], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });
      
      sendProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to send command to terminal'));
        }
      });

      sendProcess.on('error', reject);
    });
  }

  private async capturePaneOutput(paneRef: string, lines: number): Promise<string[]> {
    return new Promise(resolve => {
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', paneRef,
        '-p',
        '-S', `-${lines}`
      ], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });

      let output = '';

      captureProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      captureProcess.on('error', () => resolve([]));

      captureProcess.on('exit', (code) => {
        if (code === 0 && output) {
          const rawLines = output.split('\n');
          while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
            rawLines.pop();
          }
          resolve(rawLines);
        } else {
          resolve([]);
        }
      });
    });
  }

  private async getFarmIdFromSession(sessionName: string): Promise<string | null> {
    // Extract farm ID from session name (e.g., "farm_123" or "farm-123" -> "123")
    const match = sessionName.match(/farm[_-](.+)/);
    return match ? match[1] : null;
  }

  private broadcastHarvestUpdate(update: HarvestUpdate) {
    const room = `harvest:${update.farmId}`;
    this.io.to(room).emit('harvest:update', update);
    logger.debug(`Broadcast harvest update to room ${room}:`, update.type);
  }

  private startCoordinationWatcher() {
    // Watch coordination files for changes
    this.coordinationWatcher = setInterval(async () => {
      try {
        // Check for changes in active agents
        const agents = coordinationService.getActiveAgents();
        
        // Broadcast updates to all active harvest rooms
        this.activeHarvests.forEach((clients, farmId) => {
          if (clients.size > 0) {
            this.io.to(`harvest:${farmId}`).emit('harvest:agents:update', {
              agents,
              timestamp: new Date()
            });
          }
        });
        
        // Check for new completed work
        const completed = await coordinationService.collectCompletedWork();
        if (completed.length > 0) {
          this.activeHarvests.forEach((clients, farmId) => {
            if (clients.size > 0) {
              this.io.to(`harvest:${farmId}`).emit('harvest:work:completed', {
                completed,
                timestamp: new Date()
              });
            }
          });
        }
      } catch (error) {
        logger.error('Error in coordination watcher:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  public cleanup() {
    // Stop all polling intervals
    this.terminalPollingIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.terminalPollingIntervals.clear();

    // Remove terminal stream listeners
    for (const farmId of Array.from(this.terminalStreamHandlers.keys())) {
      this.unsubscribeFromTerminalStream(farmId);
    }

    // Stop coordination watcher
    if (this.coordinationWatcher) {
      clearInterval(this.coordinationWatcher);
      this.coordinationWatcher = null;
    }

    // MEMORY FIX: Stop event queue cleanup interval
    if (this.eventQueueCleanupInterval) {
      clearInterval(this.eventQueueCleanupInterval);
      this.eventQueueCleanupInterval = null;
    }

    // MEMORY FIX: Clear all heartbeat intervals
    this.heartbeatIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.heartbeatIntervals.clear();

    // MEMORY FIX: Clear event queues and recovery queues
    this.eventQueue.clear();
    this.sessionRecoveryQueue.clear();
    this.activeHarvests.clear();

    logger.info('Harvest WebSocket handler cleaned up');
  }
}

export default HarvestWebSocketHandler;
