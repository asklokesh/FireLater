import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { authenticate } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';

const loginSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(), // Can be empty if using httpOnly cookie
  tenant: z.string().min(1),
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

export default async function authRoutes(app: FastifyInstance) {
  // Register a new tenant
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
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
      (payload) => app.jwt.sign(payload)
    );

    reply.status(201).send({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      ...loginResult,
    });
  });

  // Login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    const result = await authService.login(
      {
        tenantSlug: body.tenant,
        email: body.email,
        password: body.password,
      },
      (payload) => app.jwt.sign(payload)
    );

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

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

    if (refreshToken) {
      await authService.logout(refreshToken, request.user.tenantSlug);
    }

    reply.clearCookie('refreshToken', { path: '/v1/auth' });
    reply.send({ message: 'Logged out successfully' });
  });

  // Refresh token
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(request.body);
    const refreshToken = body.refreshToken || request.cookies.refreshToken;

    if (!refreshToken) {
      throw new BadRequestError('Refresh token is required');
    }

    const result = await authService.refresh(
      refreshToken,
      body.tenant,
      (payload) => app.jwt.sign(payload)
    );

    reply.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.send({
      accessToken: result.accessToken,
    });
  });

  // Get current user
  app.get('/me', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

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
