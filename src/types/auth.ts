export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  roles: Role[];
  permissions: Permission[];
  createdAt: Date;
  lastLogin?: Date;
  mfaEnabled?: boolean;
  sessionToken?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  scope?: 'own' | 'team' | 'all';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  checkPermission: (resource: string, action: string) => boolean;
  hasRole: (roleName: string) => boolean;
}

export enum AuthActions {
  LOGIN_START = 'AUTH_LOGIN_START',
  LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  LOGIN_FAILURE = 'AUTH_LOGIN_FAILURE',
  LOGOUT = 'AUTH_LOGOUT',
  REFRESH_START = 'AUTH_REFRESH_START',
  REFRESH_SUCCESS = 'AUTH_REFRESH_SUCCESS',
  REFRESH_FAILURE = 'AUTH_REFRESH_FAILURE',
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface SecurityConfig {
  encryptionEnabled: boolean;
  encryptionKey?: string;
  saltRounds: number;
  sessionTimeout: number;
  mfaRequired: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  };
}

export interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
  algorithm: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expiresAt: Date;
  refreshToken?: string;
}