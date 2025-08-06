import { CryptoWorkerMessage, CryptoWorkerResponse } from '../types/encryption';

self.addEventListener('message', async (event: MessageEvent<CryptoWorkerMessage>) => {
  const { id, type, data } = event.data;
  
  try {
    let result: any;
    
    switch (type) {
      case 'encrypt':
        result = await handleEncrypt(data);
        break;
        
      case 'decrypt':
        result = await handleDecrypt(data);
        break;
        
      case 'generateKey':
        result = await handleGenerateKey(data);
        break;
        
      case 'deriveKey':
        result = await handleDeriveKey(data);
        break;
        
      case 'sign':
        result = await handleSign(data);
        break;
        
      case 'verify':
        result = await handleVerify(data);
        break;
        
      case 'hash':
        result = await handleHash(data);
        break;
        
      default:
        throw new Error(`Unknown operation: ${type}`);
    }
    
    const response: CryptoWorkerResponse = {
      id,
      success: true,
      result,
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: CryptoWorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    self.postMessage(response);
  }
});

async function handleEncrypt(data: {
  plaintext: ArrayBuffer;
  key: CryptoKey;
  algorithm: AlgorithmIdentifier;
  iv?: ArrayBuffer;
}): Promise<{ ciphertext: ArrayBuffer; iv: ArrayBuffer }> {
  const { plaintext, key, algorithm, iv: providedIv } = data;
  
  let iv = providedIv;
  if (!iv) {
    // Generate IV based on algorithm
    const algorithmName = typeof algorithm === 'string' ? algorithm : algorithm.name;
    const ivLength = algorithmName === 'AES-GCM' ? 12 : 16;
    iv = crypto.getRandomValues(new Uint8Array(ivLength));
  }
  
  const encryptAlgorithm = typeof algorithm === 'string' 
    ? { name: algorithm, iv } 
    : { ...algorithm, iv };
  
  const ciphertext = await crypto.subtle.encrypt(encryptAlgorithm, key, plaintext);
  
  return { ciphertext, iv };
}

async function handleDecrypt(data: {
  ciphertext: ArrayBuffer;
  key: CryptoKey;
  algorithm: AlgorithmIdentifier;
  iv: ArrayBuffer;
}): Promise<ArrayBuffer> {
  const { ciphertext, key, algorithm, iv } = data;
  
  const decryptAlgorithm = typeof algorithm === 'string' 
    ? { name: algorithm, iv } 
    : { ...algorithm, iv };
  
  return crypto.subtle.decrypt(decryptAlgorithm, key, ciphertext);
}

async function handleGenerateKey(data: {
  algorithm: AlgorithmIdentifier;
  extractable: boolean;
  keyUsages: KeyUsage[];
}): Promise<CryptoKey | CryptoKeyPair> {
  const { algorithm, extractable, keyUsages } = data;
  
  return crypto.subtle.generateKey(algorithm, extractable, keyUsages);
}

async function handleDeriveKey(data: {
  algorithm: AlgorithmIdentifier;
  baseKey: CryptoKey;
  derivedKeyAlgorithm: AlgorithmIdentifier;
  extractable: boolean;
  keyUsages: KeyUsage[];
}): Promise<CryptoKey> {
  const { algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages } = data;
  
  return crypto.subtle.deriveKey(
    algorithm,
    baseKey,
    derivedKeyAlgorithm,
    extractable,
    keyUsages
  );
}

async function handleSign(data: {
  algorithm: AlgorithmIdentifier;
  key: CryptoKey;
  data: ArrayBuffer;
}): Promise<ArrayBuffer> {
  const { algorithm, key, data: dataToSign } = data;
  
  return crypto.subtle.sign(algorithm, key, dataToSign);
}

async function handleVerify(data: {
  algorithm: AlgorithmIdentifier;
  key: CryptoKey;
  signature: ArrayBuffer;
  data: ArrayBuffer;
}): Promise<boolean> {
  const { algorithm, key, signature, data: dataToVerify } = data;
  
  return crypto.subtle.verify(algorithm, key, signature, dataToVerify);
}

async function handleHash(data: {
  algorithm: AlgorithmIdentifier;
  data: ArrayBuffer;
}): Promise<ArrayBuffer> {
  const { algorithm, data: dataToHash } = data;
  
  return crypto.subtle.digest(algorithm, dataToHash);
}

// Additional utility functions for the worker

function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function pbkdf2(
  password: ArrayBuffer,
  salt: ArrayBuffer,
  iterations: number,
  keyLength: number,
  hash: string = 'SHA-256'
): Promise<ArrayBuffer> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    password,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash,
    },
    passwordKey,
    keyLength * 8
  );
}

async function hkdf(
  ikm: ArrayBuffer,
  salt: ArrayBuffer,
  info: ArrayBuffer,
  keyLength: number,
  hash: string = 'SHA-256'
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      salt,
      info,
      hash,
    },
    key,
    keyLength * 8
  );
}

// Export for TypeScript
export {};