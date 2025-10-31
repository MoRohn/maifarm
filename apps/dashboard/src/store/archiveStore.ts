/**
 * Archive Store - State management for farm archives
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import apiClient from '@/services/apiClient';
import {
  ArchivedFarm,
  ArchivedFarmSummary,
  ArchiveFilter,
  ArchiveStats,
  ArchiveFarmRequest,
  RestoreFarmRequest,
  UpdateArchiveRequest
} from '@/types/archive';

interface ArchiveState {
  // State
  archivedFarms: ArchivedFarmSummary[];
  selectedArchive: ArchivedFarm | null;
  archiveStats: ArchiveStats | null;
  loading: boolean;
  error: string | null;

  // Pagination
  totalArchives: number;
  currentPage: number;
  pageSize: number;

  // Filter
  filter: ArchiveFilter;

  // Actions
  fetchArchivedFarms: (filter?: ArchiveFilter) => Promise<void>;
  fetchArchiveDetails: (archiveId: string) => Promise<void>;
  fetchArchiveStats: () => Promise<void>;
  archiveFarm: (request: ArchiveFarmRequest) => Promise<string>;
  restoreFarm: (request: RestoreFarmRequest) => Promise<void>;
  updateArchive: (archiveId: string, updates: UpdateArchiveRequest) => Promise<void>;
  deleteArchive: (archiveId: string) => Promise<void>;

  // UI Actions
  setFilter: (filter: Partial<ArchiveFilter>) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  clearSelectedArchive: () => void;
  clearError: () => void;
}

export const useArchiveStore = create<ArchiveState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        archivedFarms: [],
        selectedArchive: null,
        archiveStats: null,
        loading: false,
        error: null,
        totalArchives: 0,
        currentPage: 1,
        pageSize: 20,
        filter: {
          sortBy: 'archivedAt',
          sortOrder: 'desc'
        },

        // Fetch archived farms
        fetchArchivedFarms: async (filter?: ArchiveFilter) => {
          set({ loading: true, error: null });

          try {
            const currentFilter = filter || get().filter;
            const { currentPage, pageSize } = get();

            const params = new URLSearchParams();

            // Add filter params
            if (currentFilter.search) params.append('search', currentFilter.search);
            if (currentFilter.category) params.append('category', currentFilter.category);
            if (currentFilter.tags?.length) params.append('tags', currentFilter.tags.join(','));
            if (currentFilter.archivedBy) params.append('archivedBy', currentFilter.archivedBy);
            if (currentFilter.dateFrom) params.append('dateFrom', currentFilter.dateFrom.toISOString());
            if (currentFilter.dateTo) params.append('dateTo', currentFilter.dateTo.toISOString());
            if (currentFilter.isPublic !== undefined) params.append('isPublic', String(currentFilter.isPublic));
            if (currentFilter.isPinned !== undefined) params.append('isPinned', String(currentFilter.isPinned));
            if (currentFilter.minQualityScore !== undefined) params.append('minQualityScore', String(currentFilter.minQualityScore));

            // Add sorting
            params.append('sortBy', currentFilter.sortBy || 'archivedAt');
            params.append('sortOrder', currentFilter.sortOrder || 'desc');

            // Add pagination
            params.append('limit', String(pageSize));
            params.append('offset', String((currentPage - 1) * pageSize));

            const response = await apiClient.get(`/api/farms/archived?${params.toString()}`);

            if (response.data.success) {
              set({
                archivedFarms: response.data.data,
                totalArchives: response.data.total,
                loading: false,
                filter: currentFilter
              });
            } else {
              throw new Error(response.data.error || 'Failed to fetch archived farms');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch archived farms',
              loading: false
            });
          }
        },

        // Fetch archive details
        fetchArchiveDetails: async (archiveId: string) => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.get(`/api/farms/archived/${archiveId}`);

            if (response.data.success) {
              set({
                selectedArchive: response.data.data,
                loading: false
              });
            } else {
              throw new Error(response.data.error || 'Failed to fetch archive details');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch archive details',
              loading: false
            });
          }
        },

        // Fetch archive statistics
        fetchArchiveStats: async () => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.get('/api/farms/archived/stats');

            if (response.data.success) {
              set({
                archiveStats: response.data.data,
                loading: false
              });
            } else {
              throw new Error(response.data.error || 'Failed to fetch archive stats');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch archive stats',
              loading: false
            });
          }
        },

        // Archive a farm
        archiveFarm: async (request: ArchiveFarmRequest) => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.post(`/api/farms/${request.farmId}/archive`, {
              reason: request.reason,
              notes: request.notes,
              category: request.category,
              tags: request.tags,
              isPublic: request.isPublic
            });

            if (response.data.success) {
              set({ loading: false });

              // Refresh the archived farms list
              await get().fetchArchivedFarms();

              return response.data.data.archiveId;
            } else {
              throw new Error(response.data.error || 'Failed to archive farm');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to archive farm',
              loading: false
            });
            throw error;
          }
        },

        // Restore a farm
        restoreFarm: async (request: RestoreFarmRequest) => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.post(`/api/farms/${request.farmId}/restore`, {
              createCopy: request.createCopy
            });

            if (response.data.success) {
              set({ loading: false });

              // Refresh the archived farms list
              await get().fetchArchivedFarms();
            } else {
              throw new Error(response.data.error || 'Failed to restore farm');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to restore farm',
              loading: false
            });
            throw error;
          }
        },

        // Update archive metadata
        updateArchive: async (archiveId: string, updates: UpdateArchiveRequest) => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.patch(`/api/farms/archived/${archiveId}`, updates);

            if (response.data.success) {
              set({ loading: false });

              // Update the selected archive if it's the same one
              const selectedArchive = get().selectedArchive;
              if (selectedArchive && selectedArchive.id === archiveId) {
                set({
                  selectedArchive: {
                    ...selectedArchive,
                    ...updates
                  }
                });
              }

              // Refresh the list
              await get().fetchArchivedFarms();
            } else {
              throw new Error(response.data.error || 'Failed to update archive');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update archive',
              loading: false
            });
            throw error;
          }
        },

        // Delete archive
        deleteArchive: async (archiveId: string) => {
          set({ loading: true, error: null });

          try {
            const response = await apiClient.delete(`/api/farms/archived/${archiveId}`);

            if (response.data.success) {
              set({ loading: false });

              // Clear selected archive if it's the deleted one
              const selectedArchive = get().selectedArchive;
              if (selectedArchive && selectedArchive.id === archiveId) {
                set({ selectedArchive: null });
              }

              // Refresh the list
              await get().fetchArchivedFarms();
            } else {
              throw new Error(response.data.error || 'Failed to delete archive');
            }
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete archive',
              loading: false
            });
            throw error;
          }
        },

        // UI Actions
        setFilter: (filter: Partial<ArchiveFilter>) => {
          const currentFilter = get().filter;
          const newFilter = { ...currentFilter, ...filter };
          set({ filter: newFilter, currentPage: 1 });

          // Auto-fetch with new filter
          get().fetchArchivedFarms(newFilter);
        },

        setCurrentPage: (page: number) => {
          set({ currentPage: page });
          get().fetchArchivedFarms();
        },

        setPageSize: (size: number) => {
          set({ pageSize: size, currentPage: 1 });
          get().fetchArchivedFarms();
        },

        clearSelectedArchive: () => {
          set({ selectedArchive: null });
        },

        clearError: () => {
          set({ error: null });
        }
      }),
      {
        name: 'archive-storage',
        partialize: (state) => ({
          filter: state.filter,
          pageSize: state.pageSize
        })
      }
    )
  )
);