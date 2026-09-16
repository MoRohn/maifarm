/**
 * HarvestWebSocketHandler - Manages WebSocket event subscriptions for HarvestPage
 * Centralizes all WebSocket event handling logic
 */

import { Agent } from '@/types/agent';
import { websocketService } from '@/services/websocket';

export interface WebSocketHandlerCallbacks {
  onFarmUpdate: (data: any) => void;
  onAgentUpdate: (data: any) => void;
  onTerminalOutput: (data: any) => void;
  onTerminalJoined: (data: any) => void;
  onHarvestStarted: (data: any) => void;
  onHarvestProgress: (data: any) => void;
  onHarvestCompleted: (data: any) => void;
  onFarmStatusChange: (data: any) => void;
  onFarmLaunched: (data: any) => void;
  onAgentRegistered: (data: any) => void;
  onSystemMessage?: (data: any) => void;
  onError?: (data: any) => void;
}

export class HarvestWebSocketHandler {
  private farmId: string;
  private callbacks: WebSocketHandlerCallbacks;
  private eventListeners: Array<{ event: string; handler: Function }> = [];
  private isSubscribed: boolean = false;

  constructor(farmId: string, callbacks: WebSocketHandlerCallbacks) {
    this.farmId = farmId;
    this.callbacks = callbacks;
  }

  /**
   * Subscribe to all WebSocket events for this farm
   */
  public subscribe(): void {
    if (this.isSubscribed) {
      console.log('[WebSocketHandler] Already subscribed, skipping duplicate subscription');
      return;
    }

    console.log(`[WebSocketHandler] Subscribing to WebSocket events for farm ${this.farmId}`);

    // Join the farm room
    websocketService.joinFarmRoom(this.farmId);

    // Farm events
    this.addEventListener('farm:updated', this.handleFarmUpdate.bind(this));
    this.addEventListener('farm:status', this.handleFarmStatusChange.bind(this));
    this.addEventListener('farm:launched', this.handleFarmLaunched.bind(this));

    // Agent events
    this.addEventListener('agent:updated', this.handleAgentUpdate.bind(this));
    this.addEventListener('agent:registered', this.handleAgentRegistered.bind(this));
    this.addEventListener('agent:status', this.handleAgentStatus.bind(this));

    // Terminal events
    this.addEventListener('terminal:output', this.handleTerminalOutput.bind(this));
    this.addEventListener('terminal:joined', this.handleTerminalJoined.bind(this));
    this.addEventListener('terminal:clear', this.handleTerminalClear.bind(this));

    // Harvest events
    this.addEventListener('harvest:started', this.handleHarvestStarted.bind(this));
    this.addEventListener('harvest:progress', this.handleHarvestProgress.bind(this));
    this.addEventListener('harvest:completed', this.handleHarvestCompleted.bind(this));

    // System events
    this.addEventListener('system:message', this.handleSystemMessage.bind(this));
    this.addEventListener('error', this.handleError.bind(this));

    this.isSubscribed = true;
  }

  /**
   * Unsubscribe from all WebSocket events
   */
  public unsubscribe(): void {
    if (!this.isSubscribed) {
      return;
    }

    console.log(`[WebSocketHandler] Unsubscribing from WebSocket events for farm ${this.farmId}`);

    // Remove all event listeners
    this.eventListeners.forEach(({ event, handler }) => {
      websocketService.off(event, handler as any);
    });

    // Leave the farm room
    websocketService.leaveFarmRoom(this.farmId);

    this.eventListeners = [];
    this.isSubscribed = false;
  }

  /**
   * Helper to add event listener and track it
   */
  private addEventListener(event: string, handler: Function): void {
    websocketService.on(event, handler as any);
    this.eventListeners.push({ event, handler });
  }

  // Farm event handlers
  private handleFarmUpdate(data: any): void {
    if (data.farmId === this.farmId || data.id === this.farmId) {
      console.log('[WebSocketHandler] Farm update received:', data);
      this.callbacks.onFarmUpdate(data);
    }
  }

  private handleFarmStatusChange(data: any): void {
    if (data.farmId === this.farmId || data.id === this.farmId) {
      console.log('[WebSocketHandler] Farm status change:', data.status);
      this.callbacks.onFarmStatusChange(data);
    }
  }

