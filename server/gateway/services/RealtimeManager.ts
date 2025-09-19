import { getSocketServer } from '../../websocket/socketServer.js';
import { EventEmitter } from 'events';

export class RealtimeManager extends EventEmitter {
  private subscriptions = new Map<string, Set<string>>();
  
  async getConnectionStatus() {
    const io = getSocketServer();
    const sockets = await io.fetchSockets();
    
    return {
      connected: sockets.length,
      channels: Array.from(this.subscriptions.keys()),
      uptime: process.uptime()
    };
  }
  
  async subscribe(data: { clientId: string; channels: string[] }) {
    const { clientId, channels } = data;
    
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    
    const clientSubs = this.subscriptions.get(clientId)!;
    channels.forEach(channel => clientSubs.add(channel));
    
    return {
      clientId,
      subscribed: Array.from(clientSubs)
    };
  }
  
  async unsubscribe(data: { clientId: string; channels?: string[] }) {
    const { clientId, channels } = data;
    
    if (!channels) {
      // Unsubscribe from all
      this.subscriptions.delete(clientId);
    } else {
      const clientSubs = this.subscriptions.get(clientId);
      if (clientSubs) {
        channels.forEach(channel => clientSubs.delete(channel));
        if (clientSubs.size === 0) {
          this.subscriptions.delete(clientId);
        }
      }
    }
  }
  
  async getAvailableChannels() {
    return [
      'farms',
      'agents',
      'tasks',
      'metrics',
      'harvests',
      'system'
    ];
  }
}