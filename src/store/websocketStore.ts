import { create } from 'zustand'
import { Farm, Agent, WebSocketMessage } from '../types'

interface WebSocketState {
  connected: boolean
  messages: WebSocketMessage[]
  lastMessage: WebSocketMessage | null
  farms: Map<string, Farm>
  agents: Map<string, Agent>
  messageHandlers: Map<string, Set<(message: WebSocketMessage) => void>>
  eventListeners: Map<string, Set<(data: any) => void>>
  setConnected: (connected: boolean) => void
  addMessage: (message: WebSocketMessage) => void
  updateFarm: (farm: Partial<Farm> & { id: string }) => void
  updateAgent: (agent: Partial<Agent> & { id: string }) => void
  clearMessages: () => void
  subscribe: (event: string, callback: (data: any) => void) => () => void
  unsubscribe: (event: string, callback: (data: any) => void) => void
  sendMessage: (message: any) => void
  addMessageHandler: (type: string, handler: (message: WebSocketMessage) => void) => void
  removeMessageHandler: (type: string, handler: (message: WebSocketMessage) => void) => void
  triggerEvent: (event: string, data: any) => void
}

// WebSocket instance stored outside of Zustand for direct access
let wsInstance: WebSocket | null = null;

export const setWebSocketInstance = (ws: WebSocket | null) => {
  wsInstance = ws;
};

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  connected: false,
  messages: [],
  lastMessage: null,
  farms: new Map(),
  agents: new Map(),
  messageHandlers: new Map(),
  eventListeners: new Map(),
  
  setConnected: (connected) => set({ connected }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message].slice(-100), // Keep last 100 messages
    lastMessage: message
  })),
  
  updateFarm: (farmUpdate) => set((state) => {
    const farms = new Map(state.farms)
    const existingFarm = farms.get(farmUpdate.id)
    if (existingFarm) {
      farms.set(farmUpdate.id, { ...existingFarm, ...farmUpdate })
    } else {
      farms.set(farmUpdate.id, farmUpdate as Farm)
    }
    return { farms }
  }),
  
  updateAgent: (agentUpdate) => set((state) => {
    const agents = new Map(state.agents)
    const existingAgent = agents.get(agentUpdate.id)
    if (existingAgent) {
      agents.set(agentUpdate.id, { ...existingAgent, ...agentUpdate })
    } else {
      agents.set(agentUpdate.id, agentUpdate as Agent)
    }
    return { agents }
  }),
  
  clearMessages: () => set({ messages: [] }),
  
  subscribe: (event, callback) => {
    set((state) => {
      const listeners = new Map(state.eventListeners)
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)?.add(callback)
      return { eventListeners: listeners }
    })
    
    // Return unsubscribe function
    return () => {
      get().unsubscribe(event, callback)
    }
  },
  
  unsubscribe: (event, callback) => {
    set((state) => {
      const listeners = new Map(state.eventListeners)
      listeners.get(event)?.delete(callback)
      if (listeners.get(event)?.size === 0) {
        listeners.delete(event)
      }
      return { eventListeners: listeners }
    })
  },
  
  triggerEvent: (event, data) => {
    const listeners = get().eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  },
  
  sendMessage: (message) => {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  },
  
  addMessageHandler: (type, handler) => set((state) => {
    const handlers = new Map(state.messageHandlers);
    if (!handlers.has(type)) {
      handlers.set(type, new Set());
    }
    handlers.get(type)?.add(handler);
    return { messageHandlers: handlers };
  }),
  
  removeMessageHandler: (type, handler) => set((state) => {
    const handlers = new Map(state.messageHandlers);
    handlers.get(type)?.delete(handler);
    if (handlers.get(type)?.size === 0) {
      handlers.delete(type);
    }
    return { messageHandlers: handlers };
  }),
}))