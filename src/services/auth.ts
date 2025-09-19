import { AuthTokens, LoginCredentials, User } from '@/types/auth';
import { SecurityEvent, SecurityEventType } from '@/types/security';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4567/api';

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadTokensFromStorage();
  }

  private loadTokensFromStorage() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  private saveTokensToStorage(tokens: AuthTokens) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      
      // Set up auto-refresh
      this.scheduleTokenRefresh(tokens.expiresIn);
    }
  }

  private clearTokensFromStorage() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      this.accessToken = null;
      this.refreshToken = null;
      
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
  }

  private scheduleTokenRefresh(expiresIn: number) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshTime = (expiresIn - 300) * 1000;
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, refreshTime);
  }

  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      this.saveTokensToStorage(data.tokens);

      // Log security event
      await this.logSecurityEvent({
        type: SecurityEventType.LOGIN_SUCCESS,
        userId: data.user.id,
        details: { email: credentials.email },
        severity: 'low',
        timestamp: new Date().toISOString(),
      });

      return data;
    } catch (error) {
      // Log failed login attempt
      await this.logSecurityEvent({
        type: SecurityEventType.LOGIN_FAILURE,
        details: { email: credentials.email, error: error instanceof Error ? error.message : 'Unknown error' },
        severity: 'medium',
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearTokensFromStorage();
    }
  }

  async refreshAccessToken(): Promise<AuthTokens> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokens = await response.json();
      this.saveTokensToStorage(tokens);
      return tokens;
    } catch (error) {
      this.clearTokensFromStorage();
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Try to refresh token
        await this.refreshAccessToken();
        return this.getCurrentUser();
      }
      throw new Error('Failed to fetch user');
    }

    return response.json();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/auth/password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Password change failed');
    }

    // Log security event
    await this.logSecurityEvent({
      type: SecurityEventType.PASSWORD_CHANGE,
      userId: (await this.getCurrentUser()).id,
      details: { success: true },
      severity: 'medium',
      timestamp: new Date().toISOString(),
    });
  }

  async checkPermission(resource: string, action: string): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user.permissions.some(
        p => p.resource === resource && p.action === action
      );
    } catch {
      return false;
    }
  }

  async hasRole(roleName: string): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user.roles.some(r => r.name === roleName);
    } catch {
      return false;
    }
  }

  private async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      await fetch(`${API_BASE}/audit/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

export const authService = new AuthService();