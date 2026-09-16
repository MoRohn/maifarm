/**
 * Python WebSocket Bridge
 * Connects to Python orchestrator's WebSocket and forwards events to Node.js clients
 */

import { io as ioClient, Socket } from 'socket.io-client';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { EventEmitter } from 'events';

interface HarvestEvent {
  v: number;
  type: string;
  session_id: string;
  agent_id?: string | null;
  pane_id?: string | null;
  ts: string;
  payload: any;
}

class PythonWebSocketBridge extends EventEmitter {
  private static instance: PythonWebSocketBridge;
  private client: Socket | null = null;
  private url: string;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  private constructor() {
    super();
    this.url = process.env.PYTHON_ORCHESTRATOR_WS_URL || 'http://127.0.0.1:8000';
  }

  static getInstance(): PythonWebSocketBridge {
    if (!PythonWebSocketBridge.instance) {
      PythonWebSocketBridge.instance = new PythonWebSocketBridge();
    }
    return PythonWebSocketBridge.instance;
  }

  connect(): void {
    // DISABLED: Python WebSocket bridge not required for current tmux-based architecture
    // Farm orchestration uses scripts/python/orchestrator.py with tmux sessions
    // Terminal streaming captured via pipe-pane → log files → Node.js file watchers
    logger.info(LogCategory.TERMINAL, 'Python WebSocket bridge disabled (not required for tmux-based orchestration)');
    return;

    // eslint-disable-next-line no-unreachable
    if (this.client && this.connected) {
      logger.info(LogCategory.TERMINAL, 'Python WebSocket bridge already connected');
      return;
    }

    logger.info(LogCategory.TERMINAL, 'Connecting to Python orchestrator WebSocket', { url: this.url });

    this.client = ioClient(this.url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info(LogCategory.TERMINAL, 'Python WebSocket bridge connected');
      this.emit('connected');
    });

    this.client.on('disconnect', (reason) => {
      this.connected = false;
      logger.warn(LogCategory.TERMINAL, 'Python WebSocket bridge disconnected', { reason });
      this.emit('disconnected', reason);
    });

    this.client.on('connect_error', (error) => {
      this.reconnectAttempts++;
      logger.error(LogCategory.TERMINAL, 'Python WebSocket connection error', {
        error: error.message,
        attempt: this.reconnectAttempts,
      });

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.warn(LogCategory.TERMINAL, 'Max reconnection attempts reached, will retry in 60s');
        // Don't stop permanently - retry after cooldown
        setTimeout(() => {
          this.reconnectAttempts = 0;
          logger.info(LogCategory.TERMINAL, 'Retrying Python WebSocket connection after cooldown');
          this.connect();
        }, 60000); // 60 second cooldown
      }
    });

    // Forward harvest events to Node.js WebSocket clients
    this.client.on('harvest_event', (event: HarvestEvent) => {
      this.handleHarvestEvent(event);
    });

    // Listen for specific event types
    this.client.on('term_line', (data: any) => {
      this.handleTerminalLine(data);
    });

    this.client.on('agent_event', (data: any) => {
      this.handleAgentEvent(data);
    });

    this.client.on('status', (data: any) => {
      this.handleStatusEvent(data);
    });
  }

  private handleHarvestEvent(event: HarvestEvent): void {
    try {
      logger.debug(LogCategory.TERMINAL, 'Received harvest event from Python', {
        type: event.type,
        sessionId: event.session_id,
        agentId: event.agent_id,
      });

      // Forward to appropriate Node.js WebSocket room
      const roomName = `farm-${event.session_id}`;

      // Transform to Node.js format
      const nodeEvent = {
        type: event.type,
        sessionId: event.session_id,
        agentId: event.agent_id,
        paneId: event.pane_id,
        timestamp: event.ts,
        ...event.payload,
      };

      websocketManager.broadcastToRoom(roomName, event.type, nodeEvent);
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error handling harvest event', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private handleTerminalLine(data: any): void {
    try {
      const { session_id, pane_id, line, agent_id } = data;

      logger.debug(LogCategory.TERMINAL, 'Terminal line from Python', {
        sessionId: session_id,
        paneId: pane_id,
        length: line?.length || 0,
      });

      // Forward to terminal:output event
      const roomName = `farm-${session_id}`;
      websocketManager.broadcastToRoom(roomName, 'terminal:output', {
        farmId: session_id,
        agentId: agent_id,
        paneId: pane_id,
        output: line,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error handling terminal line', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private handleAgentEvent(data: any): void {
    try {
      const { session_id, agent_id, phase, content_delta } = data;

      logger.debug(LogCategory.TERMINAL, 'Agent event from Python', {
        sessionId: session_id,
        agentId: agent_id,
        phase,
      });

      const roomName = `farm-${session_id}`;
      websocketManager.broadcastToRoom(roomName, 'agent:event', {
        sessionId: session_id,
        agentId: agent_id,
        phase,
        contentDelta: content_delta,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error handling agent event', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private handleStatusEvent(data: any): void {
    try {
      const { session_id, agent_id, status, detail } = data;

      logger.debug(LogCategory.TERMINAL, 'Status event from Python', {
        sessionId: session_id,
        agentId: agent_id,
        status,
      });

      const roomName = `farm-${session_id}`;
      websocketManager.broadcastToRoom(roomName, 'agent:status', {
        sessionId: session_id,
        agentId: agent_id,
        status,
        detail,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error handling status event', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  subscribeToSession(sessionId: string): void {
    if (!this.client || !this.connected) {
      logger.warn(LogCategory.TERMINAL, 'Cannot subscribe: Python WebSocket not connected');
      return;
    }

    logger.info(LogCategory.TERMINAL, 'Subscribing to Python WebSocket session', { sessionId });

    // Join the harvest WebSocket room in Python
    this.client.emit('join_session', { session_id: sessionId });
  }

  unsubscribeFromSession(sessionId: string): void {
    if (!this.client || !this.connected) {
      return;
    }

    logger.info(LogCategory.TERMINAL, 'Unsubscribing from Python WebSocket session', { sessionId });
    this.client.emit('leave_session', { session_id: sessionId });
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.connected = false;
      logger.info(LogCategory.TERMINAL, 'Python WebSocket bridge disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const pythonWebSocketBridge = PythonWebSocketBridge.getInstance();
