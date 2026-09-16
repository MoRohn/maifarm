import React, { useEffect, useReducer, useCallback, createContext, useContext, useMemo } from 'react';
import { authService } from '@/services/auth';
import { securityService } from '@/services/securityService';
import { AuthState, AuthContextType, LoginCredentials, RegisterInput, User, AuthActions, Permission, AuthTokens, AuthFlowOptions, ProfileUpdateInput } from '@/types/auth';
import { auditService } from '@/services/audit';
import { permissionsService } from '@/services/permissions';
import { useFarmStore } from '@/store/farmStore';
import { useUserStore } from '@/store/userStore';
import { safeStorage, removeAccessToken, removeRefreshToken } from '@/utils/safeStorage';

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isBootstrapping: true,
  error: null,
};

function authReducer(state: AuthState, action: any): AuthState {
  switch (action.type) {
    case AuthActions.LOGIN_START:
      return { ...state, isLoading: true, error: null };

    case AuthActions.REFRESH_START:
      return {
        ...state,
        isLoading: state.isBootstrapping ? state.isLoading : false,
        isBootstrapping: true,
        error: null,
      };

    case AuthActions.LOGIN_SUCCESS:
    case AuthActions.REFRESH_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        isBootstrapping: false,
        error: null,
      };

    case AuthActions.LOGIN_FAILURE:
    case AuthActions.REFRESH_FAILURE:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isBootstrapping: false,
        error: action.payload.error,
      };

    case AuthActions.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
        isBootstrapping: false,
      };

    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode; onNavigate?: (path: string) => void }> = ({ children, onNavigate }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      console.log('[AUTH_PROVIDER] Starting initialization...');

      // Check for guest mode (development only)
      const guestMode = safeStorage.getItem('maifarm:guest-mode') === 'true';
      const authBypass = safeStorage.getItem('maifarm:auth-bypass') === 'true';
      if ((guestMode || authBypass) && (import.meta.env.DEV || window.location.hostname === 'localhost')) {
        console.log('[AUTH_PROVIDER] Guest mode enabled');
        const guestUser: User = {
          id: 'guest-user',
          email: 'guest@maifarm.local',
          name: 'Guest User',
          role: 'user',
          permissions: ['*'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const tokens: AuthTokens = {
          accessToken: 'guest-mode-token',
          refreshToken: 'guest-mode-refresh',
          expiresIn: 12 * 60 * 60,
        };
        const userStore = useUserStore.getState();
        userStore.setUser(guestUser);
        dispatch({
          type: AuthActions.REFRESH_SUCCESS,
          payload: { user: guestUser, tokens },
        });
        return;
      }

      // Normal auth flow starts here
      dispatch({ type: AuthActions.REFRESH_START });
      try {
        const devBypassFlag = safeStorage.getItem('maifarm-dev-bypass') === 'true';
        if (devBypassFlag && securityService.isAuthenticated && securityService.user) {
          const devUser = securityService.user as unknown as User;
          const tokens: AuthTokens = {
            accessToken: securityService.sessionToken || 'dev-bypass-token',
            refreshToken: (securityService as any).userRefreshToken || 'dev-bypass-refresh',
            expiresIn: 12 * 60 * 60,
          };

          const userStore = useUserStore.getState();
          userStore.setUser(devUser);

          dispatch({
            type: AuthActions.REFRESH_SUCCESS,
            payload: { user: devUser, tokens },
          });
          return;
        }

        if (authService.isAuthenticated()) {
          console.log('[AUTH_PROVIDER] Auth service says user is authenticated, fetching user...');
          let user;
          let retries = 0;
          const maxRetries = 2;

          while (retries <= maxRetries) {
            try {
              user = await authService.getCurrentUser();
              console.log('[AUTH_PROVIDER] Successfully fetched user:', user?.email);

              // Update permissions cache
              if (user.permissions) {
                permissionsService.updateUserPermissions(user.id, user.permissions);
              }
              break; // Success, exit retry loop
            } catch (getCurrentUserError: any) {
              console.error('[AUTH_PROVIDER] ERROR fetching current user (attempt', retries + 1, '):', getCurrentUserError);

              // Check if it's a network/temporary error (not 401/403)
              const isTemporaryError = !getCurrentUserError?.response ||
                (getCurrentUserError?.response?.status !== 401 &&
                 getCurrentUserError?.response?.status !== 403);

              if (isTemporaryError && retries < maxRetries) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, (retries + 1) * 1000));
                retries++;
                continue;
              }

              // Non-temporary error or max retries reached
              throw getCurrentUserError;
            }
          }

          if (!user) {
            throw new Error('Failed to fetch user after retries');
          }

          // Update role permissions
          for (const role of user.roles) {
            // Convert string permissions to Permission objects if needed
            const permissions = Array.isArray(role.permissions) && role.permissions.length > 0
              ? typeof role.permissions[0] === 'string'
                ? [] // Skip string permissions for now
                : role.permissions as Permission[]
              : [];
            if (permissions.length > 0) {
              permissionsService.updateRolePermissions(role.id, permissions);
            }
          }

          dispatch({
            type: AuthActions.REFRESH_SUCCESS,
            payload: { user },
          });
        } else {
          useFarmStore.getState().reset();
          dispatch({ type: AuthActions.LOGOUT });
        }
      } catch (error: any) {
        console.error('[AUTH_PROVIDER] Session restore failed after retries:', error);

        // Clear invalid tokens to prevent login loop (safe storage handles SSR/incognito)
        console.log('[AUTH_PROVIDER] Clearing invalid tokens from storage');
        removeAccessToken();
        removeRefreshToken();

        // Provide more specific error message
        const errorMessage = error?.message || 'Failed to restore session';
        console.error('[AUTH_PROVIDER] Error details:', {
          message: errorMessage,
          status: error?.response?.status,
          name: error?.name
        });

        dispatch({
          type: AuthActions.REFRESH_FAILURE,
          payload: { error: errorMessage },
        });
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials, options?: AuthFlowOptions) => {
    dispatch({ type: AuthActions.LOGIN_START });

    try {
      const { user, tokens } = await authService.login(credentials);

      // Update permissions cache
      if (user.permissions) {
        permissionsService.updateUserPermissions(user.id, user.permissions);
      }

      // Update role permissions
      for (const role of user.roles) {
        // Convert string permissions to Permission objects if needed
        const permissions = Array.isArray(role.permissions) && role.permissions.length > 0
          ? typeof role.permissions[0] === 'string'
            ? [] // Skip string permissions for now
            : role.permissions as Permission[]
          : [];
        if (permissions.length > 0) {
          permissionsService.updateRolePermissions(role.id, permissions);
        }
      }

      dispatch({
        type: AuthActions.LOGIN_SUCCESS,
        payload: { user, tokens },
      });

      const userStore = useUserStore.getState();
      userStore.setUser(user);
      if ((user as any)?.preferences) {
        userStore.updatePreferences((user as any).preferences);
      }

      // Log successful login asynchronously without blocking login flow
      auditService.logAction('LOGIN', 'auth', user.id, true).catch(err => {
        console.warn('[Auth] Failed to log login audit:', err);
      });

      // CRITICAL: Set initialization flags to prevent redirect loops
      // FIX: Wrap in try-catch for iOS Safari private browsing mode (QuotaExceededError)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('maifarm:initialized', 'true');
          localStorage.setItem('maifarm:first-run-complete', 'true');
          localStorage.setItem('maifarm:welcome-page:v2', 'viewed');
        } catch (storageError) {
          console.warn('[Auth] localStorage unavailable (private browsing?), using session only:', storageError);
          // Continue without persistent storage - session will work for current tab
        }

        // Verify tokens are persisted
        try {
          const accessToken = localStorage.getItem('accessToken');
          const refreshToken = localStorage.getItem('refreshToken');
          console.log('[Auth] Login complete. Tokens persisted:', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken
          });
        } catch (readError) {
          console.warn('[Auth] Could not verify token persistence');
        }
      }

      // Check if user should see welcome page (new user onboarding)
      // FIX: Wrap in try-catch for iOS Safari private browsing mode
      let showWelcomeFlag: string | null = null;
      if (typeof window !== 'undefined') {
        try {
          showWelcomeFlag = localStorage.getItem(`maifarm-show-welcome-${user.id}`);
        } catch {
          // Storage unavailable, default to no welcome page
        }
      }

      const shouldNavigate = options?.redirectTo !== null;
      if (onNavigate && shouldNavigate) {
        // Add small delay to ensure state updates propagate before navigation
        setTimeout(() => {
          if (showWelcomeFlag === 'true' && !options?.redirectTo) {
            try {
              localStorage.removeItem(`maifarm-show-welcome-${user.id}`);
            } catch {
              // Storage unavailable, continue anyway
            }
            onNavigate('/welcome');
          } else {
            onNavigate(options?.redirectTo ?? '/home');
          }
        }, 100);
      }
    } catch (error: any) {
      dispatch({
        type: AuthActions.LOGIN_FAILURE,
        payload: { error: error.message || 'Login failed' },
      });

      // Log failed login asynchronously without blocking error handling
      auditService.logAction('LOGIN', 'auth', credentials.email, false, {
        error: error.message,
      }).catch(err => {
        console.warn('[Auth] Failed to log login failure audit:', err);
      });
    }
  }, [onNavigate]);

  // REMOVED: Development bypass availability check - all users must authenticate properly

  /**
   * @deprecated Development bypass has been removed for security
   * This function is kept for backward compatibility but always returns null
   */
  const bypassForDevelopment = useCallback(async (): Promise<User | null> => {
    console.warn('[Auth] Development bypass has been disabled for security. Please use proper authentication.');
    dispatch({
      type: AuthActions.LOGIN_FAILURE,
      payload: { error: 'Development bypass is disabled. Please use proper authentication.' },
    });
    return null;
  }, []);

  const register = useCallback(async (input: RegisterInput, options?: AuthFlowOptions) => {
    dispatch({ type: AuthActions.LOGIN_START });

    try {
      const result = await authService.register(input);
      const { user, tokens, requiresVerification, message } = result;

      if (user.permissions) {
        permissionsService.updateUserPermissions(user.id, user.permissions);
      }

      for (const role of user.roles) {
        const permissions = Array.isArray(role.permissions) && role.permissions.length > 0
          ? typeof role.permissions[0] === 'string'
            ? []
            : role.permissions as Permission[]
          : [];
        if (permissions.length > 0) {
          permissionsService.updateRolePermissions(role.id, permissions);
        }
      }

      dispatch({
        type: AuthActions.LOGIN_SUCCESS,
        payload: { user, tokens },
      });

      const userStore = useUserStore.getState();
      userStore.setUser(user);
      if ((user as any)?.preferences) {
        userStore.updatePreferences((user as any).preferences);
      }

      // Log audit action asynchronously without blocking registration flow
      auditService.logAction('REGISTER', 'auth', user.id, true).catch(err => {
        console.warn('[Auth] Failed to log registration audit:', err);
      });

      // CRITICAL: Set initialization flags to prevent redirect loops
      if (typeof window !== 'undefined' && !requiresVerification) {
        localStorage.setItem('maifarm:initialized', 'true');
        localStorage.setItem('maifarm:first-run-complete', 'true');
        localStorage.setItem('maifarm:welcome-page:v2', 'viewed');
      }

      // Only navigate if verification is not required
      if (onNavigate && options?.redirectTo !== null && !requiresVerification) {
        // Add small delay to ensure state updates propagate before navigation
        setTimeout(() => {
          onNavigate(options?.redirectTo ?? '/home');
        }, 100);
      }

      // Return the full result so EnhancedLogin can handle verification flow
      return result;
    } catch (error: any) {
      dispatch({
        type: AuthActions.LOGIN_FAILURE,
        payload: { error: error.message || 'Account creation failed' },
      });

      // Log audit action asynchronously without blocking error handling
      auditService.logAction('REGISTER', 'auth', input.email, false, {
        error: error.message,
      }).catch(err => {
        console.warn('[Auth] Failed to log registration failure audit:', err);
      });

      throw error;
    }
  }, [onNavigate]);

  const logout = useCallback(async () => {
    const userId = state.user?.id;
    
    try {
      await authService.logout();

      // Log logout asynchronously without blocking logout flow
      if (userId) {
        auditService.logAction('LOGOUT', 'auth', userId, true).catch(err => {
          console.warn('[Auth] Failed to log logout audit:', err);
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear permissions cache
      permissionsService.clearCache();
      useFarmStore.getState().reset();
      useUserStore.getState().logout();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('maifarm-dev-bypass');
      }

      dispatch({ type: AuthActions.LOGOUT });
      if (onNavigate) {
        onNavigate('/login');
      }
    }
  }, [state.user, onNavigate]);

  const refreshAuth = useCallback(async () => {
    dispatch({ type: AuthActions.REFRESH_START });

    try {
      await authService.refreshAccessToken();
      const user = await authService.getCurrentUser();
      
      // Update permissions cache
      if (user.permissions) {
        permissionsService.updateUserPermissions(user.id, user.permissions);
      }
      
      // Update role permissions
      for (const role of user.roles) {
        // Convert string permissions to Permission objects if needed
        const permissions = Array.isArray(role.permissions) && role.permissions.length > 0
          ? typeof role.permissions[0] === 'string'
            ? [] // Skip string permissions for now
            : role.permissions as Permission[]
          : [];
        if (permissions.length > 0) {
          permissionsService.updateRolePermissions(role.id, permissions);
        }
      }

      dispatch({
        type: AuthActions.REFRESH_SUCCESS,
        payload: { user },
      });

      const userStore = useUserStore.getState();
      userStore.setUser(user);
      if ((user as any)?.preferences) {
        userStore.updatePreferences((user as any).preferences);
      }
    } catch (error: any) {
      dispatch({
        type: AuthActions.REFRESH_FAILURE,
        payload: { error: error.message || 'Session refresh failed' },
      });
      
      // If refresh fails, logout
      await logout();
    }
  }, [logout]);

  const checkPermission = useCallback((resource: string, action: string): boolean => {
    return permissionsService.hasPermission(state.user, resource, action);
  }, [state.user]);

  const hasRole = useCallback((roleName: string): boolean => {
    return permissionsService.hasRole(state.user, roleName);
  }, [state.user]);

  const updateProfile = useCallback(async (updates: ProfileUpdateInput): Promise<void> => {
    if (!state.user) {
      throw new Error('No user logged in');
    }

    try {
      const updatedUser = await authService.updateProfile(state.user.id, updates);

      dispatch({
        type: AuthActions.REFRESH_SUCCESS,
        payload: { user: updatedUser },
      });

      const userStore = useUserStore.getState();
      userStore.setUser(updatedUser);
      if (updatedUser.preferences) {
        userStore.hydratePreferences(updatedUser.preferences as any);
      }

      // Log profile update asynchronously without blocking profile update flow
      auditService.logAction('UPDATE_PROFILE', 'auth', state.user.id, true, updates).catch(err => {
        console.warn('[Auth] Failed to log profile update audit:', err);
      });
    } catch (error: any) {
      // Revert on error
      await refreshAuth();
      throw error;
    }
  }, [state.user, refreshAuth]);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    refreshAuth,
    updateProfile,
    checkPermission,
    hasRole,
    bypassForDevelopment,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
