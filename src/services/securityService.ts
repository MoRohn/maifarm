import { 
  AuthCredentials, 
  AuthResponse, 
  AuthUser,
  Session,
  Permission,
  AuditLog,
  EncryptedData,
  ApiKey
} from '../types/security';
import { websocketService } from './websocket';
import * as bcrypt from 'bcryptjs';

class SecurityService {
  private currentUser: AuthUser | null = null;
  private sessionToken: string | null = null;
  private refreshToken: string | null = null;
  private permissions: Map<string, Permission> = new Map();
  private encryptionKey: CryptoKey | null = null;

  constructor() {
    this.initializeEncryption();
    this.loadStoredSession();
  }

  private async initializeEncryption() {
    try {
      // Generate or load encryption key
      const storedKey = localStorage.getItem('maifarm_encryption_key');
      if (storedKey) {
        this.encryptionKey = await this.importKey(storedKey);
      } else {
        this.encryptionKey = await this.generateEncryptionKey();
      }
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
    }
  }

  private async generateEncryptionKey(): Promise<CryptoKey> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Export and store key
    const exportedKey = await crypto.subtle.exportKey('jwk', key);
    localStorage.setItem('maifarm_encryption_key', JSON.stringify(exportedKey));

    return key;
  }

  private async importKey(keyData: string): Promise<CryptoKey> {
    const jwk = JSON.parse(keyData);
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  private loadStoredSession() {
    try {
      const storedSession = localStorage.getItem('maifarm_session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        if (this.isSessionValid(session)) {
          this.currentUser = session.user;
          this.sessionToken = session.token;
          this.refreshToken = session.refreshToken;
          this.loadPermissions(session.user.permissions);
        } else {
          this.clearSession();
        }
      }
    } catch (error) {
      console.error('Failed to load stored session:', error);
      this.clearSession();
    }
  }

  private isSessionValid(session: any): boolean {
    if (!session.expiresAt) return false;
    return new Date(session.expiresAt) > new Date();
  }

  private loadPermissions(permissions: Permission[]) {
    this.permissions.clear();
    permissions.forEach(permission => {
      const key = `${permission.resource}:${permission.action}`;
      this.permissions.set(key, permission);
    });
  }

  private clearSession() {
    this.currentUser = null;
    this.sessionToken = null;
    this.refreshToken = null;
    this.permissions.clear();
    localStorage.removeItem('maifarm_session');
  }

  // Authentication methods
  public async login(credentials: AuthCredentials): Promise<AuthResponse> {
    try {
      // Hash password before sending
      const hashedPassword = await this.hashPassword(credentials.password);
      
      // Send login request
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          password: hashedPassword
        })
      });

      const data = await response.json();

      if (data.success && data.user) {
        this.currentUser = data.user;
        this.sessionToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        this.loadPermissions(data.user.permissions);

        // Store session if remember me is enabled
        if (credentials.rememberMe) {
          const session = {
            user: data.user,
            token: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: new Date(Date.now() + (data.expiresIn || 3600) * 1000)
          };
          localStorage.setItem('maifarm_session', JSON.stringify(session));
        }

        // Log successful login
        this.logAuditEvent('login', 'authentication', true);

        // Connect WebSocket with auth token
        websocketService.connect(`ws://localhost:8765?token=${data.accessToken}`);
      }

      return data;
    } catch (error) {
      this.logAuditEvent('login', 'authentication', false, error.message);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  public async logout(): Promise<void> {
    try {
      if (this.sessionToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${this.sessionToken}` 
          }
        });
      }

      this.logAuditEvent('logout', 'authentication', true);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearSession();
      websocketService.disconnect();
    }
  }

  public async refreshSession(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      const data = await response.json();

      if (data.success) {
        this.sessionToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return false;
    }
  }

  // Authorization methods
  public hasPermission(resource: string, action: string): boolean {
    if (!this.currentUser) return false;

    // Check direct permission
    const key = `${resource}:${action}`;
    if (this.permissions.has(key)) {
      const permission = this.permissions.get(key)!;
      return this.evaluatePermissionConditions(permission);
    }

    // Check role-based permissions
    return this.currentUser.roles.some(role => 
      role.permissions.some(p => 
        p.resource === resource && p.action === action &&
        this.evaluatePermissionConditions(p)
      )
    );
  }

  private evaluatePermissionConditions(permission: Permission): boolean {
    if (!permission.conditions || permission.conditions.length === 0) {
      return true;
    }

    // Evaluate all conditions
    return permission.conditions.every(condition => {
      // Implement condition evaluation logic
      // This is a simplified version
      switch (condition.operator) {
        case 'equals':
          return this.getContextValue(condition.field) === condition.value;
        case 'contains':
          return String(this.getContextValue(condition.field)).includes(condition.value);
        case 'gt':
          return Number(this.getContextValue(condition.field)) > condition.value;
        case 'lt':
          return Number(this.getContextValue(condition.field)) < condition.value;
        case 'in':
          return condition.value.includes(this.getContextValue(condition.field));
        default:
          return false;
      }
    });
  }

  private getContextValue(field: string): any {
    // Get value from current context
    // This would be extended based on your needs
    const context: Record<string, any> = {
      userId: this.currentUser?.id,
      userEmail: this.currentUser?.email,
      timestamp: Date.now()
    };

    return context[field];
  }

  // Encryption methods
  public async encrypt(data: string): Promise<EncryptedData> {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      this.encryptionKey,
      encodedData
    );

    return {
      data: this.bufferToBase64(encryptedBuffer),
      iv: this.bufferToBase64(iv),
      salt: '', // Not used with AES-GCM
      algorithm: 'AES-256-GCM',
      timestamp: new Date()
    };
  }

  public async decrypt(encryptedData: EncryptedData): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    const iv = this.base64ToBuffer(encryptedData.iv);
    const data = this.base64ToBuffer(encryptedData.data);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      this.encryptionKey,
      data
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  // Audit logging
  private async logAuditEvent(
    action: string, 
    resource: string, 
    success: boolean, 
    error?: string
  ) {
    const auditLog: Partial<AuditLog> = {
      userId: this.currentUser?.id || 'anonymous',
      action,
      resource,
      timestamp: new Date(),
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      success,
      error,
      severity: success ? 'low' : 'medium'
    };

    // Send to server
    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`
        },
        body: JSON.stringify(auditLog)
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  private async getClientIP(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  // Helper methods
  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // API Key management
  public async createApiKey(name: string, permissions: Permission[]): Promise<ApiKey> {
    const response = await fetch('/api/keys/create', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.sessionToken}`
      },
      body: JSON.stringify({ name, permissions })
    });

    const apiKey = await response.json();
    return apiKey;
  }

  public async revokeApiKey(keyId: string): Promise<boolean> {
    const response = await fetch(`/api/keys/${keyId}/revoke`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${this.sessionToken}`
      }
    });

    return response.ok;
  }

  // Public getters
  public get isAuthenticated(): boolean {
    return !!this.currentUser && !!this.sessionToken;
  }

  public get user(): AuthUser | null {
    return this.currentUser;
  }

  public get token(): string | null {
    return this.sessionToken;
  }
}

// Export singleton instance
export const securityService = new SecurityService();