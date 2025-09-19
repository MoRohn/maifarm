import { OAuthProvider } from '@/types/oauth';

export const microsoftProvider: OAuthProvider = {
  id: 'microsoft',
  name: 'Microsoft',
  type: 'oidc',
  authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
  clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
  scopes: [
    'openid',
    'profile',
    'email',
    'User.Read',
  ],
  icon: `<svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#F25022" d="M1 1h10v10H1z"/>
    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
    <path fill="#FFB900" d="M13 13h10v10H13z"/>
  </svg>`,
  color: '#0078d4',
};

export const configureMicrosoftProvider = (clientId: string): OAuthProvider => ({
  ...microsoftProvider,
  clientId,
});