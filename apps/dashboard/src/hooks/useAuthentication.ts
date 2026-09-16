import { useState, useEffect, useCallback } from 'react';
import { AuthCredentials, AuthResponse, AuthUser, EncryptedData } from '@/types/security';
import { securityService } from '@/services/securityService';
import { toast } from 'react-hot-toast';

export function useAuthentication() {
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
  }, []);

  const bypassAuthForDevelopment = useCallback(async (): Promise<AuthResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await securityService.bypassForDevelopment();
      if (response.success && response.user) {
        setUser(response.user);
        setIsAuthenticated(true);
        toast('Development session ready', { icon: '🛠️' });
        return response;
      }
      if (response.error) {
        setError(response.error);
        toast.error(response.error);
      }
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bypass failed';
      setError(message);
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      await securityService.logout();
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully');
      // Navigation should be handled by the component calling this
    } catch (err) {
      toast.error('Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const decrypt = useCallback(async (encryptedData: EncryptedData): Promise<string> => {
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
    bypassAuthForDevelopment,
    
    // Direct access to service
    securityService
  };
}

// Hook for requiring authentication - must be used within Router context
export function useRequireAuth(redirectTo: string = '/login') {
  const { isAuthenticated } = useAuthentication();
  // Navigation removed - component should handle redirect
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
