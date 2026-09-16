/**
 * Thermal WebSocket Handlers
 *
 * Handles real-time thermal monitoring events over WebSocket.
 * Broadcasts thermal updates, alerts, and farm actions to connected clients.
 */

import { Server, Socket } from 'socket.io';
import { logger, LogCategory } from '../utils/logger';
import {
  thermalMonitoringService,
  ThermalMetrics,
  ThermalAlert,
  ThermalAction,
  ThermalPressureLevel,
  THERMAL_PRESSURE_LABELS
} from '../services/ThermalMonitoringService';

interface ThermalUpdatePayload {
  type: 'thermal:update';
  data: ThermalMetrics;
  timestamp: Date;
}

interface ThermalAlertPayload {
  type: 'thermal:alert';
  data: ThermalAlert;
  timestamp: Date;
}

interface ThermalActionPayload {
  type: 'thermal:action';
  data: {
    action: ThermalAction;
    pressureLevel: ThermalPressureLevel;
    farmId?: string;
    pausedFarms?: string[];
    timestamp: Date;
  };
}

/**
 * Initialize thermal WebSocket handlers
 */
export function initializeThermalHandlers(io: Server): void {
  const thermalNamespace = io.of('/thermal');

  // Handle thermal namespace connections
  thermalNamespace.on('connection', (socket: Socket) => {
    logger.info(LogCategory.THERMAL, 'Client connected to thermal namespace', {
      socketId: socket.id
    });

    // Join thermal updates room
    socket.join('thermal-updates');

    // Send current metrics on connection
    const currentMetrics = thermalMonitoringService.getCurrentMetrics();
    if (currentMetrics) {
      socket.emit('thermal:current', {
        type: 'thermal:current',
        data: currentMetrics,
        canLaunchFarm: thermalMonitoringService.canLaunchFarm(),
        thresholds: thermalMonitoringService.getThresholds()
      });
    }

    // Send active alerts
    const activeAlerts = thermalMonitoringService.getActiveAlerts();
    if (activeAlerts.length > 0) {
      socket.emit('thermal:alerts', {
        type: 'thermal:alerts',
        data: activeAlerts
      });
    }

    // Handle request for history
    socket.on('thermal:get-history', (data: { limit?: number }) => {
      const limit = Math.min(data?.limit || 100, 500);
      const history = thermalMonitoringService.getHistory(limit);
      socket.emit('thermal:history', {
        type: 'thermal:history',
        data: history
      });
    });

    // Handle alert acknowledgment
    socket.on('thermal:acknowledge-alert', (data: { alertId: string }) => {
      const acknowledged = thermalMonitoringService.acknowledgeAlert(data.alertId);
      socket.emit('thermal:alert-acknowledged', {
        alertId: data.alertId,
        success: acknowledged
      });
    });

    // Handle threshold update request
    socket.on('thermal:update-thresholds', async (data: any) => {
      try {
        await thermalMonitoringService.setThresholds(data);
        socket.emit('thermal:thresholds-updated', {
          success: true,
          thresholds: thermalMonitoringService.getThresholds()
        });
        // Broadcast to all clients
        thermalNamespace.emit('thermal:thresholds-changed', {
          thresholds: thermalMonitoringService.getThresholds()
        });
      } catch (error) {
        socket.emit('thermal:thresholds-updated', {
          success: false,
          error: 'Failed to update thresholds'
        });
      }
    });

    socket.on('disconnect', () => {
      logger.debug(LogCategory.THERMAL, 'Client disconnected from thermal namespace', {
        socketId: socket.id
      });
    });
  });

  // Also handle thermal events on main namespace for clients not on /thermal
  io.on('connection', (socket: Socket) => {
    // Allow clients to subscribe to thermal updates
    socket.on('thermal:subscribe', () => {
      socket.join('thermal-subscribers');
      logger.debug(LogCategory.THERMAL, 'Client subscribed to thermal updates', {
        socketId: socket.id
      });

      // Send current state
      const currentMetrics = thermalMonitoringService.getCurrentMetrics();
      if (currentMetrics) {
        socket.emit('thermal:update', {
          type: 'thermal:update',
          data: currentMetrics,
          timestamp: new Date()
        });
      }
    });

    socket.on('thermal:unsubscribe', () => {
      socket.leave('thermal-subscribers');
    });
  });

  // Set up event listeners on thermal monitoring service
  setupServiceEventListeners(io, thermalNamespace);

  logger.info(LogCategory.THERMAL, 'Thermal WebSocket handlers initialized');
}

/**
 * Set up listeners for thermal monitoring service events
 */
