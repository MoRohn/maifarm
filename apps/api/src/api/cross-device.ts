/**
 * Cross-Device API Routes
 * Handles device registration, farm handoffs, and cross-device synchronization
 */

import { Router, Request, Response } from 'express';
import {
  crossDeviceSyncService,
  DeviceRegistrationRequest,
} from '../services/CrossDeviceSyncService';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

const router = Router();

// Middleware to ensure authentication
const requireAuth = (req: Request, res: Response, next: () => void) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
};

// =============================================================================
// DEVICE MANAGEMENT
// =============================================================================

/**
 * POST /api/cross-device/register
 * Register or update a device for the current user
 */
router.post('/register', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const request: DeviceRegistrationRequest = req.body;

    if (!request.deviceId || !request.deviceName || !request.deviceType) {
      return res.status(400).json({
        success: false,
        error: 'deviceId, deviceName, and deviceType are required',
      });
    }

    const device = await crossDeviceSyncService.registerDevice(userId, request);

    res.json({
      success: true,
      device,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Device registration failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/heartbeat
 * Update device online status
 */
router.post('/heartbeat', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    await crossDeviceSyncService.updateDeviceHeartbeat(userId, deviceId);

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/cross-device/devices
 * Get all registered devices for the current user
 */
router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const devices = await crossDeviceSyncService.getUserDevices(userId);

    res.json({
      success: true,
      devices,
      count: devices.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * PUT /api/cross-device/devices/:deviceId
 * Update device settings
 */
router.put('/devices/:deviceId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId } = req.params;

    const device = await crossDeviceSyncService.updateDeviceSettings(userId, deviceId, req.body);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({ success: true, device });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * DELETE /api/cross-device/devices/:deviceId
 * Remove a device
 */
router.delete('/devices/:deviceId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId } = req.params;

    const removed = await crossDeviceSyncService.removeDevice(userId, deviceId);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// =============================================================================
// PUSH NOTIFICATION TOKEN MANAGEMENT
// =============================================================================

/**
 * POST /api/cross-device/push-token
 * Register or update a device's push notification token
 */
router.post('/push-token', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId, pushToken, tokenType = 'apns' } = req.body;

    if (!deviceId || !pushToken) {
      return res.status(400).json({
        success: false,
        error: 'deviceId and pushToken are required',
      });
    }

    // Verify device belongs to user
    const deviceValid = await crossDeviceSyncService.verifyDeviceOwnership(userId, deviceId);
    if (!deviceValid) {
      return res.status(403).json({
        success: false,
        error: 'Device does not belong to user',
      });
    }

    // Import push notification service dynamically to avoid circular deps
    const { pushNotificationService } = await import('../services/pushNotificationService');
    await pushNotificationService.registerPushToken(userId, deviceId, pushToken, tokenType);

    logger.info(LogCategory.API, 'Push token registered', {
      userId,
      deviceId: deviceId.substring(0, 8) + '...',
      tokenType,
    });

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Push token registration failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * DELETE /api/cross-device/push-token
 * Remove a device's push notification token
 */
router.delete('/push-token', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    // Support both query param and body for iOS compatibility
    const deviceId = (req.query.deviceId as string) || req.body?.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required (query param or body)',
      });
    }

    // Verify device belongs to user
    const deviceValid = await crossDeviceSyncService.verifyDeviceOwnership(userId, deviceId);
    if (!deviceValid) {
      return res.status(403).json({
        success: false,
        error: 'Device does not belong to user',
      });
    }

    const { pushNotificationService } = await import('../services/pushNotificationService');
    await pushNotificationService.unregisterPushToken(userId, deviceId);

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/cross-device/notifications
 * Get pending notifications for a device
 */
router.get('/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId, markDelivered = 'true', unreadOnly = 'true' } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required',
      });
    }

    // Verify device belongs to user
    const deviceValid = await crossDeviceSyncService.verifyDeviceOwnership(userId, deviceId as string);
    if (!deviceValid) {
      return res.status(403).json({
        success: false,
        error: 'Device does not belong to user',
      });
    }

    // Get notifications from database
    let query = `
      SELECT id, notification_type, payload, priority, delivered, delivered_at,
             read, read_at, created_at, expires_at
      FROM device_notifications
      WHERE user_id = $1
        AND (target_device_id = $2 OR target_device_id IS NULL)
        AND expires_at > NOW()
    `;
    const params: any[] = [userId, deviceId];

    if (unreadOnly === 'true') {
      query += ` AND read = FALSE`;
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await db.query(query, params);
    const notifications = result.rows;

    // Mark as delivered if requested
    if (markDelivered === 'true' && notifications.length > 0) {
      const notificationIds = notifications.filter((n: any) => !n.delivered).map((n: any) => n.id);
      if (notificationIds.length > 0) {
        await db.query(
          `UPDATE device_notifications
           SET delivered = TRUE, delivered_at = NOW()
           WHERE id = ANY($1)`,
          [notificationIds]
        );
      }
    }

    res.json({
      success: true,
      notifications: notifications.map((n: any) => ({
        id: n.id,
        type: n.notification_type,
        payload: n.payload,
        priority: n.priority,
        delivered: n.delivered,
        deliveredAt: n.delivered_at,
        read: n.read,
        readAt: n.read_at,
        createdAt: n.created_at,
        expiresAt: n.expires_at,
      })),
      count: notifications.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/notifications/read
 * Mark notifications as read
 */
router.post('/notifications/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'notificationIds array is required',
      });
    }

    await db.query(
      `UPDATE device_notifications
       SET read = TRUE, read_at = NOW()
       WHERE id = ANY($1) AND user_id = $2`,
      [notificationIds, userId]
    );

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// =============================================================================
// DEVICE SELECTION FOR FARM CREATION
// =============================================================================

/**
 * GET /api/cross-device/execution-devices
 * Get devices available to execute a new farm (for farm creation)
 * Returns devices that can run farms, prioritizing workstation > performance > standard
 */
router.get('/execution-devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { minAgents, minDuration, preferLocal } = req.query;

    const devices = await crossDeviceSyncService.getUserDevices(userId);

    // Filter and sort devices for farm execution
    let eligibleDevices = devices.filter((d) => {
      if (minAgents && d.maxAgents < Number(minAgents)) return false;
      if (minDuration && d.maxFarmDurationMinutes < Number(minDuration)) return false;
      return true;
    });

    // Sort by capability (workstation > performance > standard > limited)
    const tierOrder = ['workstation', 'performance', 'standard', 'limited'];
    eligibleDevices.sort((a, b) => {
      const aOrder = tierOrder.indexOf(a.computeTier);
      const bOrder = tierOrder.indexOf(b.computeTier);

      // Prefer local models if requested
      if (preferLocal === 'true') {
        if (a.supportsLocalModels && !b.supportsLocalModels) return -1;
        if (!a.supportsLocalModels && b.supportsLocalModels) return 1;
      }

      // Then by compute tier
      if (aOrder !== bOrder) return aOrder - bOrder;

      // Then by online status
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;

      // Finally by last seen
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });

    res.json({
      success: true,
      devices: eligibleDevices.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        computeTier: d.computeTier,
        isOnline: d.isOnline,
        lastSeenAt: d.lastSeenAt,
        supportsLocalModels: d.supportsLocalModels,
        maxAgents: d.maxAgents,
        maxFarmDurationMinutes: d.maxFarmDurationMinutes,
        isCurrentDevice: (req as any).deviceId === d.deviceId,
      })),
      count: eligibleDevices.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// =============================================================================
// FARM HANDOFF
// =============================================================================

/**
 * GET /api/cross-device/handoff/eligible-devices
 * Get devices eligible to receive a farm handoff
 */
router.get('/handoff/eligible-devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { sourceDeviceId, minComputeTier, farmId } = req.query;

    if (!sourceDeviceId) {
      return res.status(400).json({ success: false, error: 'sourceDeviceId is required' });
    }

    // If farmId is provided, check farm requirements
    let requiredTier = (minComputeTier as string) || 'standard';
    let farmAgents = 0;

    if (farmId) {
      const farmResult = await db.query(
        `SELECT provider, jsonb_array_length(COALESCE(agents, '[]'::jsonb)) as agent_count
         FROM farms WHERE id = $1 AND user_id = $2`,
        [farmId, userId]
      );

      if (farmResult.rows[0]) {
        farmAgents = farmResult.rows[0].agent_count || 0;

        // Require higher tier for more agents
        if (farmAgents >= 8) requiredTier = 'workstation';
        else if (farmAgents >= 5) requiredTier = 'performance';
      }
    }

    const eligibleDevices = await crossDeviceSyncService.getHandoffEligibleDevices(
      userId,
      sourceDeviceId as string,
      requiredTier
    );

    // Filter by agent capacity if needed
    const filteredDevices = farmAgents > 0
      ? eligibleDevices.filter((d) => d.maxAgents >= farmAgents)
      : eligibleDevices;

    res.json({
      success: true,
      devices: filteredDevices,
      count: filteredDevices.length,
      requirements: {
        minComputeTier: requiredTier,
        minAgents: farmAgents,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/handoff/request
 * Request a farm handoff to another device
 * Available for running/active farms or during farm creation
 */
router.post('/handoff/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { farmId, sourceDeviceId, targetDeviceId, handoffType, reason } = req.body;

    if (!farmId || !sourceDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'farmId and sourceDeviceId are required',
      });
    }

    // Verify farm exists and is in a transferable state
    const farmResult = await db.query(
      `SELECT id, name, status, provider FROM farms WHERE id = $1 AND user_id = $2`,
      [farmId, userId]
    );

    if (!farmResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Farm not found' });
    }

    const farm = farmResult.rows[0];
    const transferableStatuses = ['running', 'active', 'launching', 'idle'];

    if (!transferableStatuses.includes(farm.status)) {
      return res.status(400).json({
        success: false,
        error: `Farm cannot be transferred in ${farm.status} status. Farm must be running, active, launching, or idle.`,
      });
    }

    const request = await crossDeviceSyncService.requestFarmHandoff(
      userId,
      farmId,
      sourceDeviceId,
      targetDeviceId || null,
      handoffType || 'transfer',
      reason
    );

    res.json({
      success: true,
      request,
      message: targetDeviceId
        ? `Handoff request sent to target device. Waiting for acceptance.`
        : `Broadcast handoff request created. Any eligible device can accept.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Handoff request failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/cross-device/handoff/pending
 * Get pending handoff requests for the current device
 */
router.get('/handoff/pending', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const requests = await crossDeviceSyncService.getPendingHandoffRequests(userId, deviceId as string);

    res.json({
      success: true,
      requests,
      count: requests.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/handoff/:requestId/accept
 * Accept a handoff request
 */
router.post('/handoff/:requestId/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { requestId } = req.params;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    // Verify the handoff request belongs to this user
    const request = await crossDeviceSyncService.getHandoffRequest(requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    if (request.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to accept this request' });
    }

    // Verify accepting device belongs to user
    const deviceValid = await crossDeviceSyncService.verifyDeviceOwnership(userId, deviceId);
    if (!deviceValid) {
      return res.status(403).json({ success: false, error: 'Device does not belong to user' });
    }

    const result = await crossDeviceSyncService.acceptHandoffRequest(requestId, deviceId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      farmState: result.farmState,
      message: 'Handoff accepted. You can now manage this farm.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/handoff/:requestId/cancel
 * Cancel a pending handoff request
 */
router.post('/handoff/:requestId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { requestId } = req.params;

    const cancelled = await crossDeviceSyncService.cancelHandoffRequest(requestId, userId);

    if (!cancelled) {
      return res.status(404).json({ success: false, error: 'Request not found or already processed' });
    }

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/handoff/:requestId/complete
 * Mark a handoff as completed (called after successful transfer)
 */
router.post('/handoff/:requestId/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { requestId } = req.params;

    // Verify the handoff request belongs to this user
    const request = await crossDeviceSyncService.getHandoffRequest(requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    if (request.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to complete this request' });
    }

    // Verify request is in accepted status
    if (request.status !== 'accepted' && request.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: `Cannot complete request in ${request.status} status`,
      });
    }

    await crossDeviceSyncService.completeHandoff(requestId);

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/cross-device/handoff/:requestId
 * Get handoff request details
 */
router.get('/handoff/:requestId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { requestId } = req.params;

    const request = await crossDeviceSyncService.getHandoffRequest(requestId);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Only allow user to see their own requests
    if (request.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this request' });
    }

    res.json({ success: true, request });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * GET /api/cross-device/notifications
 * Get undelivered notifications for the current device
 */
router.get('/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deviceId, markDelivered } = req.query;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const notifications = await crossDeviceSyncService.getUndeliveredNotifications(userId, deviceId as string);

    // Optionally mark as delivered
    if (markDelivered === 'true' && notifications.length > 0) {
      await crossDeviceSyncService.markNotificationsDelivered(notifications.map((n) => n.id));
    }

    res.json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/cross-device/notifications/read
 * Mark notifications as read
 */
router.post('/notifications/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({ success: false, error: 'notificationIds array is required' });
    }

    await crossDeviceSyncService.markNotificationsRead(notificationIds);

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// =============================================================================
// FARM SUBSCRIPTIONS
// =============================================================================

/**
 * POST /api/cross-device/farms/:farmId/subscribe
 * Subscribe a device to farm updates
 */
router.post('/farms/:farmId/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { farmId } = req.params;
    const { deviceId, subscriptionType } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    // Verify farm belongs to user
    const farmResult = await db.query(
      `SELECT id FROM farms WHERE id = $1 AND user_id = $2`,
      [farmId, userId]
    );
    if (!farmResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Farm not found' });
    }

    // Verify device belongs to user
    const deviceValid = await crossDeviceSyncService.verifyDeviceOwnership(userId, deviceId);
    if (!deviceValid) {
      return res.status(403).json({ success: false, error: 'Device does not belong to user' });
    }

    // Validate subscription type
    const validTypes = ['owner', 'monitor', 'read_only'];
    const type = validTypes.includes(subscriptionType) ? subscriptionType : 'monitor';

    await crossDeviceSyncService.subscribeFarmUpdates(
      userId,
      deviceId,
      farmId,
      type
    );

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * DELETE /api/cross-device/farms/:farmId/subscribe
 * Unsubscribe a device from farm updates
 */
router.delete('/farms/:farmId/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { farmId } = req.params;
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    await crossDeviceSyncService.unsubscribeFarmUpdates(userId, deviceId as string, farmId);

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/cross-device/farms/:farmId/subscribers
 * Get all devices subscribed to a farm
 */
router.get('/farms/:farmId/subscribers', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { farmId } = req.params;

    const subscribers = await crossDeviceSyncService.getFarmSubscribers(userId, farmId);

    res.json({
      success: true,
      subscribers,
      count: subscribers.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
