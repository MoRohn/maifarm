import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, AuthCredentials, AuthResponse, Permission } from '../types/security';
import { SecureStorage, EncryptionService } from '../utils/encryption';

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (credentials: AuthCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkPermission: (resource: string, action: string) => boolean;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Mock user data for development
const MOCK_USERS: AuthUser[] = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@maifarm.ai',
    roles: [
      {
        id: '1',
        name: 'admin',
        description: 'Administrator',
        permissions: [
          { id: '1', resource: '*', action: '*' }
        ],
        priority: 100
      }
    ],
    permissions: [
      { id: '1', resource: '*', action: '*' }
    ],
    lastLogin: new Date(),
    mfaEnabled: false
  }
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null
  });

  // Initialize secure storage and check for existing session
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check for existing session
        const savedToken = localStorage.getItem('auth_token');
        if (savedToken) {
          // Initialize secure storage with the token
          await SecureStorage.init(savedToken);
          
          // Retrieve user data
          const userData = await SecureStorage.getItem<AuthUser>('user_data');
          if (userData) {
            setAuthState({
              isAuthenticated: true,
              user: userData,
              token: savedToken,
              loading: false,
              error: null
            });
          } else {
            setAuthState(prev => ({ ...prev, loading: false }));
          }
        } else {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setAuthState(prev => ({ ...prev, loading: false, error: 'Failed to initialize authentication' }));
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (credentials: AuthCredentials) => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Simulate API call - in production, this would be a real authentication endpoint
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock authentication
      const hashedPassword = await EncryptionService.hashPassword(credentials.password);
      
      // Find user (mock implementation)
      const user = MOCK_USERS.find(u => u.username === credentials.username);
      
      if (!user || credentials.password !== 'password') {
        throw new Error('Invalid credentials');
      }

      // Generate session token
      const token = EncryptionService.generateToken();
      
      // Initialize secure storage with the token
      await SecureStorage.init(token);
      
      // Store user data securely
      await SecureStorage.setItem('user_data', user);
      
      // Store token in regular localStorage (or could use httpOnly cookie in production)
      localStorage.setItem('auth_token', token);
      
      if (credentials.rememberMe) {
        localStorage.setItem('remember_me', 'true');
      }

      setAuthState({
        isAuthenticated: true,
        user,
        token,
        loading: false,
        error: null
      });
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Clear secure storage
      SecureStorage.clear();
      
      // Clear regular storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('remember_me');
      
      setAuthState({
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const checkPermission = useCallback((resource: string, action: string): boolean => {
    if (!authState.user) return false;

    // Check if user has admin role
    const isAdmin = authState.user.roles.some(role => role.name === 'admin');
    if (isAdmin) return true;

    // Check direct permissions
    const hasDirectPermission = authState.user.permissions.some(permission => 
      (permission.resource === '*' || permission.resource === resource) &&
      (permission.action === '*' || permission.action === action)
    );

    if (hasDirectPermission) return true;

    // Check role permissions
    return authState.user.roles.some(role => 
      role.permissions.some(permission => 
        (permission.resource === '*' || permission.resource === resource) &&
        (permission.action === '*' || permission.action === action)
      )
    );
  }, [authState.user]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    if (!authState.user) return;

    const updatedUser = { ...authState.user, ...updates };
    
    setAuthState(prev => ({
      ...prev,
      user: updatedUser
    }));

    // Update secure storage
    SecureStorage.setItem('user_data', updatedUser).catch(console.error);
  }, [authState.user]);

  const value: AuthContextType = {
    ...authState,
    login,
    logout,
    checkPermission,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};