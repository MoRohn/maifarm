import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'
import { useSettingsStore } from './settingsStore'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: import('@/types/settings').NotificationSettings;
  language: string;
  aiSettings?: {
    suggestionLevel: 'minimal' | 'moderate' | 'aggressive';
    autoOptimize: boolean;
  };
  apiKeys?: any[];
  farmTemplates?: any[];
  security?: any;
  goWild?: {
    creativityLevel: number;
    explorationDepth: number;
    maxDuration: number;
    boundaries: {
      allowExternalAPIs: boolean;
      allowFileSystem: boolean;
      allowNetworkRequests: boolean;
      restrictedDomains: string[];
    };
    focusAreas: string[];
  };
}

interface UserState {
  user: User | null
  isAuthenticated: boolean
  preferences?: UserPreferences
  userActivity?: {
    lastAction: string
    timestamp: Date
    frequentActions: string[]
    totalActions?: number
    sessionDuration?: number
    featureUsage?: Record<string, number>
  }
  setUser: (user: User) => void
  updateUser: (updates: Partial<User>) => void
  updatePreferences: (updates: Partial<UserPreferences>) => void
  logout: () => void
  updateCredits: (credits: number) => void
  addNotification: (notification: any) => void
  hydratePreferences: (preferences: Partial<UserPreferences>) => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        credits: 1250,
        tier: 'pro',
        preferences: {
          theme: 'system',
          notifications: {
            enabled: true,
            sound: true,
            desktop: true,
            email: {
              enabled: false,
              address: '',
              frequency: 'immediate'
            },
            quietHours: {
              enabled: false,
              start: '22:00',
              end: '08:00'
            },
            types: {
              farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
              farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
              agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
              resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
              aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } }
            }
          },
          language: 'en',
        },
      } as User,
      isAuthenticated: true,
      preferences: {
        theme: 'system',
        notifications: {
          enabled: true,
          sound: true,
          desktop: true,
          email: {
            enabled: false,
            address: '',
            frequency: 'immediate'
          },
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00'
          },
          types: {
            farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
            farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
            agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
            resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
            aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } }
          }
        },
        language: 'en',
        aiSettings: {
          suggestionLevel: 'moderate',
          autoOptimize: true,
        },
      },
      userActivity: {
        lastAction: 'login',
        timestamp: new Date(),
        frequentActions: [],
      },
      
      setUser: (user) => set({
        user,
        isAuthenticated: true,
        // Extract preferences from user object and populate store.preferences
        preferences: user?.preferences ? {
          theme: user.preferences.theme || 'dark',
          notifications: user.preferences.notifications || {
            enabled: true,
            sound: true,
            desktop: true,
            email: { enabled: false, address: user.email || '', frequency: 'immediate' },
            quietHours: { enabled: false, start: '22:00', end: '08:00' },
            types: {
              farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
              farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
              agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
              resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
              aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } }
            }
          },
          language: user.preferences.language || 'en',
          aiSettings: user.preferences.aiSettings || { suggestionLevel: 'moderate', autoOptimize: true }
        } as UserPreferences : undefined
      }),
      
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),
      
      updatePreferences: (updates) => set((state) => ({
        preferences: state.preferences ? { ...state.preferences, ...updates } : updates,
        user: state.user && state.user.preferences 
          ? { ...state.user, preferences: { ...state.user.preferences, ...updates } }
          : state.user,
      })),

      hydratePreferences: (preferences) => set((state) => ({
        preferences: state.preferences ? { ...state.preferences, ...preferences } : (preferences as UserPreferences),
        user: state.user && state.user.preferences
          ? { ...state.user, preferences: { ...state.user.preferences, ...preferences } }
          : state.user,
      })),
      
      logout: () => set({ user: null, isAuthenticated: false }),
      
      updateCredits: (credits) => set((state) => ({
        user: state.user ? { ...state.user, credits } : null,
      })),
      
      addNotification: (notification) => set((state) => ({
        user: state.user
          ? {
              ...state.user,
              notifications: [...(state.user.notifications || []), notification],
            }
          : null,
      })),
    }),
    {
      name: 'maifarm-user',
      onRehydrateStorage: () => (state) => {
        if (state?.preferences) {
          const settingsStore = useSettingsStore.getState();
          if (state.preferences.notifications) {
            settingsStore.setNotifications(state.preferences.notifications as any);
          }

          if (state.preferences.language) {
            settingsStore.setLanguage(state.preferences.language);
          }
        }
      }
    }
  )
)

useUserStore.subscribe((state, prev) => {
  if (state.preferences !== prev.preferences && state.preferences) {
    const settingsStore = useSettingsStore.getState();

    if (state.preferences.notifications) {
      settingsStore.setNotifications(state.preferences.notifications as any);
    }

    if (state.preferences.language) {
      settingsStore.setLanguage(state.preferences.language);
    }
  }
});
