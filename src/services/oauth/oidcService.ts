import {
  OAuthProvider,
  OIDCTokenClaims,
  TokenValidationResult,
  JWKS,
  JWK,
  UserInfo,
} from '../../types/oauth';

class OIDCService {
  private jwksCache: Map<string, { jwks: JWKS; fetchedAt: number }> = new Map();
  private readonly JWKS_CACHE_TTL = 3600000; // 1 hour

  async validateIdToken(
    idToken: string,
    provider: OAuthProvider,
    nonce?: string
  ): Promise<TokenValidationResult> {
    try {
      const [header, payload, signature] = idToken.split('.');
      
      if (!header || !payload || !signature) {
        return { valid: false, error: 'Invalid token format' };
      }

      const decodedHeader = JSON.parse(atob(header));
      const claims: OIDCTokenClaims = JSON.parse(atob(payload));

      // Basic validation
      const now = Math.floor(Date.now() / 1000);
      
      if (claims.exp <= now) {
        return { valid: false, error: 'Token expired' };
      }

      if (claims.iat > now + 60) {
        return { valid: false, error: 'Token issued in the future' };
      }

      if (claims.aud !== provider.clientId && !claims.aud.includes(provider.clientId)) {
        return { valid: false, error: 'Invalid audience' };
      }

      if (nonce && claims.nonce !== nonce) {
        return { valid: false, error: 'Invalid nonce' };
      }

      // Verify signature
      const jwks = await this.fetchJWKS(provider);
      const key = jwks.keys.find(k => k.kid === decodedHeader.kid);
      
      if (!key) {
        return { valid: false, error: 'Signing key not found' };
      }

      const isValidSignature = await this.verifySignature(
        `${header}.${payload}`,
        signature,
        key,
        decodedHeader.alg
      );

      if (!isValidSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true, claims };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Token validation failed' 
      };
    }
  }

  async fetchUserInfo(provider: OAuthProvider, accessToken: string): Promise<UserInfo> {
    if (!provider.userInfoUrl) {
      throw new Error('UserInfo endpoint not configured for provider');
    }

    const response = await fetch(provider.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`UserInfo request failed: ${response.status}`);
    }

    return response.json();
  }

  async introspectToken(
    provider: OAuthProvider,
    token: string,
    tokenType: 'access_token' | 'refresh_token' = 'access_token'
  ): Promise<any> {
    const introspectUrl = `${provider.tokenUrl}/introspect`;
    
    const response = await fetch(introspectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token,
        token_type_hint: tokenType,
        client_id: provider.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error('Token introspection failed');
    }

    return response.json();
  }

  private async fetchJWKS(provider: OAuthProvider): Promise<JWKS> {
    const cached = this.jwksCache.get(provider.id);
    
    if (cached && Date.now() - cached.fetchedAt < this.JWKS_CACHE_TTL) {
      return cached.jwks;
    }

    const jwksUrl = await this.getJWKSUrl(provider);
    const response = await fetch(jwksUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch JWKS');
    }

    const jwks: JWKS = await response.json();
    
    this.jwksCache.set(provider.id, {
      jwks,
      fetchedAt: Date.now(),
    });

    return jwks;
  }

  private async getJWKSUrl(provider: OAuthProvider): Promise<string> {
    // Try well-known configuration first
    const wellKnownUrl = `${provider.authorizationUrl.split('/oauth')[0]}/.well-known/openid-configuration`;
    
    try {
      const response = await fetch(wellKnownUrl);
      if (response.ok) {
        const config = await response.json();
        return config.jwks_uri;
      }
    } catch {
      // Fall back to common patterns
    }

    // Common JWKS URL patterns
    const baseUrl = provider.authorizationUrl.split('/oauth')[0];
    return `${baseUrl}/.well-known/jwks.json`;
  }

  private async verifySignature(
    message: string,
    signature: string,
    key: JWK,
    algorithm: string
  ): Promise<boolean> {
    try {
      // Import the JWK
      const cryptoKey = await this.importJWK(key, algorithm);
      
      // Decode signature from base64url
      const sig = this.base64UrlDecode(signature);
      
      // Verify the signature
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      
      return await crypto.subtle.verify(
        this.getAlgorithmParams(algorithm),
        cryptoKey,
        sig,
        data
      );
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  private async importJWK(jwk: JWK, algorithm: string): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      this.getAlgorithmParams(algorithm),
      false,
      ['verify']
    );
  }

  private getAlgorithmParams(algorithm: string): AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams {
    switch (algorithm) {
      case 'RS256':
        return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
      case 'RS384':
        return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' };
      case 'RS512':
        return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' };
      case 'ES256':
        return { name: 'ECDSA', namedCurve: 'P-256' };
      case 'ES384':
        return { name: 'ECDSA', namedCurve: 'P-384' };
      case 'ES512':
        return { name: 'ECDSA', namedCurve: 'P-521' };
      case 'PS256':
        return { name: 'RSA-PSS', hash: 'SHA-256' };
      case 'PS384':
        return { name: 'RSA-PSS', hash: 'SHA-384' };
      case 'PS512':
        return { name: 'RSA-PSS', hash: 'SHA-512' };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  private base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    return bytes;
  }

  decodeIdToken(idToken: string): OIDCTokenClaims {
    const [, payload] = idToken.split('.');
    return JSON.parse(atob(payload));
  }

  isTokenExpired(idToken: string): boolean {
    try {
      const claims = this.decodeIdToken(idToken);
      return Date.now() >= claims.exp * 1000;
    } catch {
      return true;
    }
  }

  getTokenExpiryTime(idToken: string): Date | null {
    try {
      const claims = this.decodeIdToken(idToken);
      return new Date(claims.exp * 1000);
    } catch {
      return null;
    }
  }
}

export const oidcService = new OIDCService();