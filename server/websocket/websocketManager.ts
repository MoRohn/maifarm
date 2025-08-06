import WebSocketServer from './socketServer';

class WebSocketManagerClass {
  private static instance: WebSocketManagerClass;
  private server: WebSocketServer | null = null;

  static getInstance(): WebSocketManagerClass {
    if (!WebSocketManagerClass.instance) {
      WebSocketManagerClass.instance = new WebSocketManagerClass();
    }
    return WebSocketManagerClass.instance;
  }

  setServer(server: WebSocketServer): void {
    this.server = server;
  }

  broadcast(event: string, data: any): void {
    if (this.server) {
      this.server.broadcast(event, data);
    }
  }

  sendToUser(userId: string, event: string, data: any): void {
    if (this.server) {
      // Implement user-specific messaging if needed
      // For now, broadcast to all
      this.server.broadcast(event, data);
    }
  }

  broadcastToFarm(farmId: string, event: string, data: any): void {
    if (this.server) {
      // In a production system, this would send only to users subscribed to this farm
      // For now, broadcast to all with farmId in the data
      this.server.broadcast(event, { ...data, farmId });
    }
  }

  getServer(): WebSocketServer | null {
    return this.server;
  }
}

export const WebSocketManager = WebSocketManagerClass.getInstance();
export const websocketManager = WebSocketManager;