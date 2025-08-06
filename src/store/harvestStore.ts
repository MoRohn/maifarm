import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Harvest, HarvestFilter, HarvestSummary } from '../types/harvest';
import { BarnStats } from '../types/barn';
import { harvestService } from '../services/harvestService';
import { api } from '../services/apiClient';

interface HarvestData {
  artifacts: any[];
  metrics: any[];
  insights: any[];
  agents: any[];
}

interface HarvestState {
  harvests: Harvest[];
  recentHarvests: Harvest[];
  harvestSummaries: HarvestSummary[];
  harvestData: HarvestData | null;
  stats: BarnStats | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchHarvests: (filter?: HarvestFilter) => Promise<void>;
  fetchHarvestSummaries: () => Promise<void>;
  fetchHarvest: (farmId: string) => Promise<void>;
  createHarvest: (farmId: string, farmName: string) => Promise<Harvest | null>;
  addHarvest: (harvest: Harvest) => void;
  updateHarvest: (id: string, updates: Partial<Harvest>) => void;
  updateHarvestData: (data: Partial<HarvestData>) => void;
  deleteHarvest: (id: string) => void;
  recordHarvestUse: (id: string) => void;
  fetchStats: () => Promise<void>;
  clearHarvest: () => void;
}

export const useHarvestStore = create<HarvestState>()(
  persist(
    (set, get) => ({
      harvests: [],
      recentHarvests: [],
      harvestSummaries: [],
      harvestData: null,
      stats: null,
      loading: false,
      error: null,

      fetchHarvests: async (filter?: HarvestFilter) => {
        set({ loading: true, error: null });
        try {
          const harvests = await harvestService.getAll(filter);
          set({
            harvests,
            recentHarvests: harvests
              .sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
              .slice(0, 10),
            loading: false
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch harvests',
            loading: false
          });
        }
      },
      
      fetchHarvestSummaries: async () => {
        try {
          const summaries = await harvestService.getSummaries();
          set({ harvestSummaries: summaries });
        } catch (error) {
          console.error('Failed to fetch harvest summaries:', error);
        }
      },

      addHarvest: (harvest) => set((state) => ({
        harvests: [harvest, ...state.harvests],
        recentHarvests: [harvest, ...state.recentHarvests].slice(0, 10)
      })),

      updateHarvest: (id, updates) => set((state) => ({
        harvests: state.harvests.map(h => 
          h.id === id ? { ...h, ...updates } : h
        ),
        recentHarvests: state.recentHarvests.map(h => 
          h.id === id ? { ...h, ...updates } : h
        )
      })),

      deleteHarvest: (id) => set((state) => ({
        harvests: state.harvests.filter(h => h.id !== id),
        recentHarvests: state.recentHarvests.filter(h => h.id !== id)
      })),

      recordHarvestUse: (id) => {
        // This method is no longer needed for harvest entities
        // Harvest use is tracked differently than barn items
        console.log('recordHarvestUse called for:', id);
      },

      fetchStats: async () => {
        try {
          const response = await api.barn.stats();
          if (response.data.success) {
            set({ stats: response.data.data });
          }
        } catch (error) {
          console.error('Failed to fetch barn stats:', error);
        }
      },

      createHarvest: async (farmId: string, farmName: string) => {
        set({ loading: true, error: null });
        try {
          // Use the harvest service to start a harvest
          const harvest = await harvestService.startHarvest(farmId, farmName);
          get().addHarvest(harvest);
          set({ loading: false });
          return harvest;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create harvest',
            loading: false
          });
          return null;
        }
      },
      
      fetchHarvest: async (farmId: string) => {
        set({ loading: true, error: null });
        try {
          // Fetch harvest data from coordination files or API
          const harvests = await harvestService.getByFarmId(farmId);
          if (harvests.length > 0) {
            // Simulate harvest data - in production this would come from agent outputs
            const harvestData: HarvestData = {
              artifacts: [],
              metrics: [],
              insights: [],
              agents: []
            };
            set({ harvestData, loading: false });
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch harvest',
            loading: false
          });
        }
      },
      
      updateHarvestData: (data: Partial<HarvestData>) => set((state) => ({
        harvestData: state.harvestData 
          ? { ...state.harvestData, ...data }
          : { artifacts: [], metrics: [], insights: [], agents: [], ...data }
      })),
      
      clearHarvest: () => set({ 
        harvestData: null,
        loading: false,
        error: null 
      })
    }),
    {
      name: 'maifarm-harvests'
    }
  )
);