/**
 * SSO Service Types
 * Defines types for SSO authentication (SAML 2.0 and OIDC)
 */

export type ProviderType = 'saml' | 'oidc';

export type ProviderName = 'azure_ad' | 'okta' | 'google' | 'auth0' | 'generic';

export interface SSOProvider {
  id: string;
  name: string;
  providerType: ProviderType;
  providerName: ProviderName;
  enabled: boolean;
  isDefault: boolean;
  configuration: SAMLConfig | OIDCConfig;
  attributeMappings: AttributeMapping;
  jitProvisioning: boolean;
  autoCreateUsers: boolean;
  defaultRole: string;
  requireVerifiedEmail: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  cert: string;
  privateKey?: string;
  decryptionPvk?: string;
  signatureAlgorithm?: string;
  identifierFormat?: string;
  wantAssertionsSigned?: boolean;
  wantAuthnResponseSigned?: boolean;
  logoutUrl?: string;
  logoutCallbackUrl?: string;
}

export interface OIDCConfig {
  issuer: string;
  authorizationURL: string;
  tokenURL: string;
  userInfoURL: string;
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope: string;
  responseType: string;
  responseMode?: string;
}

export interface AttributeMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string;
  roles?: string;
  department?: string;
  phoneNumber?: string;
  jobTitle?: string;
}

export interface SSOSession {
  id: string;
  userId: string;
  providerId: string;
  sessionIndex?: string;
  nameId?: string;
  idpSessionId?: string;
  loginTime: Date;
  lastActivity: Date;
  expiresAt?: Date;
  logoutUrl?: string;
  metadata: Record<string, any>;
}

export interface SSOAuthResult {
  success: boolean;
  user?: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string[];
    roles?: string[];
  };
  sessionInfo?: {
    sessionIndex?: string;
    nameId?: string;
    attributes: Record<string, any>;
  };
  error?: string;
}

export interface SSOLoginRequest {
  tenantSlug: string;
  providerId?: string;
  relayState?: string;
}

export interface SSOCallbackRequest {
  tenantSlug: string;
  providerId: string;
  samlResponse?: string;
  code?: string;
  state?: string;
}
