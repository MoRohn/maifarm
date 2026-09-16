import { LoginCredentials, AuthSession, AuthUser, Role, Permission } from '@/types/auth';
import { encryptionService } from './encryptionService';

// Default roles and permissions
const DEFAULT_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access',
    permissions: [
      { id: 'farms.all', resource: 'farms', action: '*', scope: 'all' },
      { id: 'agents.all', resource: 'agents', action: '*', scope: 'all' },
      { id: 'settings.all', resource: 'settings', action: '*', scope: 'all' },
      { id: 'users.all', resource: 'users', action: '*', scope: 'all' },
    ],
    isSystem: true,
  },
  {
    id: 'user',
    name: 'User',
    description: 'Standard user access',
    permissions: [
      { id: 'farms.read.own', resource: 'farms', action: 'read', scope: 'own' },
      { id: 'farms.write.own', resource: 'farms', action: 'write', scope: 'own' },
      { id: 'agents.control.own', resource: 'agents', action: 'control', scope: 'own' },
      { id: 'settings.read.own', resource: 'settings', action: 'read', scope: 'own' },
      { id: 'settings.write.own', resource: 'settings', action: 'write', scope: 'own' },
    ],
    isSystem: true,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    permissions: [
      { id: 'farms.read.all', resource: 'farms', action: 'read', scope: 'all' },
      { id: 'agents.read.all', resource: 'agents', action: 'read', scope: 'all' },
    ],
    isSystem: true,
  },
];

class AuthService {
  private readonly SESSION_KEY = 'maifarm_session';
  private readonly CREDENTIALS_KEY = 'maifarm_credentials';

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    try {
      // Validate credentials
      if (!credentials.email || !credentials.password) {
        throw new Error('Invalid credentials');
      }

      // Encrypt password before storing
      const encryptedPassword = await encryptionService.encrypt(credentials.password);

      // In a real app, this would make an API call
      // For now, we'll simulate local authentication
      const storedCreds = this.getStoredCredentials();
      
      if (storedCreds) {
        const decryptedPassword = await encryptionService.decrypt(storedCreds.password);
        if (credentials.email !== storedCreds.email || credentials.password !== decryptedPassword) {
          throw new Error('Invalid email or password');
        }
      } else {
        // First time login - store credentials
        await this.storeCredentials({
          email: credentials.email,
          password: encryptedPassword,
        });
      }

      // Create user session
      const user: AuthUser = {
        id: this.generateUserId(credentials.email),
        email: credentials.email,
        name: credentials.email.split('@')[0],
        roles: [DEFAULT_ROLES.find(r => r.id === 'user')!],
        permissions: DEFAULT_ROLES.find(r => r.id === 'user')!.permissions,
        lastLogin: new Date(),
        mfaEnabled: false,
      };

      const session: AuthSession = {
        token: await this.generateSessionToken(),
        user,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      };

      // Store session
      if (credentials.rememberMe) {
        session.refreshToken = await this.generateRefreshToken();
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      }

      await this.storeSession(session);
      return session;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    // iOS Safari private browsing protection - don't throw on storage errors
    try {
      localStorage.removeItem(this.SESSION_KEY);
    } catch {
      console.warn('[AuthService] localStorage unavailable for logout');
    }
    try {
      sessionStorage.removeItem(this.SESSION_KEY);
    } catch {
      console.warn('[AuthService] sessionStorage unavailable for logout');
    }
  }

  async verifySession(): Promise<AuthSession | null> {
    try {
      const session = this.getStoredSession();
      if (!session) return null;

      // Check if session is expired
      if (new Date(session.expiresAt) < new Date()) {
        // Try to refresh if refresh token exists
        if (session.refreshToken) {
          return await this.refreshSession(session.refreshToken);
        }
        await this.logout();
        return null;
      }

      return session;
    } catch (error) {
      console.error('Session verification failed:', error);
      return null;
    }
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    try {
      const session = this.getStoredSession();
      if (!session || session.refreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Generate new tokens
      session.token = await this.generateSessionToken();
      session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await this.storeSession(session);
      return session;
    } catch (error) {
      console.error('Session refresh failed:', error);
      throw error;
    }
  }

  checkPermission(user: AuthUser | null, resource: string, action: string, scope?: string): boolean {
    if (!user) return false;

    return user.permissions.some(perm => {
      const resourceMatch = perm.resource === resource || perm.resource === '*';
      const actionMatch = perm.action === action || perm.action === '*';
      const scopeMatch = !scope || perm.scope === scope || perm.scope === 'all';
      
      return resourceMatch && actionMatch && scopeMatch;
    });
  }

  hasRole(user: AuthUser | null, roleName: string): boolean {
    if (!user) return false;
    return user.roles.some(role => role.name === roleName);
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const creds = this.getStoredCredentials();
      if (!creds) throw new Error('No credentials found');

      const decryptedPassword = await encryptionService.decrypt(creds.password);
      if (currentPassword !== decryptedPassword) {
        throw new Error('Current password is incorrect');
      }

      const encryptedNewPassword = await encryptionService.encrypt(newPassword);
      await this.storeCredentials({
        email: creds.email,
        password: encryptedNewPassword,
      });
    } catch (error) {
      console.error('Password update failed:', error);
      throw error;
    }
  }

  // Private methods
  private async generateSessionToken(): Promise<string> {
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    return btoa(String.fromCharCode(...random));
  }

  private async generateRefreshToken(): Promise<string> {
    const random = new Uint8Array(64);
    crypto.getRandomValues(random);
    return btoa(String.fromCharCode(...random));
  }

  private generateUserId(email: string): string {
    return btoa(email).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  private getStoredSession(): AuthSession | null {
    try {
      const sessionStr = localStorage.getItem(this.SESSION_KEY) || sessionStorage.getItem(this.SESSION_KEY);
      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  }

  private async storeSession(session: AuthSession): Promise<void> {
    const sessionStr = JSON.stringify(session);
    try {
      if (session.refreshToken) {
        localStorage.setItem(this.SESSION_KEY, sessionStr);
      } else {
        sessionStorage.setItem(this.SESSION_KEY, sessionStr);
      }
    } catch {
      // iOS Safari private browsing - session will not persist
      console.warn('[AuthService] Storage unavailable (iOS Safari private mode?) - session not persisted');
    }
  }

  private getStoredCredentials(): { email: string; password: string } | null {
    try {
      const credsStr = localStorage.getItem(this.CREDENTIALS_KEY);
      if (!credsStr) return null;
      return JSON.parse(credsStr);
    } catch {
      return null;
    }
  }

  private async storeCredentials(creds: { email: string; password: string }): Promise<void> {
    const credsStr = JSON.stringify(creds);
    try {
      localStorage.setItem(this.CREDENTIALS_KEY, credsStr);
    } catch {
      // iOS Safari private browsing - credentials will not persist
      console.warn('[AuthService] localStorage unavailable (iOS Safari private mode?) - credentials not persisted');
    }
  }
}

export const authService = new AuthService();