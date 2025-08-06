export interface OAuthProvider {
  id: string;
  name: string;
  type: 'oauth2' | 'oidc';
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  clientId: string;
  scopes: string[];
  icon?: string;
  color?: string;
}

export interface OAuthConfig {
  providers: OAuthProvider[];
  redirectUri: string;
  responseType: 'code' | 'token';
  grantType: 'authorization_code' | 'implicit' | 'client_credentials';
  pkce: boolean;
  state: boolean;
  nonce: boolean;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface OIDCTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  acr?: string;
  amr?: string[];
  azp?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface OAuthState {
  provider: string;
  codeVerifier?: string;
  state: string;
  nonce?: string;
  returnUrl?: string;
  timestamp: number;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256' | 'plain';
}

export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  nickname?: string;
  preferred_username?: string;
  profile?: string;
  picture?: string;
  website?: string;
  email?: string;
  email_verified?: boolean;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  address?: {
    formatted?: string;
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  updated_at?: number;
}

export interface JWK {
  kty: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
  x5u?: string;
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  x?: string;
  y?: string;
  crv?: string;
  k?: string;
}

export interface JWKS {
  keys: JWK[];
}

export interface OAuthSession {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  scopes: string[];
  userInfo?: UserInfo;
}

export interface TokenValidationResult {
  valid: boolean;
  claims?: OIDCTokenClaims;
  error?: string;
}

export interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  prompt?: 'none' | 'login' | 'consent' | 'select_account';
  max_age?: number;
  ui_locales?: string;
  id_token_hint?: string;
  login_hint?: string;
  acr_values?: string;
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
  username?: string;
  password?: string;
}