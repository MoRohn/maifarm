import {
  EncryptionKey,
  EncryptedPayload,
  KeyPair,
  E2ESession,
  E2EMessage,
  EncryptionAlgorithm,
  EncryptionConfig,
  SecureChannel,
} from '../../types/encryption';

export class E2EEncryptionService {
  private config: EncryptionConfig = {
    defaultAlgorithm: 'AES-GCM',
    keyLength: 256,
    saltLength: 16,
    iterations: 100000,
    tagLength: 128,
    enableHardwareAcceleration: true,
    keyRotationPolicy: {
      enabled: true,
      rotationInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
      keyRetentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      automaticRotation: true,
      notificationThreshold: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  private sessions = new Map<string, E2ESession>();
  private channels = new Map<string, SecureChannel>();
  private keys = new Map<string, EncryptionKey>();

  async establishSession(participantId: string): Promise<E2ESession> {
    // Generate local key pair for key exchange
    const keyPair = await this.generateKeyPair();
    
    const session: E2ESession = {
      sessionId: this.generateSessionId(),
      localKeyPair: keyPair,
      participant: participantId,
      status: 'pending',
      lastUsed: new Date(),
    };

    this.sessions.set(session.sessionId, session);
    
    // Initiate key exchange
    await this.initiateKeyExchange(session);
    
    return session;
  }

  async completeKeyExchange(
    sessionId: string,
    remotePublicKeyData: JsonWebKey
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Import remote public key
    const remotePublicKey = await crypto.subtle.importKey(
      'jwk',
      remotePublicKeyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: remotePublicKey,
      },
      session.localKeyPair.privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );

    session.remotePublicKey = remotePublicKey;
    session.sharedSecret = sharedSecret;
    session.status = 'established';
    session.establishedAt = new Date();

    this.sessions.set(sessionId, session);
  }

  async encryptMessage(
    sessionId: string,
    message: string | ArrayBuffer
  ): Promise<E2EMessage> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'established' || !session.sharedSecret) {
      throw new Error('Session not established');
    }

    const payload = await this.encrypt(message, session.sharedSecret);
    
    const e2eMessage: E2EMessage = {
      id: crypto.randomUUID(),
      sessionId,
      payload,
      sender: 'self',
      recipient: session.participant,
      timestamp: new Date(),
    };

    // Sign the message for integrity
    if (session.localKeyPair.privateKey) {
      e2eMessage.signature = await this.signMessage(e2eMessage, session.localKeyPair.privateKey);
    }

    session.lastUsed = new Date();
    return e2eMessage;
  }

  async decryptMessage(
    sessionId: string,
    message: E2EMessage
  ): Promise<string | ArrayBuffer> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'established' || !session.sharedSecret) {
      throw new Error('Session not established');
    }

    // Verify signature if present
    if (message.signature && session.remotePublicKey) {
      const isValid = await this.verifySignature(message, session.remotePublicKey);
      if (!isValid) {
        throw new Error('Invalid message signature');
      }
    }

    const decrypted = await this.decrypt(message.payload, session.sharedSecret);
    session.lastUsed = new Date();
    
    return decrypted;
  }

  async createSecureChannel(participants: string[]): Promise<SecureChannel> {
    // Generate channel encryption key
    const encryptionKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );

    const channel: SecureChannel = {
      id: crypto.randomUUID(),
      participants,
      encryptionKey,
      established: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      bytesTransferred: 0,
    };

    this.channels.set(channel.id, channel);
    return channel;
  }

  private async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      algorithm: 'ECDH',
      keyId: crypto.randomUUID(),
      createdAt: new Date(),
    };
  }

  private async encrypt(
    data: string | ArrayBuffer,
    key: CryptoKey
  ): Promise<EncryptedPayload> {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: this.config.tagLength,
      },
      key,
      dataBuffer
    );

    return {
      ciphertext: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
      algorithm: 'AES-GCM',
      timestamp: Date.now(),
    };
  }

  private async decrypt(
    payload: EncryptedPayload,
    key: CryptoKey
  ): Promise<ArrayBuffer> {
    const ciphertext = this.base64ToArrayBuffer(payload.ciphertext);
    const iv = this.base64ToArrayBuffer(payload.iv);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: payload.algorithm,
        iv,
        tagLength: this.config.tagLength,
      },
      key,
      ciphertext
    );

    return decrypted;
  }

  private async signMessage(
    message: E2EMessage,
    privateKey: CryptoKey
  ): Promise<string> {
    const encoder = new TextEncoder();
    const messageData = encoder.encode(JSON.stringify({
      id: message.id,
      sessionId: message.sessionId,
      payload: message.payload,
      sender: message.sender,
      recipient: message.recipient,
      timestamp: message.timestamp,
    }));

    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      privateKey,
      messageData
    );

    return this.arrayBufferToBase64(signature);
  }

  private async verifySignature(
    message: E2EMessage,
    publicKey: CryptoKey
  ): Promise<boolean> {
    if (!message.signature) {
      return false;
    }

    const encoder = new TextEncoder();
    const messageData = encoder.encode(JSON.stringify({
      id: message.id,
      sessionId: message.sessionId,
      payload: message.payload,
      sender: message.sender,
      recipient: message.recipient,
      timestamp: message.timestamp,
    }));

    const signature = this.base64ToArrayBuffer(message.signature);

    return crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signature,
      messageData
    );
  }

  private async initiateKeyExchange(session: E2ESession): Promise<void> {
    // Export public key for exchange
    const publicKeyData = await crypto.subtle.exportKey(
      'jwk',
      session.localKeyPair.publicKey
    );

    // Send public key to participant
    // This would typically be done through a secure channel or API
    await this.sendKeyExchangeRequest(session.participant, {
      sessionId: session.sessionId,
      publicKey: publicKeyData,
    });
  }

  private async sendKeyExchangeRequest(
    participant: string,
    data: any
  ): Promise<void> {
    // Implementation would send the key exchange request
    // through the appropriate channel (WebSocket, API, etc.)
    console.log(`Sending key exchange request to ${participant}`, data);
  }

  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async rotateKeys(): Promise<void> {
    // Rotate encryption keys based on policy
    const now = Date.now();
    
    for (const [keyId, key] of this.keys.entries()) {
      const age = now - key.createdAt.getTime();
      
      if (age > this.config.keyRotationPolicy.rotationInterval) {
        await this.rotateKey(keyId);
      }
    }
  }

  private async rotateKey(keyId: string): Promise<void> {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) return;

    // Generate new key
    const newKey = await crypto.subtle.generateKey(
      {
        name: oldKey.algorithm,
        length: this.config.keyLength,
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Create new key entry
    const newKeyEntry: EncryptionKey = {
      id: crypto.randomUUID(),
      algorithm: oldKey.algorithm,
      key: newKey as CryptoKey,
      createdAt: new Date(),
      purpose: oldKey.purpose,
      metadata: {
        rotatedFrom: keyId,
      },
    };

    this.keys.set(newKeyEntry.id, newKeyEntry);

    // Mark old key for deletion after retention period
    oldKey.expiresAt = new Date(Date.now() + this.config.keyRotationPolicy.keyRetentionPeriod);
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.status === 'established').length;
  }

  getMetrics(): any {
    return {
      activeSessions: this.getActiveSessionCount(),
      activeChannels: this.channels.size,
      activeKeys: this.keys.size,
    };
  }
}

export const e2eEncryptionService = new E2EEncryptionService();