/**
 * Cross-Device Sync Service
 * Manages device registration, farm handoffs, and cross-device state synchronization
 * for the iMac/iOS ecosystem
 */

import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface UserDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'iphone' | 'ipad' | 'mac' | 'web';
  platform: string;
  osVersion?: string;
  appVersion?: string;
  computeTier: 'limited' | 'standard' | 'performance' | 'workstation';
  supportsLocalModels: boolean;
  supportsBackgroundExecution: boolean;
  maxAgents: number;
  maxFarmDurationMinutes: number;
  pushToken?: string;
  pushTokenType?: 'apns' | 'fcm';
  isOnline: boolean;
  lastSeenAt: Date;
  lastHeartbeatAt?: Date;
  isPrimaryDevice: boolean;
  acceptHandoffs: boolean;
  autoSyncEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceRegistrationRequest {
  deviceId: string;
  deviceName: string;
  deviceType: 'iphone' | 'ipad' | 'mac' | 'web';
  platform: string;
  osVersion?: string;
  appVersion?: string;
  computeTier?: 'limited' | 'standard' | 'performance' | 'workstation';
  supportsLocalModels?: boolean;
  supportsBackgroundExecution?: boolean;
  maxAgents?: number;
  maxFarmDurationMinutes?: number;
  pushToken?: string;
  pushTokenType?: 'apns' | 'fcm';
}

export interface HandoffRequest {
  id: string;
  userId: string;
  farmId: string;
  sourceDeviceId: string;
  targetDeviceId?: string;
  handoffType: 'transfer' | 'clone' | 'monitor_only';
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired';
  farmStateSnapshot: Record<string, unknown>;
  agentsSnapshot?: unknown[];
  progressAtHandoff?: number;
  reason?: string;
  errorMessage?: string;
  requestedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
}

export interface HandoffEligibleDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  computeTier: string;
  isOnline: boolean;
  lastSeenAt: Date;
  supportsLocalModels: boolean;
  maxAgents: number;
}

export interface DeviceNotification {
  id: string;
  userId: string;
  targetDeviceId?: string;
  notificationType: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  delivered: boolean;
  deliveredAt?: Date;
  read: boolean;
  readAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

// Events
export interface CrossDeviceEvents {
  'device:registered': { userId: string; device: UserDevice };
  'device:online': { userId: string; deviceId: string };
  'device:offline': { userId: string; deviceId: string };
  'handoff:requested': { userId: string; request: HandoffRequest };
  'handoff:accepted': { userId: string; request: HandoffRequest; acceptingDeviceId: string };
  'handoff:completed': { userId: string; request: HandoffRequest };
  'handoff:failed': { userId: string; request: HandoffRequest; error: string };
  'notification:created': { notification: DeviceNotification };
  'sync:required': { userId: string; deviceId: string; entityType: string; entityId: string };
}

class CrossDeviceSyncService extends EventEmitter {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupJob();
  }

  // Device Management

