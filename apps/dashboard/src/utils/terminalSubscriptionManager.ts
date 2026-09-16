/**
 * Terminal Subscription Manager
 * Handles robust WebSocket subscriptions for terminal events
 */

import { Socket } from 'socket.io-client';

interface TerminalSubscription {
  sessionId: string;
  farmId?: string;
  callback: (data: any) => void;
  retryCount: number;
  active: boolean;
}

class TerminalSubscriptionManager {
  private subscriptions = new Map<string, TerminalSubscription>();
  private socket: Socket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startReconnectionMonitor();
  }

  setSocket(socket: Socket) {
    if (this.socket) {
      this.unsubscribeAll();
    }
    
    this.socket = socket;
    this.setupSocketListeners();
    
    // Re-subscribe to all active subscriptions
    this.resubscribeAll();
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('[TerminalSubscriptionManager] Socket connected - resubscribing to all sessions');
      this.resubscribeAll();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[TerminalSubscriptionManager] Socket disconnected:', reason);
      this.markAllInactive();
    });

    // Terminal events - listen to ALL possible event names
    this.socket.on('terminal:output', this.handleTerminalOutput.bind(this));
    this.socket.on('terminal:data', this.handleTerminalOutput.bind(this));
    this.socket.on('agent:output', this.handleTerminalOutput.bind(this));
    this.socket.on('farm:terminal:output', this.handleTerminalOutput.bind(this));
    this.socket.on('terminal:stream', this.handleTerminalOutput.bind(this));
    this.socket.on('terminal:update', this.handleTerminalOutput.bind(this));
    this.socket.on('agent:terminal', this.handleTerminalOutput.bind(this));
    this.socket.on('harvest:terminal:update', this.handleTerminalOutput.bind(this));
    this.socket.on('harvest:terminal:output', this.handleTerminalOutput.bind(this));

    // Subscription confirmations
    this.socket.on('terminal:joined', (data) => {
      console.log('[TerminalSubscriptionManager] ✅ Joined session:', data);
      this.markSubscriptionActive(data.sessionId);
    });
  }

  private handleTerminalOutput(data: any) {
    const sessionId = data.sessionId || data.sessionName;
    if (!sessionId) {
      console.warn('[TerminalSubscriptionManager] Received output with no sessionId:', data);
      return;
    }

    console.log('[TerminalSubscriptionManager] Received terminal output for session:', sessionId, 'agentId:', data.agentId, 'lines:', data.lines?.length || 0);

    // Find matching subscriptions (flexible matching)
    const matchingSubscriptions = this.findMatchingSubscriptions(sessionId);
    
    console.log('[TerminalSubscriptionManager] Found', matchingSubscriptions.length, 'matching subscriptions for', sessionId);
    
    matchingSubscriptions.forEach(subscription => {
      try {
        console.log('[TerminalSubscriptionManager] Delivering to subscription:', subscription.sessionId);
        subscription.callback(data);
      } catch (error) {
        console.error('[TerminalSubscriptionManager] Error in subscription callback:', error);
      }
    });
    
    // If no matching subscriptions found, check if any subscription matches the variations
    if (matchingSubscriptions.length === 0 && data.sessionVariations) {
      for (const variation of data.sessionVariations) {
        const varMatchingSubscriptions = this.findMatchingSubscriptions(variation);
        if (varMatchingSubscriptions.length > 0) {
          console.log('[TerminalSubscriptionManager] Found matches using variation:', variation);
          varMatchingSubscriptions.forEach(subscription => {
            try {
              subscription.callback(data);
            } catch (error) {
              console.error('[TerminalSubscriptionManager] Error in subscription callback:', error);
            }
          });
          break; // Stop after first successful variation match
        }
      }
    }
  }

  private findMatchingSubscriptions(sessionId: string): TerminalSubscription[] {
    const matches: TerminalSubscription[] = [];

    for (const [key, subscription] of this.subscriptions) {
      if (this.isSessionMatch(sessionId, subscription.sessionId)) {
        matches.push(subscription);
      }
    }
    
    if (matches.length === 0) {
      // Debug: log all active subscriptions when no match found
      console.log('[TerminalSubscriptionManager] No matches for', sessionId, '. Active subscriptions:');
      for (const [key, subscription] of this.subscriptions) {
        console.log('  -', subscription.sessionId, 'active:', subscription.active);
      }
    }

    return matches;
  }

  private isSessionMatch(incomingSessionId: string, subscribedSessionId: string): boolean {
    // STRICT MATCHING ONLY - prevent any cross-session leakage
    // Only exact string matches are allowed
    return incomingSessionId === subscribedSessionId;
  }

  subscribe(sessionId: string, farmId: string | undefined, callback: (data: any) => void): string {
    const subscriptionKey = `${sessionId}-${Date.now()}`;
    
    const subscription: TerminalSubscription = {
      sessionId,
      farmId,
      callback,
      retryCount: 0,
      active: false
    };

    this.subscriptions.set(subscriptionKey, subscription);
    this.performSubscription(subscriptionKey);

    console.log(`[TerminalSubscriptionManager] Created subscription ${subscriptionKey} for session ${sessionId}`);
    return subscriptionKey;
  }

  private performSubscription(subscriptionKey: string) {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription || !this.socket || !this.socket.connected) {
      console.warn(`[TerminalSubscriptionManager] Cannot subscribe - socket not available`);
      return;
    }

    console.log(`[TerminalSubscriptionManager] Subscribing to session: ${subscription.sessionId}`);

    // Send multiple subscription formats for maximum compatibility
    this.socket.emit('terminal:join_session', {
      sessionId: subscription.sessionId,
      farmId: subscription.farmId,
      timestamp: Date.now()
    });

    this.socket.emit('join', `terminal:${subscription.sessionId}`);
    
    subscription.retryCount++;
  }

  unsubscribe(subscriptionKey: string) {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription) return;

    if (this.socket && this.socket.connected) {
      this.socket.emit('terminal:leave_session', {
        sessionId: subscription.sessionId
      });
    }

    this.subscriptions.delete(subscriptionKey);
    console.log(`[TerminalSubscriptionManager] Removed subscription ${subscriptionKey}`);
  }

  private resubscribeAll() {
    console.log(`[TerminalSubscriptionManager] Resubscribing to ${this.subscriptions.size} sessions`);
    
    for (const [key, subscription] of this.subscriptions) {
      subscription.active = false;
      subscription.retryCount = 0;
      
      // Add delay between subscriptions to avoid overwhelming server
      setTimeout(() => {
        this.performSubscription(key);
      }, subscription.retryCount * 100);
    }
  }

  private markAllInactive() {
    for (const subscription of this.subscriptions.values()) {
      subscription.active = false;
    }
  }

  private markSubscriptionActive(sessionId: string) {
    for (const subscription of this.subscriptions.values()) {
      if (this.isSessionMatch(sessionId, subscription.sessionId)) {
        subscription.active = true;
      }
    }
  }

  private unsubscribeAll() {
    if (this.socket) {
      for (const subscription of this.subscriptions.values()) {
        this.socket.emit('terminal:leave_session', {
          sessionId: subscription.sessionId
        });
      }
    }
  }

  private startReconnectionMonitor() {
    this.reconnectInterval = setInterval(() => {
      if (!this.socket?.connected) return;

      // Check for failed subscriptions and retry
      const failedSubscriptions = Array.from(this.subscriptions.entries())
        .filter(([, sub]) => !sub.active && sub.retryCount < 5);

      if (failedSubscriptions.length > 0) {
        console.log(`[TerminalSubscriptionManager] Retrying ${failedSubscriptions.length} failed subscriptions`);
        
        for (const [key, subscription] of failedSubscriptions) {
          setTimeout(() => {
            this.performSubscription(key);
          }, Math.random() * 2000); // Random delay to spread load
        }
      }
    }, 10000); // Check every 10 seconds
  }

  destroy() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.unsubscribeAll();
    this.subscriptions.clear();
    this.socket = null;
  }

  // Debug methods
  getSubscriptionStats() {
    const total = this.subscriptions.size;
    const active = Array.from(this.subscriptions.values()).filter(s => s.active).length;
    const failed = Array.from(this.subscriptions.values()).filter(s => s.retryCount >= 5).length;

    return { total, active, failed };
  }
}

// Singleton instance
export const terminalSubscriptionManager = new TerminalSubscriptionManager();
