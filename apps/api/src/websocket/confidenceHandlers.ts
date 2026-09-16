/**
 * Confidence WebSocket Handlers
 *
 * Integrates ConfidenceCoordinationReader with the WebSocket manager
 * to broadcast real-time confidence updates to the dashboard.
 */

import { Socket } from 'socket.io';
import { logger, LogCategory } from '../utils/logger';
import { confidenceCoordinationReader } from '../services/ConfidenceCoordinationReader';
import { unifiedWebSocketManager } from './UnifiedWebSocketManager';
import { ConfidenceUpdateEvent, FarmConfidenceSummary } from '../types/plugins';

/**
 * Initialize confidence WebSocket handlers
 */
export function initializeConfidenceHandlers(): void {
  // Listen for confidence updates from the coordination reader
  confidenceCoordinationReader.on('confidence:update', (event: ConfidenceUpdateEvent) => {
    handleConfidenceUpdate(event);
  });

  logger.info(LogCategory.WEBSOCKET, 'Confidence WebSocket handlers initialized');
}

/**
 * Handle confidence update event and broadcast to clients
 */
function handleConfidenceUpdate(event: ConfidenceUpdateEvent): void {
  try {
    // Broadcast to farm-specific room
    unifiedWebSocketManager.broadcastToFarm(
      event.farmId,
      'farm:confidence:update',
      event
    );

    // Also broadcast globally for dashboard overview
    unifiedWebSocketManager.broadcast('confidence:update', {
      farmId: event.farmId,
      averageScore: event.aggregate.averageScore,
      trend: event.aggregate.trend,
      agentCount: event.agents.length,
      timestamp: event.timestamp
    });

    logger.debug(
      LogCategory.WEBSOCKET,
      `Broadcast confidence update for farm ${event.farmId}: avg=${event.aggregate.averageScore.toFixed(1)}%`
    );
  } catch (error) {
    logger.error(LogCategory.WEBSOCKET, 'Failed to broadcast confidence update:', error);
  }
}

/**
 * Register socket handlers for confidence-related events
 */
export function registerConfidenceSocketHandlers(socket: Socket): void {
  // Client subscribes to confidence updates for a specific farm
  socket.on('confidence:subscribe', async (data: { farmId: string }) => {
    try {
      const { farmId } = data;

      // Join the farm room to receive updates
      socket.join(`farm:${farmId}`);

      // Start monitoring if not already
      await confidenceCoordinationReader.startMonitoring(farmId);

      // Send current confidence data if available
      const currentData = confidenceCoordinationReader.getConfidenceSummary(farmId);
      if (currentData) {
        socket.emit('confidence:current', {
          farmId,
          ...formatConfidenceData(currentData)
        });
      }

      logger.debug(LogCategory.WEBSOCKET, `Socket ${socket.id} subscribed to confidence for farm ${farmId}`);
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Error subscribing to confidence:', error);
      socket.emit('confidence:error', { message: 'Failed to subscribe to confidence updates' });
    }
  });

  // Client unsubscribes from confidence updates
  socket.on('confidence:unsubscribe', (data: { farmId: string }) => {
    const { farmId } = data;
    socket.leave(`farm:${farmId}`);
    logger.debug(LogCategory.WEBSOCKET, `Socket ${socket.id} unsubscribed from confidence for farm ${farmId}`);
  });

  // Client requests current confidence data
  socket.on('confidence:get', (data: { farmId: string }, callback?: (response: any) => void) => {
    const { farmId } = data;
    const currentData = confidenceCoordinationReader.getConfidenceSummary(farmId);

    const response = currentData
      ? { success: true, data: formatConfidenceData(currentData) }
      : { success: false, error: 'No confidence data available' };

    if (callback) {
      callback(response);
    } else {
      socket.emit('confidence:data', response);
    }
  });

  // Client requests all farms' confidence data
  socket.on('confidence:getAll', (callback?: (response: any) => void) => {
    const allData = confidenceCoordinationReader.getAllConfidenceData();
    const formatted: Record<string, any> = {};

    for (const [farmId, data] of allData) {
      formatted[farmId] = formatConfidenceData(data);
    }

    const response = { success: true, data: formatted };

    if (callback) {
      callback(response);
    } else {
      socket.emit('confidence:allData', response);
    }
  });
}

/**
 * Format confidence data for client consumption
 */
function formatConfidenceData(summary: FarmConfidenceSummary): any {
  return {
    farmId: summary.farmId,
    agents: Object.values(summary.agents).map(a => ({
      id: a.agentId,
      name: a.agentName,
      score: a.score,
      level: a.level,
      shouldAutoContinue: a.shouldAutoContinue,
      timestamp: a.timestamp
    })),
    aggregate: {
      average: summary.averageScore,
      min: summary.minScore,
      max: summary.maxScore,
      level: summary.overallLevel,
      trend: summary.trend
    },
    updatedAt: summary.updatedAt
  };
}

/**
 * Start confidence monitoring for a farm (called from farm launch)
 */
export async function startConfidenceMonitoringForFarm(farmId: string): Promise<void> {
  await confidenceCoordinationReader.startMonitoring(farmId);
  logger.info(LogCategory.WEBSOCKET, `Started confidence monitoring for farm ${farmId}`);
}

/**
 * Stop confidence monitoring for a farm (called from farm shutdown)
 */
export function stopConfidenceMonitoringForFarm(farmId: string): void {
  confidenceCoordinationReader.stopMonitoring(farmId);
  logger.info(LogCategory.WEBSOCKET, `Stopped confidence monitoring for farm ${farmId}`);
}

/**
 * Shutdown all confidence handlers
 */
export function shutdownConfidenceHandlers(): void {
  confidenceCoordinationReader.shutdown();
  logger.info(LogCategory.WEBSOCKET, 'Confidence handlers shutdown complete');
}