function setupServiceEventListeners(io: Server, thermalNamespace: any): void {
  // Handle thermal metrics update
  thermalMonitoringService.on('thermal:update', (metrics: ThermalMetrics) => {
    const payload: ThermalUpdatePayload = {
      type: 'thermal:update',
      data: metrics,
      timestamp: new Date()
    };

    // Broadcast to thermal namespace
    thermalNamespace.to('thermal-updates').emit('thermal:update', payload);

    // Broadcast to main namespace subscribers
    io.to('thermal-subscribers').emit('thermal:update', payload);

    // Also emit to analytics room for dashboard integration
    io.to('analytics').emit('thermal:metrics', {
      ...payload,
      pressureLabel: metrics.pressureLabel,
      isThrottling: metrics.isThrottling
    });
  });

  // Handle thermal alerts
  thermalMonitoringService.on('thermal:alert', (alert: ThermalAlert) => {
    const payload: ThermalAlertPayload = {
      type: 'thermal:alert',
      data: alert,
      timestamp: new Date()
    };

    // Broadcast to all connected clients - alerts are important
    thermalNamespace.emit('thermal:alert', payload);
    io.emit('thermal:alert', payload);

    // Also emit as a notification for toast/banner display
    io.emit('notification', {
      type: 'thermal',
      severity: alert.severity,
      title: 'Thermal Alert',
      message: alert.message,
      timestamp: new Date(),
      action: alert.action
    });

    logger.info(LogCategory.THERMAL, 'Thermal alert broadcast to clients', {
      alertId: alert.id,
      severity: alert.severity
    });
  });

  // Handle thermal actions (pause/resume farms)
  thermalMonitoringService.on('thermal:action', (actionData: {
    action: ThermalAction;
    pressureLevel: ThermalPressureLevel;
    farmId?: string;
    pausedFarms?: string[];
    timestamp: Date;
  }) => {
    const payload: ThermalActionPayload = {
      type: 'thermal:action',
      data: actionData,
      timestamp: new Date()
    };

    // Broadcast to all clients
    thermalNamespace.emit('thermal:action', payload);
    io.emit('thermal:action', payload);

    // If farms were paused/resumed, also emit farm status updates
    if (actionData.action === ThermalAction.PAUSE_ALL_FARMS && actionData.pausedFarms) {
      for (const farmId of actionData.pausedFarms) {
        io.emit('farm:status', {
          farmId,
          status: 'paused',
          reason: 'thermal_protection',
          pressureLevel: THERMAL_PRESSURE_LABELS[actionData.pressureLevel]
        });
      }
    }

    if (actionData.action === ThermalAction.RESUME_FARM && actionData.farmId) {
      io.emit('farm:status', {
        farmId: actionData.farmId,
        status: 'running',
        reason: 'thermal_recovery'
      });
    }

    if (actionData.action === ThermalAction.EMERGENCY_STOP) {
      // Broadcast emergency notification
      io.emit('notification', {
        type: 'thermal-emergency',
        severity: 'emergency',
        title: 'EMERGENCY: Thermal Protection',
        message: 'All farming operations have been stopped due to critical thermal conditions',
        timestamp: new Date(),
        persistent: true
      });
    }
  });
}

/**
 * Broadcast thermal status to a specific client
 */
export function sendThermalStatusToClient(socket: Socket): void {
  const currentMetrics = thermalMonitoringService.getCurrentMetrics();
  const activeAlerts = thermalMonitoringService.getActiveAlerts();
  const thresholds = thermalMonitoringService.getThresholds();

  socket.emit('thermal:status', {
    metrics: currentMetrics,
    alerts: activeAlerts,
    thresholds,
    canLaunchFarm: thermalMonitoringService.canLaunchFarm()
  });
}

/**
 * Get thermal monitoring status summary for API responses
 */
export function getThermalStatusSummary(): {
  isHealthy: boolean;
  pressureLevel: string;
  isThrottling: boolean;
  canLaunchFarm: boolean;
  activeAlertCount: number;
} {
  const metrics = thermalMonitoringService.getCurrentMetrics();
  const alerts = thermalMonitoringService.getActiveAlerts();
  const canLaunch = thermalMonitoringService.canLaunchFarm();

  return {
    isHealthy: metrics ? metrics.pressureLevel <= ThermalPressureLevel.MODERATE : true,
    pressureLevel: metrics?.pressureLabel || 'unknown',
    isThrottling: metrics?.isThrottling || false,
    canLaunchFarm: canLaunch.allowed,
    activeAlertCount: alerts.length
  };
}
