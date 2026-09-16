import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import apn from 'apn'; // Apple Push Notification service
import { logger, LogCategory } from '../utils/logger';

// Notification Types
export type NotificationType =
  | 'farm_status_change'
  | 'farm_completed'
  | 'farm_failed'
  | 'farm_launching'
  | 'farm_running'
  | 'farm_recovering'
  | 'harvest_ready'
  | 'agent_status_change'
  | 'agent_error'
  | 'task_failed'
  | 'handoff_request'
  | 'handoff_accepted'
  | 'handoff_completed'
  | 'handoff_failed'
  | 'cross_device_sync'
  | 'system_alert';

// Notification Priority
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  category?: string;
  threadId?: string;
  targetContentId?: string;
  priority?: NotificationPriority;
  collapseId?: string; // For grouping/replacing notifications
}

export interface FarmStatusNotification {
  farmId: string;
  farmName: string;
  userId: string;
  previousStatus?: string;
  newStatus: string;
  progress?: number;
  agentCount?: number;
  errorMessage?: string;
}

export interface HandoffNotification {
  requestId: string;
  farmId: string;
  farmName: string;
  userId: string;
  sourceDeviceId: string;
  sourceDeviceName?: string;
  targetDeviceId?: string;
  targetDeviceName?: string;
  handoffType: 'transfer' | 'clone' | 'monitor_only';
  status: string;
  reason?: string;
  errorMessage?: string;
}

interface DeviceInfo {
  userId: string;
  deviceId: string;
  deviceToken: string;
  platform: 'ios' | 'macos';
  appVersion?: string;
  lastSeen: Date;
}

interface UserNotificationPreferences {
  farmStatusChanges: boolean;
  farmCompletions: boolean;
  farmFailures: boolean;
  harvestReady: boolean;
  agentErrors: boolean;
  handoffRequests: boolean;
  crossDeviceSync: boolean;
  quietHoursStart?: number; // Hour of day (0-23)
  quietHoursEnd?: number;
}

class PushNotificationService extends EventEmitter {
  private apnProvider: apn.Provider | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Cache user preferences to avoid repeated DB lookups
  private preferencesCache: Map<string, { prefs: UserNotificationPreferences; expires: number }> = new Map();
  private readonly PREFERENCE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize Apple Push Notification service
      if (process.env.APN_KEY_PATH && process.env.APN_KEY_ID && process.env.APN_TEAM_ID) {
        this.apnProvider = new apn.Provider({
          token: {
            key: process.env.APN_KEY_PATH,
            keyId: process.env.APN_KEY_ID,
            teamId: process.env.APN_TEAM_ID,
          },
          production: process.env.NODE_ENV === 'production',
        });

        logger.info(LogCategory.NOTIFICATION, 'APN provider initialized');
      } else {
        logger.warn(
          LogCategory.NOTIFICATION,
          'APN credentials not configured - push notifications disabled'
        );
      }

      this.initialized = true;
      this.setupEventListeners();
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to initialize push notification service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Wait for service initialization
   */
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  private setupEventListeners(): void {
    // Listen for farm events from websocket manager
    if (websocketManager) {
      // Farm status changes
      websocketManager.on('farm:status', (data) => {
        this.handleFarmStatusChange(data);
      });

      websocketManager.on('farm:completed', (data) => {
        this.sendFarmCompletedNotification(data);
      });

      websocketManager.on('farm:failed', (data) => {
        this.sendFarmFailedNotification(data);
      });

      websocketManager.on('harvest:ready', (data) => {
        this.sendHarvestReadyNotification(data);
      });

      websocketManager.on('task:failed', (data) => {
        this.sendTaskFailedNotification(data);
      });

      websocketManager.on('agent:error', (data) => {
        this.sendAgentErrorNotification(data);
      });

      // Handoff events
      websocketManager.on('handoff:requested', (data) => {
        this.sendHandoffRequestNotification(data);
      });

      websocketManager.on('handoff:accepted', (data) => {
        this.sendHandoffAcceptedNotification(data);
      });

      websocketManager.on('handoff:completed', (data) => {
        this.sendHandoffCompletedNotification(data);
      });

      websocketManager.on('handoff:failed', (data) => {
        this.sendHandoffFailedNotification(data);
      });

      logger.info(LogCategory.NOTIFICATION, 'Event listeners setup complete');
    }
  }

