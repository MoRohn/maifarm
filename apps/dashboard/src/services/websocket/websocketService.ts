// Re-export the main websocket service for consistent imports
export { WebSocketService } from '../websocket';
export type { AgentStatus, FarmStatus, WebSocketMessage } from '../websocket';

// Add additional helper methods for the new features
import { websocketService as ws } from '../websocket';

// Extend with typed event emitters for Seeds, Harvest, and Barn
export const websocketService = {
  ...ws,
  
  // Override the on method to handle both old and new event formats
  on(event: string, handler: any) {
    if (ws.socket) {
      ws.socket.on(event, handler);
    }
  },
  
  off(event: string, handler: any) {
    if (ws.socket) {
      ws.socket.off(event, handler);
    }
  },
  
  // Add getter for socket
  get socket() {
    return (ws as any).socket;
  }
};