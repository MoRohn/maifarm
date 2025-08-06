import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean | {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    email: boolean;
    categories: {
      farmComplete: boolean;
      agentError: boolean;
      systemUpdate: boolean;
      aiDiscovery: boolean;
    };
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
  language: string;
  aiSettings?: {
    suggestionLevel: 'minimal' | 'moderate' | 'aggressive'
    autoOptimize: boolean
  }
  apiKeys?: any[]
  farmTemplates?: any[]
  security?: any
  goWild?: {
    creativityLevel: number
    explorationDepth: number
    maxDuration: number
    boundaries: {
      allowExternalAPIs: boolean
      allowFileSystem: boolean
      allowNetworkRequests: boolean
      restrictedDomains: string[]
    }
    focusAreas: string[]
  }
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
          notifications: true,
          language: 'en',
        },
      } as User,
      isAuthenticated: true,
      preferences: {
        theme: 'system',
        notifications: true,
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
      
      setUser: (user) => set({ user, isAuthenticated: true }),
      
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),
      
      updatePreferences: (updates) => set((state) => ({
        preferences: state.preferences ? { ...state.preferences, ...updates } : updates,
        user: state.user && state.user.preferences 
          ? { ...state.user, preferences: { ...state.user.preferences, ...updates } }
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
    }
  )
)