  // ============================================
  // FARM STATUS NOTIFICATIONS
  // ============================================

  /**
   * Handle farm status changes and send appropriate notifications
   */
  private async handleFarmStatusChange(data: FarmStatusNotification): Promise<void> {
    const { farmId, farmName, userId, previousStatus, newStatus, progress, agentCount, errorMessage } = data;

    // Don't notify for minor progress updates
    if (previousStatus === newStatus && !errorMessage) {
      return;
    }

    // Determine notification content based on status transition
    let notification: NotificationPayload | null = null;

    switch (newStatus) {
      case 'launching':
        notification = {
          title: 'Farm Launching',
          body: `"${farmName}" is being prepared with ${agentCount || 'multiple'} agents`,
          category: 'FARM_LAUNCHING',
          threadId: farmId,
          priority: 'normal',
          collapseId: `farm-${farmId}`,
          data: {
            type: 'farm_status_change',
            farmId,
            status: newStatus,
            previousStatus,
          },
        };
        break;

      case 'running':
      case 'active':
        notification = {
          title: 'Farm Running',
          body: `"${farmName}" is now active with ${agentCount || 'multiple'} agents working`,
          category: 'FARM_RUNNING',
          threadId: farmId,
          priority: 'normal',
          collapseId: `farm-${farmId}`,
          data: {
            type: 'farm_status_change',
            farmId,
            status: newStatus,
            previousStatus,
            progress,
          },
        };
        break;

      case 'recovering':
        notification = {
          title: 'Farm Recovering',
          body: `"${farmName}" is recovering from an issue`,
          category: 'FARM_RECOVERING',
          threadId: farmId,
          priority: 'high',
          sound: 'default',
          collapseId: `farm-${farmId}`,
          data: {
            type: 'farm_status_change',
            farmId,
            status: newStatus,
            previousStatus,
            errorMessage,
          },
        };
        break;

      case 'completed':
        // Handled by dedicated method
        return;

      case 'failed':
        // Handled by dedicated method
        return;
    }

    if (notification) {
      await this.sendToUserIfAllowed(userId, notification, 'farmStatusChanges');
    }
  }

  /**
   * Send farm completed notification
   */
  private async sendFarmCompletedNotification(data: any): Promise<void> {
    const { farmId, farmName, userId, harvestId, duration, tokensUsed } = data;

    const notification: NotificationPayload = {
      title: 'Farm Completed! 🎉',
      body: `"${farmName}" has finished successfully${duration ? ` in ${Math.round(duration / 60)} minutes` : ''}`,
      category: 'FARM_COMPLETED',
      threadId: farmId,
      priority: 'high',
      sound: 'success.caf', // Custom success sound
      data: {
        type: 'farm_completed',
        farmId,
        harvestId,
        duration,
        tokensUsed,
      },
    };

    await this.sendToUserIfAllowed(userId, notification, 'farmCompletions');

    // Also store in database for cross-device sync
    await this.storeNotificationForSync(userId, 'farm_completed', notification);
  }

  /**
   * Send farm failed notification
   */
  private async sendFarmFailedNotification(data: any): Promise<void> {
    const { farmId, farmName, userId, error, recoverable } = data;

    const notification: NotificationPayload = {
      title: 'Farm Failed',
      body: `"${farmName}" encountered an error${recoverable ? ' (auto-recovery available)' : ''}`,
      category: 'FARM_FAILED',
      threadId: farmId,
      priority: 'critical',
      sound: 'alert.caf',
      data: {
        type: 'farm_failed',
        farmId,
        error,
        recoverable,
      },
    };

    await this.sendToUserIfAllowed(userId, notification, 'farmFailures');
    await this.storeNotificationForSync(userId, 'farm_failed', notification);
  }

  /**
   * Send harvest ready notification
   */
  private async sendHarvestReadyNotification(data: any): Promise<void> {
    const { harvestId, farmName, userId, filesCount, outputSize } = data;

    const notification: NotificationPayload = {
      title: 'Harvest Ready',
      body: `Harvest from "${farmName}" is ready${filesCount ? ` (${filesCount} files)` : ''}`,
      category: 'HARVEST_READY',
      priority: 'high',
      sound: 'default',
      data: {
        type: 'harvest_ready',
        harvestId,
        filesCount,
        outputSize,
      },
    };

    await this.sendToUserIfAllowed(userId, notification, 'harvestReady');
    await this.storeNotificationForSync(userId, 'harvest_ready', notification);
  }

