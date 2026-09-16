import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FarmerGroup, FarmerTemplate, FarmerDbStats } from '@/types/farmers';
import { api } from '@/services/apiClient';

interface FarmerGroupState {
  // Data
  groups: FarmerGroup[];
  selectedGroup: FarmerGroup | null;
  farmersInGroup: FarmerTemplate[];
  allStats: FarmerDbStats[];
  favorites: string[];
  recentFarmers: string[];

  // UI State
  loading: boolean;
  error: string | null;

  // Actions
  fetchGroups: () => Promise<void>;
  selectGroup: (groupId: string | null) => Promise<void>;
  fetchFarmersInGroup: (groupId: string) => Promise<FarmerTemplate[]>;
  fetchAllStats: () => Promise<void>;
  fetchFavorites: () => Promise<void>;
  fetchRecentFarmers: (limit?: number) => Promise<void>;
  toggleFavorite: (farmerId: string) => Promise<boolean>;
  addRating: (farmerId: string, rating: number, farmId?: string, review?: string) => Promise<void>;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  groups: [],
  selectedGroup: null,
  farmersInGroup: [],
  allStats: [],
  favorites: [],
  recentFarmers: [],
  loading: false,
  error: null,
};

export const useFarmerGroupStore = create<FarmerGroupState>()(
  persist(
    (set, get) => ({
      ...initialState,

      fetchGroups: async () => {
        set({ loading: true, error: null });
        try {
          const response = await api.farmerGroups.list();
          const groups = response.data?.data || [];
          set({ groups, loading: false });
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to fetch groups:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch groups',
            loading: false,
          });
        }
      },

      selectGroup: async (groupId: string | null) => {
        if (!groupId) {
          set({ selectedGroup: null, farmersInGroup: [] });
          return;
        }

        set({ loading: true, error: null });
        try {
          // Find in cached groups first
          const cachedGroup = get().groups.find(g => g.id === groupId || g.slug === groupId);

          if (cachedGroup) {
            set({ selectedGroup: cachedGroup });
          } else {
            // Fetch from API
            const response = await api.farmerGroups.getById(groupId);
            if (response.data?.data) {
              set({ selectedGroup: response.data.data });
            }
          }

          // Fetch farmers in this group
          const farmersResponse = await api.farmerGroups.getFarmers(groupId);
          const farmers = farmersResponse.data?.data?.farmers || [];
          set({ farmersInGroup: farmers, loading: false });
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to select group:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to load group',
            loading: false,
          });
        }
      },

      fetchFarmersInGroup: async (groupId: string) => {
        try {
          const response = await api.farmerGroups.getFarmers(groupId);
          const farmers = response.data?.data?.farmers || [];
          set({ farmersInGroup: farmers });
          return farmers;
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to fetch farmers:', error);
          return [];
        }
      },

      fetchAllStats: async () => {
        try {
          const response = await api.farmerGroups.getAllStats();
          const stats = response.data?.data || [];
          set({ allStats: stats });
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to fetch stats:', error);
        }
      },

      fetchFavorites: async () => {
        try {
          const response = await api.farmerGroups.getFavorites();
          const favoriteIds = response.data?.farmerIds || [];
          set({ favorites: favoriteIds });
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to fetch favorites:', error);
        }
      },

      fetchRecentFarmers: async (limit = 5) => {
        try {
          const response = await api.farmerGroups.getRecent(limit);
          const recentIds = response.data?.farmerIds || [];
          set({ recentFarmers: recentIds });
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to fetch recent farmers:', error);
        }
      },

      toggleFavorite: async (farmerId: string) => {
        try {
          const response = await api.farmerGroups.toggleFavorite(farmerId);
          const isFavorite = response.data?.data?.isFavorite || false;

          // Update local state
          set(state => ({
            favorites: isFavorite
              ? [...state.favorites, farmerId]
              : state.favorites.filter(id => id !== farmerId),
          }));

          return isFavorite;
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to toggle favorite:', error);
          return false;
        }
      },

      addRating: async (farmerId: string, rating: number, farmId?: string, review?: string) => {
        try {
          await api.farmerGroups.addRating({ farmerId, rating, farmId, review });
          // Refresh stats after rating
          get().fetchAllStats();
        } catch (error) {
          console.error('[FarmerGroupStore] Failed to add rating:', error);
          throw error;
        }
      },

      setError: (error) => set({ error }),

      reset: () => set(initialState),
    }),
    {
      name: 'farmer-group-storage',
      partialize: (state) => ({
        // Only persist favorites and recent - not full data
        favorites: state.favorites,
        recentFarmers: state.recentFarmers,
      }),
    }
  )
);

// Selector hooks for common patterns
export const useGroups = () => useFarmerGroupStore(state => state.groups);
export const useSelectedGroup = () => useFarmerGroupStore(state => state.selectedGroup);
export const useFarmersInGroup = () => useFarmerGroupStore(state => state.farmersInGroup);
export const useFavorites = () => useFarmerGroupStore(state => state.favorites);
export const useRecentFarmers = () => useFarmerGroupStore(state => state.recentFarmers);
