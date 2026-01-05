/**
 * SSO Authentication Routes
 * Handles SAML 2.0 and OIDC authentication flows
 *
 * Note: This is a foundational implementation. Full SAML/OIDC flows would require
 * additional configuration and testing with real identity providers.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SAML } from '@node-saml/node-saml';
import { ssoService } from '../services/sso/index.js';
import { pool } from '../config/database.js';
import { tenantService } from '../services/tenant.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { SAMLConfig, OIDCConfig, SSOProvider } from '../services/sso/types.js';

export default async function ssoRoutes(fastify: FastifyInstance) {
  /**
   * Initiate SSO login
   * GET /v1/sso/login/:tenantSlug/:providerId?
   */
  fastify.get<{
    Params: { tenantSlug: string; providerId?: string };
    Querystring: { relayState?: string };
  }>('/login/:tenantSlug/:providerId?', async (request, reply) => {
    const { tenantSlug, providerId } = request.params;
    const { relayState } = request.query;

    // Get SSO provider
    const provider = providerId
      ? await ssoService.getProviderById(tenantSlug, providerId)
      : await ssoService.getDefaultProvider(tenantSlug);

    if (!provider || !provider.enabled) {
      throw new NotFoundError('SSO Provider', providerId || 'default');
    }

    // Route to appropriate authentication flow
    if (provider.providerType === 'saml') {
      return handleSAMLLogin(request, reply, tenantSlug, provider, relayState);
    } else {
      return handleOIDCLogin(request, reply, tenantSlug, provider, relayState);
    }
  });

  /**
   * SSO callback handler for SAML (POST)
   */
  fastify.post<{
    Params: { tenantSlug: string; providerId: string };
    Body: { SAMLResponse: string; RelayState?: string };
  }>('/callback/:tenantSlug/:providerId', async (request, reply) => {
    const { tenantSlug, providerId } = request.params;
    const { SAMLResponse, RelayState } = request.body;

    const provider = await ssoService.getProviderById(tenantSlug, providerId);
    if (!provider || !provider.enabled) {
      throw new NotFoundError('SSO Provider', providerId);
    }

    if (provider.providerType === 'saml') {
      return handleSAMLCallback(request, reply, tenantSlug, provider, SAMLResponse, RelayState);
    } else {
      throw new BadRequestError('Use GET for OIDC callback');
    }
  });

  /**
   * SSO callback handler for OIDC (GET)
   */
  fastify.get<{
    Params: { tenantSlug: string; providerId: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>('/callback/:tenantSlug/:providerId', async (request, reply) => {
    const { tenantSlug, providerId } = request.params;
    const { code, state, error } = request.query;

    if (error) {
      throw new UnauthorizedError(`SSO authentication failed: ${error}`);
    }

    const provider = await ssoService.getProviderById(tenantSlug, providerId);
    if (!provider || !provider.enabled) {
      throw new NotFoundError('SSO Provider', providerId);
    }

    if (provider.providerType === 'oidc') {
      return handleOIDCCallback(request, reply, tenantSlug, provider, code, state);
    } else {
      throw new BadRequestError('Use POST for SAML callback');
    }
  });

  /**
   * Initiate SSO logout
   * GET /v1/sso/logout/:tenantSlug/:sessionId
   */
  fastify.get<{
    Params: { tenantSlug: string; sessionId: string };
  }>('/logout/:tenantSlug/:sessionId', async (request, reply) => {
    const { tenantSlug, sessionId } = request.params;

    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    // Get session info
    const sessionResult = await pool.query(
      `SELECT * FROM ${schemaName}.sso_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new NotFoundError('SSO Session', sessionId);
    }

    const session = sessionResult.rows[0];

    // Get provider
    const provider = await ssoService.getProviderById(tenantSlug, session.provider_id);
    if (!provider) {
      throw new NotFoundError('SSO Provider', session.provider_id);
    }

    // Delete session
    await pool.query(
      `DELETE FROM ${schemaName}.sso_sessions WHERE id = $1`,
      [sessionId]
    );

    logger.info({ sessionId, userId: session.user_id }, 'SSO session logged out');

    // If provider supports SLO, redirect to IdP logout
    if (provider.providerType === 'saml') {
      const samlConfig = provider.configuration as SAMLConfig;
      if (samlConfig.logoutUrl) {
        return reply.redirect(samlConfig.logoutUrl);
      }
    }

    // Otherwise, just return success
    return { success: true, message: 'Logged out successfully' };
  });

  /**
   * Get SSO metadata (for SAML)
   * GET /v1/sso/metadata/:tenantSlug/:providerId
   */
  fastify.get<{
    Params: { tenantSlug: string; providerId: string };
  }>('/metadata/:tenantSlug/:providerId', async (request, reply) => {
    const { tenantSlug, providerId } = request.params;

    const provider = await ssoService.getProviderById(tenantSlug, providerId);
    if (!provider || provider.providerType !== 'saml') {
      throw new NotFoundError('SAML Provider', providerId);
    }

    const samlConfig = provider.configuration as SAMLConfig;

    // Generate SAML metadata XML
    const metadata = generateSAMLMetadata(samlConfig, tenantSlug, providerId);

    reply.type('application/xml');
    return metadata;
  });
}

/**
 * Handle SAML login initiation
 * Note: Full implementation would use @node-saml/node-saml to generate AuthnRequest
 */
async function handleSAMLLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantSlug: string,
  provider: SSOProvider,
  relayState?: string
): Promise<void> {
  const samlConfig = provider.configuration as SAMLConfig;

  // For now, redirect directly to IdP entryPoint
  // Full implementation would generate a proper SAML AuthnRequest
  logger.info({ providerId: provider.id, tenantSlug }, 'Initiating SAML login');

  const params = new URLSearchParams();
  if (relayState) {
    params.append('RelayState', relayState);
  }

  const redirectUrl = samlConfig.entryPoint + (params.toString() ? `?${params.toString()}` : '');
  return reply.redirect(redirectUrl);
}

/**
 * Handle SAML callback
 * Validates SAML response and creates/updates user session
 */
async function handleSAMLCallback(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantSlug: string,
  provider: SSOProvider,
  samlResponse: string,
  relayState?: string
): Promise<any> {
  const samlConfig = provider.configuration as SAMLConfig;

  try {
    // Initialize SAML service provider
    const saml = new SAML({
      callbackUrl: samlConfig.callbackUrl,
      entryPoint: samlConfig.entryPoint,
      issuer: samlConfig.issuer,
      // @ts-ignore - cert is valid but type definitions incomplete
      cert: samlConfig.cert,
      acceptedClockSkewMs: 60000, // 1 minute clock skew tolerance
      wantAssertionsSigned: samlConfig.wantAssertionsSigned ?? true,
      // @ts-ignore - wantAuthnResponseSigned is valid but type definitions incomplete
      wantAuthnResponseSigned: samlConfig.wantAuthnResponseSigned ?? true,
    });

    // Validate SAML response
    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    if (!profile) {
      throw new UnauthorizedError('Invalid SAML response: no profile found');
    }

    logger.info({
      providerId: provider.id,
      tenantSlug,
      nameId: profile.nameID,
      sessionIndex: profile.sessionIndex
    }, 'SAML response validated successfully');

    // Extract user attributes from SAML assertion
    const attributeMap = provider.attributeMappings || {};
    const email = profile.email || profile[attributeMap.email as string] || profile.nameID;
    const firstName = profile.firstName || profile[attributeMap.firstName as string] || '';
    const lastName = profile.lastName || profile[attributeMap.lastName as string] || '';
    const displayName = profile.displayName || profile[attributeMap.displayName as string] || `${firstName} ${lastName}`.trim();

    if (!email) {
      throw new UnauthorizedError('Email not found in SAML assertion');
    }

    // Get tenant schema
    const tenantResult = await pool.query(
      'SELECT id FROM public.tenants WHERE slug = $1',
      [tenantSlug]
    );

    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schema = `tenant_${tenantResult.rows[0].id.replace(/-/g, '_')}`;

    // Check if user exists
    let userResult = await pool.query(
      `SELECT * FROM ${schema}.users WHERE email = $1 LIMIT 1`,
      [email]
    );

    let userId: string;

    if (userResult.rows.length === 0 && provider.autoCreateUsers) {
      // JIT provision new user
      const insertResult = await pool.query(
        `INSERT INTO ${schema}.users (email, name, role, is_active, email_verified)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id`,
        [email, displayName || email, provider.defaultRole || 'requester', !provider.requireVerifiedEmail]
      );
      userId = insertResult.rows[0].id;

      logger.info({ userId, email, tenantSlug }, 'JIT provisioned new user from SAML');
    } else if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found and auto-provisioning is disabled');
    } else {
      userId = userResult.rows[0].id;
    }

    // Create SSO session
    await pool.query(
      `INSERT INTO ${schema}.sso_sessions (user_id, provider_id, session_index, name_id, login_time, last_activity)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, provider_id, session_index) DO UPDATE
       SET last_activity = NOW()`,
      [userId, provider.id, profile.sessionIndex, profile.nameID]
    );

    // Generate JWT token for application
    const token = await reply.jwtSign({
      userId,
      tenantSlug,
      roles: [userResult.rows[0]?.role || provider.defaultRole],
      // @ts-ignore - ssoProvider is custom payload field
      ssoProvider: provider.id
    } as any);

    // Set token in HTTP-only cookie
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60, // 15 minutes
    });

    logger.info({ userId, tenantSlug, providerId: provider.id }, 'SSO login successful');

    // Redirect to application (or RelayState if provided)
    const redirectUrl = relayState || `/${tenantSlug}/dashboard`;
    return reply.redirect(redirectUrl);

  } catch (error) {
    logger.error({
      err: error,
      providerId: provider.id,
      tenantSlug
    }, 'SAML validation failed');

    if (error instanceof UnauthorizedError || error instanceof BadRequestError) {
      throw error;
    }

    throw new UnauthorizedError('SAML authentication failed: Invalid response');
  }
}

/**
 * Handle OIDC login initiation
 */
async function handleOIDCLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantSlug: string,
  provider: SSOProvider,
  relayState?: string
): Promise<void> {
  const oidcConfig = provider.configuration as OIDCConfig;

  // Create authorization URL
  const params = new URLSearchParams({
    client_id: oidcConfig.clientID,
    redirect_uri: oidcConfig.callbackURL,
    scope: oidcConfig.scope,
    response_type: oidcConfig.responseType,
    ...(relayState && { state: relayState }),
  });

  const authUrl = `${oidcConfig.authorizationURL}?${params.toString()}`;

  logger.info({ providerId: provider.id, tenantSlug }, 'Initiating OIDC login');

  return reply.redirect(authUrl);
}

/**
 * Handle OIDC callback
 */
async function handleOIDCCallback(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantSlug: string,
  provider: SSOProvider,
  code?: string,
  state?: string
): Promise<any> {
  if (!code) {
    throw new BadRequestError('Authorization code not found');
  }

  const oidcConfig = provider.configuration as OIDCConfig;

  // Exchange code for tokens
  const tokenResponse = await fetch(oidcConfig.tokenURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oidcConfig.callbackURL,
      client_id: oidcConfig.clientID,
      client_secret: oidcConfig.clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    throw new UnauthorizedError('Token exchange failed');
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };

  // Get user info
  const userInfoResponse = await fetch(oidcConfig.userInfoURL, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new UnauthorizedError('Failed to fetch user info');
  }

  const userInfo = (await userInfoResponse.json()) as Record<string, any>;

  // Extract user attributes
  const userAttributes = ssoService.extractUserAttributes(
    userInfo,
    provider.attributeMappings
  );

  if (!userAttributes.email) {
    throw new UnauthorizedError('Email attribute not found in OIDC response');
  }

  // Find or create user
  const user = await findOrCreateUser(
    tenantSlug,
    { ...userAttributes, email: userAttributes.email },
    provider
  );

  // Create SSO session
  const session = await createSSOSession(
    tenantSlug,
    user.id,
    provider.id,
    { userInfo, tokenData }
  );

  logger.info({ userId: user.id, providerId: provider.id }, 'OIDC login successful');

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    session: {
      id: session.id,
      expiresAt: session.expires_at,
    },
  };
}

/**
 * Find or create user based on SSO attributes
 */
async function findOrCreateUser(
  tenantSlug: string,
  userAttributes: {
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string[];
    roles?: string[];
  },
  provider: SSOProvider
): Promise<any> {
  const tenant = await tenantService.findBySlug(tenantSlug);
  if (!tenant) {
    throw new NotFoundError('Tenant', tenantSlug);
  }

  const schemaName = `tenant_${tenant.slug}`;

  // Check if user exists
  const existingUser = await pool.query(
    `SELECT * FROM ${schemaName}.users WHERE email = $1`,
    [userAttributes.email]
  );

  if (existingUser.rows.length > 0) {
    const user = existingUser.rows[0];

    // Update user attributes if JIT provisioning enabled
    if (provider.jitProvisioning) {
      await pool.query(
        `UPDATE ${schemaName}.users
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             updated_at = NOW()
         WHERE id = $3`,
        [userAttributes.firstName, userAttributes.lastName, user.id]
      );
    }

    return user;
  }

  // Create new user if auto-create enabled
  if (!provider.autoCreateUsers) {
    throw new UnauthorizedError('User not found and auto-create is disabled');
  }

  // Create user
  const newUser = await pool.query(
    `INSERT INTO ${schemaName}.users (
      email, first_name, last_name, role, email_verified, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())
    RETURNING *`,
    [
      userAttributes.email,
      userAttributes.firstName,
      userAttributes.lastName,
      provider.defaultRole || 'requester',
    ]
  );

  logger.info(
    { userId: newUser.rows[0].id, email: userAttributes.email },
    'User auto-created via SSO'
  );

  return newUser.rows[0];
}

/**
 * Create SSO session
 */
async function createSSOSession(
  tenantSlug: string,
  userId: string,
  providerId: string,
  metadata: any
): Promise<any> {
  const tenant = await tenantService.findBySlug(tenantSlug);
  if (!tenant) {
    throw new NotFoundError('Tenant', tenantSlug);
  }

  const schemaName = `tenant_${tenant.slug}`;

  // Create session (expires in 24 hours by default)
  const session = await pool.query(
    `INSERT INTO ${schemaName}.sso_sessions (
      user_id, provider_id, session_index, name_id, idp_session_id,
      login_time, last_activity, expires_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW() + INTERVAL '24 hours', $6)
    RETURNING *`,
    [
      userId,
      providerId,
      metadata.sessionIndex || null,
      metadata.nameID || null,
      metadata.sessionId || null,
      JSON.stringify(metadata),
    ]
  );

  return session.rows[0];
}

/**
 * Generate SAML metadata XML
 */
function generateSAMLMetadata(
  config: SAMLConfig,
  tenantSlug: string,
  providerId: string
): string {
  const entityId = config.issuer;
  const acsUrl = config.callbackUrl;
  const sloUrl = config.logoutCallbackUrl || '';

  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="${entityId}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
                      AuthnRequestsSigned="true"
                      WantAssertionsSigned="true">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                 Location="${acsUrl}"
                                 index="1"
                                 isDefault="true"/>
    ${
      sloUrl
        ? `<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                                Location="${sloUrl}"/>`
        : ''
    }
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}
