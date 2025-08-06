/**
 * WebSocket Connection Debugger
 * Helps track and debug WebSocket connection issues
 */

interface ConnectionEvent {
  timestamp: Date;
  type: 'connect' | 'disconnect' | 'error' | 'reconnect' | 'reference';
  details: string;
  referenceCount?: number;
}

class ConnectionDebugger {
  private events: ConnectionEvent[] = [];
  private maxEvents = 100;
  private debugMode = false;

  constructor() {
    // Enable debug mode in development
    this.debugMode = import.meta.env.DEV;
  }

  log(type: ConnectionEvent['type'], details: string, referenceCount?: number) {
    if (!this.debugMode) return;

    const event: ConnectionEvent = {
      timestamp: new Date(),
      type,
      details,
      referenceCount
    };

    this.events.push(event);
    
    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console with color coding
    const colors = {
      connect: 'color: green',
      disconnect: 'color: red',
      error: 'color: orange',
      reconnect: 'color: blue',
      reference: 'color: purple'
    };

    console.log(
      `%c[WS-Debug] [${type}] ${details}${referenceCount !== undefined ? ` (refs: ${referenceCount})` : ''}`,
      colors[type]
    );
  }

  getRecentEvents(count = 20): ConnectionEvent[] {
    return this.events.slice(-count);
  }

  analyzeConnectionStability(): {
    totalEvents: number;
    disconnects: number;
    errors: number;
    reconnects: number;
    stability: 'stable' | 'unstable' | 'critical';
  } {
    const recentEvents = this.getRecentEvents(50);
    const disconnects = recentEvents.filter(e => e.type === 'disconnect').length;
    const errors = recentEvents.filter(e => e.type === 'error').length;
    const reconnects = recentEvents.filter(e => e.type === 'reconnect').length;

    let stability: 'stable' | 'unstable' | 'critical' = 'stable';
    if (disconnects > 10 || errors > 5) {
      stability = 'critical';
    } else if (disconnects > 5 || errors > 2) {
      stability = 'unstable';
    }

    return {
      totalEvents: recentEvents.length,
      disconnects,
      errors,
      reconnects,
      stability
    };
  }

  clear() {
    this.events = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

export const wsDebugger = new ConnectionDebugger();