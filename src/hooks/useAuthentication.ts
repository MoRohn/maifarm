import { useState, useEffect, useCallback } from 'react';
import { AuthCredentials, AuthResponse, AuthUser } from '../types/security';
import { securityService } from '../services/securityService';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export function useAuthentication() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(securityService.user);
  const [isAuthenticated, setIsAuthenticated] = useState(securityService.isAuthenticated);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to auth changes
    const checkAuth = () => {
      setUser(securityService.user);
      setIsAuthenticated(securityService.isAuthenticated);
    };

    // Check auth status periodically
    const interval = setInterval(checkAuth, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  const login = useCallback(async (credentials: AuthCredentials): Promise<AuthResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await securityService.login(credentials);
      
      if (response.success) {
        setUser(response.user!);
        setIsAuthenticated(true);
        toast.success('Welcome back!');
        navigate('/home');
        return response;
      } else {
        setError(response.error || 'Login failed');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await securityService.logout();
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (err) {
      toast.error('Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const refreshed = await securityService.refreshSession();
      if (refreshed) {
        setUser(securityService.user);
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Session refresh failed:', err);
      return false;
    }
  }, []);

  const hasPermission = useCallback((resource: string, action: string): boolean => {
    return securityService.hasPermission(resource, action);
  }, []);

  const encrypt = useCallback(async (data: string): Promise<string> => {
    const encrypted = await securityService.encrypt(data);
    return encrypted.data;
  }, []);

  const decrypt = useCallback(async (encryptedData: any): Promise<string> => {
    return securityService.decrypt(encryptedData);
  }, []);

  return {
    // State
    user,
    isAuthenticated,
    isLoading,
    error,
    
    // Methods
    login,
    logout,
    refreshSession,
    hasPermission,
    encrypt,
    decrypt,
    
    // Direct access to service
    securityService
  };
}

// Hook for requiring authentication
export function useRequireAuth(redirectTo: string = '/login') {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthentication();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, navigate, redirectTo]);

  return isAuthenticated;
}

// Hook for role-based access control
export function useRBAC(requiredPermissions: Array<{ resource: string; action: string }>) {
  const { hasPermission } = useAuthentication();
  
  const hasAccess = requiredPermissions.every(({ resource, action }) => 
    hasPermission(resource, action)
  );

  return {
    hasAccess,
    checkPermission: hasPermission
  };
}