import { Router, Request, Response } from 'express';
import { reliabilityManager } from '../websocket/reliabilityManager';
import { WebSocketServer } from '../websocket/socketServer';

const router = Router();

// GET /api/websocket/health - Get WebSocket health status
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check if getStatistics method exists, otherwise use fallback
    const stats = reliabilityManager.getStatistics ? 
      reliabilityManager.getStatistics() : 
      {
        totalConnections: 0,
        averageReliability: 100,
        connections: [],
        messageQueue: { size: 0, messages: [] },
        performanceMetrics: { messageRate: 0, latency: 0 }
      };
    const wsServer = (req.app.locals.wsServer as WebSocketServer);
    const connectionStats = wsServer?.getConnectionStats() || {
      totalConnections: 0,
      farmSubscriptions: [],
      agentSubscriptions: []
    };

    // Calculate overall health score
    const healthScore = calculateHealthScore(stats, connectionStats);

    res.json({
      status: getHealthStatus(healthScore),
      score: healthScore,
      timestamp: new Date(),
      connections: {
        active: stats.totalConnections,
        reliability: stats.averageReliability,
        details: stats.connections
      },
      messaging: {
        queued: stats.queuedMessages,
        pendingAcks: stats.pendingAcknowledgments
      },
      subscriptions: {
        farms: connectionStats.farmSubscriptions,
        agents: connectionStats.agentSubscriptions
      },
      recommendations: getRecommendations(healthScore, stats)
    });
  } catch (error) {
    console.error('Failed to get WebSocket health:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve WebSocket health status'
    });
  }
});

// GET /api/websocket/connections - Get detailed connection information
router.get('/connections', async (req: Request, res: Response) => {
  try {
    const health = reliabilityManager.getAllConnectionHealth();
    const connections = Array.from(health.entries()).map(([id, data]) => ({
      id,
      ...data,
      status: getConnectionStatus(data)
    }));

    res.json({
      total: connections.length,
      connections,
      summary: {
        connected: connections.filter(c => c.connected).length,
        disconnected: connections.filter(c => !c.connected).length,
        avgLatency: Math.round(
          connections.reduce((sum, c) => sum + c.latency, 0) / connections.length || 0
        ),
        avgReliability: Math.round(
          connections.reduce((sum, c) => sum + c.reliability, 0) / connections.length || 0
        )
      }
    });
  } catch (error) {
    console.error('Failed to get connection details:', error);
    res.status(500).json({
      error: 'Failed to retrieve connection details'
    });
  }
});

// GET /api/websocket/connection/:id - Get specific connection health
router.get('/connection/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const health = reliabilityManager.getConnectionHealth(id);

    if (!health) {
      return res.status(404).json({
        error: 'Connection not found'
      });
    }

    res.json({
      id,
      ...health,
      status: getConnectionStatus(health)
    });
  } catch (error) {
    console.error('Failed to get connection health:', error);
    res.status(500).json({
      error: 'Failed to retrieve connection health'
    });
  }
});

// POST /api/websocket/prune - Prune old messages from queue
router.post('/prune', async (req: Request, res: Response) => {
  try {
    const { maxAge = 300000 } = req.body; // Default 5 minutes
    const pruned = reliabilityManager.pruneMessageQueue(maxAge);

    res.json({
      success: true,
      pruned,
      message: `Pruned ${pruned} old messages from queue`
    });
  } catch (error) {
    console.error('Failed to prune message queue:', error);
    res.status(500).json({
      error: 'Failed to prune message queue'
    });
  }
});

// GET /api/websocket/test - Test WebSocket connectivity
router.get('/test', async (req: Request, res: Response) => {
  try {
    const wsServer = (req.app.locals.wsServer as WebSocketServer);
    
    if (!wsServer) {
      return res.status(503).json({
        status: 'unavailable',
        error: 'WebSocket server not initialized'
      });
    }

    // Send a test broadcast
    const testId = `test_${Date.now()}`;
    wsServer.broadcast('connection:test', {
      id: testId,
      timestamp: new Date(),
      type: 'health_check'
    });

    res.json({
      status: 'ok',
      testId,
      message: 'Test broadcast sent successfully'
    });
  } catch (error) {
    console.error('WebSocket test failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'WebSocket test failed'
    });
  }
});

// Helper functions
function calculateHealthScore(stats: any, connectionStats: any): number {
  let score = 100;

  // Reduce score based on queued messages
  if (stats.queuedMessages > 10) score -= 10;
  if (stats.queuedMessages > 50) score -= 20;
  if (stats.queuedMessages > 100) score -= 30;

  // Reduce score based on pending acknowledgments
  if (stats.pendingAcknowledgments > 5) score -= 10;
  if (stats.pendingAcknowledgments > 20) score -= 20;

  // Reduce score based on average reliability
  score = Math.min(score, stats.averageReliability || 100);

  // Bonus points for active connections
  if (stats.totalConnections > 0) score = Math.min(100, score + 5);

  return Math.max(0, Math.round(score));
}

function getHealthStatus(score: number): string {
  if (score >= 90) return 'healthy';
  if (score >= 70) return 'degraded';
  if (score >= 50) return 'warning';
  return 'critical';
}

function getConnectionStatus(health: any): string {
  if (!health.connected) return 'disconnected';
  if (health.reliability >= 90) return 'excellent';
  if (health.reliability >= 70) return 'good';
  if (health.reliability >= 50) return 'fair';
  return 'poor';
}

function getRecommendations(score: number, stats: any): string[] {
  const recommendations: string[] = [];

  if (score < 90) {
    if (stats.queuedMessages > 50) {
      recommendations.push('High message queue size detected. Consider pruning old messages.');
    }
    if (stats.pendingAcknowledgments > 10) {
      recommendations.push('Many unacknowledged messages. Check client acknowledgment implementation.');
    }
    if (stats.averageReliability < 80) {
      recommendations.push('Low average connection reliability. Investigate network issues.');
    }
    if (stats.totalConnections === 0) {
      recommendations.push('No active connections. Check WebSocket server status.');
    }
  }

  if (recommendations.length === 0 && score === 100) {
    recommendations.push('WebSocket service is operating optimally.');
  }

  return recommendations;
}

export default router;