  /**
   * Send task failed notification
   */
  private async sendTaskFailedNotification(data: any): Promise<void> {
    const { taskId, taskName, userId, error } = data;

    const notification: NotificationPayload = {
      title: 'Task Failed',
      body: `Task "${taskName}" failed: ${error?.substring(0, 100) || 'Unknown error'}`,
      category: 'TASK_FAILED',
      priority: 'high',
      data: {
        type: 'task_failed',
        taskId,
        error,
      },
    };

    await this.sendToUserIfAllowed(userId, notification, 'farmFailures');
  }

  /**
   * Send agent error notification
   */
  private async sendAgentErrorNotification(data: any): Promise<void> {
    const { agentId, agentName, farmId, userId, error, recoverable } = data;

    const notification: NotificationPayload = {
      title: 'Agent Error',
      body: `${agentName || 'An agent'} encountered an error${recoverable ? ' (recovering)' : ''}`,
      category: 'AGENT_ERROR',
      threadId: farmId,
      priority: 'normal',
      collapseId: `agent-errors-${farmId}`,
      data: {
        type: 'agent_error',
        agentId,
        farmId,
        error,
        recoverable,
      },
    };

    await this.sendToUserIfAllowed(userId, notification, 'agentErrors');
  }

  // ============================================
  // HANDOFF NOTIFICATIONS
  // ============================================

  /**
   * Send handoff request notification to target device(s)
   */
  async sendHandoffRequestNotification(data: HandoffNotification): Promise<void> {
    const {
      requestId,
      farmId,
      farmName,
      userId,
      sourceDeviceId,
      sourceDeviceName,
      targetDeviceId,
      handoffType,
    } = data;

    const handoffTypeText =
      handoffType === 'transfer' ? 'transfer' : handoffType === 'clone' ? 'clone' : 'monitor';

    const notification: NotificationPayload = {
      title: 'Farm Handoff Request',
      body: `${sourceDeviceName || 'A device'} wants to ${handoffTypeText} "${farmName}" to this device`,
      category: 'HANDOFF_REQUEST',
      threadId: requestId,
      priority: 'critical',
      sound: 'default',
      data: {
        type: 'handoff_request',
        requestId,
        farmId,
        farmName,
        sourceDeviceId,
        handoffType,
      },
    };

    if (targetDeviceId) {
      // Send to specific device
      await this.sendToDevice(userId, targetDeviceId, notification);
    } else {
      // Broadcast to all user's devices except source
      await this.sendToUserDevicesExcept(userId, sourceDeviceId, notification);
    }

    // Store for sync
    await this.storeNotificationForSync(userId, 'handoff_request', notification, targetDeviceId);
  }

  /**
   * Send handoff accepted notification to source device
   */
  async sendHandoffAcceptedNotification(data: HandoffNotification): Promise<void> {
    const { requestId, farmId, farmName, userId, sourceDeviceId, targetDeviceName } = data;

    const notification: NotificationPayload = {
      title: 'Handoff Accepted',
      body: `"${farmName}" handoff accepted by ${targetDeviceName || 'another device'}`,
      category: 'HANDOFF_ACCEPTED',
      threadId: requestId,
      priority: 'high',
      sound: 'default',
      data: {
        type: 'handoff_accepted',
        requestId,
        farmId,
        farmName,
      },
    };

    await this.sendToDevice(userId, sourceDeviceId, notification);
    await this.storeNotificationForSync(userId, 'handoff_accepted', notification, sourceDeviceId);
  }

  /**
   * Send handoff completed notification to both devices
   */
  async sendHandoffCompletedNotification(data: HandoffNotification): Promise<void> {
    const { requestId, farmId, farmName, userId, sourceDeviceId, targetDeviceId, handoffType } = data;

    const notification: NotificationPayload = {
      title: 'Handoff Complete',
      body: `"${farmName}" ${handoffType === 'transfer' ? 'transferred' : 'cloned'} successfully`,
      category: 'HANDOFF_COMPLETED',
      threadId: requestId,
      priority: 'normal',
      sound: 'success.caf',
      data: {
        type: 'handoff_completed',
        requestId,
        farmId,
        farmName,
        handoffType,
      },
    };

    // Send to both devices
    const promises: Promise<void>[] = [];
    promises.push(this.sendToDevice(userId, sourceDeviceId, notification));
    if (targetDeviceId && targetDeviceId !== sourceDeviceId) {
      promises.push(this.sendToDevice(userId, targetDeviceId, notification));
    }
    await Promise.allSettled(promises);
  }

