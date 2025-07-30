import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Farm, Agent, FarmMetrics } from '../types'

interface FarmStats {
  activeFarms: number
  totalAgents: number
  tasksCompleted: number
  successRate: number
}

interface FarmState {
  farms: Farm[]
  activeFarms: Farm[]
  recentFarms: Farm[]
  stats: FarmStats
  metrics: {
    totalAgents: number
    avgCpuUsage: number
    efficiencyScore: number
  }
  addFarm: (farm: Farm) => void
  updateFarm: (id: string, updates: Partial<Farm>) => void
  removeFarm: (id: string) => void
  setActiveFarms: (farms: Farm[]) => void
  updateStats: (stats: Partial<FarmStats>) => void
}

export const useFarmStore = create<FarmState>()(
  persist(
    (set) => ({
      farms: [],
      activeFarms: [],
      recentFarms: [],
      stats: {
        activeFarms: 0,
        totalAgents: 0,
        tasksCompleted: 0,
        successRate: 95,
      },
      metrics: {
        totalAgents: 0,
        avgCpuUsage: 45,
        efficiencyScore: 88,
      },
      
      addFarm: (farm) => set((state) => ({
        farms: [...state.farms, farm],
        activeFarms: farm.status === 'active' 
          ? [...state.activeFarms, farm]
          : state.activeFarms,
        recentFarms: [farm, ...state.recentFarms].slice(0, 5),
      })),
      
      updateFarm: (id, updates) => set((state) => ({
        farms: state.farms.map((f) => 
          f.id === id ? { ...f, ...updates } : f
        ),
        activeFarms: state.activeFarms.map((f) =>
          f.id === id ? { ...f, ...updates } : f
        ),
      })),
      
      removeFarm: (id) => set((state) => ({
        farms: state.farms.filter((f) => f.id !== id),
        activeFarms: state.activeFarms.filter((f) => f.id !== id),
      })),
      
      setActiveFarms: (farms) => set({ activeFarms: farms }),
      
      updateStats: (stats) => set((state) => ({
        stats: { ...state.stats, ...stats },
      })),
    }),
    {
      name: 'maifarm-farms',
    }
  )
)