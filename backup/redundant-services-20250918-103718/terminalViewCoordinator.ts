import { EventEmitter } from 'events';
import { websocketManager } from '../websocket/websocketManager';
import { structuredLogger as logger, LogCategory } from '../utils/structuredLogger';
import { terminalRoomManager } from '../websocket/terminalRoomManager';

export interface SessionInfo {
  sessionName: string;
  farmId: string;
  agentCount: number;
  windowTarget: string; // 'agents' or '0'
  panes: Map<number, PaneInfo>;
  connected: boolean;
  lastHealthCheck?: Date;
}

export interface PaneInfo {
  agentIndex: number;
  paneId: string; // e.g., "farm-abc:agents.0"
  title?: string;
  logPath?: string;
  connected: boolean;
  lastOutput?: Date;
  outputBuffer: string[]; // Last 100 lines for reconnection
}

export interface PaneRegistration {
  sessionName: string;
  farmId: string;
  agentIndex: number;
  paneId: string;
  logPath?: string;
}

/**
 * Coordinates terminal views across different display modes (grid, stacked, single)
 * Ensures proper agent-to-pane mapping and connection reliability
 */
export class TerminalViewCoordinator extends EventEmitter {
  private static instance: TerminalViewCoordinator;
  private sessions: Map<string, SessionInfo> = new Map();
  private paneToAgent: Map<string, { farmId: string, agentIndex: number }> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly MAX_BUFFER_LINES = 100;
  private readonly HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

  private constructor() {
    super();
    this.startHealthChecks();
    logger.info(LogCategory.TERMINAL, 'Terminal View Coordinator initialized');
  }

  static getInstance(): TerminalViewCoordinator {
    if (!TerminalViewCoordinator.instance) {
      TerminalViewCoordinator.instance = new TerminalViewCoordinator();
    }
    return TerminalViewCoordinator.instance;
  }

  /**
   * Register a new tmux session
   */
  async registerSession(info: {
    sessionName: string;
    farmId: string;
    agentCount: number;
    windowTarget?: string;
  }): Promise<void> {
    const session: SessionInfo = {
      sessionName: info.sessionName,
      farmId: info.farmId,
      agentCount: info.agentCount,
      windowTarget: info.windowTarget || 'agents',
      panes: new Map(),
      connected: false
    };

    this.sessions.set(info.sessionName, session);
    
    logger.info(LogCategory.TERMINAL, `Registered session ${info.sessionName}`, {
      farmId: info.farmId,
      agents: info.agentCount,
      window: session.windowTarget
    });

    // Broadcast session registration for UI
    websocketManager.broadcast('terminal:session-registered', {
      sessionName: info.sessionName,
      farmId: info.farmId,
      agentCount: info.agentCount,
      windowTarget: session.windowTarget,
      timestamp: new Date()
    });
  }

  /**
   * Register a pane for an agent
   */
  async registerPane(registration: PaneRegistration): Promise<void> {
    const session = this.sessions.get(registration.sessionName);
    if (!session) {
      logger.warn(LogCategory.TERMINAL, `Session ${registration.sessionName} not found for pane registration`);
      return;
    }

    const paneInfo: PaneInfo = {
      agentIndex: registration.agentIndex,
      paneId: registration.paneId,
      logPath: registration.logPath,
      connected: false,
      outputBuffer: []
    };

    session.panes.set(registration.agentIndex, paneInfo);
    this.paneToAgent.set(registration.paneId, {
      farmId: registration.farmId,
      agentIndex: registration.agentIndex
    });

    logger.debug(LogCategory.TERMINAL, `Registered pane ${registration.paneId}`, {
      farmId: registration.farmId,
      agent: registration.agentIndex
    });

    // Note: Room joining is handled by terminalHandlers when clients connect
    // This coordinator manages pane mappings, not WebSocket rooms directly

    // Broadcast pane ready event
    websocketManager.broadcast('terminal:pane-ready', {
      farmId: registration.farmId,
      sessionName: registration.sessionName,
      agentIndex: registration.agentIndex,
      paneId: registration.paneId,
      timestamp: new Date()
    });
  }

