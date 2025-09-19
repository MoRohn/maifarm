import { CryptoWorkerMessage, CryptoWorkerResponse, CryptoOperation } from '@/types/encryption';

export class CryptoWorkerService {
  private worker: Worker | null = null;
  private pendingOperations = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }>();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.worker = new Worker(
        new URL('../../workers/crypto.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize crypto worker:', error);
      throw error;
    }
  }

  async encrypt(
    plaintext: string | ArrayBuffer,
    key: CryptoKey,
    algorithm: AlgorithmIdentifier,
    iv?: ArrayBuffer
  ): Promise<{ ciphertext: ArrayBuffer; iv: ArrayBuffer }> {
    await this.ensureInitialized();

    const plaintextBuffer = typeof plaintext === 'string'
      ? new TextEncoder().encode(plaintext)
      : plaintext;

    return this.performOperation('encrypt', {
      plaintext: plaintextBuffer,
      key,
      algorithm,
      iv,
    });
  }

  async decrypt(
    ciphertext: ArrayBuffer,
    key: CryptoKey,
    algorithm: AlgorithmIdentifier,
    iv: ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.ensureInitialized();

    return this.performOperation('decrypt', {
      ciphertext,
      key,
      algorithm,
      iv,
    });
  }

  async generateKey(
    algorithm: AlgorithmIdentifier,
    extractable: boolean = true,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey | CryptoKeyPair> {
    await this.ensureInitialized();

    return this.performOperation('generateKey', {
      algorithm,
      extractable,
      keyUsages,
    });
  }

  async deriveKey(
    algorithm: AlgorithmIdentifier,
    baseKey: CryptoKey,
    derivedKeyAlgorithm: AlgorithmIdentifier,
    extractable: boolean = false,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    await this.ensureInitialized();

    return this.performOperation('deriveKey', {
      algorithm,
      baseKey,
      derivedKeyAlgorithm,
      extractable,
      keyUsages,
    });
  }

  async sign(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    data: string | ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.ensureInitialized();

    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return this.performOperation('sign', {
      algorithm,
      key,
      data: dataBuffer,
    });
  }

  async verify(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    signature: ArrayBuffer,
    data: string | ArrayBuffer
  ): Promise<boolean> {
    await this.ensureInitialized();

    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return this.performOperation('verify', {
      algorithm,
      key,
      signature,
      data: dataBuffer,
    });
  }

  async hash(
    algorithm: AlgorithmIdentifier,
    data: string | ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.ensureInitialized();

    const dataBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    return this.performOperation('hash', {
      algorithm,
      data: dataBuffer,
    });
  }

  private async performOperation(type: CryptoOperation, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      this.pendingOperations.set(id, { resolve, reject });

      const message: CryptoWorkerMessage = { id, type, data };
      this.worker!.postMessage(message);

      // Set timeout for operation
      setTimeout(() => {
        if (this.pendingOperations.has(id)) {
          this.pendingOperations.delete(id);
          reject(new Error(`Crypto operation ${type} timed out`));
        }
      }, 30000); // 30 second timeout
    });
  }

  private handleWorkerMessage(event: MessageEvent<CryptoWorkerResponse>): void {
    const { id, success, result, error } = event.data;

    const pending = this.pendingOperations.get(id);
    if (!pending) return;

    this.pendingOperations.delete(id);

    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error || 'Crypto operation failed'));
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error('Crypto worker error:', error);
    
    // Reject all pending operations
    for (const [id, { reject }] of this.pendingOperations) {
      reject(new Error('Crypto worker crashed'));
    }
    
    this.pendingOperations.clear();
    
    // Attempt to restart the worker
    this.isInitialized = false;
    this.worker = null;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.pendingOperations.clear();
    }
  }

  // Utility methods for common operations

  async encryptString(plaintext: string, password: string): Promise<{
    ciphertext: string;
    salt: string;
    iv: string;
  }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key from password
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const { ciphertext } = await this.encrypt(
      plaintext,
      key,
      { name: 'AES-GCM', iv, tagLength: 128 },
      iv
    );

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      salt: this.arrayBufferToBase64(salt),
      iv: this.arrayBufferToBase64(iv),
    };
  }

  async decryptString(
    ciphertext: string,
    password: string,
    salt: string,
    iv: string
  ): Promise<string> {
    const saltBuffer = this.base64ToArrayBuffer(salt);
    const ivBuffer = this.base64ToArrayBuffer(iv);
    const ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);

    // Derive key from password
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const decrypted = await this.decrypt(
      ciphertextBuffer,
      key,
      { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
      ivBuffer
    );

    return new TextDecoder().decode(decrypted);
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
}

export const cryptoWorkerService = new CryptoWorkerService();