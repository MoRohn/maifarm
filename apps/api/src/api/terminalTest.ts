import { Router } from 'express';
import { WebSocketServer } from '../websocket/socketServer';

const router = Router();

// Test endpoint to emit mock terminal data
router.post('/test-emit', (req, res) => {
  const { sessionId, farmId, agentCount = 2 } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  
  // Get WebSocket server instance from app.locals
  const wsServer = (req.app.locals.wsServer as WebSocketServer);
  if (!wsServer) {
    return res.status(500).json({ error: 'WebSocket server not available' });
  }
  
  console.log(`[TerminalTest] Emitting test data for session ${sessionId}`);
  
  // Emit test data for each agent
  for (let agentId = 0; agentId < agentCount; agentId++) {
    const testLines = [
      `Test output for Agent ${agentId + 1}`,
      `Session: ${sessionId}`,
      `Timestamp: ${new Date().toISOString()}`,
      `This is a test message to verify WebSocket communication`,
      `Random number: ${Math.random()}`,
      `✅ Terminal connection is working!`
    ];
    
    // Emit in multiple formats to ensure compatibility
    const outputData = {
      sessionId,
      sessionName: sessionId,
      farmId,
      agentId,
      output: testLines.join('\n'),
      lines: testLines,
      timestamp: new Date()
    };
    
    // Emit to various room formats
    wsServer.io.to(`terminal:${sessionId}`).emit('terminal:output', outputData);
    
    // Also emit to possible variations
    if (sessionId.includes('_') || sessionId.includes('-')) {
      const shortId = sessionId.split(/[_-]/)[1]?.substring(0, 8);
      if (shortId) {
        wsServer.io.to(`terminal:quick_${shortId}`).emit('terminal:output', outputData);
        wsServer.io.to(`terminal:farm-${shortId}`).emit('terminal:output', outputData);
      }
    }
    
    console.log(`[TerminalTest] Emitted test data for agent ${agentId}`);
  }
  
  res.json({ 
    success: true, 
    message: `Test data emitted for ${agentCount} agents in session ${sessionId}` 
  });
});

// Test endpoint to check WebSocket rooms
router.get('/test-rooms', (req, res) => {
  const wsServer = (req.app.locals.wsServer as WebSocketServer);
  if (!wsServer) {
    return res.status(500).json({ error: 'WebSocket server not available' });
  }
  
  const rooms: string[] = [];
  wsServer.io.sockets.adapter.rooms.forEach((value, key) => {
    if (key.startsWith('terminal:')) {
      rooms.push(key);
    }
  });
  
  res.json({ 
    success: true, 
    rooms,
    roomCount: rooms.length 
  });
});

export default router;