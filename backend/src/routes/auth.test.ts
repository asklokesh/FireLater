import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { createTestTenant, destroyTestTenant } from '../utils/test-helpers.js';

describe('Auth Routes', () => {
  let app: any;
  let tenantSlug: string;

  beforeEach(async () => {
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
      // First register a user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { 'x-tenant-slug': tenantSlug },
        payload: {
          email: 'test@example.com',
          password: 'ValidPass123!',
          name: 'Test User'
        }
      });

      // Try to login with wrong password
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