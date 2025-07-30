import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'

interface UserState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  updateUser: (updates: Partial<User>) => void
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
      
      setUser: (user) => set({ user, isAuthenticated: true }),
      
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),
      
      logout: () => set({ user: null, isAuthenticated: false }),
      
      updateCredits: (credits) => set((state) => ({
        user: state.user ? { ...state.user, credits } : null,
      })),
      
      addNotification: (notification) => set((state) => ({
        user: state.user
          ? {
              ...state.user,
              notifications: (state.user.notifications || 0) + 1,
            }
          : null,
      })),
    }),
    {
      name: 'maifarm-user',
    }
  )
)