  /**
   * Send handoff failed notification
   */
  async sendHandoffFailedNotification(data: HandoffNotification): Promise<void> {
    const { requestId, farmId, farmName, userId, sourceDeviceId, targetDeviceId, errorMessage } = data;

    const notification: NotificationPayload = {
      title: 'Handoff Failed',
      body: `"${farmName}" handoff failed${errorMessage ? `: ${errorMessage.substring(0, 80)}` : ''}`,
      category: 'HANDOFF_FAILED',
      threadId: requestId,
      priority: 'high',
      sound: 'alert.caf',
      data: {
        type: 'handoff_failed',
        requestId,
        farmId,
        farmName,
        errorMessage,
      },
    };

    // Notify both devices
    const promises: Promise<void>[] = [];
    promises.push(this.sendToDevice(userId, sourceDeviceId, notification));
    if (targetDeviceId && targetDeviceId !== sourceDeviceId) {
      promises.push(this.sendToDevice(userId, targetDeviceId, notification));
    }
    await Promise.allSettled(promises);
  }

  // ============================================
  // DEVICE REGISTRATION & TOKEN MANAGEMENT
  // ============================================

  /**
   * Register or update device push token
   */
  async registerPushToken(
    userId: string,
    deviceId: string,
    pushToken: string,
    tokenType: 'apns' | 'fcm' = 'apns'
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE user_devices
         SET push_token = $1, push_token_type = $2, updated_at = NOW()
         WHERE user_id = $3 AND device_id = $4`,
        [pushToken, tokenType, userId, deviceId]
      );

      logger.info(LogCategory.NOTIFICATION, 'Push token registered', {
        userId,
        deviceId: deviceId.substring(0, 8) + '...',
        tokenType,
      });
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to register push token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Unregister device push token
   */
  async unregisterPushToken(userId: string, deviceId: string): Promise<void> {
    try {
      await db.query(
        `UPDATE user_devices
         SET push_token = NULL, push_token_type = NULL, updated_at = NOW()
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );

      logger.info(LogCategory.NOTIFICATION, 'Push token unregistered', {
        userId,
        deviceId: deviceId.substring(0, 8) + '...',
      });
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to unregister push token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Legacy method - Register device (for backward compatibility)
   */
  async registerDevice(deviceInfo: DeviceInfo): Promise<void> {
    await this.registerPushToken(
      deviceInfo.userId,
      deviceInfo.deviceId,
      deviceInfo.deviceToken,
      deviceInfo.platform === 'macos' ? 'apns' : 'apns'
    );
  }

