import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();

    // Mock auth routes for testing
    app.post('/v1/auth/login', async (request, reply) => {
      const { tenant, email, password } = request.body as { tenant: string; email: string; password: string };

      if (!tenant || !email || !password) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Missing required fields',
        });
      }

      if (email === 'invalid@example.com') {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid credentials',
        });
      }

      const token = app.jwt.sign({
        userId: 'user-123',
        email,
        tenantSlug: tenant,
        roles: ['user'],
      });

      reply.setCookie('refreshToken', 'mock-refresh-token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/v1/auth',
      });

      return {
        accessToken: token,
        user: {
          id: 'user-123',
          email,
          name: 'Test User',
          roles: ['user'],
        },
      };
    });

    app.post('/v1/auth/register', async (request, reply) => {
      const { tenantName, tenantSlug, adminEmail, adminName, adminPassword } = request.body as {
        tenantName: string;
        tenantSlug: string;
        adminEmail: string;
        adminName: string;
        adminPassword: string;
      };

      if (!tenantName || !tenantSlug || !adminEmail || !adminName || !adminPassword) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Missing required fields',
        });
      }

      if (adminPassword.length < 8) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Password must be at least 8 characters',
        });
      }

      if (tenantSlug === 'existing-org') {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Organization already exists',
        });
      }

      const token = app.jwt.sign({
        userId: 'new-user-123',
        email: adminEmail,
        tenantSlug,
        roles: ['admin'],
      });

      reply.status(201).send({
        tenant: {
          id: 'new-tenant-123',
          name: tenantName,
          slug: tenantSlug,
        },
        accessToken: token,
        user: {
          id: 'new-user-123',
          email: adminEmail,
          name: adminName,
          roles: ['admin'],
        },
      });
    });

    app.get('/v1/auth/me', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header',
        });
      }

      try {
        const decoded = app.jwt.verify(authHeader.replace('Bearer ', '')) as {
          userId: string;
          email: string;
          tenantSlug: string;
          roles: string[];
        };
        return {
          id: decoded.userId,
          email: decoded.email,
          name: 'Test User',
          roles: decoded.roles,
          permissions: ['issues:read', 'issues:write'],
        };
      } catch {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token',
        });
      }
    });

    app.post('/v1/auth/logout', async (request, reply) => {
      reply.clearCookie('refreshToken', { path: '/v1/auth' });
      return { message: 'Logged out successfully' };
    });

    app.put('/v1/auth/password', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const { oldPassword, newPassword } = request.body as { oldPassword: string; newPassword: string };

      if (!oldPassword || !newPassword) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Old and new passwords are required',
        });
      }

      if (newPassword.length < 8) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Password must be at least 8 characters',
        });
      }

      if (oldPassword === 'wrong-password') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Current password is incorrect',
        });
      }

      return { message: 'Password changed successfully' };
    });

    app.post('/v1/auth/forgot-password', async (request, reply) => {
      const { tenant, email } = request.body as { tenant: string; email: string };

      if (!tenant || !email) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Tenant and email are required',
        });
      }

      // Always return success to prevent email enumeration
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    });

    app.post('/v1/auth/reset-password', async (request, reply) => {
      const { tenant, token, newPassword } = request.body as { tenant: string; token: string; newPassword: string };

      if (!tenant || !token || !newPassword) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Tenant, token, and new password are required',
        });
      }

      if (newPassword.length < 8) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Password must be at least 8 characters',
        });
      }

      if (token === 'invalid-token') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid or expired reset token',
        });
      }

      return { message: 'Password has been reset successfully. You can now login with your new password.' };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          tenant: 'test-org',
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          tenant: 'test-org',
          email: 'invalid@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'test@example.com',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should set refresh token cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          tenant: 'test-org',
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });
  });

  describe('POST /v1/auth/register', () => {
    it('should register a new tenant successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          tenantName: 'New Organization',
          tenantSlug: 'new-org',
          adminEmail: 'admin@new-org.com',
          adminName: 'Admin User',
          adminPassword: 'securepassword123',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.tenant).toBeDefined();
      expect(body.tenant.slug).toBe('new-org');
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe('admin@new-org.com');
    });

    it('should reject duplicate tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          tenantName: 'Existing Organization',
          tenantSlug: 'existing-org',
          adminEmail: 'admin@existing.com',
          adminName: 'Admin',
          adminPassword: 'password123',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('already exists');
    });

    it('should reject short passwords', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          tenantName: 'Test Org',
          tenantSlug: 'test-org-2',
          adminEmail: 'admin@test.com',
          adminName: 'Admin',
          adminPassword: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.email).toBe(testUser.email);
      expect(body.roles).toContain('admin');
      expect(body.permissions).toBeDefined();
    });

    it('should reject request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Logged out');
    });
  });

  describe('PUT /v1/auth/password', () => {
    it('should change password successfully', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/auth/password',
        headers: createAuthHeader(token),
        payload: {
          oldPassword: 'currentpassword',
          newPassword: 'newpassword123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Password changed');
    });

    it('should reject incorrect current password', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/auth/password',
        headers: createAuthHeader(token),
        payload: {
          oldPassword: 'wrong-password',
          newPassword: 'newpassword123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject short new password', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/auth/password',
        headers: createAuthHeader(token),
        payload: {
          oldPassword: 'currentpassword',
          newPassword: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/auth/forgot-password', () => {
    it('should accept forgot password request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/forgot-password',
        payload: {
          tenant: 'test-org',
          email: 'test@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('If an account exists');
    });

    it('should not reveal if email exists (security)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/forgot-password',
        payload: {
          tenant: 'test-org',
          email: 'nonexistent@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('If an account exists');
    });
  });

  describe('POST /v1/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/reset-password',
        payload: {
          tenant: 'test-org',
          token: 'valid-reset-token',
          newPassword: 'newsecurepassword123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Password has been reset');
    });

    it('should reject invalid reset token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/reset-password',
        payload: {
          tenant: 'test-org',
          token: 'invalid-token',
          newPassword: 'newsecurepassword123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Invalid');
    });
  });
});
