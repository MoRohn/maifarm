import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthUser, AuthCredentials, SessionData } from '@/types/security';
import { securityService } from '@/services/securityService';

// FIX: Store timeout reference to prevent timeout stacking
let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Helper to clear existing timeout before setting new one
function clearRefreshTimeout() {
  if (refreshTimeoutId) {
    clearTimeout(refreshTimeoutId);
    refreshTimeoutId = null;
  }
}

// Helper to set refresh timeout (clears existing first)
function setRefreshTimeout(callback: () => void, delay: number) {
  clearRefreshTimeout();
  refreshTimeoutId = setTimeout(callback, delay);
}

interface AuthStore {
  user: AuthUser | null;
  session: SessionData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: AuthCredentials) => Promise<{ requiresMFA?: boolean }>;
  register: (credentials: AuthCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkSession: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      login: async (credentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await securityService.authenticate(credentials);
          
          if (response.requiresMFA) {
            return { requiresMFA: true };
          }
          
          if (response.user && response.accessToken) {
            const session: SessionData = {
              id: crypto.randomUUID(),
              userId: response.user.id,
              token: response.accessToken,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + ((response.expiresIn || 3600) * 1000)),
              lastActivity: new Date(),
              ipAddress: '',
              userAgent: navigator.userAgent,
              isActive: true
            };
            
            set({
              user: response.user,
              session,
              isAuthenticated: true,
              isLoading: false,
            });
            
            // Set up token refresh (FIX: Use helper to prevent timeout stacking)
            const refreshInterval = ((response.expiresIn || 3600) - 300) * 1000; // 5 minutes before expiry
            setRefreshTimeout(() => get().refreshToken(), refreshInterval);
          }
          
          return {};
        } catch (error: any) {
          set({
            error: error.message || 'Authentication failed',
            isLoading: false,
          });
          throw error;
        }
      },
      
      register: async (credentials) => {
        set({ isLoading: true, error: null });
        
        try {
          await securityService.registerBasic(credentials);
          set({ isLoading: false });
        } catch (error: any) {
          set({
            error: error.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },
      
      logout: async () => {
        const { session } = get();

        // FIX: Clear refresh timeout on logout to prevent memory leaks
        clearRefreshTimeout();

        if (session?.token) {
          try {
            await securityService.logoutWithToken(session.token);
          } catch (error) {
            console.error('Logout error:', error);
          }
        }

        set({
          user: null,
          session: null,
          isAuthenticated: false,
          error: null,
        });
      },
      
      refreshToken: async () => {
        const { session } = get();
        
        if (!session) {
          return;
        }
        
        try {
          const success = await securityService.refreshSession();
          
          if (success) {
            // Session was refreshed successfully
            const newToken = securityService.token;
            if (newToken && session) {
              set({
                session: {
                  ...session,
                  token: newToken,
                  lastActivity: new Date(),
                },
              });
              
              // Set up next refresh (FIX: Use helper to prevent timeout stacking)
              setRefreshTimeout(() => get().refreshToken(), 55 * 60 * 1000); // 55 minutes
            }
          }
        } catch (error) {
          // Token refresh failed, logout user
          get().logout();
        }
      },
      
      checkSession: () => {
        const { session } = get();

        if (session && session.expiresAt) {
          // Handle Date deserialization from localStorage (strings become dates)
          const expiresAt = typeof session.expiresAt === 'string'
            ? new Date(session.expiresAt)
            : session.expiresAt;

          const isValid = expiresAt && expiresAt.getTime() > Date.now();

          if (isValid) {
            set({
              isAuthenticated: true,
              session: {
                ...session,
                expiresAt, // Ensure it's a Date object
              }
            });

            // Set up token refresh if needed (FIX: Use helper to prevent timeout stacking)
            const timeUntilExpiry = expiresAt.getTime() - Date.now();
            if (timeUntilExpiry < 300000) { // Less than 5 minutes
              get().refreshToken();
            } else {
              setRefreshTimeout(() => get().refreshToken(), timeUntilExpiry - 300000);
            }
          } else {
            // Session expired, clear it
            set({
              user: null,
              session: null,
              isAuthenticated: false,
            });
          }
        } else {
          // No session found
          set({
            user: null,
            session: null,
            isAuthenticated: false,
          });
        }
      },
      
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'maifarm-auth',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
      }),
      // Custom storage to handle Date serialization with iOS Safari private browsing protection
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            if (!str) return null;

            try {
              const { state } = JSON.parse(str);
              // Rehydrate dates in session
              if (state.session) {
                if (state.session.createdAt) {
                  state.session.createdAt = new Date(state.session.createdAt);
                }
                if (state.session.expiresAt) {
                  state.session.expiresAt = new Date(state.session.expiresAt);
                }
                if (state.session.lastActivity) {
                  state.session.lastActivity = new Date(state.session.lastActivity);
                }
              }
              return JSON.stringify({ state });
            } catch (error) {
              console.error('[AuthStore] Error rehydrating state:', error);
              return null;
            }
          } catch {
            // iOS Safari private browsing - localStorage unavailable
            console.warn('[AuthStore] localStorage unavailable (iOS Safari private mode?)');
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            // iOS Safari private browsing - localStorage unavailable
            console.warn('[AuthStore] localStorage unavailable (iOS Safari private mode?) - state not persisted');
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // iOS Safari private browsing - localStorage unavailable
            console.warn('[AuthStore] localStorage unavailable for removal');
          }
        },
      },
    }
  )
);
