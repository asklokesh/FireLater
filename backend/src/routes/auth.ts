import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { sessionService, type ClientContext } from '../services/sessions.js';
import { auditService, type AuditAction } from '../services/audit.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { validateDate, validateDateRange, validateLimit, validateOffset } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

// Security warning: log if secure cookies are disabled in production
const isSecureCookiesDisabled = process.env.NODE_ENV === 'production' && process.env.DISABLE_SECURE_COOKIES === 'true';
if (isSecureCookiesDisabled) {
  logger.warn({
    setting: 'DISABLE_SECURE_COOKIES',
    environment: process.env.NODE_ENV
  }, 'SECURITY WARNING: Secure cookies are disabled in production. This should only be used behind a trusted reverse proxy with TLS termination.');
}

// Centralized cookie options for security consistency
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && !isSecureCookiesDisabled,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
});

// Auth events recorded in the audit log (see GET /audit-log)
const AUTH_AUDIT_ACTIONS: AuditAction[] = [
  'token_issued',
  'token_refreshed',
  'token_revoked',
  'token_reuse_detected',
];

// Optional device binding: clients send a stable device fingerprint with login and refresh
const getClientContext = (request: FastifyRequest): ClientContext => {
  const fingerprint = request.headers['x-device-fingerprint'];
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint: Array.isArray(fingerprint) ? fingerprint[0] : fingerprint,
  };
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant: z.string().min(1).optional(), // Optional - can come from header
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // Optional - can come from cookie
  tenant: z.string().min(1).optional(), // Optional - can come from header
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const forgotPasswordSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

const verifyEmailSchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
});

const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(255),
  tenantSlug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).max(255),
  adminPassword: z.string().min(8),
});

const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
});

