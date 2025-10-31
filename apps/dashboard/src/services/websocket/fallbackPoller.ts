/**
 * HTTP Long-polling fallback for when WebSocket fails
 * Provides degraded but functional real-time communication
 */

interface PollResponse {
  messages: Array<{ event: string; data: any }>;
  timestamp: number;
  nextPollDelay?: number;
}

interface PollRequest {
  clientId: string;
  lastTimestamp: number;
  pendingMessages?: Array<{ event: string; data: any }>;
}

export class FallbackPoller {
  private baseUrl: string;
  private clientId: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastTimestamp = 0;
  private pollDelay = 2000; // Start with 2 second polling
  private maxPollDelay = 10000; // Max 10 seconds
  private minPollDelay = 1000; // Min 1 second
  private consecutiveErrors = 0;
  private pendingMessages: Array<{ event: string; data: any }> = [];
  private messageCallback: ((messages: Array<{ event: string; data: any }>) => void) | null = null;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.clientId = this.generateClientId();
  }
  
  /**
   * Start polling
   */
  start(onMessage: (messages: Array<{ event: string; data: any }>) => void): void {
    if (this.isPolling) {
      console.warn('[FallbackPoller] Already polling');
      return;
    }
    
    console.log('[FallbackPoller] Starting HTTP long-polling fallback');
    this.isPolling = true;
    this.messageCallback = onMessage;
    this.poll();
  }
  
  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isPolling) return;
    
    console.log('[FallbackPoller] Stopping HTTP long-polling');
    this.isPolling = false;
    
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    
    this.messageCallback = null;
    this.consecutiveErrors = 0;
    this.pollDelay = 2000;
  }
  
  /**
   * Send a message via fallback
   */
  send(event: string, data: any): void {
    this.pendingMessages.push({ event, data });
    
    // If we have too many pending messages, trigger immediate poll
    if (this.pendingMessages.length > 5 && !this.pollInterval) {
      this.poll();
    }
  }
  
  /**
   * Perform a poll request
   */
  private async poll(): Promise<void> {
    if (!this.isPolling) return;
    
    try {
      const request: PollRequest = {
        clientId: this.clientId,
        lastTimestamp: this.lastTimestamp,
        pendingMessages: this.pendingMessages.splice(0, 10) // Send up to 10 messages
      };
      
      const response = await fetch(`${this.baseUrl}/api/fallback/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': this.clientId,
          'X-Fallback-Mode': 'true'
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status} ${response.statusText}`);
      }
      
      const data: PollResponse = await response.json();
      
      // Update timestamp
      this.lastTimestamp = data.timestamp;
      
      // Process received messages
      if (data.messages && data.messages.length > 0) {
        if (this.messageCallback) {
          this.messageCallback(data.messages);
        }
      }
      
      // Adjust poll delay based on server recommendation
      if (data.nextPollDelay) {
        this.pollDelay = Math.max(
          this.minPollDelay,
          Math.min(this.maxPollDelay, data.nextPollDelay)
        );
      } else {
        // Reduce delay if we received messages (more activity)
        if (data.messages && data.messages.length > 0) {
          this.pollDelay = Math.max(this.minPollDelay, this.pollDelay - 500);
        } else {
          // Increase delay if no messages (less activity)
          this.pollDelay = Math.min(this.maxPollDelay, this.pollDelay + 500);
        }
      }
      
      // Reset error counter on success
      this.consecutiveErrors = 0;
      
    } catch (error) {
      console.error('[FallbackPoller] Poll error:', error);
      this.consecutiveErrors++;
      
      // Exponential backoff on errors
      if (this.consecutiveErrors > 3) {
        this.pollDelay = Math.min(this.maxPollDelay, this.pollDelay * 2);
      }
      
      // Stop polling after too many errors
      if (this.consecutiveErrors > 10) {
        console.error('[FallbackPoller] Too many consecutive errors, stopping');
        this.stop();
        return;
      }
    }
    
    // Schedule next poll
    if (this.isPolling) {
      this.pollInterval = setTimeout(() => {
        this.pollInterval = null;
        this.poll();
      }, this.pollDelay);
    }
  }
  
  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `fallback_${timestamp}_${random}`;
  }
  
  /**
   * Get polling status
   */
  getStatus(): {
    isPolling: boolean;
    pollDelay: number;
    consecutiveErrors: number;
    pendingMessages: number;
    lastTimestamp: number;
  } {
    return {
      isPolling: this.isPolling,
      pollDelay: this.pollDelay,
      consecutiveErrors: this.consecutiveErrors,
      pendingMessages: this.pendingMessages.length,
      lastTimestamp: this.lastTimestamp
    };
  }
}