/**
 * Unified Notification Service - Handles all notifications and alerts
 */

import { EventEmitter } from 'events';
import { BaseService, Notification, NotificationType } from './types';
import { UnifiedWebSocketHub } from './websocketHub';
import { logger, LogCategory } from '../../utils/logger';

export class UnifiedNotificationService extends EventEmitter implements BaseService {
  private notifications: Map<string, Notification> = new Map();

  constructor(private websocket: UnifiedWebSocketHub) {
    super();
  }

  async initialize(): Promise<void> {
    logger.info(LogCategory.NOTIFICATION, 'Notification Service initialized');
  }

  async shutdown(): Promise<void> {
    this.removeAllListeners();
    logger.info(LogCategory.NOTIFICATION, 'Notification Service shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: 'Notification service operational' };
  }

  getStats(): Record<string, any> {
    return {
      totalNotifications: this.notifications.size,
      unread: Array.from(this.notifications.values()).filter(n => !n.read).length
    };
  }

  /**
   * Send a notification
   */
  async sendNotification(
    type: NotificationType,
    title: string,
    message: string,
    userId?: string,
    data?: any
  ): Promise<void> {
    const notification: Notification = {
      id: `notif-${Date.now()}`,
      userId,
      type,
      title,
      message,
      data,
      read: false,
      createdAt: new Date()
    };

    this.notifications.set(notification.id, notification);

    // Broadcast via WebSocket
    this.websocket.broadcast('notification', notification);

    // Emit event
    this.emit('notification:sent', notification);

    logger.debug(LogCategory.NOTIFICATION, `Notification sent: ${type} - ${title}`);
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.read = true;
    }
  }

  /**
   * Get notifications for a user
   */
  getUserNotifications(userId: string): Notification[] {
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}