  /**
   * Update pane output and buffer for reconnection
   */
  updatePaneOutput(paneId: string, output: string): void {
    const agentInfo = this.paneToAgent.get(paneId);
    if (!agentInfo) return;

    // Find the session containing this pane
    for (const [sessionName, session] of this.sessions) {
      const pane = session.panes.get(agentInfo.agentIndex);
      if (pane && pane.paneId === paneId) {
        pane.lastOutput = new Date();
        pane.connected = true;
        
        // Update output buffer (keep last 100 lines)
        const lines = output.split('\n');
        pane.outputBuffer.push(...lines);
        if (pane.outputBuffer.length > this.MAX_BUFFER_LINES) {
          pane.outputBuffer = pane.outputBuffer.slice(-this.MAX_BUFFER_LINES);
        }
        
        // Broadcast output to correct room
        websocketManager.broadcastToRoom(
          `terminal:${agentInfo.farmId}:${agentInfo.agentIndex}`,
          'terminal:output',
          {
            farmId: agentInfo.farmId,
            agentIndex: agentInfo.agentIndex,
            sessionName,
            paneId,
            content: output,
            timestamp: new Date()
          }
        );
        
        break;
      }
    }
  }

  /**
   * Handle view switch (grid/stacked/single)
   */
  async switchView(farmId: string, viewType: 'grid' | 'stacked' | 'single', selectedAgent?: number): Promise<void> {
    const session = this.findSessionByFarmId(farmId);
    if (!session) {
      logger.warn(LogCategory.TERMINAL, `No session found for farm ${farmId}`);
      return;
    }

    // Prepare view-specific data
    const viewData = {
      farmId,
      sessionName: session.sessionName,
      viewType,
      agentCount: session.agentCount,
      panes: Array.from(session.panes.entries()).map(([index, pane]) => ({
        index,
        paneId: pane.paneId,
        connected: pane.connected,
        hasOutput: pane.outputBuffer.length > 0
      })),
      selectedAgent,
      timestamp: new Date()
    };

    // Broadcast view switch event
    websocketManager.broadcast('terminal:view-switched', viewData);

    // For grid view, send layout information
    if (viewType === 'grid') {
      const gridLayout = this.calculateGridLayout(session.agentCount);
      websocketManager.broadcast('terminal:grid-layout', {
        farmId,
        ...gridLayout,
        timestamp: new Date()
      });
    }

    logger.info(LogCategory.TERMINAL, `Switched to ${viewType} view for farm ${farmId}`, {
      selectedAgent
    });
  }

  /**
   * Handle client reconnection - send buffered output
   */
  async handleReconnection(farmId: string, clientId: string): Promise<void> {
    const session = this.findSessionByFarmId(farmId);
    if (!session) return;

    for (const [agentIndex, pane] of session.panes) {
      if (pane.outputBuffer.length > 0) {
        // Send buffered output to reconnecting client
        websocketManager.sendToClient(clientId, 'terminal:buffered-output', {
          farmId,
          agentIndex,
          paneId: pane.paneId,
          content: pane.outputBuffer.join('\n'),
          timestamp: new Date()
        });
      }
    }

    logger.info(LogCategory.TERMINAL, `Sent buffered output to reconnecting client ${clientId}`);
  }

