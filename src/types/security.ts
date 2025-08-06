// Security types for MaiFarm V2

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  roles: Role[];
  permissions: Permission[];
  lastLogin: Date;
  mfaEnabled: boolean;
  sessionToken?: string;
  refreshToken?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  priority: number;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in';
  value: any;
}

export interface AuthCredentials {
  username?: string;
  email?: string;
  password: string;
  mfaCode?: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}

export interface SessionData {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface EncryptionConfig {
  algorithm: 'AES-256-GCM' | 'AES-256-CBC';
  keyDerivation: 'PBKDF2' | 'scrypt' | 'argon2';
  iterations: number;
  saltLength: number;
}

export interface EncryptedData {
  data: string; // Base64 encoded
  ciphertext?: string; // Alias for data
  iv: string; // Base64 encoded
  salt: string; // Base64 encoded
  tag?: string; // Authentication tag for GCM mode
  algorithm: string;
  timestamp: Date;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number; // days
  preventReuse: number; // number of previous passwords
}

export interface SecurityConfig {
  passwordPolicy: PasswordPolicy;
  sessionPolicy: {
    maxDuration: number; // minutes
    idleTimeout: number; // minutes
    maxConcurrentSessions: number;
    requireMFA: boolean;
  };
  apiPolicy: {
    rateLimit: number; // requests per minute
    maxRequestSize: number; // bytes
    allowedOrigins: string[];
    requireApiKey: boolean;
  };
  encryptionEnabled: boolean;
  auditLoggingEnabled: boolean;
  twoFactorRequired: boolean;
  allowedIPs?: string[];
  blockedIPs?: string[];
}

export interface SecurityPolicy {
  passwordPolicy: PasswordPolicy;
  sessionPolicy: {
    maxDuration: number; // minutes
    idleTimeout: number; // minutes
    maxConcurrentSessions: number;
    requireMFA: boolean;
  };
  apiPolicy: {
    rateLimit: number; // requests per minute
    maxRequestSize: number; // bytes
    allowedOrigins: string[];
    requireApiKey: boolean;
  };
}

export interface AccessControl {
  resource: string;
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
    execute: boolean;
  };
  conditions?: AccessCondition[];
}

export interface AccessCondition {
  type: 'ownership' | 'role' | 'time' | 'location' | 'custom';
  parameters: Record<string, any>;
}

export interface SecurityAlert {
  id: string;
  type: 'failed_login' | 'suspicious_activity' | 'permission_violation' | 'data_breach';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  timestamp: Date;
  description: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  actions: SecurityAction[];
}

export interface SecurityAction {
  type: 'block_ip' | 'lock_account' | 'force_logout' | 'notify_admin' | 'require_mfa';
  executed: boolean;
  executedAt?: Date;
  result?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string; // Hashed
  userId: string;
  permissions: Permission[];
  createdAt: Date;
  lastUsed?: Date;
  expiresAt?: Date;
  isActive: boolean;
  allowedIPs?: string[];
  rateLimit?: number;
}

export interface OfflineCapability {
  enabled: boolean;
  syncStrategy: 'manual' | 'automatic' | 'smart';
  cacheSize: number; // MB
  encryptLocalData: boolean;
  allowedOfflineActions: string[];
  syncInterval: number; // minutes
  conflictResolution: 'local_wins' | 'remote_wins' | 'manual';
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
}

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  details?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}