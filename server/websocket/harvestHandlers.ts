import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { harvestService } from '../services/harvestService';
import { coordinationService } from '../services/coordinationService';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

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
  agentId: string;
  lines: string[];
  timestamp: Date;
}

class HarvestWebSocketHandler {
  private io: SocketServer;
  private activeHarvests: Map<string, Set<string>> = new Map(); // farmId -> Set of client IDs
  private terminalPollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private coordinationWatcher: NodeJS.Timeout | null = null;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupHandlers();
    this.startCoordinationWatcher();
  }

  private setupHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Harvest WebSocket client connected: ${socket.id}`);

      // Join harvest room for a specific farm
      socket.on('harvest:join', async (data: { farmId: string }) => {
        const { farmId } = data;
        socket.join(`harvest:${farmId}`);
        
        // Track active harvest connections
        if (!this.activeHarvests.has(farmId)) {
          this.activeHarvests.set(farmId, new Set());
        }
        this.activeHarvests.get(farmId)!.add(socket.id);
        
        logger.info(`Client ${socket.id} joined harvest room for farm ${farmId}`);
        
        // Send initial harvest data
        await this.sendInitialHarvestData(socket, farmId);
        
        // Start terminal polling if not already running
        this.startTerminalPolling(farmId);
      });

      // Leave harvest room
      socket.on('harvest:leave', (data: { farmId: string }) => {
        const { farmId } = data;
        socket.leave(`harvest:${farmId}`);
        
        // Remove from active harvests
        const clients = this.activeHarvests.get(farmId);
        if (clients) {
          clients.delete(socket.id);
          if (clients.size === 0) {
            this.activeHarvests.delete(farmId);
            this.stopTerminalPolling(farmId);
          }
        }
        
        logger.info(`Client ${socket.id} left harvest room for farm ${farmId}`);
      });

      // Request terminal output for specific agent
      socket.on('harvest:terminal:request', async (data: { 
        sessionName: string; 
        agentId: string; 
        lines?: number 
      }) => {
        const output = await this.getTerminalOutput(
          data.sessionName, 
          data.agentId, 
          data.lines || 100
        );
        
        socket.emit('harvest:terminal:output', output);
      });

      // Send command to agent terminal
      socket.on('harvest:terminal:command', async (data: {
        sessionName: string;
        agentId: string;
        command: string;
      }) => {
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
      });

      // Start harvest manually
      socket.on('harvest:start', async (data: { farmId: string; farmName: string }) => {
        try {
          const harvest = await harvestService.startHarvest(data.farmId, data.farmName);
          
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
          const harvest = await harvestService.completeHarvest(data.harvestId);
          
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
        
        // Clean up from all harvest rooms
        this.activeHarvests.forEach((clients, farmId) => {
          if (clients.has(socket.id)) {
            clients.delete(socket.id);
            if (clients.size === 0) {
              this.activeHarvests.delete(farmId);
              this.stopTerminalPolling(farmId);
            }
          }
        });
      });
    });
  }

  private async sendInitialHarvestData(socket: Socket, farmId: string) {
    try {
      // Get active agents from coordination
      const agents = coordinationService.getActiveAgents();
      
      // Get work claims
      const claims = coordinationService.getWorkClaims();
      
      // Get completed work
      const completed = await coordinationService.collectCompletedWork();
      
      // Get harvest reports
      const reports = await coordinationService.getHarvestReports(farmId);
      
      socket.emit('harvest:initial:data', {
        farmId,
        agents,
        claims,
        completed,
        reports,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to send initial harvest data:', error);
      socket.emit('harvest:error', {
        error: 'Failed to load initial data',
        details: (error as Error).message
      });
    }
  }

  private startTerminalPolling(farmId: string) {
    // Don't start if already polling
    if (this.terminalPollingIntervals.has(farmId)) {
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
      // Get tmux sessions for this farm
      const sessionName = `farm_${farmId}`;
      const alternateSession = 'claude_agents'; // Fallback session name
      
      // Try farm-specific session first
      let sessions = await this.getTmuxSessions(sessionName);
      if (sessions.length === 0) {
        // Try alternate session name
        sessions = await this.getTmuxSessions(alternateSession);
      }
      
      if (sessions.length === 0) {
        return; // No active sessions
      }
      
      // Get terminal output for each agent
      const outputs: TerminalOutput[] = [];
      for (const session of sessions) {
        for (let i = 0; i < session.paneCount; i++) {
          const output = await this.getTerminalOutput(session.sessionName, i.toString(), 50);
          if (output.lines.length > 0) {
            outputs.push(output);
          }
        }
      }
      
      // Broadcast terminal updates
      if (outputs.length > 0) {
        this.broadcastHarvestUpdate({
          farmId,
          harvestId: '', // Will be filled by service
          type: 'terminal_output',
          data: { outputs },
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error(`Failed to poll terminal outputs for farm ${farmId}:`, error);
    }
  }

  private async getTmuxSessions(sessionName: string): Promise<Array<{
    sessionName: string;
    paneCount: number;
  }>> {
    return new Promise((resolve) => {
      const checkSession = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
      
      let output = '';
      checkSession.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      checkSession.on('exit', (code) => {
        if (code === 0) {
          const paneCount = output.trim().split('\n').filter(Boolean).length;
          resolve([{ sessionName, paneCount }]);
        } else {
          resolve([]);
        }
      });
    });
  }

  private async getTerminalOutput(
    sessionName: string, 
    agentId: string, 
    lines: number = 100
  ): Promise<TerminalOutput> {
    return new Promise((resolve) => {
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:0.${agentId}`,
        '-p',
        '-S', `-${lines}`
      ]);
      
      let output = '';
      captureProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      captureProcess.on('exit', (code) => {
        const lines = code === 0 ? output.split('\n') : [];
        resolve({
          sessionName,
          agentId,
          lines,
          timestamp: new Date()
        });
      });
    });
  }

  private async sendTerminalCommand(
    sessionName: string,
    agentId: string,
    command: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', `${sessionName}:0.${agentId}`,
        command,
        'C-m'
      ]);
      
      sendProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to send command to terminal'));
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
    
    // Stop coordination watcher
    if (this.coordinationWatcher) {
      clearInterval(this.coordinationWatcher);
      this.coordinationWatcher = null;
    }
    
    logger.info('Harvest WebSocket handler cleaned up');
  }
}

export default HarvestWebSocketHandler;