  /**
   * Register or update a device for a user
   */
  async registerDevice(userId: string, request: DeviceRegistrationRequest): Promise<UserDevice> {
    try {
      logger.info(LogCategory.API, 'Registering device', {
        userId,
        deviceId: request.deviceId,
        deviceType: request.deviceType,
      });

      const result = await db.query(
        `INSERT INTO user_devices (
          id, user_id, device_id, device_name, device_type, platform,
          os_version, app_version, compute_tier, supports_local_models,
          supports_background_execution, max_agents, max_farm_duration_minutes,
          push_token, push_token_type, is_online, last_seen_at, last_heartbeat_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE, NOW(), NOW()
        )
        ON CONFLICT (user_id, device_id) DO UPDATE SET
          device_name = EXCLUDED.device_name,
          device_type = EXCLUDED.device_type,
          platform = EXCLUDED.platform,
          os_version = EXCLUDED.os_version,
          app_version = EXCLUDED.app_version,
          compute_tier = COALESCE(EXCLUDED.compute_tier, user_devices.compute_tier),
          supports_local_models = COALESCE(EXCLUDED.supports_local_models, user_devices.supports_local_models),
          supports_background_execution = COALESCE(EXCLUDED.supports_background_execution, user_devices.supports_background_execution),
          max_agents = COALESCE(EXCLUDED.max_agents, user_devices.max_agents),
          max_farm_duration_minutes = COALESCE(EXCLUDED.max_farm_duration_minutes, user_devices.max_farm_duration_minutes),
          push_token = COALESCE(EXCLUDED.push_token, user_devices.push_token),
          push_token_type = COALESCE(EXCLUDED.push_token_type, user_devices.push_token_type),
          is_online = TRUE,
          last_seen_at = NOW(),
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        RETURNING *`,
        [
          uuidv4(),
          userId,
          request.deviceId,
          request.deviceName,
          request.deviceType,
          request.platform,
          request.osVersion,
          request.appVersion,
          request.computeTier || this.inferComputeTier(request.deviceType),
          request.supportsLocalModels ?? request.deviceType === 'mac',
          request.supportsBackgroundExecution ?? request.deviceType === 'mac',
          request.maxAgents ?? this.getDefaultMaxAgents(request.deviceType),
          request.maxFarmDurationMinutes ?? this.getDefaultMaxDuration(request.deviceType),
          request.pushToken,
          request.pushTokenType,
        ]
      );

      const device = this.mapDeviceRow(result.rows[0]);
      this.emit('device:registered', { userId, device });
      this.emit('device:online', { userId, deviceId: device.deviceId });

      return device;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to register device', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update device heartbeat to maintain online status
   */
  async updateDeviceHeartbeat(userId: string, deviceId: string): Promise<boolean> {
    try {
      const result = await db.query(
        `UPDATE user_devices
         SET is_online = TRUE, last_heartbeat_at = NOW(), last_seen_at = NOW()
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to update device heartbeat', {
        userId,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string): Promise<UserDevice[]> {
    try {
      const result = await db.query(
        `SELECT * FROM user_devices WHERE user_id = $1 ORDER BY last_seen_at DESC`,
        [userId]
      );
      return result.rows.map(this.mapDeviceRow);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get user devices', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(userId: string, deviceId: string): Promise<UserDevice | null> {
    try {
      const result = await db.query(
        `SELECT * FROM user_devices WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
      return result.rows[0] ? this.mapDeviceRow(result.rows[0]) : null;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get device', {
        userId,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Verify a device belongs to a user
   */
  async verifyDeviceOwnership(userId: string, deviceId: string): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to verify device ownership', {
        userId,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get devices eligible for farm handoff
   */
  async getHandoffEligibleDevices(
    userId: string,
    sourceDeviceId: string,
    minComputeTier: string = 'standard'
  ): Promise<HandoffEligibleDevice[]> {
    try {
      // Validate compute tier
      const validTiers = ['limited', 'standard', 'performance', 'workstation'];
      const tier = validTiers.includes(minComputeTier) ? minComputeTier : 'standard';

      const result = await db.query(
        `SELECT * FROM get_handoff_eligible_devices($1, $2, $3)`,
        [userId, sourceDeviceId, tier]
      );
      return result.rows.map((row) => ({
        deviceId: row.device_id,
        deviceName: row.device_name,
        deviceType: row.device_type,
        computeTier: row.compute_tier,
        isOnline: row.is_online,
        lastSeenAt: row.last_seen_at,
        supportsLocalModels: row.supports_local_models,
        maxAgents: row.max_agents,
      }));
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get handoff eligible devices', {
        userId,
        sourceDeviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Update device settings
   */
  async updateDeviceSettings(
    userId: string,
    deviceId: string,
    settings: Partial<{
      deviceName: string;
      acceptHandoffs: boolean;
      autoSyncEnabled: boolean;
      isPrimaryDevice: boolean;
      pushToken: string;
      pushTokenType: 'apns' | 'fcm';
    }>
  ): Promise<UserDevice | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 3;

    if (settings.deviceName !== undefined) {
      updates.push(`device_name = $${paramIndex++}`);
      values.push(settings.deviceName);
    }
    if (settings.acceptHandoffs !== undefined) {
      updates.push(`accept_handoffs = $${paramIndex++}`);
      values.push(settings.acceptHandoffs);
    }
    if (settings.autoSyncEnabled !== undefined) {
      updates.push(`auto_sync_enabled = $${paramIndex++}`);
      values.push(settings.autoSyncEnabled);
    }
    if (settings.isPrimaryDevice !== undefined) {
      updates.push(`is_primary_device = $${paramIndex++}`);
      values.push(settings.isPrimaryDevice);

      // If setting as primary, unset other primary devices
      if (settings.isPrimaryDevice) {
        await db.query(
          `UPDATE user_devices SET is_primary_device = FALSE WHERE user_id = $1 AND device_id != $2`,
          [userId, deviceId]
        );
      }
    }
    if (settings.pushToken !== undefined) {
      updates.push(`push_token = $${paramIndex++}`);
      values.push(settings.pushToken);
    }
    if (settings.pushTokenType !== undefined) {
      updates.push(`push_token_type = $${paramIndex++}`);
      values.push(settings.pushTokenType);
    }

    if (updates.length === 0) {
      return null;
    }

    const result = await db.query(
      `UPDATE user_devices SET ${updates.join(', ')}, updated_at = NOW()
       WHERE user_id = $1 AND device_id = $2
       RETURNING *`,
      [userId, deviceId, ...values]
    );

    return result.rows[0] ? this.mapDeviceRow(result.rows[0]) : null;
  }

  /**
   * Remove a device
   */
  async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM user_devices WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Farm Handoff

  /**
   * Request a farm handoff to another device
   */
  async requestFarmHandoff(
    userId: string,
    farmId: string,
    sourceDeviceId: string,
    targetDeviceId: string | null,
    handoffType: 'transfer' | 'clone' | 'monitor_only' = 'transfer',
    reason?: string
  ): Promise<HandoffRequest> {
    try {
      logger.info(LogCategory.API, 'Creating farm handoff request', {
        userId,
        farmId,
        sourceDeviceId,
        targetDeviceId,
        handoffType,
      });

      // Verify source device belongs to user
      const sourceDeviceValid = await this.verifyDeviceOwnership(userId, sourceDeviceId);
      if (!sourceDeviceValid) {
        throw new Error('Source device does not belong to user');
      }

      // Verify target device belongs to user (if specified)
      if (targetDeviceId) {
        const targetDeviceValid = await this.verifyDeviceOwnership(userId, targetDeviceId);
        if (!targetDeviceValid) {
          throw new Error('Target device does not belong to user');
        }
      }

      // Validate handoff type
      const validTypes = ['transfer', 'clone', 'monitor_only'];
      if (!validTypes.includes(handoffType)) {
        throw new Error('Invalid handoff type');
      }

      const result = await db.query(
        `SELECT create_farm_handoff_request($1, $2, $3, $4, $5, $6) as request_id`,
        [userId, farmId, sourceDeviceId, targetDeviceId, handoffType, reason]
      );

      const requestId = result.rows[0]?.request_id;
      if (!requestId) {
        throw new Error('Failed to create handoff request');
      }

      const request = await this.getHandoffRequest(requestId);

      if (!request) {
        throw new Error('Failed to retrieve created handoff request');
      }

      this.emit('handoff:requested', { userId, request });

      return request;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to create handoff request', {
        userId,
        farmId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Accept a handoff request
   */
  async acceptHandoffRequest(requestId: string, acceptingDeviceId: string): Promise<{ success: boolean; error?: string; farmState?: Record<string, unknown> }> {
    try {
      const result = await db.query(
        `SELECT accept_farm_handoff($1, $2) as result`,
        [requestId, acceptingDeviceId]
      );

      const response = result.rows[0].result;

      if (response.success) {
        const request = await this.getHandoffRequest(requestId);
        if (request) {
          this.emit('handoff:accepted', { userId: request.userId, request, acceptingDeviceId });
        }
      }

      return {
        success: response.success,
        error: response.error,
        farmState: response.farm_state,
      };
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to accept handoff request', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Complete a handoff (after successful transfer)
   */
  async completeHandoff(requestId: string): Promise<void> {
    const result = await db.query(
      `UPDATE farm_handoff_requests
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId]
    );

    if (result.rows[0]) {
      const request = this.mapHandoffRow(result.rows[0]);
      this.emit('handoff:completed', { userId: request.userId, request });

      // Notify both devices
      await this.createNotification(
        request.userId,
        request.sourceDeviceId,
        'handoff_completed',
        {
          requestId,
          farmId: request.farmId,
          targetDeviceId: request.targetDeviceId,
        },
        'normal'
      );
    }
  }

  /**
   * Fail a handoff with error message
   */
  async failHandoff(requestId: string, errorMessage: string): Promise<void> {
    const result = await db.query(
      `UPDATE farm_handoff_requests
       SET status = 'failed', error_message = $2, completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId, errorMessage]
    );

    if (result.rows[0]) {
      const request = this.mapHandoffRow(result.rows[0]);
      this.emit('handoff:failed', { userId: request.userId, request, error: errorMessage });
    }
  }

  /**
   * Cancel a pending handoff request
   */
  async cancelHandoffRequest(requestId: string, userId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE farm_handoff_requests
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get handoff request by ID
   */
  async getHandoffRequest(requestId: string): Promise<HandoffRequest | null> {
    const result = await db.query(
      `SELECT * FROM farm_handoff_requests WHERE id = $1`,
      [requestId]
    );
    return result.rows[0] ? this.mapHandoffRow(result.rows[0]) : null;
  }

  /**
   * Get pending handoff requests for a device
   */
  async getPendingHandoffRequests(userId: string, deviceId: string): Promise<HandoffRequest[]> {
    const result = await db.query(
      `SELECT * FROM farm_handoff_requests
       WHERE user_id = $1
         AND (target_device_id = $2 OR target_device_id IS NULL)
         AND status = 'pending'
         AND expires_at > NOW()
       ORDER BY requested_at DESC`,
      [userId, deviceId]
    );
    return result.rows.map(this.mapHandoffRow);
  }

  // Notifications

  /**
   * Create a notification for a device
   */
  async createNotification(
    userId: string,
    targetDeviceId: string | null,
    notificationType: string,
    payload: Record<string, unknown>,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
  ): Promise<DeviceNotification> {
    const result = await db.query(
      `INSERT INTO device_notifications (
        id, user_id, target_device_id, notification_type, payload, priority
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [uuidv4(), userId, targetDeviceId, notificationType, JSON.stringify(payload), priority]
    );

    const notification = this.mapNotificationRow(result.rows[0]);
    this.emit('notification:created', { notification });
    return notification;
  }

  /**
   * Get undelivered notifications for a device
   */
  async getUndeliveredNotifications(userId: string, deviceId: string): Promise<DeviceNotification[]> {
    const result = await db.query(
      `SELECT * FROM device_notifications
       WHERE user_id = $1
         AND (target_device_id = $2 OR target_device_id IS NULL)
         AND delivered = FALSE
         AND expires_at > NOW()
       ORDER BY priority DESC, created_at ASC`,
      [userId, deviceId]
    );
    return result.rows.map(this.mapNotificationRow);
  }

  /**
   * Mark notifications as delivered
   */
  async markNotificationsDelivered(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    await db.query(
      `UPDATE device_notifications
       SET delivered = TRUE, delivered_at = NOW()
       WHERE id = ANY($1)`,
      [notificationIds]
    );
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsRead(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    await db.query(
      `UPDATE device_notifications
       SET read = TRUE, read_at = NOW()
       WHERE id = ANY($1)`,
      [notificationIds]
    );
  }

  // Farm Subscriptions

  /**
   * Subscribe a device to farm updates
   */
  async subscribeFarmUpdates(
    userId: string,
    deviceId: string,
    farmId: string,
    subscriptionType: 'owner' | 'monitor' | 'read_only' = 'monitor'
  ): Promise<void> {
    await db.query(
      `INSERT INTO device_farm_subscriptions (
        id, user_id, device_id, farm_id, subscription_type
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, device_id, farm_id) DO UPDATE SET
        subscription_type = EXCLUDED.subscription_type,
        last_activity_at = NOW()`,
      [uuidv4(), userId, deviceId, farmId, subscriptionType]
    );
  }

  /**
   * Get devices subscribed to a farm
   */
  async getFarmSubscribers(userId: string, farmId: string): Promise<Array<{ deviceId: string; subscriptionType: string }>> {
    const result = await db.query(
      `SELECT device_id, subscription_type FROM device_farm_subscriptions
       WHERE user_id = $1 AND farm_id = $2`,
      [userId, farmId]
    );
    return result.rows.map((row) => ({
      deviceId: row.device_id,
      subscriptionType: row.subscription_type,
    }));
  }

  /**
   * Unsubscribe a device from farm updates
   */
  async unsubscribeFarmUpdates(userId: string, deviceId: string, farmId: string): Promise<void> {
    await db.query(
      `DELETE FROM device_farm_subscriptions
       WHERE user_id = $1 AND device_id = $2 AND farm_id = $3`,
      [userId, deviceId, farmId]
    );
  }

  // Helpers

  private inferComputeTier(deviceType: string): string {
    switch (deviceType) {
      case 'mac':
        return 'workstation';
      case 'ipad':
        return 'performance';
      case 'iphone':
        return 'standard';
      default:
        return 'standard';
    }
  }

  private getDefaultMaxAgents(deviceType: string): number {
    switch (deviceType) {
      case 'mac':
        return 10;
      case 'ipad':
        return 5;
      case 'iphone':
        return 3;
      default:
        return 3;
    }
  }

  private getDefaultMaxDuration(deviceType: string): number {
    switch (deviceType) {
      case 'mac':
        return 480; // 8 hours
      case 'ipad':
        return 240; // 4 hours
      case 'iphone':
        return 120; // 2 hours
      default:
        return 120;
    }
  }

  private mapDeviceRow(row: Record<string, unknown>): UserDevice {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      deviceId: row.device_id as string,
      deviceName: row.device_name as string,
      deviceType: row.device_type as UserDevice['deviceType'],
      platform: row.platform as string,
      osVersion: row.os_version as string | undefined,
      appVersion: row.app_version as string | undefined,
      computeTier: row.compute_tier as UserDevice['computeTier'],
      supportsLocalModels: row.supports_local_models as boolean,
      supportsBackgroundExecution: row.supports_background_execution as boolean,
      maxAgents: row.max_agents as number,
      maxFarmDurationMinutes: row.max_farm_duration_minutes as number,
      pushToken: row.push_token as string | undefined,
      pushTokenType: row.push_token_type as 'apns' | 'fcm' | undefined,
      isOnline: row.is_online as boolean,
      lastSeenAt: new Date(row.last_seen_at as string),
      lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at as string) : undefined,
      isPrimaryDevice: row.is_primary_device as boolean,
      acceptHandoffs: row.accept_handoffs as boolean,
      autoSyncEnabled: row.auto_sync_enabled as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapHandoffRow(row: Record<string, unknown>): HandoffRequest {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      farmId: row.farm_id as string,
      sourceDeviceId: row.source_device_id as string,
      targetDeviceId: row.target_device_id as string | undefined,
      handoffType: row.handoff_type as HandoffRequest['handoffType'],
      status: row.status as HandoffRequest['status'],
      farmStateSnapshot: row.farm_state_snapshot as Record<string, unknown>,
      agentsSnapshot: row.agents_snapshot as unknown[] | undefined,
      progressAtHandoff: row.progress_at_handoff as number | undefined,
      reason: row.reason as string | undefined,
      errorMessage: row.error_message as string | undefined,
      requestedAt: new Date(row.requested_at as string),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      expiresAt: new Date(row.expires_at as string),
    };
  }

  private mapNotificationRow(row: Record<string, unknown>): DeviceNotification {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      targetDeviceId: row.target_device_id as string | undefined,
      notificationType: row.notification_type as string,
      payload: row.payload as Record<string, unknown>,
      priority: row.priority as DeviceNotification['priority'],
      delivered: row.delivered as boolean,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : undefined,
      read: row.read as boolean,
      readAt: row.read_at ? new Date(row.read_at as string) : undefined,
      expiresAt: new Date(row.expires_at as string),
      createdAt: new Date(row.created_at as string),
    };
  }

  private startCleanupJob(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await db.query(`SELECT cleanup_expired_cross_device_data()`);
      } catch (error) {
        logger.error(LogCategory.API, 'Cross-device cleanup job failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton export
export const crossDeviceSyncService = new CrossDeviceSyncService();
