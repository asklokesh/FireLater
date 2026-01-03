import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { createTestTenant, destroyTestTenant } from '../utils/test-helpers.js';

// Mock database pool
vi.mock('../config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock tenantService
vi.mock('../services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn().mockResolvedValue({
      id: 'tenant-123',
      name: 'Test Tenant',
      slug: 'test-tenant',
    }),
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
  },
}));

// Mock authService
vi.mock('../services/auth.js', () => ({
  authService: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getUserPermissions: vi.fn().mockResolvedValue([]),
  },
}));

describe('Auth Routes', () => {
  let app: any;
  let tenantSlug: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    tenantSlug = await createTestTenant();
  });

  afterEach(async () => {
    await destroyTestTenant(tenantSlug);
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should reject registration with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'invalid-email',
          password: 'ValidPass123!',
          name: 'Test User'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('message');
    });

    it('should reject registration with weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'test@example.com',
          password: '123',
          name: 'Test User'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('message');
    });

    it('should reject registration with missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'test@example.com'
          // missing password and name
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should prevent duplicate user registration', async () => {
      const { pool } = await import('../config/database.js');
      const { authService } = await import('../services/auth.js');

      // Mock first registration - no existing user, then return created user
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [] }) // Check for existing user
        .mockResolvedValueOnce({ // Create user
          rows: [{
            id: 'user-123',
            email: 'duplicate@example.com',
            name: 'Test User',
            created_at: new Date(),
          }],
        });

      // Mock login after first registration
      (authService.login as any).mockResolvedValueOnce({
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 'user-123', email: 'duplicate@example.com', name: 'Test User', roles: [] },
      });

      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'duplicate@example.com',
          password: 'ValidPass123!',
          name: 'Test User'
        }
      });

      // Mock second registration - user exists
      (pool.query as any).mockResolvedValueOnce({
        rows: [{ id: 'user-123' }], // Existing user found
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'duplicate@example.com',
          password: 'AnotherPass123!',
          name: 'Test User 2'
        }
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should reject login with non-existent user', async () => {
      const { authService } = await import('../services/auth.js');
      const { UnauthorizedError } = await import('../utils/errors.js');

      // Mock authService to throw UnauthorizedError
      (authService.login as any).mockRejectedValueOnce(
        new UnauthorizedError('Invalid email or password')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'nonexistent@example.com',
          password: 'SomePass123!'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject login with incorrect password', async () => {
      const { authService } = await import('../services/auth.js');
      const { UnauthorizedError } = await import('../utils/errors.js');

      // Mock authService to throw UnauthorizedError
      (authService.login as any).mockRejectedValueOnce(
        new UnauthorizedError('Invalid email or password. 4 attempt(s) remaining before account lockout.')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'test@example.com',
          password: 'WrongPass123!'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject login with malformed email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'not-an-email',
          password: 'SomePass123!'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should reject refresh with invalid token', async () => {
      const { authService } = await import('../services/auth.js');
      const { UnauthorizedError } = await import('../utils/errors.js');

      // Mock authService to throw UnauthorizedError
      (authService.refresh as any).mockRejectedValueOnce(
        new UnauthorizedError('Invalid or expired refresh token')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          refreshToken: 'invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject refresh with missing token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /auth/profile', () => {
    it('should reject profile access without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: { 'x-tenant-slug': tenantSlug }
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject profile access with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: { 
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject profile access with malformed authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: { 
          'x-tenant-slug': tenantSlug,
          'authorization': 'InvalidFormat'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should reject logout without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-tenant-slug': tenantSlug }
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject logout with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 
          'x-tenant-slug': tenantSlug,
          'authorization': 'Bearer invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });
});