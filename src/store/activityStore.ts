import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActivityItem {
  id: string;
  type: 'farm_created' | 'farm_completed' | 'agent_error' | 'farm_paused' | 'agent_started' | 'farm_deleted' | 'harvest_created' | 'seed_created';
  title: string;
  description: string;
  timestamp: Date;
  farmId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

interface ActivityStore {
  activities: ActivityItem[];
  maxActivities: number;
  
  // Actions
  addActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  clearActivities: () => void;
  removeActivity: (id: string) => void;
  getRecentActivities: (limit?: number) => ActivityItem[];
}

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set, get) => ({
      activities: [],
      maxActivities: 50, // Keep last 50 activities
      
      addActivity: (activity) => {
        const newActivity: ActivityItem = {
          ...activity,
          id: `activity-${Date.now()}-${Math.random().toString(36).substring(2)}`,
          timestamp: new Date()
        };
        
        set((state) => {
          const updatedActivities = [newActivity, ...state.activities];
          // Keep only the most recent activities
          return {
            activities: updatedActivities.slice(0, state.maxActivities)
          };
        });
      },
      
      clearActivities: () => {
        set({ activities: [] });
      },
      
      removeActivity: (id) => {
        set((state) => ({
          activities: state.activities.filter(a => a.id !== id)
        }));
      },
      
      getRecentActivities: (limit = 10) => {
        const state = get();
        return state.activities.slice(0, limit);
      }
    }),
    {
      name: 'maifarm-activities',
      partialize: (state) => ({
        activities: state.activities.slice(0, 20) // Only persist last 20 activities
      })
    }
  )
);

// Helper function to log farm deletion
export const logFarmDeletion = (farmName: string, farmId: string) => {
  const store = useActivityStore.getState();
  store.addActivity({
    type: 'farm_deleted',
    title: `Farm Deleted`,
    description: `"${farmName}" has been permanently deleted`,
    farmId,
    metadata: {
      deletedAt: new Date().toISOString()
    }
  });
};

// Helper function to log farm creation
export const logFarmCreation = (farmName: string, farmId: string) => {
  const store = useActivityStore.getState();
  store.addActivity({
    type: 'farm_created',
    title: `Farm Created`,
    description: `"${farmName}" has been created`,
    farmId
  });
};

// Helper function to log farm completion
export const logFarmCompletion = (farmName: string, farmId: string) => {
  const store = useActivityStore.getState();
  store.addActivity({
    type: 'farm_completed',
    title: `Farm Completed`,
    description: `"${farmName}" has completed successfully`,
    farmId
  });
};