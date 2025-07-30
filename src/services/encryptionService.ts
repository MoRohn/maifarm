import { EncryptedData } from '../types/auth';

class EncryptionService {
  private algorithm = 'AES-GCM';
  private keyLength = 256;
  private saltLength = 16;
  private ivLength = 12;
  private tagLength = 128;

  /**
   * Generates a cryptographic key from a password
   */
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: this.algorithm, length: this.keyLength },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts data using AES-GCM
   */
  async encrypt(data: string, password?: string): Promise<string> {
    try {
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
      
      // Use provided password or generate from environment
      const key = await this.deriveKey(password || this.getEncryptionKey(), salt);
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv,
          tagLength: this.tagLength,
        },
        key,
        enc.encode(data)
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts data encrypted with encrypt()
   */
  async decrypt(encryptedData: string, password?: string): Promise<string> {
    try {
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const data = combined.slice(this.saltLength + this.ivLength);

      const key = await this.deriveKey(password || this.getEncryptionKey(), salt);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv,
          tagLength: this.tagLength,
        },
        key,
        data
      );

      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypts data with structured output
   */
  async encryptWithMetadata(data: string, password?: string): Promise<EncryptedData> {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    
    const key = await this.deriveKey(password || this.getEncryptionKey(), salt);
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv,
        tagLength: this.tagLength,
      },
      key,
      enc.encode(data)
    );

    return {
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      salt: btoa(String.fromCharCode(...salt)),
      algorithm: this.algorithm,
    };
  }

  /**
   * Decrypts data with structured metadata
   */
  async decryptWithMetadata(encryptedData: EncryptedData, password?: string): Promise<string> {
    const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
    const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));

    const key = await this.deriveKey(password || this.getEncryptionKey(), salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: encryptedData.algorithm,
        iv,
        tagLength: this.tagLength,
      },
      key,
      data
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  }

  /**
   * Generates a secure random key
   */
  generateKey(): string {
    const key = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...key));
  }

  /**
   * Hashes data using SHA-256
   */
  async hash(data: string): Promise<string> {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  /**
   * Compares a plain text value with a hash
   */
  async verify(data: string, hash: string): Promise<boolean> {
    const dataHash = await this.hash(data);
    return dataHash === hash;
  }

  /**
   * Gets the encryption key from environment or generates one
   */
  private getEncryptionKey(): string {
    // In production, this should come from a secure environment variable
    let key = localStorage.getItem('maifarm_encryption_key');
    if (!key) {
      key = this.generateKey();
      localStorage.setItem('maifarm_encryption_key', key);
    }
    return key;
  }

  /**
   * Encrypts WebSocket messages
   */
  async encryptMessage(message: any): Promise<string> {
    const jsonStr = JSON.stringify(message);
    return this.encrypt(jsonStr);
  }

  /**
   * Decrypts WebSocket messages
   */
  async decryptMessage(encryptedMessage: string): Promise<any> {
    const jsonStr = await this.decrypt(encryptedMessage);
    return JSON.parse(jsonStr);
  }

  /**
   * Secure key exchange for end-to-end encryption
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey']
    );

    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
      privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey))),
    };
  }
}

export const encryptionService = new EncryptionService();