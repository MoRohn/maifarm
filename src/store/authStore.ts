import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthUser, AuthCredentials, SessionData } from '../types/security';
import { securityService } from '../services/securityService';

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
          
          if (response.user && response.token) {
            const session: SessionData = {
              user: response.user,
              token: response.token,
              permissions: response.user.permissions,
              expiresAt: Date.now() + (response.token.expiresAt * 1000),
            };
            
            set({
              user: response.user,
              session,
              isAuthenticated: true,
              isLoading: false,
            });
            
            // Set up token refresh
            const refreshInterval = (response.token.expiresAt - 300) * 1000; // 5 minutes before expiry
            setTimeout(() => get().refreshToken(), refreshInterval);
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
          await securityService.register(credentials);
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
        
        if (session?.token) {
          try {
            await securityService.logout(session.token.accessToken);
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
        
        if (!session?.token?.refreshToken) {
          return;
        }
        
        try {
          const response = await securityService.refreshToken(session.token.refreshToken);
          
          if (response.token) {
            set({
              session: {
                ...session,
                token: response.token,
                expiresAt: Date.now() + (response.token.expiresAt * 1000),
              },
            });
            
            // Set up next refresh
            const refreshInterval = (response.token.expiresAt - 300) * 1000;
            setTimeout(() => get().refreshToken(), refreshInterval);
          }
        } catch (error) {
          // Token refresh failed, logout user
          get().logout();
        }
      },
      
      checkSession: () => {
        const { session } = get();
        
        if (session && session.expiresAt > Date.now()) {
          set({ isAuthenticated: true });
          
          // Set up token refresh if needed
          const timeUntilExpiry = session.expiresAt - Date.now();
          if (timeUntilExpiry < 300000) { // Less than 5 minutes
            get().refreshToken();
          } else {
            setTimeout(() => get().refreshToken(), timeUntilExpiry - 300000);
          }
        } else {
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
    }
  )
);