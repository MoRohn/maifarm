import { create } from 'zustand'
import { Farm, Agent, WebSocketMessage } from '../types'

interface WebSocketState {
  connected: boolean
  messages: WebSocketMessage[]
  farms: Map<string, Farm>
  agents: Map<string, Agent>
  setConnected: (connected: boolean) => void
  addMessage: (message: WebSocketMessage) => void
  updateFarm: (farm: Partial<Farm> & { id: string }) => void
  updateAgent: (agent: Partial<Agent> & { id: string }) => void
  clearMessages: () => void
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  connected: false,
  messages: [],
  farms: new Map(),
  agents: new Map(),
  
  setConnected: (connected) => set({ connected }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message].slice(-100) // Keep last 100 messages
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
}))