  /**
   * Legacy method - Unregister device (for backward compatibility)
   */
  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    await this.unregisterPushToken(userId, deviceId);
  }

  // ============================================
  // SENDING NOTIFICATIONS
  // ============================================

  /**
   * Send notification to user if their preferences allow it
   */
  private async sendToUserIfAllowed(
    userId: string,
    payload: NotificationPayload,
    preferenceKey: keyof UserNotificationPreferences
  ): Promise<void> {
    const prefs = await this.getUserPreferences(userId);

    // Check if this notification type is enabled
    if (prefs && prefs[preferenceKey] === false) {
      logger.debug(LogCategory.NOTIFICATION, 'Notification blocked by user preference', {
        userId,
        preferenceKey,
      });
      return;
    }

    // Check quiet hours
    if (prefs && this.isInQuietHours(prefs)) {
      logger.debug(LogCategory.NOTIFICATION, 'Notification blocked by quiet hours', {
        userId,
      });
      return;
    }

    await this.sendToUser(userId, payload);
  }

  /**
   * Check if current time is within user's quiet hours
   */
  private isInQuietHours(prefs: UserNotificationPreferences): boolean {
    if (prefs.quietHoursStart === undefined || prefs.quietHoursEnd === undefined) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();

    if (prefs.quietHoursStart <= prefs.quietHoursEnd) {
      // Quiet hours don't span midnight
      return currentHour >= prefs.quietHoursStart && currentHour < prefs.quietHoursEnd;
    } else {
      // Quiet hours span midnight
      return currentHour >= prefs.quietHoursStart || currentHour < prefs.quietHoursEnd;
    }
  }

  /**
   * Get user's notification preferences (with caching)
   */
  private async getUserPreferences(userId: string): Promise<UserNotificationPreferences | null> {
    // Check cache first
    const cached = this.preferencesCache.get(userId);
    if (cached && cached.expires > Date.now()) {
      return cached.prefs;
    }

    try {
      const result = await db.query(
        `SELECT notification_preferences FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const prefs = result.rows[0].notification_preferences || this.getDefaultPreferences();

      // Cache the result
      this.preferencesCache.set(userId, {
        prefs,
        expires: Date.now() + this.PREFERENCE_CACHE_TTL,
      });

      return prefs;
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to get user preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return this.getDefaultPreferences();
    }
  }

  /**
   * Get default notification preferences
   */
  private getDefaultPreferences(): UserNotificationPreferences {
    return {
      farmStatusChanges: true,
      farmCompletions: true,
      farmFailures: true,
      harvestReady: true,
      agentErrors: true,
      handoffRequests: true,
      crossDeviceSync: true,
    };
  }

  /**
   * Clear preferences cache for a user
   */
  clearPreferencesCache(userId: string): void {
    this.preferencesCache.delete(userId);
  }

  /**
   * Send notification to all user's devices
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      const result = await db.query(
        `SELECT device_id, push_token, push_token_type, device_type, platform
         FROM user_devices
         WHERE user_id = $1 AND push_token IS NOT NULL`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.debug(LogCategory.NOTIFICATION, 'No devices with push tokens for user', { userId });
        return;
      }

      const promises = result.rows.map((device) =>
        this.sendPushNotification(device.push_token, device.platform || 'ios', payload)
      );

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to send to user', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
    }
  }

  /**
   * Send notification to a specific device
   */
  async sendToDevice(userId: string, deviceId: string, payload: NotificationPayload): Promise<void> {
    try {
      const result = await db.query(
        `SELECT push_token, push_token_type, platform
         FROM user_devices
         WHERE user_id = $1 AND device_id = $2 AND push_token IS NOT NULL`,
        [userId, deviceId]
      );

      if (result.rows.length === 0) {
        logger.debug(LogCategory.NOTIFICATION, 'Device has no push token', { userId, deviceId });
        return;
      }

      const device = result.rows[0];
      await this.sendPushNotification(device.push_token, device.platform || 'ios', payload);
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to send to device', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        deviceId,
      });
    }
  }

  /**
   * Send notification to all user's devices except one
   */
  private async sendToUserDevicesExcept(
    userId: string,
    exceptDeviceId: string,
    payload: NotificationPayload
  ): Promise<void> {
    try {
      const result = await db.query(
        `SELECT device_id, push_token, push_token_type, platform
         FROM user_devices
         WHERE user_id = $1 AND device_id != $2 AND push_token IS NOT NULL`,
        [userId, exceptDeviceId]
      );

      if (result.rows.length === 0) {
        return;
      }

      const promises = result.rows.map((device) =>
        this.sendPushNotification(device.push_token, device.platform || 'ios', payload)
      );

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to send to user devices', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
    }
  }

  /**
   * Send push notification via APNs
   */
  private async sendPushNotification(
    deviceToken: string,
    platform: string,
    payload: NotificationPayload
  ): Promise<void> {
    if (!this.apnProvider) {
      logger.debug(LogCategory.NOTIFICATION, 'APN provider not available');
      return;
    }

    try {
      const notification = new apn.Notification();

      // Set alert content
      notification.alert = {
        title: payload.title,
        body: payload.body,
      };

      // Set optional properties
      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }

      notification.sound = payload.sound || 'default';

      if (payload.category) {
        notification.category = payload.category;
      }

      if (payload.threadId) {
        notification.threadId = payload.threadId;
      }

      if (payload.targetContentId) {
        notification.targetContentIdentifier = payload.targetContentId;
      }

      if (payload.collapseId) {
        notification.collapseId = payload.collapseId;
      }

      // Set push type for background updates
      notification.pushType = 'alert';

      // Set priority
      switch (payload.priority) {
        case 'critical':
          notification.priority = 10;
          notification.mutableContent = 1;
          break;
        case 'high':
          notification.priority = 10;
          break;
        case 'low':
          notification.priority = 5;
          break;
        default:
          notification.priority = 10;
      }

      // Add custom data
      if (payload.data) {
        notification.payload = payload.data;
      }

      // Set topic based on platform
      notification.topic =
        platform === 'macos'
          ? process.env.APN_TOPIC_MACOS || 'com.maifarm.desktop'
          : process.env.APN_TOPIC_IOS || 'com.maifarm.ios';

      // Set expiry (1 hour)
      notification.expiry = Math.floor(Date.now() / 1000) + 3600;

      // Send notification
      const result = await this.apnProvider.send(notification, deviceToken);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        logger.error(LogCategory.NOTIFICATION, 'Failed to send push notification', {
          status: failure.status,
          response: failure.response,
        });

        // Handle invalid tokens
        if (failure.status === '410' || failure.status === '400') {
          await this.handleInvalidToken(deviceToken);
        }
      } else {
        logger.debug(LogCategory.NOTIFICATION, 'Push notification sent', {
          deviceToken: deviceToken.substring(0, 8) + '...',
          title: payload.title,
        });
      }
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Push notification error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle invalid device tokens by removing them
   */
  private async handleInvalidToken(deviceToken: string): Promise<void> {
    try {
      await db.query(
        `UPDATE user_devices SET push_token = NULL, push_token_type = NULL
         WHERE push_token = $1`,
        [deviceToken]
      );
      logger.info(LogCategory.NOTIFICATION, 'Removed invalid push token', {
        token: deviceToken.substring(0, 8) + '...',
      });
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to remove invalid token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ============================================
  // CROSS-DEVICE SYNC STORAGE
  // ============================================

  /**
   * Store notification in database for cross-device sync
   */
  private async storeNotificationForSync(
    userId: string,
    notificationType: NotificationType,
    payload: NotificationPayload,
    targetDeviceId?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO device_notifications
         (user_id, target_device_id, notification_type, payload, priority, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
        [userId, targetDeviceId || null, notificationType, payload, payload.priority || 'normal']
      );
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Failed to store notification for sync', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        notificationType,
      });
    }
  }

  // ============================================
  // PUBLIC API METHODS
  // ============================================

  /**
   * Send custom notification to user
   */
  async sendCustomNotification(userId: string, notification: NotificationPayload): Promise<void> {
    await this.sendToUser(userId, notification);
  }

  /**
   * Send broadcast notification to all users
   */
  async sendBroadcast(payload: NotificationPayload): Promise<void> {
    try {
      const result = await db.query(
        'SELECT DISTINCT user_id FROM user_devices WHERE push_token IS NOT NULL'
      );

      const promises = result.rows.map((row) => this.sendToUser(row.user_id, payload));

      await Promise.allSettled(promises);

      logger.info(LogCategory.NOTIFICATION, 'Broadcast notification sent', {
        recipientCount: result.rows.length,
      });
    } catch (error) {
      logger.error(LogCategory.NOTIFICATION, 'Broadcast failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Notify farm status change (public API)
   */
  async notifyFarmStatusChange(data: FarmStatusNotification): Promise<void> {
    await this.handleFarmStatusChange(data);
  }

  /**
   * Notify handoff event (public API)
   */
  async notifyHandoff(data: HandoffNotification): Promise<void> {
    switch (data.status) {
      case 'pending':
        await this.sendHandoffRequestNotification(data);
        break;
      case 'accepted':
        await this.sendHandoffAcceptedNotification(data);
        break;
      case 'completed':
        await this.sendHandoffCompletedNotification(data);
        break;
      case 'failed':
        await this.sendHandoffFailedNotification(data);
        break;
    }
  }

  /**
   * Get service status
   */
  getStatus(): { initialized: boolean; apnAvailable: boolean } {
    return {
      initialized: this.initialized,
      apnAvailable: this.apnProvider !== null,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
      this.apnProvider = null;
    }
    this.preferencesCache.clear();
    this.removeAllListeners();
    logger.info(LogCategory.NOTIFICATION, 'Push notification service shut down');
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
