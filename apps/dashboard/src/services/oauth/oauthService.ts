import {
  OAuthProvider,
  OAuthConfig,
  OAuthTokenResponse,
  OAuthState,
  PKCEChallenge,
  OAuthError,
  AuthorizationRequest,
  TokenRequest,
  OAuthSession,
} from '@/types/oauth';
import { encryptionService } from '../encryptionService';

const OAUTH_STATE_KEY = 'maifarm_oauth_state';
const OAUTH_SESSION_KEY = 'maifarm_oauth_session';

export class OAuthService {
  private config: OAuthConfig;
  private providers: Map<string, OAuthProvider>;

  constructor(config: OAuthConfig) {
    this.config = config;
    this.providers = new Map(config.providers.map(p => [p.id, p]));
  }

  async initiateAuthorization(providerId: string): Promise<string> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown OAuth provider: ${providerId}`);
    }

    const state = this.generateState();
    const authRequest: AuthorizationRequest = {
      client_id: provider.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: this.config.responseType,
      scope: provider.scopes.join(' '),
      state: state.state,
    };

    if (this.config.nonce && provider.type === 'oidc') {
      state.nonce = this.generateNonce();
      authRequest.nonce = state.nonce;
    }

    if (this.config.pkce) {
      const pkce = await this.generatePKCEChallenge();
      state.codeVerifier = pkce.codeVerifier;
      authRequest.code_challenge = pkce.codeChallenge;
      authRequest.code_challenge_method = pkce.method;
    }

    this.storeState(state);

    const params = new URLSearchParams(authRequest as any);
    return `${provider.authorizationUrl}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    state: string,
    error?: OAuthError
  ): Promise<OAuthSession> {
    if (error) {
      throw new Error(`OAuth error: ${error.error} - ${error.error_description}`);
    }

    const storedState = this.getStoredState();
    if (!storedState || storedState.state !== state) {
      throw new Error('Invalid OAuth state');
    }

    if (Date.now() - storedState.timestamp > 600000) {
      throw new Error('OAuth state expired');
    }

    const provider = this.providers.get(storedState.provider);
    if (!provider) {
      throw new Error('Invalid OAuth provider');
    }

    const tokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: provider.clientId,
    };

    if (this.config.pkce && storedState.codeVerifier) {
      tokenRequest.code_verifier = storedState.codeVerifier;
    }

    const tokens = await this.exchangeCodeForTokens(provider, tokenRequest);
    const session = await this.createSession(provider, tokens, storedState);

    this.clearState();
    this.storeSession(session);

    return session;
  }

  async refreshAccessToken(providerId: string): Promise<OAuthSession> {
    const session = this.getStoredSession();
    if (!session || session.provider !== providerId) {
      throw new Error('No active session for provider');
    }

    if (!session.refreshToken) {
      throw new Error('No refresh token available');
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error('Invalid OAuth provider');
    }

    const tokenRequest: TokenRequest = {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: provider.clientId,
      scope: session.scopes.join(' '),
    };

    const tokens = await this.exchangeCodeForTokens(provider, tokenRequest);
    const newSession: OAuthSession = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };

    if (tokens.id_token) {
      newSession.idToken = tokens.id_token;
    }

    this.storeSession(newSession);
    return newSession;
  }

  async revokeToken(providerId: string, token: string, tokenType: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error('Invalid OAuth provider');
    }

    const revokeUrl = `${provider.tokenUrl}/revoke`;
    const response = await fetch(revokeUrl, {
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
      throw new Error('Failed to revoke token');
    }

    this.clearSession();
  }

  private async exchangeCodeForTokens(
    provider: OAuthProvider,
    tokenRequest: TokenRequest
  ): Promise<OAuthTokenResponse> {
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenRequest as any),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.error} - ${error.error_description}`);
    }

    return response.json();
  }

  private async createSession(
    provider: OAuthProvider,
    tokens: OAuthTokenResponse,
    state: OAuthState
  ): Promise<OAuthSession> {
    const session: OAuthSession = {
      provider: provider.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scopes: tokens.scope?.split(' ') || provider.scopes,
    };

    if (provider.type === 'oidc' && tokens.id_token) {
      const { oidcService } = await import('./oidcService');
      const validation = await oidcService.validateIdToken(
        tokens.id_token,
        provider,
        state.nonce
      );

      if (!validation.valid) {
        throw new Error(`ID token validation failed: ${validation.error}`);
      }
    }

    if (provider.userInfoUrl) {
      try {
        const userInfo = await this.fetchUserInfo(provider, tokens.access_token);
        session.userInfo = userInfo;
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    }

    return session;
  }

  private async fetchUserInfo(provider: OAuthProvider, accessToken: string): Promise<any> {
    const response = await fetch(provider.userInfoUrl!, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  private async generatePKCEChallenge(): Promise<PKCEChallenge> {
    const verifier = this.generateRandomString(128);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return {
      codeVerifier: verifier,
      codeChallenge: challenge,
      method: 'S256',
    };
  }

  private generateState(): OAuthState {
    return {
      provider: '',
      state: this.generateRandomString(32),
      timestamp: Date.now(),
    };
  }

  private generateNonce(): string {
    return this.generateRandomString(32);
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => chars[byte % chars.length]).join('');
  }

  // In-memory fallback for iOS Safari private browsing mode
  private inMemoryState: string | null = null;
  private inMemorySession: string | null = null;

  private storeState(state: OAuthState): void {
    const encrypted = encryptionService.encryptSync(JSON.stringify(state));
    try {
      sessionStorage.setItem(OAUTH_STATE_KEY, encrypted);
    } catch {
      // iOS Safari private browsing - fall back to in-memory
      this.inMemoryState = encrypted;
    }
  }

  private getStoredState(): OAuthState | null {
    let encrypted: string | null = null;
    try {
      encrypted = sessionStorage.getItem(OAUTH_STATE_KEY);
    } catch {
      // iOS Safari private browsing - use in-memory fallback
      encrypted = this.inMemoryState;
    }
    if (!encrypted) return null;

    try {
      const decrypted = encryptionService.decryptSync(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  private clearState(): void {
    try {
      sessionStorage.removeItem(OAUTH_STATE_KEY);
    } catch {
      // iOS Safari private browsing - clear in-memory
    }
    this.inMemoryState = null;
  }

  private storeSession(session: OAuthSession): void {
    const encrypted = encryptionService.encryptSync(JSON.stringify(session));
    try {
      localStorage.setItem(OAUTH_SESSION_KEY, encrypted);
    } catch {
      // iOS Safari private browsing - fall back to in-memory
      this.inMemorySession = encrypted;
    }
  }

  private getStoredSession(): OAuthSession | null {
    let encrypted: string | null = null;
    try {
      encrypted = localStorage.getItem(OAUTH_SESSION_KEY);
    } catch {
      // iOS Safari private browsing - use in-memory fallback
      encrypted = this.inMemorySession;
    }
    if (!encrypted) return null;

    try {
      const decrypted = encryptionService.decryptSync(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(OAUTH_SESSION_KEY);
    } catch {
      // iOS Safari private browsing - clear in-memory
    }
    this.inMemorySession = null;
  }

  getActiveSession(): OAuthSession | null {
    const session = this.getStoredSession();
    if (!session) return null;

    if (Date.now() >= session.expiresAt) {
      this.clearSession();
      return null;
    }

    return session;
  }

  isAuthenticated(): boolean {
    return this.getActiveSession() !== null;
  }

  getProviders(): OAuthProvider[] {
    return Array.from(this.providers.values());
  }
}

import { googleProvider } from './providers/google';
import { githubProvider } from './providers/github';
import { microsoftProvider } from './providers/microsoft';

const oauthConfig: OAuthConfig = {
  providers: [
    googleProvider,
    githubProvider,
    microsoftProvider,
  ].filter(p => p.clientId), // Only include providers with configured client IDs
  redirectUri: `${window.location.origin}/auth/callback`,
  responseType: 'code',
  grantType: 'authorization_code',
  pkce: true,
  state: true,
  nonce: true,
};

export const oauthService = new OAuthService(oauthConfig);