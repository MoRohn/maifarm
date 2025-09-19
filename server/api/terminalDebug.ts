import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { terminalService } from '../services/unified/terminalService';


// Alias for compatibility
const terminalStreamService = terminalService;
// Create tmuxSessionResolver facade
const tmuxSessionResolver = {
  resolveSession: (farmId: string) => terminalService.getTerminalSession(farmId),
  getSessionName: (farmId: string) => terminalService.getSessionName(farmId)
};
import { terminalRoomManager } from '../websocket/terminalRoomManager';
import { websocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Terminal Debug API
 * Provides detailed information about terminal streaming system health
 */

/**
 * Get comprehensive debug information about terminal streaming
 */
export async function getTerminalDebugInfo(req: Request, res: Response) {
  try {
    const debugInfo: any = {
      timestamp: new Date(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime()
      },
      tmux: {
        sessions: [],
        sessionCount: 0,
        error: null
      },
      streaming: {
        activeSessions: [],
        sessionCount: 0
      },
      websocket: {
        connected: !!websocketManager.io,
        clientCount: 0,
        rooms: []
      },
      resolver: {
        cachedMappings: []
      },
      roomManager: null
    };
    
    // Get tmux sessions
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_created}:#{session_windows}" 2>/dev/null');
      const sessions = stdout.trim().split('\n').filter(Boolean);
      
      for (const sessionLine of sessions) {
        const [name, created, windows] = sessionLine.split(':');
        
        // Get pane count for each session
        let paneCount = 0;
        try {
          const { stdout: paneOut } = await execAsync(`tmux list-panes -t "${name}" 2>/dev/null | wc -l`);
          paneCount = parseInt(paneOut.trim());
        } catch {
          // Ignore pane count errors
        }
        
        debugInfo.tmux.sessions.push({
          name,
          created: new Date(parseInt(created) * 1000),
          windows: parseInt(windows),
          panes: paneCount
        });
      }
      
      debugInfo.tmux.sessionCount = sessions.length;
    } catch (error: any) {
      debugInfo.tmux.error = error.message;
    }
    
    // Get streaming sessions
    const streamingSessions = terminalStreamService.getActiveSessions();
    debugInfo.streaming.activeSessions = streamingSessions;
    debugInfo.streaming.sessionCount = streamingSessions.length;
    
    // Get WebSocket information
    if (websocketManager.io) {
      debugInfo.websocket.clientCount = websocketManager.io.sockets.sockets.size;
      
      // Get room information
      const rooms = websocketManager.io.sockets.adapter.rooms;
      const roomInfo: any[] = [];
      
      rooms.forEach((sockets, roomName) => {
        if (roomName.startsWith('terminal:')) {
          roomInfo.push({
            name: roomName,
            clientCount: sockets.size,
            socketIds: Array.from(sockets).slice(0, 3) // Show first 3 socket IDs
          });
        }
      });
      
      debugInfo.websocket.rooms = roomInfo;
    }
    
    // Get resolver cache
    debugInfo.resolver.cachedMappings = tmuxSessionResolver.getCachedMappings();
    
    // Get room manager debug info
    debugInfo.roomManager = terminalRoomManager.getDebugInfo();
    
    res.json({
      success: true,
      data: debugInfo
    });
  } catch (error: any) {
    logger.error('[TerminalDebug] Error getting debug info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Test terminal streaming for a specific session
 */
export async function testTerminalStreaming(req: Request, res: Response) {
  try {
    const { sessionName, farmId } = req.body;
    
    if (!sessionName) {
      return res.status(400).json({
        success: false,
        error: 'sessionName is required'
      });
    }
    
    const testResults: any = {
      sessionName,
      farmId,
      timestamp: new Date(),
      tests: []
    };
    
    // Test 1: Session resolution
    const resolvedSession = await tmuxSessionResolver.resolveSession(sessionName, farmId);
    testResults.tests.push({
      name: 'Session Resolution',
      passed: resolvedSession !== sessionName,
      result: resolvedSession,
      message: resolvedSession !== sessionName 
        ? `Resolved to: ${resolvedSession}` 
        : 'Using original session name'
    });
    
    // Test 2: Session exists
    let sessionExists = false;
    try {
      await execAsync(`tmux has-session -t "${resolvedSession}" 2>/dev/null`);
      sessionExists = true;
    } catch {
      sessionExists = false;
    }
    
    testResults.tests.push({
      name: 'Session Exists',
      passed: sessionExists,
      result: sessionExists,
      message: sessionExists ? 'Session found in tmux' : 'Session not found in tmux'
    });
    
    // Test 3: Pane count
    if (sessionExists) {
      const paneCount = await tmuxSessionResolver.getPaneCount(resolvedSession);
      testResults.tests.push({
        name: 'Pane Count',
        passed: paneCount > 0,
        result: paneCount,
        message: `Found ${paneCount} pane(s)`
      });
      
      // Test 4: Pane targets
      const paneTargets: string[] = [];
      for (let i = 0; i < Math.min(paneCount, 3); i++) {
        const target = await tmuxSessionResolver.getPaneTarget(resolvedSession, i);
        const exists = await tmuxSessionResolver.verifyPaneExists(target);
        paneTargets.push(`${target} (${exists ? 'exists' : 'missing'})`);
      }
      
      testResults.tests.push({
        name: 'Pane Targets',
        passed: true,
        result: paneTargets,
        message: 'Pane target verification'
      });
    }
    
    // Test 5: Streaming status
    const streamingStatus = await terminalStreamService.getStreamingStatus(resolvedSession);
    testResults.tests.push({
      name: 'Streaming Status',
      passed: streamingStatus?.active || false,
      result: streamingStatus,
      message: streamingStatus?.active ? 'Streaming is active' : 'Streaming is not active'
    });
    
    // Test 6: WebSocket rooms
    if (websocketManager.io) {
      const rooms = Array.from(websocketManager.io.sockets.adapter.rooms.keys())
        .filter(r => r.includes(resolvedSession) || (farmId && r.includes(farmId)));
      
      testResults.tests.push({
        name: 'WebSocket Rooms',
        passed: rooms.length > 0,
        result: rooms,
        message: `Found ${rooms.length} matching room(s)`
      });
    }
    
    // Test 7: Send test message
    if (sessionExists && websocketManager.io) {
      try {
        const testMessage = `[DEBUG_TEST] Terminal test at ${new Date().toISOString()}`;
        await execAsync(`tmux send-keys -t "${resolvedSession}:0.0" "echo '${testMessage}'" Enter`);
        
        testResults.tests.push({
          name: 'Send Test Message',
          passed: true,
          result: testMessage,
          message: 'Test message sent to pane 0'
        });
      } catch (error: any) {
        testResults.tests.push({
          name: 'Send Test Message',
          passed: false,
          result: null,
          message: `Failed: ${error.message}`
        });
      }
    }
    
    // Calculate overall status
    const passedTests = testResults.tests.filter((t: any) => t.passed).length;
    const totalTests = testResults.tests.length;
    testResults.summary = {
      passed: passedTests,
      total: totalTests,
      percentage: Math.round((passedTests / totalTests) * 100),
      status: passedTests === totalTests ? 'healthy' : passedTests > totalTests / 2 ? 'degraded' : 'critical'
    };
    
    res.json({
      success: true,
      data: testResults
    });
  } catch (error: any) {
    logger.error('[TerminalDebug] Error testing terminal streaming:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Force restart terminal streaming for a session
 */
export async function restartTerminalStreaming(req: Request, res: Response) {
  try {
    const { sessionName, farmId, agentCount = 2 } = req.body;
    
    if (!sessionName) {
      return res.status(400).json({
        success: false,
        error: 'sessionName is required'
      });
    }
    
    // Stop existing streaming
    const resolvedSession = await tmuxSessionResolver.resolveSession(sessionName, farmId);
    await terminalStreamService.stopStreaming(resolvedSession);
    
    // Clear resolver cache
    tmuxSessionResolver.clearCache();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start streaming again
    await terminalStreamService.startStreaming(sessionName, farmId || sessionName, agentCount);
    
    res.json({
      success: true,
      message: `Restarted streaming for session: ${resolvedSession}`,
      data: {
        sessionName,
        resolvedSession,
        farmId,
        agentCount
      }
    });
  } catch (error: any) {
    logger.error('[TerminalDebug] Error restarting terminal streaming:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get live terminal output sample
 */
export async function getTerminalSample(req: Request, res: Response) {
  try {
    const { sessionName, agentId = 0, lines = 20 } = req.query;
    
    if (!sessionName) {
      return res.status(400).json({
        success: false,
        error: 'sessionName is required'
      });
    }
    
    const resolvedSession = await tmuxSessionResolver.resolveSession(sessionName as string);
    const paneTarget = await tmuxSessionResolver.getPaneTarget(resolvedSession, Number(agentId));
    
    // Capture pane content
    const { stdout } = await execAsync(
      `tmux capture-pane -t "${paneTarget}" -p -S -${lines} 2>/dev/null`
    );
    
    const outputLines = stdout.split('\n').filter(line => line.trim());
    
    res.json({
      success: true,
      data: {
        sessionName: sessionName as string,
        resolvedSession,
        paneTarget,
        agentId: Number(agentId),
        lines: outputLines.length,
        output: outputLines
      }
    });
  } catch (error: any) {
    logger.error('[TerminalDebug] Error getting terminal sample:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}