  private handleFarmLaunched(data: any): void {
    if (data.farmId === this.farmId || data.id === this.farmId) {
      console.log('[WebSocketHandler] Farm launched event received');
      this.callbacks.onFarmLaunched(data);
    }
  }

  // Agent event handlers
  private handleAgentUpdate(data: any): void {
    if (data.farmId === this.farmId || data.farm_id === this.farmId) {
      console.log('[WebSocketHandler] Agent update received:', data);
      this.callbacks.onAgentUpdate(data);
    }
  }

  private handleAgentRegistered(data: any): void {
    if (data.farmId === this.farmId) {
      console.log('[WebSocketHandler] Agent registered:', data);
      this.callbacks.onAgentRegistered(data);
    }
  }

  private handleAgentStatus(data: any): void {
    if (data.farmId === this.farmId || data.farm_id === this.farmId) {
      console.log('[WebSocketHandler] Agent status update:', data);
      this.callbacks.onAgentUpdate(data);
    }
  }

  // Terminal event handlers
  private handleTerminalOutput(data: any): void {
    if (data.farmId === this.farmId) {
      // Don't log terminal output as it's too verbose
      this.callbacks.onTerminalOutput(data);
    }
  }

  private handleTerminalJoined(data: any): void {
    if (data.farmId === this.farmId) {
      console.log('[WebSocketHandler] Terminal joined:', data);
      this.callbacks.onTerminalJoined(data);
    }
  }

  private handleTerminalClear(data: any): void {
    if (data.farmId === this.farmId && data.agentId !== undefined) {
      console.log('[WebSocketHandler] Terminal clear for agent:', data.agentId);
      // Clear the terminal content for this agent
      this.callbacks.onTerminalOutput({
        ...data,
        content: '',
        clear: true
      });
    }
  }

  // Harvest event handlers
  private handleHarvestStarted(data: any): void {
    if (data.farmId === this.farmId) {
      console.log('[WebSocketHandler] Harvest started:', data);
      this.callbacks.onHarvestStarted(data);
    }
  }

  private handleHarvestProgress(data: any): void {
    if (data.farmId === this.farmId || data.farm_id === this.farmId) {
      console.log('[WebSocketHandler] Harvest progress:', data.progress);
      this.callbacks.onHarvestProgress(data);
    }
  }

  private handleHarvestCompleted(data: any): void {
    if (data.farmId === this.farmId || data.farm_id === this.farmId) {
      console.log('[WebSocketHandler] Harvest completed:', data);
      this.callbacks.onHarvestCompleted(data);
    }
  }

  // System event handlers
  private handleSystemMessage(data: any): void {
    if (data.farmId === this.farmId) {
      console.log('[WebSocketHandler] System message:', data.message);
      if (this.callbacks.onSystemMessage) {
        this.callbacks.onSystemMessage(data);
      }
    }
  }

  private handleError(data: any): void {
    if (data.farmId === this.farmId) {
      console.error('[WebSocketHandler] Error event:', data);
      if (this.callbacks.onError) {
        this.callbacks.onError(data);
      }
    }
  }

  /**
   * Request terminal content for a specific agent
   */
  public requestTerminalContent(agentId: number): void {
    console.log(`[WebSocketHandler] Requesting terminal content for agent ${agentId}`);
    websocketService.emit('terminal:request-content', {
      farmId: this.farmId,
      agentId
    });
  }

  /**
   * Join terminal session for an agent
   */
  public joinTerminal(agentId: number): void {
    console.log(`[WebSocketHandler] Joining terminal for agent ${agentId}`);
    websocketService.emit('terminal:join', {
      farmId: this.farmId,
      agentId
    });
  }

  /**
   * Leave terminal session for an agent
   */
  public leaveTerminal(agentId: number): void {
    console.log(`[WebSocketHandler] Leaving terminal for agent ${agentId}`);
    websocketService.emit('terminal:leave', {
      farmId: this.farmId,
      agentId
    });
  }

  /**
   * Check if currently subscribed
   */
  public isActive(): boolean {
    return this.isSubscribed;
  }
}