  /**
   * Verify all connections for a session
   */
  async verifyConnections(sessionName: string): Promise<boolean> {
    const session = this.sessions.get(sessionName);
    if (!session) return false;

    // First check if the tmux session still exists
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t ${sessionName} 2>/dev/null || echo "not_found"`);
      
      if (stdout.includes('not_found')) {
        // Session no longer exists, clean up
        logger.info(LogCategory.TERMINAL, `Session ${sessionName} no longer exists, cleaning up`);
        this.sessions.delete(sessionName);
        return false;
      }
    } catch (error) {
      // Session check failed, assume it doesn't exist
      this.sessions.delete(sessionName);
      return false;
    }

    let allConnected = true;
    
    for (const [index, pane] of session.panes) {
      // Check if pane has recent output
      const isConnected = pane.lastOutput && 
        (Date.now() - pane.lastOutput.getTime()) < 30000; // 30 seconds
      
      pane.connected = isConnected || false;
      
      if (!isConnected) {
        allConnected = false;
        // Only log as debug level since this is expected when agents complete
        logger.debug(LogCategory.TERMINAL, `Pane ${index} not connected in session ${sessionName}`);
      }
    }

    session.connected = allConnected;
    session.lastHealthCheck = new Date();

    // Broadcast connection status
    websocketManager.broadcast('terminal:connection-status', {
      sessionName,
      farmId: session.farmId,
      connected: allConnected,
      paneStatuses: Array.from(session.panes.entries()).map(([index, pane]) => ({
        index,
        connected: pane.connected
      })),
      timestamp: new Date()
    });

    return allConnected;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      for (const [sessionName, session] of this.sessions) {
        // Only check active sessions
        if (session.connected || !session.lastHealthCheck || 
            (Date.now() - session.lastHealthCheck.getTime()) < 60000) {
          this.performHealthCheck(sessionName);
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Perform health check for a session
   */
  private async performHealthCheck(sessionName: string): Promise<void> {
    const session = this.sessions.get(sessionName);
    if (!session) return;

    // Send ping to all connected clients watching this session
    websocketManager.broadcast('terminal:health-ping', {
      sessionName,
      farmId: session.farmId,
      timestamp: new Date()
    });

    // Expect pong responses within 2 seconds
    setTimeout(() => {
      this.verifyConnections(sessionName);
    }, 2000);
  }

  /**
   * Handle health pong response from client
   */
  handleHealthPong(sessionName: string, agentIndex: number): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;

    const pane = session.panes.get(agentIndex);
    if (pane) {
      pane.connected = true;
      pane.lastOutput = new Date();
    }
  }

  /**
   * Calculate grid layout dimensions
   */
  private calculateGridLayout(agentCount: number): { rows: number, cols: number } {
    if (agentCount <= 1) return { rows: 1, cols: 1 };
    if (agentCount <= 2) return { rows: 1, cols: 2 };
    if (agentCount <= 4) return { rows: 2, cols: 2 };
    if (agentCount <= 6) return { rows: 2, cols: 3 };
    if (agentCount <= 9) return { rows: 3, cols: 3 };
    if (agentCount <= 12) return { rows: 3, cols: 4 };
    return { rows: 4, cols: Math.ceil(agentCount / 4) };
  }

  /**
   * Find session by farm ID
   */
  private findSessionByFarmId(farmId: string): SessionInfo | undefined {
    for (const session of this.sessions.values()) {
      if (session.farmId === farmId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Clean up session resources
   */
  async cleanupSession(sessionName: string): Promise<void> {
    const session = this.sessions.get(sessionName);
    if (!session) return;

    // Remove pane mappings
    for (const pane of session.panes.values()) {
      this.paneToAgent.delete(pane.paneId);
    }

    // Remove session
    this.sessions.delete(sessionName);

    logger.info(LogCategory.TERMINAL, `Cleaned up session ${sessionName}`);

    // Broadcast cleanup event
    websocketManager.broadcast('terminal:session-cleanup', {
      sessionName,
      farmId: session.farmId,
      timestamp: new Date()
    });
  }

  /**
   * Get session information
   */
  getSession(sessionName: string): SessionInfo | undefined {
    return this.sessions.get(sessionName);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Cleanup resources on shutdown
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.sessions.clear();
    this.paneToAgent.clear();
    logger.info(LogCategory.TERMINAL, 'Terminal View Coordinator shut down');
  }
}

// Export singleton instance
export const terminalViewCoordinator = TerminalViewCoordinator.getInstance();