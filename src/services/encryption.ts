import { EncryptedData, EncryptionConfig } from '../types/security';

class EncryptionService {
  private config: EncryptionConfig = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 16,
    saltLength: 32,
    iterations: 100000,
  };

  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();

  async generateKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.textEncoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.config.iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: this.config.keyLength },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data: string, password: string): Promise<EncryptedData> {
    const salt = crypto.getRandomValues(new Uint8Array(this.config.saltLength));
    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    const key = await this.generateKey(password, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      this.textEncoder.encode(data)
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    const tag = encryptedArray.slice(-16);
    const ciphertext = encryptedArray.slice(0, -16);

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
      salt: this.arrayBufferToBase64(salt),
      tag: this.arrayBufferToBase64(tag),
    };
  }

  async decrypt(encryptedData: EncryptedData, password: string): Promise<string> {
    const salt = this.base64ToArrayBuffer(encryptedData.salt);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
    const tag = this.base64ToArrayBuffer(encryptedData.tag);

    const key = await this.generateKey(password, salt);

    // Combine ciphertext and tag for AES-GCM
    const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
    combined.set(new Uint8Array(ciphertext), 0);
    combined.set(new Uint8Array(tag), ciphertext.byteLength);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      combined
    );

    return this.textDecoder.decode(decryptedBuffer);
  }

  async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordBuffer = this.textEncoder.encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashArray = new Uint8Array(derivedBits);
    const saltAndHash = new Uint8Array(salt.length + hashArray.length);
    saltAndHash.set(salt);
    saltAndHash.set(hashArray, salt.length);

    return this.arrayBufferToBase64(saltAndHash);
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const saltAndHash = this.base64ToArrayBuffer(storedHash);
    const salt = saltAndHash.slice(0, 16);
    const hash = saltAndHash.slice(16);

    const passwordBuffer = this.textEncoder.encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const derivedHash = new Uint8Array(derivedBits);
    
    return this.arrayEquals(derivedHash, new Uint8Array(hash));
  }

  generateRandomToken(length: number = 32): string {
    const array = crypto.getRandomValues(new Uint8Array(length));
    return this.arrayBufferToBase64(array);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
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

  private arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

export const encryptionService = new EncryptionService();