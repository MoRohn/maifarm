import { Request, Response } from 'express';
import { websocketManager } from '../websocket/websocketManager';
import TerminalStreamFix from '../websocket/terminalStreamFix';
import TerminalGlobalFix from '../websocket/terminalGlobalFix';
import { terminalService } from '../services/unified/terminalService';

// Alias for compatibility
const terminalStreamService = terminalService;

/**
 * Debug endpoint to check terminal WebSocket room status
 */
export const getTerminalDebugInfo = async (req: Request, res: Response) => {
  try {
    // Get debug info from TerminalStreamFix
    const debugInfo = websocketManager.io ? 
      TerminalStreamFix.getDebugInfo(websocketManager.io) : 
      { error: 'WebSocket not initialized' };
    
    // Get streaming sessions
    const streamingSessions: any[] = [];
    
    // Get all rooms from socket.io
    const allRooms: any = {};
    if (websocketManager.io) {
      const rooms = websocketManager.io.sockets.adapter.rooms;
      for (const [roomName, sockets] of rooms) {
        // Skip socket ID rooms (they match socket IDs)
        if (!roomName.includes(':')) continue;
        
        allRooms[roomName] = {
          size: sockets.size,
          sockets: Array.from(sockets)
        };
      }
    }
    
    // Get connected sockets
    const connectedSockets: any[] = [];
    if (websocketManager.io) {
      for (const [id, socket] of websocketManager.io.sockets.sockets) {
        connectedSockets.push({
          id,
          rooms: Array.from(socket.rooms),
          connected: socket.connected
        });
      }
    }
    
    // Get global fix info
    const globalFixInfo = TerminalGlobalFix.getDebugInfo();
    
    res.json({
      success: true,
      data: {
        ...debugInfo,
        globalFix: globalFixInfo,
        allRooms,
        connectedSockets,
        streamingSessions,
        totalConnectedClients: connectedSockets.length,
        terminalRoomCount: Object.keys(allRooms).filter(r => r.startsWith('terminal:')).length
      }
    });
  } catch (error: any) {
    console.error('[Debug Terminal] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Force broadcast a test message to terminal rooms
 */
export const testTerminalBroadcast = async (req: Request, res: Response) => {
  try {
    const { sessionId, farmId } = req.body;
    
    if (!websocketManager.io) {
      return res.status(500).json({
        success: false,
        error: 'WebSocket not initialized'
      });
    }
    
    // Broadcast test message using both methods
    const testData = {
      sessionName: sessionId || 'test-session',
      farmId: farmId || 'test-farm',
      agentId: 0,
      output: 'TEST: This is a test terminal output message\n',
      lines: ['TEST: This is a test terminal output message']
    };
    
    // Use global fix
    TerminalGlobalFix.broadcastTerminalOutput(websocketManager.io, testData);
    
    // Also use stream fix
    TerminalStreamFix.broadcastOutput(websocketManager.io, testData);
    
    res.json({
      success: true,
      message: 'Test broadcast sent'
    });
  } catch (error: any) {
    console.error('[Test Broadcast] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};