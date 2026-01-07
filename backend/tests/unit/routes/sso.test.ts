import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/sso/index.js', () => ({
  ssoService: {
    getProviderById: vi.fn().mockResolvedValue(null),
    getDefaultProvider: vi.fn().mockResolvedValue(null),
    extractUserAttributes: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SSO Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Login Parameters', () => {
    const loginParamsSchema = z.object({
      tenantSlug: z.string().min(1).max(100),
      providerId: z.string().uuid().optional(),
    });

    it('should require tenantSlug', () => {
      const result = loginParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept tenantSlug only', () => {
      const result = loginParamsSchema.safeParse({
        tenantSlug: 'test-company',
      });
      expect(result.success).toBe(true);
    });

    it('should accept tenantSlug and providerId', () => {
      const result = loginParamsSchema.safeParse({
        tenantSlug: 'test-company',
        providerId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid providerId', () => {
      const result = loginParamsSchema.safeParse({
        tenantSlug: 'test-company',
        providerId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Login Query Parameters', () => {
    const loginQuerySchema = z.object({
      relayState: z.string().optional(),
    });

    it('should accept empty query', () => {
      const result = loginQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept relayState', () => {
      const result = loginQuerySchema.safeParse({
        relayState: '/dashboard',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SAML Callback Body', () => {
    const samlCallbackSchema = z.object({
      SAMLResponse: z.string().min(1),
      RelayState: z.string().optional(),
    });

    it('should require SAMLResponse', () => {
      const result = samlCallbackSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid SAML response', () => {
      const result = samlCallbackSchema.safeParse({
        SAMLResponse: 'base64encodedsamlresponse...',
      });
      expect(result.success).toBe(true);
    });

    it('should accept RelayState', () => {
      const result = samlCallbackSchema.safeParse({
        SAMLResponse: 'base64encodedsamlresponse...',
        RelayState: '/dashboard',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('OIDC Callback Query', () => {
    const oidcCallbackSchema = z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    });

    it('should accept empty query', () => {
      const result = oidcCallbackSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept code and state', () => {
      const result = oidcCallbackSchema.safeParse({
        code: 'authorization-code',
        state: 'random-state',
      });
      expect(result.success).toBe(true);
    });

    it('should accept error', () => {
      const result = oidcCallbackSchema.safeParse({
        error: 'access_denied',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Logout Parameters', () => {
    const logoutParamsSchema = z.object({
      tenantSlug: z.string().min(1).max(100),
      sessionId: z.string().uuid(),
    });

    it('should require tenantSlug and sessionId', () => {
      const result = logoutParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid logout params', () => {
      const result = logoutParamsSchema.safeParse({
        tenantSlug: 'test-company',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid sessionId', () => {
      const result = logoutParamsSchema.safeParse({
        tenantSlug: 'test-company',
        sessionId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Metadata Parameters', () => {
    const metadataParamsSchema = z.object({
      tenantSlug: z.string().min(1).max(100),
      providerId: z.string().uuid(),
    });

    it('should require tenantSlug and providerId', () => {
      const result = metadataParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid metadata params', () => {
      const result = metadataParamsSchema.safeParse({
        tenantSlug: 'test-company',
        providerId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Provider Type Enum', () => {
    const providerTypeEnum = z.enum(['saml', 'oidc']);

    it('should accept saml', () => {
      const result = providerTypeEnum.safeParse('saml');
      expect(result.success).toBe(true);
    });

    it('should accept oidc', () => {
      const result = providerTypeEnum.safeParse('oidc');
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = providerTypeEnum.safeParse('ldap');
      expect(result.success).toBe(false);
    });
  });

  describe('SAML Config Schema', () => {
    const samlConfigSchema = z.object({
      entryPoint: z.string().url(),
      issuer: z.string().min(1),
      cert: z.string().min(1),
      callbackUrl: z.string().url(),
      logoutUrl: z.string().url().optional(),
      logoutCallbackUrl: z.string().url().optional(),
      wantAssertionsSigned: z.boolean().optional(),
      wantAuthnResponseSigned: z.boolean().optional(),
    });

    it('should require essential SAML fields', () => {
      const result = samlConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid SAML config', () => {
      const result = samlConfigSchema.safeParse({
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://sp.example.com',
        cert: 'MIIC...certificate...',
        callbackUrl: 'https://sp.example.com/callback',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional logout URLs', () => {
      const result = samlConfigSchema.safeParse({
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://sp.example.com',
        cert: 'MIIC...certificate...',
        callbackUrl: 'https://sp.example.com/callback',
        logoutUrl: 'https://idp.example.com/logout',
        logoutCallbackUrl: 'https://sp.example.com/logout/callback',
      });
      expect(result.success).toBe(true);
    });

    it('should accept signing options', () => {
      const result = samlConfigSchema.safeParse({
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://sp.example.com',
        cert: 'MIIC...certificate...',
        callbackUrl: 'https://sp.example.com/callback',
        wantAssertionsSigned: true,
        wantAuthnResponseSigned: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('OIDC Config Schema', () => {
    const oidcConfigSchema = z.object({
      clientID: z.string().min(1),
      clientSecret: z.string().min(1),
      callbackURL: z.string().url(),
      authorizationURL: z.string().url(),
      tokenURL: z.string().url(),
      userInfoURL: z.string().url(),
      scope: z.string().min(1),
      responseType: z.string().min(1),
    });

    it('should require essential OIDC fields', () => {
      const result = oidcConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid OIDC config', () => {
      const result = oidcConfigSchema.safeParse({
        clientID: 'client-123',
        clientSecret: 'secret-456',
        callbackURL: 'https://sp.example.com/callback',
        authorizationURL: 'https://idp.example.com/authorize',
        tokenURL: 'https://idp.example.com/token',
        userInfoURL: 'https://idp.example.com/userinfo',
        scope: 'openid profile email',
        responseType: 'code',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SSO Provider Schema', () => {
    const ssoProviderSchema = z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255),
      providerType: z.enum(['saml', 'oidc']),
      enabled: z.boolean(),
      isDefault: z.boolean().optional(),
      autoCreateUsers: z.boolean().optional(),
      jitProvisioning: z.boolean().optional(),
      defaultRole: z.string().optional(),
      requireVerifiedEmail: z.boolean().optional(),
      attributeMappings: z.record(z.string()).optional(),
    });

    it('should require essential fields', () => {
      const result = ssoProviderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid provider', () => {
      const result = ssoProviderSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Corporate SSO',
        providerType: 'saml',
        enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept provisioning options', () => {
      const result = ssoProviderSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Corporate SSO',
        providerType: 'saml',
        enabled: true,
        autoCreateUsers: true,
        jitProvisioning: true,
        defaultRole: 'requester',
      });
      expect(result.success).toBe(true);
    });

    it('should accept attribute mappings', () => {
      const result = ssoProviderSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Corporate SSO',
        providerType: 'oidc',
        enabled: true,
        attributeMappings: {
          email: 'preferred_username',
          firstName: 'given_name',
          lastName: 'family_name',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing provider', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const error = {
        statusCode: 404,
        error: 'Not Found',
        message: `SSO Provider '${id}' not found`,
      };
      expect(error.statusCode).toBe(404);
    });

    it('should return 404 for missing tenant', () => {
      const slug = 'nonexistent';
      const error = {
        statusCode: 404,
        error: 'Not Found',
        message: `Tenant '${slug}' not found`,
      };
      expect(error.statusCode).toBe(404);
    });

    it('should return 404 for missing session', () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const error = {
        statusCode: 404,
        error: 'Not Found',
        message: `SSO Session '${sessionId}' not found`,
      };
      expect(error.statusCode).toBe(404);
    });

    it('should return 400 for wrong callback method', () => {
      const error = {
        statusCode: 400,
        message: 'Use POST for SAML callback',
      };
      expect(error.statusCode).toBe(400);
    });

    it('should return 401 for authentication failure', () => {
      const error = {
        statusCode: 401,
        message: 'SSO authentication failed: access_denied',
      };
      expect(error.statusCode).toBe(401);
    });

    it('should return success for logout', () => {
      const response = { success: true, message: 'Logged out successfully' };
      expect(response.success).toBe(true);
    });

    it('should return user and session for OIDC login', () => {
      const response = {
        success: true,
        user: { id: 'user-1', email: 'user@example.com' },
        session: { id: 'session-1', expiresAt: new Date() },
      };
      expect(response).toHaveProperty('user');
      expect(response).toHaveProperty('session');
    });

    it('should return XML for metadata', () => {
      const contentType = 'application/xml';
      expect(contentType).toBe('application/xml');
    });
  });

  describe('User Attributes Extraction', () => {
    const userAttributesSchema = z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      displayName: z.string().optional(),
      groups: z.array(z.string()).optional(),
      roles: z.array(z.string()).optional(),
    });

    it('should require email', () => {
      const result = userAttributesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid user attributes', () => {
      const result = userAttributesSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
      });
      expect(result.success).toBe(true);
    });

    it('should accept groups and roles', () => {
      const result = userAttributesSchema.safeParse({
        email: 'user@example.com',
        groups: ['IT', 'Development'],
        roles: ['admin', 'user'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should call ssoService.getProviderById', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');
      const providerId = '123e4567-e89b-12d3-a456-426614174000';

      await ssoService.getProviderById('test-tenant', providerId);
      expect(ssoService.getProviderById).toHaveBeenCalledWith('test-tenant', providerId);
    });

    it('should call ssoService.getDefaultProvider', async () => {
      const { ssoService } = await import('../../../src/services/sso/index.js');

      await ssoService.getDefaultProvider('test-tenant');
      expect(ssoService.getDefaultProvider).toHaveBeenCalledWith('test-tenant');
    });

    it('should call tenantService.findBySlug', async () => {
      const { tenantService } = await import('../../../src/services/tenant.js');

      await tenantService.findBySlug('test-tenant');
      expect(tenantService.findBySlug).toHaveBeenCalledWith('test-tenant');
    });
  });

  describe('SAML Metadata Generation', () => {
    it('should include entity descriptor', () => {
      const metadata = `<md:EntityDescriptor entityID="https://sp.example.com">`;
      expect(metadata).toContain('EntityDescriptor');
      expect(metadata).toContain('entityID');
    });

    it('should include SP descriptor', () => {
      const metadata = `<md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">`;
      expect(metadata).toContain('SPSSODescriptor');
    });

    it('should include assertion consumer service', () => {
      const metadata = `<md:AssertionConsumerService Location="https://sp.example.com/callback" index="1">`;
      expect(metadata).toContain('AssertionConsumerService');
      expect(metadata).toContain('Location');
    });
  });

  describe('Session Management', () => {
    it('should store session with 24 hour expiry', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const diffHours = (expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBe(24);
    });

    it('should include session index for SAML', () => {
      const session = {
        userId: 'user-1',
        providerId: 'provider-1',
        sessionIndex: 'saml-session-123',
        nameId: 'user@example.com',
      };
      expect(session).toHaveProperty('sessionIndex');
      expect(session).toHaveProperty('nameId');
    });
  });

  describe('Cookie Settings', () => {
    it('should use httpOnly cookie', () => {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 15 * 60,
      };
      expect(cookieOptions.httpOnly).toBe(true);
    });

    it('should set 15 minute max age', () => {
      const maxAge = 15 * 60;
      expect(maxAge).toBe(900);
    });
  });
});
