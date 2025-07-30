import { useEffect, useReducer, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { AuthState, AuthContextType, LoginCredentials, User, AuthActions } from '../types/auth';
import { auditService } from '../services/audit';
import { permissionsService } from '../services/permissions';

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

function authReducer(state: AuthState, action: any): AuthState {
  switch (action.type) {
    case AuthActions.LOGIN_START:
    case AuthActions.REFRESH_START:
      return { ...state, isLoading: true, error: null };
    
    case AuthActions.LOGIN_SUCCESS:
    case AuthActions.REFRESH_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    
    case AuthActions.LOGIN_FAILURE:
    case AuthActions.REFRESH_FAILURE:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload.error,
      };
    
    case AuthActions.LOGOUT:
      return initialState;
    
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const navigate = useNavigate();

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (authService.isAuthenticated()) {
          const user = await authService.getCurrentUser();
          
          // Update permissions cache
          if (user.permissions) {
            permissionsService.updateUserPermissions(user.id, user.permissions);
          }
          
          // Update role permissions
          for (const role of user.roles) {
            permissionsService.updateRolePermissions(role.id, role.permissions);
          }
          
          dispatch({
            type: AuthActions.REFRESH_SUCCESS,
            payload: { user },
          });
        } else {
          dispatch({ type: AuthActions.LOGOUT });
        }
      } catch (error) {
        dispatch({
          type: AuthActions.REFRESH_FAILURE,
          payload: { error: 'Failed to restore session' },
        });
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: AuthActions.LOGIN_START });

    try {
      const { user, tokens } = await authService.login(credentials);
      
      // Update permissions cache
      if (user.permissions) {
        permissionsService.updateUserPermissions(user.id, user.permissions);
      }
      
      // Update role permissions
      for (const role of user.roles) {
        permissionsService.updateRolePermissions(role.id, role.permissions);
      }

      dispatch({
        type: AuthActions.LOGIN_SUCCESS,
        payload: { user, tokens },
      });

      // Log successful login
      await auditService.logAction('LOGIN', 'auth', user.id, true);

      // Navigate to dashboard
      navigate('/');
    } catch (error: any) {
      dispatch({
        type: AuthActions.LOGIN_FAILURE,
        payload: { error: error.message || 'Login failed' },
      });

      // Log failed login
      await auditService.logAction('LOGIN', 'auth', credentials.email, false, {
        error: error.message,
      });
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    const userId = state.user?.id;
    
    try {
      await authService.logout();
      
      // Log logout
      if (userId) {
        await auditService.logAction('LOGOUT', 'auth', userId, true);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear permissions cache
      permissionsService.clearCache();
      
      dispatch({ type: AuthActions.LOGOUT });
      navigate('/login');
    }
  }, [state.user, navigate]);

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
        permissionsService.updateRolePermissions(role.id, role.permissions);
      }

      dispatch({
        type: AuthActions.REFRESH_SUCCESS,
        payload: { user },
      });
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

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshAuth,
    checkPermission,
    hasRole,
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