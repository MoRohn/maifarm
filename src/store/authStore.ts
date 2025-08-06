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
            
            // Set up token refresh
            const refreshInterval = ((response.expiresIn || 3600) - 300) * 1000; // 5 minutes before expiry
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
              
              // Set up next refresh (refresh 5 minutes before expiry)
              setTimeout(() => get().refreshToken(), 55 * 60 * 1000); // 55 minutes
            }
          }
        } catch (error) {
          // Token refresh failed, logout user
          get().logout();
        }
      },
      
      checkSession: () => {
        const { session } = get();
        
        if (session && session.expiresAt && session.expiresAt.getTime() > Date.now()) {
          set({ isAuthenticated: true });
          
          // Set up token refresh if needed
          const timeUntilExpiry = (session.expiresAt?.getTime() || Date.now()) - Date.now();
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