export default async function authRoutes(app: FastifyInstance) {
  // Register endpoint - handles both tenant creation and user registration
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantSlug = request.headers['x-tenant-slug'] as string | undefined;

    // If tenant slug in header, this is user registration in existing tenant
    if (tenantSlug) {
      const body = registerUserSchema.parse(request.body);
      const schema = tenantService.getSchemaName(tenantSlug);

      // Register user in tenant
      const { pool } = await import('../config/database.js');
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash(body.password, 10);

      // Check if user already exists
      const existingUser = await pool.query(
        `SELECT id FROM ${schema}.users WHERE email = $1`,
        [body.email]
      );

      if (existingUser.rows.length > 0) {
        throw new ConflictError('User with this email already exists');
      }

      // Create user
      const result = await pool.query(
        `INSERT INTO ${schema}.users (email, password_hash, name, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id, email, name, created_at`,
        [body.email, hashedPassword, body.name]
      );

      const user = result.rows[0];

      // Auto-login after registration
      const loginResult = await authService.login(
        {
          tenantSlug,
          email: body.email,
          password: body.password,
        },
        (payload) => app.jwt.sign(payload),
        getClientContext(request)
      );

      reply.status(201).send({
        ...loginResult,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } else {
      // No tenant slug - this is tenant registration
      const body = registerTenantSchema.parse(request.body);

      const tenant = await tenantService.create({
        name: body.tenantName,
        slug: body.tenantSlug,
        adminEmail: body.adminEmail,
        adminName: body.adminName,
        adminPassword: body.adminPassword,
      });

      // Auto-login after registration
      const loginResult = await authService.login(
        {
          tenantSlug: body.tenantSlug,
          email: body.adminEmail,
          password: body.adminPassword,
        },
        (payload) => app.jwt.sign(payload),
        getClientContext(request)
      );

      reply.status(201).send({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        ...loginResult,
      });
    }
  });

  // Login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);
    const tenantSlug = (request.headers['x-tenant-slug'] as string) || body.tenant;

    if (!tenantSlug) {
      throw new BadRequestError('Tenant is required (provide x-tenant-slug header or tenant in body)');
    }

    const result = await authService.login(
      {
        tenantSlug,
        email: body.email,
        password: body.password,
      },
      (payload) => app.jwt.sign(payload),
      getClientContext(request)
    );

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

    reply.send({
      accessToken: result.accessToken,
      user: result.user,
    });
  });

  // Logout
  app.post('/logout', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refreshToken;

    const { userId, tenantSlug, sid } = request.user;
    const context = getClientContext(request);

    if (refreshToken) {
      await authService.logout(refreshToken, tenantSlug, context);
    }
    // Also end the session of the access token being used (e.g. when the cookie is absent)
    if (sid) {
      await authService.revokeSession(tenantSlug, userId, sid, context, 'logout');
    }

    reply.clearCookie('refreshToken', { path: '/' });
    reply.send({ message: 'Logged out successfully' });
  });

  // Refresh token
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(request.body);
    const refreshToken = body.refreshToken || request.cookies.refreshToken;
    const tenantSlug = (request.headers['x-tenant-slug'] as string) || body.tenant;

    if (!refreshToken) {
      throw new BadRequestError('Refresh token is required');
    }

    if (!tenantSlug) {
      throw new BadRequestError('Tenant is required (provide x-tenant-slug header or tenant in body)');
    }

    const result = await authService.refresh(
      refreshToken,
      tenantSlug,
      (payload) => app.jwt.sign(payload),
      getClientContext(request)
    );

    reply.setCookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

    reply.send({
      accessToken: result.accessToken,
    });
  });

  // List the caller's active sessions
  app.get('/sessions', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, tenantSlug, sid } = request.user;
    const sessions = await sessionService.listForUser(tenantSlug, userId);

    reply.send({
      sessions: sessions.map((session) => ({ ...session, current: session.id === sid })),
    });
  });

  // Revoke all of the caller's sessions (sign out everywhere)
  app.delete('/sessions', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, tenantSlug } = request.user;
    await authService.revokeAllSessions(tenantSlug, userId, getClientContext(request));

    reply.clearCookie('refreshToken', { path: '/' });
    reply.send({ message: 'All sessions revoked' });
  });

  // Revoke one of the caller's sessions
  app.delete<{ Params: { id: string } }>('/sessions/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId, tenantSlug } = request.user;
    const sessionId = z.string().uuid().parse(request.params.id);

    const revoked = await authService.revokeSession(
      tenantSlug,
      userId,
      sessionId,
      getClientContext(request)
    );
    if (!revoked) {
      throw new NotFoundError('Session', sessionId);
    }

    reply.send({ message: 'Session revoked' });
  });

  // Security review: token issuance, refresh, revocation and reuse events
  app.get<{
    Querystring: {
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };
  }>('/audit-log', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const { userId, action, startDate, endDate, limit, offset } = request.query;

    if (action && !AUTH_AUDIT_ACTIONS.includes(action as AuditAction)) {
      throw new BadRequestError(`action must be one of: ${AUTH_AUDIT_ACTIONS.join(', ')}`);
    }

    const validatedStartDate = validateDate(startDate, 'startDate');
    const validatedEndDate = validateDate(endDate, 'endDate');
    validateDateRange(validatedStartDate, validatedEndDate, 365);

    return auditService.query(tenantSlug, {
      userId,
      action: (action as AuditAction | undefined) ?? AUTH_AUDIT_ACTIONS,
      entityType: 'auth_session',
      startDate: validatedStartDate,
      endDate: validatedEndDate,
      limit: validateLimit(limit, 1000),
      offset: validateOffset(offset),
    });
  });

  // Handler for getting current user profile
  const getCurrentUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, tenantSlug, roles } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    const { pool } = await import('../config/database.js');
    const result = await pool.query(
      `SELECT id, email, name, avatar_url, phone, timezone, status, settings, created_at
       FROM ${schema}.users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new BadRequestError('User not found');
    }

    // Get permissions
    const permissions = await authService.getUserPermissions(userId, schema);

    reply.send({
      ...user,
      roles,
      permissions,
    });
  };

  // Get current user - primary endpoint
  app.get('/me', {
    preHandler: [authenticate],
  }, getCurrentUser);

  // Get current user - alias for /me
  app.get('/profile', {
    preHandler: [authenticate],
  }, getCurrentUser);

  // Change password
  app.put('/password', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = changePasswordSchema.parse(request.body);
    const { userId, tenantSlug } = request.user;
    const schema = tenantService.getSchemaName(tenantSlug);

    await authService.changePassword(
      userId,
      body.oldPassword,
      body.newPassword,
      schema
    );

    reply.send({ message: 'Password changed successfully' });
  });

  // Forgot password - request reset token
  app.post('/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = forgotPasswordSchema.parse(request.body);

    await authService.requestPasswordReset(body.tenant, body.email);

    // Always return success to prevent email enumeration
    reply.send({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  });

  // Reset password with token
  app.post('/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = resetPasswordSchema.parse(request.body);

    await authService.resetPassword(body.tenant, body.token, body.newPassword);

    reply.send({ message: 'Password has been reset successfully. You can now login with your new password.' });
  });

  // Verify email
  app.post('/verify-email', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = verifyEmailSchema.parse(request.body);

    const result = await authService.verifyEmail(body.tenant, body.token);

    reply.send({
      message: 'Email verified successfully. You can now login.',
      email: result.email,
    });
  });

  // Resend verification email
  app.post('/resend-verification', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = resendVerificationSchema.parse(request.body);

    await authService.resendVerificationEmail(body.tenant, body.email);

    // Always return success to prevent email enumeration
    reply.send({
      message: 'If your email is registered and not yet verified, a new verification link has been sent.',
    });
  });
}
