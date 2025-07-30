import { GoWildSession, GoWildConfig } from '../types/goWild';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8080/api';
const WS_BASE = process.env.REACT_APP_WS_BASE || 'ws://localhost:8080';

class GoWildService {
  private wsConnections: Map<string, WebSocket> = new Map();

  connectWebSocket(farmId: string): WebSocket {
    const existingWs = this.wsConnections.get(farmId);
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      return existingWs;
    }

    const ws = new WebSocket(`${WS_BASE}/go-wild/${farmId}`);
    this.wsConnections.set(farmId, ws);
    return ws;
  }

  async getSession(farmId: string): Promise<GoWildSession | null> {
    try {
      const response = await fetch(`${API_BASE}/go-wild/session/${farmId}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch session: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching session:', error);
      throw error;
    }
  }

  async startExploration(farmId: string, config: GoWildConfig): Promise<GoWildSession> {
    const response = await fetch(`${API_BASE}/go-wild/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ farmId, config })
    });

    if (!response.ok) {
      throw new Error(`Failed to start exploration: ${response.statusText}`);
    }

    return await response.json();
  }

  async pauseExploration(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/go-wild/${sessionId}/pause`, {
      method: 'PUT'
    });

    if (!response.ok) {
      throw new Error(`Failed to pause exploration: ${response.statusText}`);
    }
  }

  async resumeExploration(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/go-wild/${sessionId}/resume`, {
      method: 'PUT'
    });

    if (!response.ok) {
      throw new Error(`Failed to resume exploration: ${response.statusText}`);
    }
  }

  async stopExploration(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/go-wild/${sessionId}/stop`, {
      method: 'PUT'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop exploration: ${response.statusText}`);
    }
  }

  async updateConfig(sessionId: string, config: GoWildConfig): Promise<void> {
    const response = await fetch(`${API_BASE}/go-wild/${sessionId}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      throw new Error(`Failed to update config: ${response.statusText}`);
    }
  }

  async saveDiscovery(sessionId: string, discoveryId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/go-wild/${sessionId}/discovery/${discoveryId}/save`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Failed to save discovery: ${response.statusText}`);
    }
  }

  closeConnection(farmId: string): void {
    const ws = this.wsConnections.get(farmId);
    if (ws) {
      ws.close();
      this.wsConnections.delete(farmId);
    }
  }

  closeAllConnections(): void {
    this.wsConnections.forEach(ws => ws.close());
    this.wsConnections.clear();
  }
}

export const goWildService = new GoWildService();