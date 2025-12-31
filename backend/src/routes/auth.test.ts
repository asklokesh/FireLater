import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app.js';
import { createTestTenant, deleteTestTenant } from '../utils/testUtils.js';

describe('Auth Routes', () => {
  let app: ReturnType<typeof buildApp>;
  let testTenant: any;

  beforeEach(async () => {
    app = buildApp();
    testTenant = await createTestTenant();
  });

  afterEach(async () => {
    await deleteTestTenant(testTenant.slug);
    await app.close();
  });

  describe('POST /login', () => {
    test('should login successfully with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'admin@example.com',
          password: 'password123',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(body.token);
      assert.ok(body.refreshToken);
      assert.strictEqual(body.user.email, 'admin@example.com');
    });

    test('should reject invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'password123',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject missing tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'admin@example.com',
          password: 'password123'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject invalid tenant slug format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'admin@example.com',
          password: 'password123',
          tenantSlug: 'invalid@tenant'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'admin@example.com',
          password: 'wrongpassword',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /register', () => {
    test('should register new user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(body.token);
      assert.ok(body.refreshToken);
      assert.strictEqual(body.user.email, 'newuser@example.com');
    });

    test('should reject duplicate email', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'password123',
          name: 'Test User',
          tenantSlug: testTenant.slug
        }
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'password123',
          name: 'Test User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 409);
    });

    test('should reject weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: '123',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });
  });

  describe('POST /reset-password', () => {
    test('should initiate password reset for valid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          email: 'admin@example.com',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 200);
    });

    test('should handle non-existent email gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          email: 'nonexistent@example.com',
          tenantSlug: testTenant.slug
        }
      });

      // Should still return 200 to prevent email enumeration
      assert.strictEqual(response.statusCode, 200);
    });

    test('should reject invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          email: 'invalid-email',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });
  });
});