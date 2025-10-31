export interface EncryptionKey {
  id: string;
  algorithm: EncryptionAlgorithm;
  key: CryptoKey;
  createdAt: Date;
  expiresAt?: Date;
  purpose: KeyPurpose;
  metadata?: Record<string, any>;
}

export type EncryptionAlgorithm = 
  | 'AES-GCM'
  | 'AES-256-GCM'
  | 'AES-CBC'
  | 'AES-256-CBC'
  | 'RSA-OAEP'
  | 'ECDH-ES';

export type KeyPurpose = 
  | 'data-encryption'
  | 'key-wrapping'
  | 'signing'
  | 'key-agreement';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt?: string;
  tag?: string;
  algorithm: EncryptionAlgorithm;
  keyId?: string;
  timestamp: number;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  algorithm: string;
  keyId: string;
  createdAt: Date;
}

export interface E2ESession {
  sessionId: string;
  localKeyPair: KeyPair;
  remotePublicKey?: CryptoKey;
  sharedSecret?: CryptoKey;
  establishedAt?: Date;
  lastUsed: Date;
  participant: string;
  status: E2ESessionStatus;
}

export type E2ESessionStatus = 
  | 'pending'
  | 'established'
  | 'expired'
  | 'terminated';

export interface E2EMessage {
  id: string;
  sessionId: string;
  payload: EncryptedPayload;
  sender: string;
  recipient: string;
  timestamp: Date;
  signature?: string;
}

export interface KeyRotationPolicy {
  enabled: boolean;
  rotationInterval: number; // milliseconds
  keyRetentionPeriod: number; // milliseconds
  automaticRotation: boolean;
  notificationThreshold: number; // milliseconds before expiry
}

export interface EncryptionConfig {
  defaultAlgorithm: EncryptionAlgorithm;
  keyLength: number;
  ivLength?: number;
  saltLength: number;
  iterations: number;
  tagLength: number;
  enableHardwareAcceleration: boolean;
  keyRotationPolicy: KeyRotationPolicy;
}

export interface CryptoWorkerMessage {
  id: string;
  type: CryptoOperation;
  data: any;
}

export type CryptoOperation = 
  | 'encrypt'
  | 'decrypt'
  | 'generateKey'
  | 'deriveKey'
  | 'sign'
  | 'verify'
  | 'hash';

export interface CryptoWorkerResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface HSMConfig {
  enabled: boolean;
  provider: string;
  endpoint?: string;
  credentials?: HSMCredentials;
  keyMapping?: Record<string, string>;
}

export interface HSMCredentials {
  apiKey?: string;
  certificate?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ZeroKnowledgeProof {
  commitment: string;
  challenge: string;
  response: string;
  publicInputs: string[];
  verificationKey: string;
}

export interface SecureChannel {
  id: string;
  participants: string[];
  encryptionKey: CryptoKey;
  signingKey?: CryptoKey;
  established: Date;
  lastActivity: Date;
  messageCount: number;
  bytesTransferred: number;
}

export interface KeyDerivationParams {
  algorithm: 'PBKDF2' | 'HKDF' | 'Scrypt' | 'Argon2';
  salt: string;
  iterations?: number;
  length: number;
  hash?: string;
  info?: string;
  memoryCost?: number;
  parallelism?: number;
}

export interface EncryptionMetrics {
  operationsPerSecond: number;
  averageLatency: number;
  keyRotations: number;
  failedOperations: number;
  activeKeys: number;
  activeSessions: number;
}