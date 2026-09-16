import { GoWildSession, GoWildConfig } from '@/types/goWild';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const WS_BASE = import.meta.env.VITE_WS_URL || '';

class GoWildService {
  private wsConnections: Map<string, WebSocket> = new Map();

  connectWebSocket(farmId: string): WebSocket {
    const existingWs = this.wsConnections.get(farmId);
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      return existingWs;
    }

    // Connect to the main WebSocket endpoint, not a specific Go Wild endpoint
    const ws = new WebSocket(WS_BASE);
    
    // Once connected, subscribe to Go Wild events for this farm
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'goWild',
        farmId: farmId
      }));
    });

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
      const result = await response.json();
      return result.data || result;
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

    const result = await response.json();
    return result.data || result;
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

  async saveDefaultConfig(config: GoWildConfig): Promise<void> {
    // Save to localStorage for client-side persistence (with iOS Safari private browsing protection)
    try {
      localStorage.setItem('goWildDefaultConfig', JSON.stringify(config));
    } catch {
      // iOS Safari private browsing mode - localStorage unavailable
      console.warn('[GoWildService] localStorage unavailable (iOS Safari private mode?) - config not persisted');
    }

    // Also try to save to backend if available
    try {
      const response = await fetch(`${API_BASE}/go-wild/config/default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        console.warn('Failed to save default config to backend:', response.statusText);
      }
    } catch (error) {
      console.warn('Failed to save default config to backend:', error);
      // Not critical - localStorage save is sufficient
    }
  }

  async getDefaultConfig(): Promise<GoWildConfig | null> {
    // First try to get from localStorage (with iOS Safari private browsing protection)
    try {
      const stored = localStorage.getItem('goWildDefaultConfig');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (error) {
          console.error('Failed to parse stored config:', error);
        }
      }
    } catch {
      // iOS Safari private browsing mode - localStorage unavailable
      console.warn('[GoWildService] localStorage unavailable (iOS Safari private mode?)');
    }

    // Fallback to backend
    try {
      const response = await fetch(`${API_BASE}/go-wild/config/default`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to fetch default config from backend:', error);
    }

    return null;
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