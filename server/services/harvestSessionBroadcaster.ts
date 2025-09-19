import { websocketManager } from '../websocket/websocketManager';
import { harvestSessionCache, CachedSession } from './harvestSessionCache';
import { logger } from '../utils/logger';

/**
 * Service for broadcasting harvest session updates via WebSocket
 * Eliminates the need for frontend polling by pushing real-time updates
 */
export class HarvestSessionBroadcaster {
  private isInitialized = false;
  private lastSessionSnapshot = new Map<string, CachedSession>();
  private broadcastInterval: NodeJS.Timeout | null = null;
  
  /**
   * Initialize the broadcaster with WebSocket manager
   */
  initialize() {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    
    // Start broadcasting session updates every 30 seconds
    this.broadcastInterval = setInterval(() => {
      this.broadcastSessionUpdates().catch(err => {
        logger.error('[HarvestSessionBroadcaster] Failed to broadcast updates:', err);
      });
    }, 30000);
    
    logger.info('[HarvestSessionBroadcaster] Initialized with 30s broadcast interval');
  }

  /**
   * Stop the broadcaster
   */
  shutdown() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    this.isInitialized = false;
    logger.info('[HarvestSessionBroadcaster] Shutdown complete');
  }

  /**
   * Broadcast session updates with change detection
   */
  private async broadcastSessionUpdates() {
    if (!this.isInitialized) return;
    
    try {
      // Get all current sessions
      const currentSessionsArray = await harvestSessionCache.getAllSessions();
      
      // Convert array to Map for change detection
      const sessionMap = new Map<string, CachedSession>();
      currentSessionsArray.forEach(session => {
        sessionMap.set(session.sessionName, session);
      });
      
      // Detect changes compared to last snapshot
      const changes = this.detectSessionChanges(sessionMap);
      
      if (changes.added.length > 0 || changes.removed.length > 0 || changes.updated.length > 0) {
        // Broadcast comprehensive update
        websocketManager.broadcast('harvest:sessions:update', {
          sessions: currentSessionsArray.map(session => ({
            sessionName: session.sessionName,
            farmId: session.farmId,
            paneCount: session.paneCount,
            createdAt: session.createdAt,
            status: session.status,
            age: Date.now() - session.createdAt.getTime(),
            ageMinutes: (Date.now() - session.createdAt.getTime()) / (1000 * 60)
          })),
          changes: {
            added: changes.added.length,
            removed: changes.removed.length,
            updated: changes.updated.length
          },
          timestamp: new Date()
        });
        
        logger.debug(`[HarvestSessionBroadcaster] Broadcasted session update: +${changes.added.length}, -${changes.removed.length}, ~${changes.updated.length}`);
      }
      
      // Update snapshot
      this.lastSessionSnapshot = sessionMap;
      
    } catch (error) {
      logger.error('[HarvestSessionBroadcaster] Error broadcasting session updates:', error);
    }
  }

  /**
   * Detect changes between current and previous session snapshots
   */
  private detectSessionChanges(currentSessions: Map<string, CachedSession>) {
    const added: CachedSession[] = [];
    const removed: string[] = [];
    const updated: CachedSession[] = [];
    
    // Find added and updated sessions
    for (const [sessionName, currentSession] of currentSessions) {
      const previousSession = this.lastSessionSnapshot.get(sessionName);
      
      if (!previousSession) {
        added.push(currentSession);
      } else if (this.hasSessionChanged(previousSession, currentSession)) {
        updated.push(currentSession);
      }
    }
    
    // Find removed sessions
    for (const [sessionName] of this.lastSessionSnapshot) {
      if (!currentSessions.has(sessionName)) {
        removed.push(sessionName);
      }
    }
    
    return { added, removed, updated };
  }

  /**
   * Check if session has meaningfully changed
   */
  private hasSessionChanged(previous: CachedSession, current: CachedSession): boolean {
    return (
      previous.status !== current.status ||
      previous.paneCount !== current.paneCount ||
      Math.abs(current.lastSeen.getTime() - previous.lastSeen.getTime()) > 60000 // More than 1 minute difference
    );
  }

  /**
   * Broadcast immediate session event for specific actions
   */
  broadcastSessionEvent(eventType: string, data: any) {
    websocketManager.broadcast(`harvest:session:${eventType}`, {
      ...data,
      timestamp: new Date()
    });
    
    logger.debug(`[HarvestSessionBroadcaster] Broadcasted session event: ${eventType}`);
  }

  /**
   * Broadcast farm-specific session update
   */
  async broadcastFarmSessionUpdate(farmId: string) {
    try {
      const sessions = await harvestSessionCache.getSessionsForFarm(farmId);
      
      websocketManager.broadcast('harvest:farm:sessions', {
        farmId,
        sessions: sessions.map(session => ({
          sessionName: session.sessionName,
          farmId: session.farmId,
          paneCount: session.paneCount,
          createdAt: session.createdAt,
          status: session.status,
          age: Date.now() - session.createdAt.getTime()
        })),
        timestamp: new Date()
      });
      
      logger.debug(`[HarvestSessionBroadcaster] Broadcasted farm session update for ${farmId}`);
    } catch (error) {
      logger.error(`[HarvestSessionBroadcaster] Failed to broadcast farm session update for ${farmId}:`, error);
    }
  }

  /**
   * Broadcast session creation event
   */
  broadcastSessionCreated(farmId: string, sessionName: string, paneCount: number) {
    this.broadcastSessionEvent('created', {
      farmId,
      sessionName,
      paneCount,
      action: 'created'
    });
  }

  /**
   * Broadcast session destroyed event
   */
  broadcastSessionDestroyed(farmId: string, sessionName: string) {
    this.broadcastSessionEvent('destroyed', {
      farmId,
      sessionName,
      action: 'destroyed'
    });
  }

  /**
   * Force immediate broadcast of all sessions
   */
  async forceBroadcast() {
    await this.broadcastSessionUpdates();
  }
}

// Singleton instance
export const harvestSessionBroadcaster = new HarvestSessionBroadcaster();