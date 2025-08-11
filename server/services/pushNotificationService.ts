import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import apn from 'apn'; // Apple Push Notification service
import { logger } from '../utils/logger';

interface NotificationPayload {
  title: string;
  body: string;
  data?: any;
  badge?: number;
  sound?: string;
  category?: string;
  threadId?: string;
  targetContentId?: string;
}

interface DeviceInfo {
  userId: string;
  deviceId: string;
  deviceToken: string;
  platform: 'ios' | 'macos';
  appVersion?: string;
  lastSeen: Date;
}

class PushNotificationService extends EventEmitter {
  private apnProvider: apn.Provider | null = null;
  private initialized = false;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize Apple Push Notification service
      if (process.env.APN_KEY_PATH && process.env.APN_KEY_ID && process.env.APN_TEAM_ID) {
        this.apnProvider = new apn.Provider({
          token: {
            key: process.env.APN_KEY_PATH,
            keyId: process.env.APN_KEY_ID,
            teamId: process.env.APN_TEAM_ID
          },
          production: process.env.NODE_ENV === 'production'
        });
        
        logger.info('[PushNotification] APN provider initialized');
      } else {
        logger.warn('[PushNotification] APN credentials not configured');
      }

      this.initialized = true;
      this.setupEventListeners();
    } catch (error) {
      logger.error('[PushNotification] Failed to initialize:', error);
    }
  }

  private setupEventListeners() {
    // Listen for farm events
    if (websocketManager) {
      websocketManager.on('farm:completed', (data) => {
        this.sendFarmCompletedNotification(data);
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
    }
  }

  /**
   * Register or update a device for push notifications
   */
  async registerDevice(deviceInfo: DeviceInfo): Promise<void> {
    try {
      await db.query(
        `INSERT INTO user_devices (
          user_id, device_id, device_token, platform, app_version, last_seen, push_enabled
        ) VALUES ($1, $2, $3, $4, $5, NOW(), true)
        ON CONFLICT (user_id, device_id) 
        DO UPDATE SET 
          device_token = EXCLUDED.device_token,
          platform = EXCLUDED.platform,
          app_version = EXCLUDED.app_version,
          last_seen = NOW(),
          push_enabled = true`,
        [
          deviceInfo.userId,
          deviceInfo.deviceId,
          deviceInfo.deviceToken,
          deviceInfo.platform,
          deviceInfo.appVersion || null
        ]
      );

      logger.info(`[PushNotification] Device registered: ${deviceInfo.deviceId}`);
    } catch (error) {
      logger.error('[PushNotification] Failed to register device:', error);
      throw error;
    }
  }

  /**
   * Unregister a device from push notifications
   */
  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    try {
      await db.query(
        'UPDATE user_devices SET push_enabled = false WHERE user_id = $1 AND device_id = $2',
        [userId, deviceId]
      );
      
      logger.info(`[PushNotification] Device unregistered: ${deviceId}`);
    } catch (error) {
      logger.error('[PushNotification] Failed to unregister device:', error);
      throw error;
    }
  }

  /**
   * Send notification to specific user's devices
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      // Get user's devices
      const result = await db.query(
        `SELECT device_token, platform 
         FROM user_devices 
         WHERE user_id = $1 AND push_enabled = true AND device_token IS NOT NULL`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.debug(`[PushNotification] No devices found for user ${userId}`);
        return;
      }

      // Send to each device
      const promises = result.rows.map(device => 
        this.sendToDevice(device.device_token, device.platform, payload)
      );

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error('[PushNotification] Failed to send to user:', error);
    }
  }

  /**
   * Send notification to specific device
   */
  private async sendToDevice(
    deviceToken: string, 
    platform: 'ios' | 'macos', 
    payload: NotificationPayload
  ): Promise<void> {
    if (!this.apnProvider) {
      logger.debug('[PushNotification] APN provider not available');
      return;
    }

    try {
      const notification = new apn.Notification();
      
      // Set basic notification properties
      notification.alert = {
        title: payload.title,
        body: payload.body
      };
      
      // Set optional properties
      if (payload.badge !== undefined) {
        notification.badge = payload.badge;
      }
      
      if (payload.sound) {
        notification.sound = payload.sound;
      } else {
        notification.sound = 'default';
      }
      
      if (payload.category) {
        notification.category = payload.category;
      }
      
      if (payload.threadId) {
        notification.threadId = payload.threadId;
      }
      
      if (payload.targetContentId) {
        notification.targetContentIdentifier = payload.targetContentId;
      }
      
      // Add custom data
      if (payload.data) {
        notification.payload = payload.data;
      }
      
      // Set topic based on platform
      notification.topic = platform === 'macos' 
        ? process.env.APN_TOPIC_MACOS || 'com.maifarm.desktop'
        : process.env.APN_TOPIC_IOS || 'com.maifarm.ios';
      
      // Send notification
      const result = await this.apnProvider.send(notification, deviceToken);
      
      if (result.failed.length > 0) {
        logger.error('[PushNotification] Failed to send:', result.failed[0]);
        
        // Handle invalid tokens
        if (result.failed[0].status === '410') {
          await this.handleInvalidToken(deviceToken);
        }
      } else {
        logger.debug(`[PushNotification] Sent to ${deviceToken.substring(0, 8)}...`);
      }
    } catch (error) {
      logger.error('[PushNotification] Send error:', error);
    }
  }

  /**
   * Handle invalid device tokens
   */
  private async handleInvalidToken(deviceToken: string): Promise<void> {
    try {
      await db.query(
        'DELETE FROM user_devices WHERE device_token = $1',
        [deviceToken]
      );
      logger.info(`[PushNotification] Removed invalid token: ${deviceToken.substring(0, 8)}...`);
    } catch (error) {
      logger.error('[PushNotification] Failed to remove invalid token:', error);
    }
  }

  /**
   * Send farm completed notification
   */
  private async sendFarmCompletedNotification(data: any): Promise<void> {
    const { farmId, farmName, userId, harvestId } = data;
    
    await this.sendToUser(userId, {
      title: 'Farm Completed',
      body: `Your farm "${farmName}" has completed successfully`,
      category: 'FARM_COMPLETED',
      threadId: farmId,
      data: {
        type: 'farm_completed',
        farmId,
        harvestId
      }
    });
  }

  /**
   * Send harvest ready notification
   */
  private async sendHarvestReadyNotification(data: any): Promise<void> {
    const { harvestId, farmName, userId } = data;
    
    await this.sendToUser(userId, {
      title: 'Harvest Ready',
      body: `Harvest from "${farmName}" is ready for collection`,
      category: 'HARVEST_READY',
      data: {
        type: 'harvest_ready',
        harvestId
      }
    });
  }

  /**
   * Send task failed notification
   */
  private async sendTaskFailedNotification(data: any): Promise<void> {
    const { taskId, taskName, userId, error } = data;
    
    await this.sendToUser(userId, {
      title: 'Task Failed',
      body: `Task "${taskName}" failed: ${error}`,
      category: 'TASK_FAILED',
      data: {
        type: 'task_failed',
        taskId,
        error
      }
    });
  }

  /**
   * Send agent error notification
   */
  private async sendAgentErrorNotification(data: any): Promise<void> {
    const { agentId, farmId, userId, error } = data;
    
    await this.sendToUser(userId, {
      title: 'Agent Error',
      body: `An agent encountered an error: ${error}`,
      category: 'AGENT_ERROR',
      threadId: farmId,
      data: {
        type: 'agent_error',
        agentId,
        farmId,
        error
      }
    });
  }

  /**
   * Send custom notification
   */
  async sendCustomNotification(
    userId: string, 
    notification: NotificationPayload
  ): Promise<void> {
    await this.sendToUser(userId, notification);
  }

  /**
   * Send broadcast notification to all users
   */
  async sendBroadcast(payload: NotificationPayload): Promise<void> {
    try {
      const result = await db.query(
        'SELECT DISTINCT user_id FROM user_devices WHERE push_enabled = true'
      );
      
      const promises = result.rows.map(row => 
        this.sendToUser(row.user_id, payload)
      );
      
      await Promise.allSettled(promises);
      
      logger.info(`[PushNotification] Broadcast sent to ${result.rows.length} users`);
    } catch (error) {
      logger.error('[PushNotification] Broadcast failed:', error);
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
      this.apnProvider = null;
    }
    this.removeAllListeners();
    logger.info('[PushNotification] Service shut down');
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();