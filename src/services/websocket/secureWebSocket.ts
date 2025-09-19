import { io, Socket } from 'socket.io-client';
import { e2eEncryptionService } from '../encryption/e2eEncryption';
import { E2ESession, E2EMessage } from '@/types/encryption';
import { authService } from '../authService';

interface SecureWebSocketConfig {
  url: string;
  enableEncryption: boolean;
  autoEstablishSessions: boolean;
  heartbeatInterval: number;
}

interface SecureMessage {
  type: 'encrypted' | 'plain';
  sessionId?: string;
  payload: any;
  timestamp: number;
}

export class SecureWebSocketService {
  private socket: Socket | null = null;
  private config: SecureWebSocketConfig;
  private sessions = new Map<string, E2ESession>();
  private messageHandlers = new Map<string, ((data: any) => void)[]>();
  private connectionPromise: Promise<void> | null = null;

  constructor(config: Partial<SecureWebSocketConfig> = {}) {
    this.config = {
      url: config.url || import.meta.env.VITE_WS_URL || 'ws://localhost:3001',
      enableEncryption: config.enableEncryption ?? true,
      autoEstablishSessions: config.autoEstablishSessions ?? true,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
    };
  }

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tokens = authService.getStoredTokens();
      
      this.socket = io(this.config.url, {
        transports: ['websocket'],
        auth: {
          token: tokens?.accessToken || '',
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Secure WebSocket connected');
        this.setupEventHandlers();
        this.startHeartbeat();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        this.stopHeartbeat();
      });
    });
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Handle key exchange requests
    this.socket.on('e2e:keyExchange', async (data: {
      sessionId: string;
      publicKey: JsonWebKey;
      sender: string;
    }) => {
      if (this.config.enableEncryption) {
        await this.handleKeyExchange(data);
      }
    });

    // Handle secure messages
    this.socket.on('message:secure', async (message: SecureMessage) => {
      await this.handleSecureMessage(message);
    });

    // Handle session establishment
    this.socket.on('e2e:sessionRequest', async (data: {
      participantId: string;
    }) => {
      if (this.config.autoEstablishSessions) {
        await this.establishSession(data.participantId);
      }
    });
  }

  async send(event: string, data: any, options?: {
    encrypt?: boolean;
    recipientId?: string;
  }): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected');
    }

    const shouldEncrypt = options?.encrypt ?? this.config.enableEncryption;

    if (shouldEncrypt && options?.recipientId) {
      // Send encrypted message
      const session = await this.getOrCreateSession(options.recipientId);
      const encrypted = await e2eEncryptionService.encryptMessage(
        session.sessionId,
        JSON.stringify(data)
      );

      const secureMessage: SecureMessage = {
        type: 'encrypted',
        sessionId: session.sessionId,
        payload: encrypted,
        timestamp: Date.now(),
      };

      this.socket.emit(event, secureMessage);
    } else {
      // Send plain message
      const message: SecureMessage = {
        type: 'plain',
        payload: data,
        timestamp: Date.now(),
      };

      this.socket.emit(event, message);
    }
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
      
      // Set up the actual socket listener
      this.socket?.on(event, async (message: any) => {
        // Handle both secure and regular messages
        if (message && typeof message === 'object' && 'type' in message) {
          await this.handleSecureMessage(message);
        } else {
          // Regular message, pass through
          const handlers = this.messageHandlers.get(event) || [];
          handlers.forEach(h => h(message));
        }
      });
    }

    this.messageHandlers.get(event)!.push(handler);
  }

  off(event: string, handler?: (data: any) => void): void {
    if (!handler) {
      this.messageHandlers.delete(event);
      this.socket?.off(event);
    } else {
      const handlers = this.messageHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        if (handlers.length === 0) {
          this.messageHandlers.delete(event);
          this.socket?.off(event);
        }
      }
    }
  }

  private async handleSecureMessage(message: SecureMessage): Promise<void> {
    if (message.type === 'encrypted' && message.sessionId) {
      try {
        const decrypted = await e2eEncryptionService.decryptMessage(
          message.sessionId,
          message.payload as E2EMessage
        );

        const data = JSON.parse(
          decrypted instanceof ArrayBuffer
            ? new TextDecoder().decode(decrypted)
            : decrypted
        );

        // Emit decrypted message to handlers
        this.emitToHandlers('message:decrypted', data);
      } catch (error) {
        console.error('Failed to decrypt message:', error);
        this.emitToHandlers('message:decryptionError', { error, message });
      }
    } else {
      // Plain message
      this.emitToHandlers('message:plain', message.payload);
    }
  }

  private async handleKeyExchange(data: {
    sessionId: string;
    publicKey: JsonWebKey;
    sender: string;
  }): Promise<void> {
    try {
      await e2eEncryptionService.completeKeyExchange(data.sessionId, data.publicKey);
      
      // Store the session
      const session = await this.getSession(data.sessionId);
      if (session) {
        this.sessions.set(data.sender, session);
      }

      this.emitToHandlers('e2e:sessionEstablished', {
        sessionId: data.sessionId,
        participantId: data.sender,
      });
    } catch (error) {
      console.error('Key exchange failed:', error);
      this.emitToHandlers('e2e:sessionError', { error, sender: data.sender });
    }
  }

  private async getOrCreateSession(participantId: string): Promise<E2ESession> {
    const existing = this.sessions.get(participantId);
    if (existing && existing.status === 'established') {
      return existing;
    }

    const session = await this.establishSession(participantId);
    this.sessions.set(participantId, session);
    return session;
  }

  private async establishSession(participantId: string): Promise<E2ESession> {
    const session = await e2eEncryptionService.establishSession(participantId);
    
    // Send public key to participant
    if (this.socket?.connected) {
      const publicKey = await crypto.subtle.exportKey(
        'jwk',
        session.localKeyPair.publicKey
      );

      this.socket.emit('e2e:keyExchange', {
        sessionId: session.sessionId,
        publicKey,
        recipient: participantId,
      });
    }

    return session;
  }

  private async getSession(sessionId: string): Promise<E2ESession | null> {
    // This would typically query the E2E service for the session
    for (const session of this.sessions.values()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return null;
  }

  private emitToHandlers(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  private heartbeatInterval: NodeJS.Timeout | null = null;

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.sessions.clear();
    this.messageHandlers.clear();
    this.connectionPromise = null;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async rotateSessionKeys(): Promise<void> {
    const participants = Array.from(this.sessions.keys());
    this.sessions.clear();

    // Re-establish sessions with new keys
    for (const participantId of participants) {
      await this.establishSession(participantId);
    }
  }
}

export const secureWebSocketService = new SecureWebSocketService();