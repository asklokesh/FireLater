import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { createTestTenant, deleteTestTenant } from '../utils/testUtils.js';

describe('Auth Routes', () => {
  let app: FastifyInstance;
  let testTenant: any;

  beforeEach(async () => {
    app = await buildApp();
    testTenant = await createTestTenant();
  });

  afterEach(async () => {
    if (testTenant) {
      await deleteTestTenant(testTenant.slug);
    }
    await app.close();
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const loginPayload = {
        email: 'test@example.com',
        password: 'password123',
        tenantSlug: testTenant.slug
      };

      // Make requests up to the rate limit
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: loginPayload
        });
      }

      // This request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: loginPayload
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().message).toBe('Rate limit exceeded');
    });

    it('should rate limit registration attempts', async () => {
      const registerPayload = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        tenantSlug: testTenant.slug
      };

      // Make requests up to the rate limit
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: registerPayload
        });
      }

      // This request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: registerPayload
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().message).toBe('Rate limit exceeded');
    });

    it('should rate limit password reset requests', async () => {
      const resetPayload = {
        email: 'test@example.com',
        tenantSlug: testTenant.slug
      };

      // Make requests up to the rate limit
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/reset-password',
          payload: resetPayload
        });
      }

      // This request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: resetPayload
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().message).toBe('Rate limit exceeded');
    });
  });

  describe('Tenant Validation', () => {
    it('should reject login with invalid tenant slug format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          tenantSlug: 'invalid_tenant!' // Invalid characters
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('Invalid tenant identifier');
    });

    it('should reject login with missing tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123'
          // Missing tenantSlug
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('Invalid tenant identifier');
    });

    it('should reject login with non-existent tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          tenantSlug: 'nonexistent'
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toBe('Tenant not found');
    });

    it('should reject registration with invalid tenant slug format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          tenantSlug: 'invalid-tenant-' // Ends with hyphen
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('Invalid tenant identifier');
    });

    it('should reject password reset with invalid tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          email: 'test@example.com',
          tenantSlug: '123invalid' // Starts with number
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('Invalid tenant identifier');
    });
  });
});