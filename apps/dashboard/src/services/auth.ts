import { AuthTokens, LoginCredentials, RegisterInput, User, ProfileUpdateInput, Role, Permission } from '@/types/auth';
import { SecurityEvent, SecurityEventType } from '@/types/security';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface SetupStatusResponse {
  success: boolean;
  requiresSetup: boolean;
  requiresUserSetup?: boolean;
  hasAdminUser: boolean;
  totalUsers: number;
  isNewInstall?: boolean;
  bypassMode?: boolean;
  fallback?: boolean;
  userSetupCompleted?: boolean;
  setupCompletedAt?: string | null;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadTokensFromStorage();
  }

  private normalizeUser(apiUser: any): User {
    if (!apiUser) {
      throw new Error('Invalid user payload received from server');
    }

    const roles = this.normalizeRoles(apiUser.roles);
    const permissions = this.normalizePermissions(apiUser.permissions);
    const preferences = this.parsePreferences(apiUser.preferences);

    const displayName = apiUser.display_name || apiUser.displayName || apiUser.name || apiUser.username || apiUser.email || 'User';

    return {
      id: apiUser.id ?? apiUser.user_id ?? 'unknown-user',
      email: apiUser.email ?? '',
      name: apiUser.name || displayName,
      displayName,
      username: apiUser.username ?? undefined,
      avatar: apiUser.avatar ?? apiUser.avatar_url ?? undefined,
      avatarUrl: apiUser.avatar_url ?? apiUser.avatar ?? undefined,
      roles,
      permissions,
      createdAt: apiUser.created_at ? new Date(apiUser.created_at) : new Date(),
      updatedAt: apiUser.updated_at ? new Date(apiUser.updated_at) : undefined,
      lastLogin: apiUser.last_login_at ? new Date(apiUser.last_login_at) : (apiUser.lastLogin ? new Date(apiUser.lastLogin) : undefined),
      mfaEnabled: apiUser.mfa_enabled ?? apiUser.mfaEnabled,
      isActive: apiUser.is_active ?? apiUser.isActive ?? true,
      isAdmin: (apiUser.is_admin ?? apiUser.isAdmin) ?? roles.some(role => role.name?.toLowerCase() === 'admin'),
      sessionToken: apiUser.sessionToken,
      notifications: apiUser.notifications,
      farms: apiUser.farms,
      harvests: apiUser.harvests,
      preferences,
      credits: apiUser.credits ?? undefined,
      tier: apiUser.tier ?? undefined,
      setupCompletedAt: apiUser.setup_completed_at ?? apiUser.setupCompletedAt ?? null,
    };
  }

  private normalizeRoles(rawRoles: any): Role[] {
    if (!Array.isArray(rawRoles)) {
      return [];
    }

    return rawRoles.map((role, index) => {
      if (typeof role === 'string') {
        return {
          id: role,
          name: role,
          description: '',
          permissions: [],
        };
      }

      return {
        id: role.id ?? role.name ?? `role-${index}`,
        name: role.name ?? role.id ?? `role-${index}`,
        description: role.description ?? '',
        permissions: this.normalizePermissions(role.permissions),
      };
    });
  }

  private normalizePermissions(rawPermissions: any): Permission[] {
    if (!Array.isArray(rawPermissions)) {
      return [];
    }

    const permissions: Permission[] = [];

    rawPermissions.forEach((perm, index) => {
      if (!perm) {
        return;
      }

      if (typeof perm === 'string') {
        const [resource, action] = perm.includes(':') ? perm.split(':') : ['global', perm];
        permissions.push({
          id: `${resource}:${action}:${index}`,
          resource,
          action,
        });
        return;
      }

      if (typeof perm === 'object') {
        permissions.push({
          id: perm.id ?? `${perm.resource ?? 'global'}:${perm.action ?? 'read'}:${index}`,
          resource: perm.resource ?? 'global',
          action: perm.action ?? 'read',
          scope: perm.scope,
        });
      }
    });

    return permissions;
  }

  private parsePreferences(raw: any): Record<string, any> | undefined {
    if (!raw) {
      return undefined;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('[AuthService] Failed to parse stored preferences string:', error);
        return undefined;
      }
    }

    if (typeof raw === 'object') {
      return raw;
    }

    return undefined;
  }

  loadTokensFromStorage() {
    if (typeof window !== 'undefined') {
      try {
        this.accessToken = localStorage.getItem('accessToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        console.log('[AuthService] Loaded tokens from storage:', {
          hasAccessToken: !!this.accessToken,
          hasRefreshToken: !!this.refreshToken,
          accessTokenLength: this.accessToken?.length || 0
        });
      } catch (error) {
        // iOS Safari private browsing throws on localStorage access
        console.warn('[AuthService] localStorage unavailable (private browsing?), using session only:', error);
        this.accessToken = null;
        this.refreshToken = null;
      }
    }
  }

  private saveTokensToStorage(tokens: AuthTokens) {
    if (typeof window !== 'undefined') {
      // Always update in-memory tokens
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;

      try {
        localStorage.setItem('accessToken', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);

        console.log('[AuthService] Tokens saved to storage:', {
          accessTokenSaved: !!localStorage.getItem('accessToken'),
          refreshTokenSaved: !!localStorage.getItem('refreshToken')
        });
      } catch (error) {
        // iOS Safari private browsing - tokens remain in memory for session
        console.warn('[AuthService] localStorage unavailable (private browsing?), tokens in memory only:', error);
      }

      // Set up auto-refresh
      this.scheduleTokenRefresh(tokens.expiresIn);
    }
  }

  private clearTokensFromStorage() {
    if (typeof window !== 'undefined') {
      // Always clear in-memory tokens
      this.accessToken = null;
      this.refreshToken = null;

      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } catch (error) {
        // iOS Safari private browsing - already cleared from memory
        console.warn('[AuthService] localStorage unavailable during cleanup:', error);
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
        // Preserve error code and details for better error handling
        const authError: any = new Error(error.error || error.message || 'Login failed');
        authError.code = error.code;
        authError.details = error.details;
        authError.response = { data: error };
        throw authError;
      }

      const data = await response.json();
      const tokens: AuthTokens = data.tokens ?? {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn ?? (15 * 60),
      };

      this.saveTokensToStorage(tokens);
      const normalizedUser = this.normalizeUser(data.user ?? data);
      data.tokens = tokens;

      // NON-BLOCKING: Log security event without blocking login
      this.logSecurityEvent({
        type: SecurityEventType.LOGIN_SUCCESS,
        userId: data.user.id,
        details: { email: credentials.email },
        severity: 'low',
        timestamp: new Date().toISOString(),
      }).catch(err => {
        console.warn('[Auth] Failed to log login security event (non-critical):', err?.message || String(err));
      });

      return { user: normalizedUser, tokens };
    } catch (error) {
      // NON-BLOCKING: Log failed login attempt without blocking error handling
      this.logSecurityEvent({
        type: SecurityEventType.LOGIN_FAILURE,
        details: { email: credentials.email, error: error instanceof Error ? error.message : 'Unknown error' },
        severity: 'medium',
        timestamp: new Date().toISOString(),
      }).catch(err => {
        console.warn('[Auth] Failed to log login failure security event (non-critical):', err?.message || String(err));
      });

      throw error;
    }
  }

  async register(input: RegisterInput): Promise<{ user: User; tokens: AuthTokens; requiresVerification?: boolean; message?: string }> {
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({} as Record<string, any>));
        const message = error.error || error.message || error.details?.message || 'Account creation failed';

        // Create error object with code and details for frontend error handling
        const enrichedError: any = new Error(message);
        enrichedError.code = error.code;
        enrichedError.details = error.details;
        enrichedError.response = { data: error };
        throw enrichedError;
      }

      const data = await response.json();
      const tokens: AuthTokens = data.tokens ?? {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn ?? 3600,
      };

      this.saveTokensToStorage(tokens);
      const normalizedUser = this.normalizeUser(data.user ?? data);
      data.tokens = tokens;

      // NON-BLOCKING: Log security event without blocking registration
      this.logSecurityEvent({
        type: SecurityEventType.REGISTER,
        userId: data.user?.id,
        details: { email: input.email },
        severity: 'low',
        timestamp: new Date().toISOString(),
      }).catch(err => {
        console.warn('[Auth] Failed to log registration security event (non-critical):', err?.message || String(err));
      });

      // Return full response including requiresVerification for frontend handling
      return {
        user: normalizedUser,
        tokens,
        requiresVerification: data.requiresVerification,
        message: data.message
      };
    } catch (error) {
      // NON-BLOCKING: Log security event without blocking error handling
      this.logSecurityEvent({
        type: SecurityEventType.REGISTER,
        details: {
          email: input.email,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        severity: 'medium',
        timestamp: new Date().toISOString(),
      }).catch(err => {
        console.warn('[Auth] Failed to log registration failure security event (non-critical):', err?.message || String(err));
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

      const data = await response.json();
      const tokens: AuthTokens = data.tokens ?? {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn ?? (15 * 60),
      };

      this.saveTokensToStorage(tokens);
      return tokens;
    } catch (error) {
      this.clearTokensFromStorage();
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    // REMOVED: Auth bypass mode - all users must authenticate properly

    // Ensure tokens are loaded from storage
    if (!this.accessToken && typeof window !== 'undefined') {
      this.loadTokensFromStorage();
    }

    if (!this.accessToken) {
      console.error('[AuthService] getCurrentUser failed: No access token available');
      throw new Error('Not authenticated');
    }

    console.log('[AuthService] Fetching current user with token');

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        credentials: 'include',
      });

      console.log('[AuthService] getCurrentUser response status:', response.status);

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[AuthService] Token expired, attempting refresh');
          // Try to refresh token
          await this.refreshAccessToken();
          return this.getCurrentUser();
        }

        const errorText = await response.text();
        console.error('[AuthService] getCurrentUser failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
      }

      const payload = await response.json().catch(() => null);
      const userData = payload?.user ?? payload?.data ?? payload;

      if (!userData || !userData.id) {
        console.error('[AuthService] Invalid user data received:', payload);
        throw new Error('Invalid user data received from server');
      }

      console.log('[AuthService] Successfully fetched user:', userData.email);
      return this.normalizeUser(userData);
    } catch (error) {
      console.error('[AuthService] getCurrentUser error:', error);
      throw error;
    }
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

    // NON-BLOCKING: Log security event without blocking password change
    this.logSecurityEvent({
      type: SecurityEventType.PASSWORD_CHANGE,
      userId: (await this.getCurrentUser()).id,
      details: { success: true },
      severity: 'medium',
      timestamp: new Date().toISOString(),
    }).catch(err => {
      console.warn('[Auth] Failed to log password change security event (non-critical):', err?.message || String(err));
    });
  }

  async updateProfile(userId: string, updates: ProfileUpdateInput): Promise<User> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const body: Record<string, any> = {};

    if (updates.displayName !== undefined || updates.name !== undefined) {
      body.display_name = updates.displayName ?? updates.name;
    }
    if (updates.username !== undefined) {
      body.username = updates.username;
    }
    if (updates.email !== undefined) {
      body.email = updates.email;
    }
    if (updates.avatar !== undefined) {
      body.avatar_url = updates.avatar;
    }
    if (updates.preferences) {
      body.preferences = updates.preferences;
    }

    if (Object.keys(body).length === 0) {
      throw new Error('No profile changes specified');
    }

    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'Failed to update profile');
    }

    const payload = await response.json().catch(() => ({}));
    const userData = payload.user ?? payload.data ?? payload;
    const normalizedUser = this.normalizeUser(userData);

    console.log('[AuthService] Profile updated successfully');
    return normalizedUser;
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
    if (import.meta.env.VITE_ENABLE_AUDIT_LOGS !== 'true') {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        // Fall back silently without throwing; audit logging must never block primary flow
        console.warn('[AuthService] Audit logging failed with status', response.status);
      }
    } catch (error) {
      console.warn('[AuthService] Failed to log security event (non-critical):', error);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    // REMOVED: Auth bypass mode
    // Ensure tokens are loaded from storage if not already in memory
    if (!this.accessToken && typeof window !== 'undefined') {
      this.loadTokensFromStorage();
    }
    const isAuth = !!this.accessToken;
    console.log('[AuthService] isAuthenticated check:', { isAuth, hasToken: !!this.accessToken });
    return isAuth;
  }

  setSessionForDevelopment(tokens: AuthTokens) {
    this.saveTokensToStorage(tokens);
  }

  private persistSetupStatus(data: Partial<SetupStatusResponse>) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (data.userSetupCompleted) {
        localStorage.setItem('maifarm:first-run-complete', 'true');
        localStorage.setItem('maifarm:initialized', 'true');
      } else if (data.requiresUserSetup) {
        localStorage.removeItem('maifarm:first-run-complete');
      }

      if (data.requiresSetup === false && data.hasAdminUser) {
        localStorage.setItem('maifarm-owner-account', 'true');
      } else if (data.isNewInstall) {
        localStorage.removeItem('maifarm-owner-account');
        localStorage.removeItem('maifarm-owner-profile');
      }
    } catch (error) {
      // iOS Safari private browsing - setup status tracking unavailable
      console.warn('[AuthService] localStorage unavailable for setup status:', error);
    }
  }

  async getSetupStatus(): Promise<SetupStatusResponse> {
    try {
      const headers: Record<string, string> = {};
      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(`${API_BASE}/auth/setup-status`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load setup status');
      }

      const data = (await response.json()) as SetupStatusResponse;
      this.persistSetupStatus(data);
      return data;
    } catch (error) {
      console.error('[AuthService] Failed to get setup status:', error);

      // Safe localStorage access for fallback - may fail in iOS Safari private browsing
      let hasLocalOwner = false;
      let initializationFlag = false;

      if (typeof window !== 'undefined') {
        try {
          hasLocalOwner = localStorage.getItem('maifarm-owner-account') === 'true';
          initializationFlag = localStorage.getItem('maifarm:initialized') === 'true';
        } catch (storageError) {
          console.warn('[AuthService] localStorage unavailable in fallback:', storageError);
        }
      }

      const requiresSetup = !(hasLocalOwner || initializationFlag);
      const fallback: SetupStatusResponse = {
        success: false,
        requiresSetup,
        requiresUserSetup: requiresSetup,
        hasAdminUser: hasLocalOwner,
        totalUsers: hasLocalOwner ? 1 : 0,
        fallback: true,
        userSetupCompleted: hasLocalOwner || initializationFlag,
        setupCompletedAt: null,
      };

      if (!requiresSetup) {
        this.persistSetupStatus({
          requiresSetup: false,
          hasAdminUser: hasLocalOwner,
          userSetupCompleted: true,
        });
      }

      return fallback;
    }
  }

  async saveUserPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken && { 'Authorization': `Bearer ${this.accessToken}` }),
      },
      credentials: 'include',
      body: JSON.stringify({ preferences }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to save preferences');
    }

    console.log('[AuthService] User preferences saved successfully');
  }

  async completeSetup(preferences?: Record<string, any>): Promise<void> {
    // REMOVED: Auth bypass mode

    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}/auth/complete-setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      credentials: 'include',
      body: preferences ? JSON.stringify({ preferences }) : '{}',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to complete setup');
    }

    const data = await response.json().catch(() => ({}));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('maifarm:first-run-complete', 'true');
        localStorage.setItem('maifarm:initialized', 'true');
        if (data.setupCompletedAt) {
          localStorage.setItem('maifarm:setup-completed-at', data.setupCompletedAt);
        }
      } catch (storageError) {
        // iOS Safari private browsing - setup persists on server but not locally
        console.warn('[AuthService] localStorage unavailable for setup completion:', storageError);
      }
    }

    console.log('[AuthService] Setup completed atomically', {
      setupCompletedAt: data.setupCompletedAt,
      preferencesSaved: data.preferencesSaved
    });
  }
}

export const authService = new AuthService();
