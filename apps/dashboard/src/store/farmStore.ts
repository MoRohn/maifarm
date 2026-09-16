import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Farm, Agent, FarmMetrics } from '@/types'
import { farmService } from '@/services/farmService'

const isActiveFarmStatus = (status: Farm['status']) =>
  status === 'active' || status === 'running'

// Helper to safely get agents as Agent array
// FIX: Preserve string IDs by converting them to minimal Agent objects with all required fields
function getAgentsAsObjects(agents: Agent[] | string[]): Agent[] {
  if (agents.length === 0) return [];
  if (typeof agents[0] === 'string') {
    // Convert string IDs to minimal agent objects to prevent data loss
    const now = new Date();
    return (agents as string[]).map((id, idx) => ({
      id,
      name: `Agent-${id.slice(0, 8)}`,
      status: 'idle' as const,
      farmId: '',
      agentNumber: idx + 1,
      type: 'custom' as const,
      createdAt: now,
      updatedAt: now
    }));
  }
  return agents as Agent[];
}

interface FarmStats {
  activeFarms: number
  totalAgents: number
  harvestsCompleted: number
  yieldedItems: number
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
  loading: boolean
  error: string | null
  addFarm: (farm: Farm) => void
  updateFarm: (id: string, updates: Partial<Farm>) => void
  removeFarm: (id: string) => void
  setActiveFarms: (farms: Farm[]) => void
  updateStats: (stats: Partial<FarmStats>) => void
  fetchFarms: () => Promise<void>
  setError: (error: string | null) => void
  reorderFarms: (startIndex: number, endIndex: number) => void
  reorderAgentsInFarm: (farmId: string, startIndex: number, endIndex: number) => void
  moveAgentBetweenFarms: (sourceFarmId: string, destFarmId: string, agentId: string, destIndex: number) => void
  reset: () => void
}

export const useFarmStore = create<FarmState>()(
  persist(
    (set, get) => ({
      farms: [],
      activeFarms: [],
      recentFarms: [],
      stats: {
        activeFarms: 0,
        totalAgents: 0,
        harvestsCompleted: 0,
        yieldedItems: 0,
      },
      metrics: {
        totalAgents: 0,
        avgCpuUsage: 45,
        efficiencyScore: 88,
      },
      loading: false,
      error: null,
      
      addFarm: (farm) => set((state) => {
        // Ensure farm has agents array
        const normalizedFarm = { ...farm, agents: farm.agents || [] };
        return {
          farms: [...state.farms, normalizedFarm],
          activeFarms: isActiveFarmStatus(normalizedFarm.status)
            ? [...state.activeFarms, normalizedFarm]
            : state.activeFarms,
          recentFarms: [normalizedFarm, ...state.recentFarms].slice(0, 5),
        };
      }),
      
      updateFarm: (id, updates) => set((state) => {
        const updatedFarms = state.farms.map((f) => 
          f.id === id ? { ...f, ...updates } : f
        );
        
        // Rebuild activeFarms based on status
        const activeFarms = updatedFarms.filter(f => isActiveFarmStatus(f.status));
        
        return {
          farms: updatedFarms,
          activeFarms
        };
      }),
      
      removeFarm: (id) => set((state) => ({
        farms: state.farms.filter((f) => f.id !== id),
        activeFarms: state.activeFarms.filter((f) => f.id !== id),
      })),
      
      setActiveFarms: (farms) => set({ activeFarms: farms }),
      
      updateStats: (stats) => set((state) => ({
        stats: { ...state.stats, ...stats },
      })),
      
      fetchFarms: async () => {
        set({ loading: true, error: null });
        try {
          const { farms } = await farmService.fetchFarms();
          // Ensure all farms have agents arrays
          const normalizedFarms = farms.map(f => ({ ...f, agents: f.agents || [] }));
          const activeFarms = normalizedFarms.filter(f => isActiveFarmStatus(f.status));
          set({ 
            farms: normalizedFarms, 
            activeFarms,
            recentFarms: normalizedFarms.slice(0, 5),
            stats: {
              activeFarms: activeFarms.length,
              totalAgents: (() => {
                // Count unique agents from active farms only
                const uniqueAgents = new Set();
                activeFarms.forEach(f => {
                  (f.agents || []).forEach(agent => {
                    if (agent?.id) uniqueAgents.add(agent.id);
                  });
                });
                return uniqueAgents.size || activeFarms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
              })(),
              harvestsCompleted: farms.reduce((sum, f) => sum + (f.metrics?.completedTasks || 0), 0),
              yieldedItems: 0 // Will be populated from harvest data
            },
            loading: false 
          });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch farms',
            loading: false 
          });
        }
      },
      
      setError: (error) => set({ error }),

      reorderFarms: (startIndex, endIndex) => set((state) => {
        const result = Array.from(state.farms);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return { farms: result };
      }),

      reorderAgentsInFarm: (farmId, startIndex, endIndex) => set((state) => ({
        farms: state.farms.map(farm => {
          if (farm.id === farmId && farm.agents) {
            // Use helper to get agents as objects
            const agents = getAgentsAsObjects(farm.agents);
            if (agents.length === 0) return farm;
            const reordered = [...agents];
            const [removed] = reordered.splice(startIndex, 1);
            reordered.splice(endIndex, 0, removed);
            return { ...farm, agents: reordered };
          }
          return farm;
        })
      })),

      moveAgentBetweenFarms: (sourceFarmId, destFarmId, agentId, destIndex) => set((state) => {
        const sourceFarm = state.farms.find(f => f.id === sourceFarmId);
        const destFarm = state.farms.find(f => f.id === destFarmId);

        if (!sourceFarm || !destFarm || !sourceFarm.agents || !destFarm.agents) return state;

        // Use helper to get agents as objects
        const sourceAgents = getAgentsAsObjects(sourceFarm.agents);
        const destAgents = getAgentsAsObjects(destFarm.agents);

        const agentIndex = sourceAgents.findIndex(a => a.id === agentId);
        if (agentIndex === -1) return state;

        const [agent] = sourceAgents.splice(agentIndex, 1);
        destAgents.splice(destIndex, 0, agent);

        // FIX: Create new farm objects instead of mutating existing ones
        // This preserves Zustand reactivity and prevents stale state bugs
        const farms = state.farms.map(farm => {
          if (farm.id === sourceFarmId) {
            return { ...farm, agents: sourceAgents };
          }
          if (farm.id === destFarmId) {
            return { ...farm, agents: destAgents };
          }
          return farm;
        });

        return { farms };
      }),

      reset: () => set(() => ({
        farms: [],
        activeFarms: [],
        recentFarms: [],
        stats: {
          activeFarms: 0,
          totalAgents: 0,
          harvestsCompleted: 0,
          yieldedItems: 0,
        },
        metrics: {
          totalAgents: 0,
          avgCpuUsage: 45,
          efficiencyScore: 88,
        },
        loading: false,
        error: null,
      })),
    }),
    {
      name: 'maifarm-farms',
    }
  )
)
