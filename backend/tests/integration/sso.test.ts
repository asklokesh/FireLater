import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockSSOProvider {
  id: string;
  name: string;
  providerType: 'saml' | 'oidc';
  enabled: boolean;
  isDefault: boolean;
  configuration: Record<string, unknown>;
  attributeMappings: Record<string, string>;
  autoCreateUsers: boolean;
  jitProvisioning: boolean;
  defaultRole: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSSOSession {
  id: string;
  userId: string;
  providerId: string;
  sessionIndex?: string;
  nameId?: string;
  loginTime: Date;
  lastActivity: Date;
  expiresAt: Date;
}

const providers: MockSSOProvider[] = [];
const sessions: MockSSOSession[] = [];

function resetMockData() {
  providers.length = 0;
  sessions.length = 0;
}

describe('SSO Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // ============================================
    // SSO LOGIN ROUTES
    // ============================================

    // Initiate SSO login with default provider
    app.get<{ Params: { tenantSlug: string } }>('/v1/sso/login/:tenantSlug', async (request, reply) => {
      const { tenantSlug } = request.params;
      const query = request.query as { relayState?: string };

      const defaultProvider = providers.find(p => p.isDefault && p.enabled);
      if (!defaultProvider) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No default SSO provider found',
        });
      }

      if (defaultProvider.providerType === 'saml') {
        const config = defaultProvider.configuration as { entryPoint: string };
        const redirectUrl = config.entryPoint + (query.relayState ? `?RelayState=${encodeURIComponent(query.relayState)}` : '');
        return reply.redirect(redirectUrl);
      } else {
        const config = defaultProvider.configuration as { authorizationURL: string; clientID: string; callbackURL: string; scope: string };
        const params = new URLSearchParams({
          client_id: config.clientID,
          redirect_uri: config.callbackURL,
          scope: config.scope,
          response_type: 'code',
          ...(query.relayState && { state: query.relayState }),
        });
        return reply.redirect(`${config.authorizationURL}?${params.toString()}`);
      }
    });

    // Initiate SSO login with specific provider
    app.get<{ Params: { tenantSlug: string; providerId: string } }>('/v1/sso/login/:tenantSlug/:providerId', async (request, reply) => {
      const { tenantSlug, providerId } = request.params;
      const query = request.query as { relayState?: string };

      const provider = providers.find(p => p.id === providerId && p.enabled);
      if (!provider) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SSO Provider '${providerId}' not found`,
        });
      }

      if (provider.providerType === 'saml') {
        const config = provider.configuration as { entryPoint: string };
        const redirectUrl = config.entryPoint + (query.relayState ? `?RelayState=${encodeURIComponent(query.relayState)}` : '');
        return reply.redirect(redirectUrl);
      } else {
        const config = provider.configuration as { authorizationURL: string; clientID: string; callbackURL: string; scope: string };
        const params = new URLSearchParams({
          client_id: config.clientID,
          redirect_uri: config.callbackURL,
          scope: config.scope,
          response_type: 'code',
          ...(query.relayState && { state: query.relayState }),
        });
        return reply.redirect(`${config.authorizationURL}?${params.toString()}`);
      }
    });

    // ============================================
    // SSO CALLBACK ROUTES
    // ============================================

    // SAML callback (POST)
    app.post<{ Params: { tenantSlug: string; providerId: string } }>('/v1/sso/callback/:tenantSlug/:providerId', async (request, reply) => {
      const { tenantSlug, providerId } = request.params;
      const body = request.body as { SAMLResponse?: string; RelayState?: string };

      const provider = providers.find(p => p.id === providerId && p.enabled);
      if (!provider) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SSO Provider '${providerId}' not found`,
        });
      }

      if (provider.providerType !== 'saml') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Use GET for OIDC callback',
        });
      }

      if (!body.SAMLResponse) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'SAMLResponse is required',
        });
      }

      // Simulate successful SAML validation
      const session: MockSSOSession = {
        id: `sess-${Date.now()}`,
        userId: 'user-sso-123',
        providerId,
        sessionIndex: `_${Date.now()}`,
        nameId: 'user@example.com',
        loginTime: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      sessions.push(session);

      // Redirect to relay state or dashboard
      const redirectUrl = body.RelayState || `/${tenantSlug}/dashboard`;
      return reply.redirect(redirectUrl);
    });

    // OIDC callback (GET)
    app.get<{ Params: { tenantSlug: string; providerId: string } }>('/v1/sso/callback/:tenantSlug/:providerId', async (request, reply) => {
      const { tenantSlug, providerId } = request.params;
      const query = request.query as { code?: string; state?: string; error?: string };

      if (query.error) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: `SSO authentication failed: ${query.error}`,
        });
      }

      const provider = providers.find(p => p.id === providerId && p.enabled);
      if (!provider) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SSO Provider '${providerId}' not found`,
        });
      }

      if (provider.providerType !== 'oidc') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Use POST for SAML callback',
        });
      }

      if (!query.code) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Authorization code not found',
        });
      }

      // Simulate successful OIDC token exchange
      const session: MockSSOSession = {
        id: `sess-${Date.now()}`,
        userId: 'user-oidc-456',
        providerId,
        loginTime: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      sessions.push(session);

      return reply.send({
        success: true,
        user: {
          id: session.userId,
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      });
    });

    // ============================================
    // SSO LOGOUT
    // ============================================

    app.get<{ Params: { tenantSlug: string; sessionId: string } }>('/v1/sso/logout/:tenantSlug/:sessionId', async (request, reply) => {
      const { tenantSlug, sessionId } = request.params;

      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SSO Session '${sessionId}' not found`,
        });
      }

      const session = sessions[sessionIndex];
      const provider = providers.find(p => p.id === session.providerId);

      // Remove session
      sessions.splice(sessionIndex, 1);

      // If provider has logout URL, redirect
      if (provider?.providerType === 'saml') {
        const config = provider.configuration as { logoutUrl?: string };
        if (config.logoutUrl) {
          return reply.redirect(config.logoutUrl);
        }
      }

      return reply.send({ success: true, message: 'Logged out successfully' });
    });

    // ============================================
    // SSO METADATA
    // ============================================

    app.get<{ Params: { tenantSlug: string; providerId: string } }>('/v1/sso/metadata/:tenantSlug/:providerId', async (request, reply) => {
      const { tenantSlug, providerId } = request.params;

      const provider = providers.find(p => p.id === providerId);
      if (!provider || provider.providerType !== 'saml') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SAML Provider '${providerId}' not found`,
        });
      }

      const config = provider.configuration as { issuer: string; callbackUrl: string; logoutCallbackUrl?: string };
      const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${config.issuer}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                 Location="${config.callbackUrl}"
                                 index="1"
                                 isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

      reply.type('application/xml');
      return metadata;
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // SSO LOGIN TESTS
  // ============================================

  describe('GET /v1/sso/login/:tenantSlug', () => {
    it('should redirect to default SAML provider', async () => {
      providers.push({
        id: 'saml-default',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: {
          entryPoint: 'https://idp.example.com/sso/saml',
          issuer: 'https://app.example.com',
          callbackUrl: 'https://app.example.com/sso/callback',
        },
        attributeMappings: { email: 'nameID' },
        autoCreateUsers: true,
        jitProvisioning: true,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('https://idp.example.com/sso/saml');
    });

    it('should redirect to default OIDC provider', async () => {
      providers.push({
        id: 'oidc-default',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: {
          authorizationURL: 'https://login.microsoft.com/authorize',
          tokenURL: 'https://login.microsoft.com/token',
          userInfoURL: 'https://graph.microsoft.com/oidc/userinfo',
          clientID: 'client-123',
          clientSecret: 'secret-456',
          callbackURL: 'https://app.example.com/sso/callback',
          scope: 'openid profile email',
        },
        attributeMappings: { email: 'email' },
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('https://login.microsoft.com/authorize');
      expect(response.headers.location).toContain('client_id=client-123');
    });

    it('should return 404 when no default provider exists', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('No default SSO provider');
    });

    it('should include relayState in redirect', async () => {
      providers.push({
        id: 'saml-relay',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: {
          entryPoint: 'https://idp.example.com/sso/saml',
          issuer: 'https://app.example.com',
          callbackUrl: 'https://app.example.com/sso/callback',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant?relayState=/dashboard/settings',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('RelayState');
      expect(response.headers.location).toContain(encodeURIComponent('/dashboard/settings'));
    });
  });

  describe('GET /v1/sso/login/:tenantSlug/:providerId', () => {
    it('should redirect to specific provider', async () => {
      providers.push({
        id: 'provider-specific',
        name: 'Google',
        providerType: 'oidc',
        enabled: true,
        isDefault: false,
        configuration: {
          authorizationURL: 'https://accounts.google.com/o/oauth2/auth',
          tokenURL: 'https://oauth2.googleapis.com/token',
          userInfoURL: 'https://openidconnect.googleapis.com/v1/userinfo',
          clientID: 'google-client-id',
          clientSecret: 'google-secret',
          callbackURL: 'https://app.example.com/sso/callback',
          scope: 'openid email profile',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant/provider-specific',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('https://accounts.google.com');
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for disabled provider', async () => {
      providers.push({
        id: 'disabled-provider',
        name: 'Disabled',
        providerType: 'saml',
        enabled: false,
        isDefault: false,
        configuration: { entryPoint: 'https://disabled.example.com' },
        attributeMappings: {},
        autoCreateUsers: false,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/login/test-tenant/disabled-provider',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // SSO CALLBACK TESTS
  // ============================================

  describe('POST /v1/sso/callback/:tenantSlug/:providerId (SAML)', () => {
    it('should process SAML callback and create session', async () => {
      providers.push({
        id: 'saml-callback-test',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: {
          entryPoint: 'https://idp.example.com/sso/saml',
          issuer: 'https://app.example.com',
          callbackUrl: 'https://app.example.com/sso/callback',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/sso/callback/test-tenant/saml-callback-test',
        payload: {
          SAMLResponse: 'base64encodedresponse',
          RelayState: '/dashboard',
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/dashboard');
      expect(sessions).toHaveLength(1);
    });

    it('should return 400 when SAMLResponse is missing', async () => {
      providers.push({
        id: 'saml-missing',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: { entryPoint: 'https://idp.example.com' },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/sso/callback/test-tenant/saml-missing',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('SAMLResponse is required');
    });

    it('should return 400 when using POST for OIDC provider', async () => {
      providers.push({
        id: 'oidc-wrong-method',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: false,
        configuration: { authorizationURL: 'https://login.microsoft.com' },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/sso/callback/test-tenant/oidc-wrong-method',
        payload: { SAMLResponse: 'test' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Use GET for OIDC callback');
    });
  });

  describe('GET /v1/sso/callback/:tenantSlug/:providerId (OIDC)', () => {
    it('should process OIDC callback and return user info', async () => {
      providers.push({
        id: 'oidc-callback-test',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: {
          authorizationURL: 'https://login.microsoft.com/authorize',
          tokenURL: 'https://login.microsoft.com/token',
          userInfoURL: 'https://graph.microsoft.com/userinfo',
          clientID: 'client-id',
          clientSecret: 'client-secret',
          callbackURL: 'https://app.example.com/callback',
          scope: 'openid email',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/callback/test-tenant/oidc-callback-test?code=auth-code-123&state=state-456',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user).toBeDefined();
      expect(body.session).toBeDefined();
      expect(sessions).toHaveLength(1);
    });

    it('should return 401 when error parameter is present', async () => {
      providers.push({
        id: 'oidc-error-test',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: { authorizationURL: 'https://login.microsoft.com' },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/callback/test-tenant/oidc-error-test?error=access_denied',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('access_denied');
    });

    it('should return 400 when code is missing', async () => {
      providers.push({
        id: 'oidc-no-code',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: { authorizationURL: 'https://login.microsoft.com' },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/callback/test-tenant/oidc-no-code?state=some-state',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Authorization code not found');
    });

    it('should return 400 when using GET for SAML provider', async () => {
      providers.push({
        id: 'saml-wrong-method',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: false,
        configuration: { entryPoint: 'https://idp.example.com' },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/callback/test-tenant/saml-wrong-method?code=test',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Use POST for SAML callback');
    });
  });

  // ============================================
  // SSO LOGOUT TESTS
  // ============================================

  describe('GET /v1/sso/logout/:tenantSlug/:sessionId', () => {
    it('should logout and return success', async () => {
      providers.push({
        id: 'logout-provider',
        name: 'Okta',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: {},
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      sessions.push({
        id: 'session-to-logout',
        userId: 'user-123',
        providerId: 'logout-provider',
        loginTime: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/logout/test-tenant/session-to-logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(sessions.find(s => s.id === 'session-to-logout')).toBeUndefined();
    });

    it('should redirect to IdP logout URL for SAML with SLO', async () => {
      providers.push({
        id: 'slo-provider',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: {
          entryPoint: 'https://idp.example.com/sso',
          logoutUrl: 'https://idp.example.com/slo',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      sessions.push({
        id: 'slo-session',
        userId: 'user-456',
        providerId: 'slo-provider',
        loginTime: new Date(),
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/logout/test-tenant/slo-session',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://idp.example.com/slo');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/logout/test-tenant/non-existent-session',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ============================================
  // SSO METADATA TESTS
  // ============================================

  describe('GET /v1/sso/metadata/:tenantSlug/:providerId', () => {
    it('should return SAML metadata XML', async () => {
      providers.push({
        id: 'metadata-provider',
        name: 'Okta',
        providerType: 'saml',
        enabled: true,
        isDefault: true,
        configuration: {
          entryPoint: 'https://idp.example.com/sso',
          issuer: 'https://app.example.com/saml',
          callbackUrl: 'https://app.example.com/sso/callback',
          logoutCallbackUrl: 'https://app.example.com/sso/logout',
        },
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/metadata/test-tenant/metadata-provider',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.body).toContain('EntityDescriptor');
      expect(response.body).toContain('https://app.example.com/saml');
      expect(response.body).toContain('AssertionConsumerService');
    });

    it('should return 404 for OIDC provider', async () => {
      providers.push({
        id: 'oidc-no-metadata',
        name: 'Azure AD',
        providerType: 'oidc',
        enabled: true,
        isDefault: true,
        configuration: {},
        attributeMappings: {},
        autoCreateUsers: true,
        jitProvisioning: false,
        defaultRole: 'requester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/metadata/test-tenant/oidc-no-metadata',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sso/metadata/test-tenant/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
