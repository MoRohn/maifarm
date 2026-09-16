// Re-export the main websocket service for consistent imports
export { WebSocketService } from '../websocket';
export type { AgentStatus, FarmStatus, WebSocketMessage } from '../websocket';

// Add additional helper methods for the new features
import { websocketService as ws } from '../websocket';

// Interface for the extended websocket service
interface ExtendedWebSocketService {
  on(event: string, handler: any): void;
  off(event: string, handler: any): void;
  emit(event: string, data: any): void;
  connect(url?: string): void;
  disconnect(): void;
  getStatus(): string;
  isUsingMockData(): boolean;
  isConnecting(): boolean;
  getConnectionAttempts(): number;
  getMaxRetries(): number;
  broadcast(eventOrMessage: string | any, data?: any): void;
  send(event: string, data: any): void;
  startFarm(farmConfig: any): void;
  pauseFarm(farmId: string): void;
  resumeFarm(farmId: string): void;
  stopFarm(farmId: string): void;
  restartAgent(farmId: string, agentId: string): void;
  readonly connected: boolean;
  readonly socket: any;
}

// Extend with typed event emitters for Seeds, Harvest, and Barn
// Using Object.create to properly forward the connected getter
export const websocketService: ExtendedWebSocketService = {
  // Override the on method to handle both old and new event formats
  on(event: string, handler: any) {
    if ((ws as any).socket) {
      (ws as any).socket.on(event, handler);
    }
  },

  off(event: string, handler: any) {
    if ((ws as any).socket) {
      (ws as any).socket.off(event, handler);
    }
  },

  // Explicitly forward emit method
  emit(event: string, data: any) {
    ws.emit(event, data);
  },

  // Forward other methods
  connect(url?: string) {
    ws.connect(url);
  },

  disconnect() {
    ws.disconnect();
  },

  getStatus() {
    return ws.getStatus();
  },

  isUsingMockData() {
    return ws.isUsingMockData();
  },

  isConnecting() {
    return ws.isConnecting();
  },

  getConnectionAttempts() {
    return ws.getConnectionAttempts();
  },

  getMaxRetries() {
    return ws.getMaxRetries();
  },

  broadcast(eventOrMessage: string | any, data?: any) {
    ws.broadcast(eventOrMessage, data);
  },

  send(event: string, data: any) {
    ws.send(event, data);
  },

  startFarm(farmConfig: any) {
    ws.startFarm(farmConfig);
  },

  pauseFarm(farmId: string) {
    ws.pauseFarm(farmId);
  },

  resumeFarm(farmId: string) {
    ws.resumeFarm(farmId);
  },

  stopFarm(farmId: string) {
    ws.stopFarm(farmId);
  },

  restartAgent(farmId: string, agentId: string) {
    ws.restartAgent(farmId, agentId);
  },

  // Add getter for connected status - this properly forwards the getter
  get connected() {
    return ws.connected;
  },

  // Add getter for socket
  get socket() {
    return (ws as any).socket;
  }
};