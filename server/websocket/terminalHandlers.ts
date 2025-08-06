import { Server as SocketServer, Socket } from 'socket.io';
import { spawn } from 'child_process';
import { TerminalEvent } from '../../types/terminal';

interface TerminalWebSocketHandlers {
  handleTerminalConnect: (socket: Socket) => void;
  handleTerminalDisconnect: (socket: Socket) => void;
  handleTerminalJoinSession: (socket: Socket, data: { sessionId: string; farmId?: string }) => void;
  handleTerminalLeaveSession: (socket: Socket, data: { sessionId: string }) => void;
  broadcastTerminalEvent: (io: SocketServer, event: TerminalEvent) => void;
  startOutputMonitoring: (sessionId: string, agentCount: number) => void;
  stopOutputMonitoring: (sessionId: string) => void;
}

// Store for active monitoring processes
const monitoringProcesses = new Map<string, NodeJS.Timeout[]>();
const sessionRooms = new Map<string, Set<string>>(); // sessionId -> Set of socketIds

export const createTerminalWebSocketHandlers = (io: SocketServer): TerminalWebSocketHandlers => {
  
  const handleTerminalConnect = (socket: Socket) => {
    console.log(`Terminal client connected: ${socket.id}`);
    
    // Send current terminal status
    socket.emit('terminal:status', {
      connected: true,
      timestamp: new Date(),
      clientId: socket.id
    });
  };

  const handleTerminalDisconnect = (socket: Socket) => {
    console.log(`Terminal client disconnected: ${socket.id}`);
    
    // Remove socket from all session rooms
    sessionRooms.forEach((sockets, sessionId) => {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          // Stop monitoring if no clients are watching
          stopOutputMonitoring(sessionId);
        }
      }
    });
  };

  const handleTerminalJoinSession = (socket: Socket, data: { sessionId: string; farmId?: string }) => {
    const { sessionId, farmId } = data;
    
    console.log(`Socket ${socket.id} joining terminal session: ${sessionId}`);
    
    // Join socket room
    socket.join(`terminal:${sessionId}`);
    
    // Track session membership
    if (!sessionRooms.has(sessionId)) {
      sessionRooms.set(sessionId, new Set());
    }
    sessionRooms.get(sessionId)!.add(socket.id);
    
    // Start monitoring if this is the first client
    if (sessionRooms.get(sessionId)!.size === 1) {
      // Get agent count from tmux session
      getSessionAgentCount(sessionId).then(agentCount => {
        if (agentCount > 0) {
          startOutputMonitoring(sessionId, agentCount);
        }
      });
    }
    
    // Confirm join
    socket.emit('terminal:joined', {
      sessionId,
      farmId,
      timestamp: new Date(),
      clientsWatching: sessionRooms.get(sessionId)!.size
    });
  };

  const handleTerminalLeaveSession = (socket: Socket, data: { sessionId: string }) => {
    const { sessionId } = data;
    
    console.log(`Socket ${socket.id} leaving terminal session: ${sessionId}`);
    
    // Leave socket room
    socket.leave(`terminal:${sessionId}`);
    
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
    
    // Broadcast to all clients watching this session
    io.to(room).emit('terminal:event', event);
    
    // Also broadcast specific event types
    switch (event.type) {
      case 'output':
        io.to(room).emit('terminal:output', event);
        break;
      case 'command':
        io.to(room).emit('terminal:command', event);
        break;
      case 'status':
        io.to(room).emit('terminal:agent_status', event);
        break;
      case 'session':
        // Broadcast session events globally
        io.emit('terminal:session', event);
        break;
      case 'agent_connected':
      case 'agent_disconnected':
        io.to(room).emit('terminal:agent_status', event);
        break;
    }
  };

  const startOutputMonitoring = (sessionId: string, agentCount: number) => {
    console.log(`Starting output monitoring for session ${sessionId} with ${agentCount} agents`);
    
    // Clear any existing monitoring for this session
    stopOutputMonitoring(sessionId);
    
    const intervals: NodeJS.Timeout[] = [];
    
    // Monitor each agent's output
    for (let agentId = 0; agentId < agentCount; agentId++) {
      const interval = setInterval(async () => {
        try {
          const output = await captureAgentOutput(sessionId, agentId);
          
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
          
          // Broadcast error event
          const errorEvent: TerminalEvent = {
            type: 'status',
            sessionId,
            agentId,
            data: {
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            },
            timestamp: new Date()
          };
          
          broadcastTerminalEvent(io, errorEvent);
        }
      }, 2000); // Check every 2 seconds
      
      intervals.push(interval);
    }
    
    monitoringProcesses.set(sessionId, intervals);
  };

  const stopOutputMonitoring = (sessionId: string) => {
    console.log(`Stopping output monitoring for session ${sessionId}`);
    
    const intervals = monitoringProcesses.get(sessionId);
    if (intervals) {
      intervals.forEach(interval => clearInterval(interval));
      monitoringProcesses.delete(sessionId);
    }
  };

  // Helper function to get agent count from tmux session
  const getSessionAgentCount = async (sessionId: string): Promise<number> => {
    return new Promise((resolve) => {
      const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionId}:0`, '-F', '#{pane_index}']);
      let output = '';
      
      countPanes.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      countPanes.on('exit', () => {
        const count = output.trim().split('\n').filter(Boolean).length;
        resolve(count);
      });
      
      countPanes.on('error', () => resolve(0));
    });
  };

  // Helper function to capture agent output
  const captureAgentOutput = async (sessionId: string, agentId: number): Promise<string[]> => {
    return new Promise((resolve) => {
      const capture = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionId}:0.${agentId}`,
        '-p',
        '-S', '-10' // Get last 10 lines
      ]);
      
      let output = '';
      
      capture.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      capture.on('exit', (code) => {
        if (code === 0) {
          const lines = output.split('\n').filter(line => line.trim());
          resolve(lines);
        } else {
          resolve([]);
        }
      });
      
      capture.on('error', () => resolve([]));
    });
  };

  return {
    handleTerminalConnect,
    handleTerminalDisconnect,
    handleTerminalJoinSession,
    handleTerminalLeaveSession,
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
  ERROR: 'terminal:error'
} as const;

export type TerminalEventType = typeof TERMINAL_EVENTS[keyof typeof TERMINAL_EVENTS];