import { Router } from 'express';
import type { WebSocketServer } from '../websocket/socketServer';
import { reliabilityManager } from '../websocket/reliabilityManager';

const router = Router();

// Get WebSocket health status
router.get('/health', (req, res) => {
  try {
    const wsServer = (req.app.locals.wsServer as WebSocketServer);
    const connectionStats = wsServer?.getConnectionStats() || {
      totalConnections: 0,
      farmSubscriptions: [],
      agentSubscriptions: []
    };

    const reliabilityMetrics = reliabilityManager.getMetrics();
    const connectionHealth = reliabilityManager.getHealthStatus();

    res.json({
      status: 'healthy',
      timestamp: new Date(),
      connections: {
        total: connectionStats.totalConnections,
        healthy: reliabilityMetrics.healthyConnections,
        degraded: connectionHealth.filter(h => h.latency > 200).length
      },
      reliability: {
        totalMessages: reliabilityMetrics.totalMessages,
        unacknowledged: reliabilityMetrics.unacknowledged,
        failedMessages: reliabilityMetrics.failedMessages
      },
      subscriptions: {
        farms: connectionStats.farmSubscriptions.length,
        agents: connectionStats.agentSubscriptions.length
      },
      clients: connectionHealth.map(h => ({
        socketId: h.socketId,
        connected: h.connected,
        latency: h.latency,
        missedPings: h.missedPings,
        queueSize: h.messageQueueSize
      }))
    });
  } catch (error) {
    console.error('Failed to get WebSocket health:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve WebSocket health',
      timestamp: new Date()
    });
  }
});

// Get detailed connection metrics
router.get('/metrics', (req, res) => {
  try {
    const wsServer = (req.app.locals.wsServer as WebSocketServer);
    const connectionStats = wsServer?.getConnectionStats() || {
      totalConnections: 0,
      farmSubscriptions: [],
      agentSubscriptions: []
    };

    const reliabilityMetrics = reliabilityManager.getMetrics();
    const connectionHealth = reliabilityManager.getHealthStatus();

    // Calculate averages
    const avgLatency = connectionHealth.length > 0
      ? connectionHealth.reduce((sum, h) => sum + h.latency, 0) / connectionHealth.length
      : 0;

    const connectedCount = connectionHealth.filter(h => h.connected).length;
    const disconnectedCount = connectionHealth.filter(h => !h.connected).length;

    res.json({
      timestamp: new Date(),
      summary: {
        totalClients: connectionHealth.length,
        connected: connectedCount,
        disconnected: disconnectedCount,
        averageLatency: Math.round(avgLatency),
        healthScore: reliabilityMetrics.healthyConnections / Math.max(1, connectedCount) * 100
      },
      messages: {
        total: reliabilityMetrics.totalMessages,
        pending: reliabilityMetrics.unacknowledged,
        failed: reliabilityMetrics.failedMessages,
        successRate: ((reliabilityMetrics.totalMessages - reliabilityMetrics.failedMessages) / Math.max(1, reliabilityMetrics.totalMessages) * 100).toFixed(2)
      },
      subscriptions: connectionStats,
      latencyDistribution: {
        excellent: connectionHealth.filter(h => h.latency < 50).length,
        good: connectionHealth.filter(h => h.latency >= 50 && h.latency < 150).length,
        fair: connectionHealth.filter(h => h.latency >= 150 && h.latency < 300).length,
        poor: connectionHealth.filter(h => h.latency >= 300).length
      }
    });
  } catch (error) {
    console.error('Failed to get WebSocket metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve WebSocket metrics',
      timestamp: new Date()
    });
  }
});

// Force reconnect for a specific client
router.post('/reconnect/:socketId', (req, res) => {
  try {
    const { socketId } = req.params;
    const wsServer = (req.app.locals.wsServer as WebSocketServer);
    
    // Send reconnect command to specific client
    wsServer?.broadcast('reconnect:request', { socketId, reason: 'admin_request' });
    
    res.json({
      success: true,
      message: `Reconnect request sent to client ${socketId}`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to send reconnect request:', error);
    res.status(500).json({
      error: 'Failed to send reconnect request',
      timestamp: new Date()
    });
  }
});

// Clear message queue for a client
router.delete('/queue/:socketId', (req, res) => {
  try {
    const { socketId } = req.params;
    reliabilityManager.clearSocketQueue(socketId);
    
    res.json({
      success: true,
      message: `Queue cleared for client ${socketId}`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to clear queue:', error);
    res.status(500).json({
      error: 'Failed to clear message queue',
      timestamp: new Date()
    });
  }
});

export default router;