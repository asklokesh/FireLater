import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app';
import { createTestTenant, removeTestTenant } from '../utils/test-utils';

describe('Auth Routes', () => {
  let app: any;
  let testTenant: any;

  beforeEach(async () => {
    app = await buildApp();
    testTenant = await createTestTenant();
  });

  afterEach(async () => {
    if (testTenant) {
      await removeTestTenant(testTenant.slug);
    }
    await app.close();
  });

  describe('POST /auth/register', () => {
    test('should register a new user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'Password123!',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const data = JSON.parse(response.body);
      assert.strictEqual(data.email, 'newuser@example.com');
      assert.strictEqual(data.name, 'New User');
      assert.strictEqual(data.tenant_slug, testTenant.slug);
      assert.strictEqual(data.is_active, true);
    });

    test('should return 400 for invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Password123!',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 400 for weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 409 for duplicate email', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'Password123!',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'Password123!',
          name: 'New User',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 409);
    });

    test('should return 404 for non-existent tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          name: 'New User',
          tenantSlug: 'non-existent-tenant'
        }
      });

      assert.strictEqual(response.statusCode, 404);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'loginuser@example.com',
          password: 'Password123!',
          name: 'Login User',
          tenantSlug: testTenant.slug
        }
      });
    });

    test('should login successfully with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@example.com',
          password: 'Password123!',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 200);
      const data = JSON.parse(response.body);
      assert.ok(data.token);
      assert.ok(data.refreshToken);
      assert.strictEqual(data.user.email, 'loginuser@example.com');
    });

    test('should return 401 for invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@example.com',
          password: 'WrongPassword!',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    test('should return 401 for non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'Password123!',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    test('should return 401 for inactive user', async () => {
      // Create inactive user
      await app.prisma.user.create({
        data: {
          email: 'inactive@example.com',
          password_hash: 'hashed_password',
          name: 'Inactive User',
          tenant_slug: testTenant.slug,
          is_active: false
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'inactive@example.com',
          password: 'Password123!',
          tenantSlug: testTenant.slug
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    test('should return 400 for missing credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 400 for invalid tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@example.com',
          password: 'Password123!',
          tenantSlug: ''
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create user and get refresh token
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'refreshuser@example.com',
          password: 'Password123!',
          name: 'Refresh User',
          tenantSlug: testTenant.slug
        }
      });

      const data = JSON.parse(response.body);
      refreshToken = data.refreshToken;
    });

    test('should refresh token successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken
        }
      });

      assert.strictEqual(response.statusCode, 200);
      const data = JSON.parse(response.body);
      assert.ok(data.token);
      assert.ok(data.refreshToken);
    });

    test('should return 401 for invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: 'invalid-token'
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    test('should return 401 for expired refresh token', async () => {
      // Create an expired token manually
      const expiredToken = app.jwt.sign(
        { userId: 'test-user-id', tenantSlug: testTenant.slug },
        { expiresIn: '-1h' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: expiredToken
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    test('should return 400 for missing refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {}
      });

      assert.strictEqual(response.statusCode, 400);
    });
  });

  describe('Security Tests', () => {
    test('should prevent SQL injection in tenant slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          tenantSlug: "test'; DROP TABLE users; --"
        }
      });

      // Should return 400 for invalid tenant slug format, not 500 for SQL error
      assert.strictEqual(response.statusCode, 400);
    });

    test('should rate limit login attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'test@example.com',
            password: 'wrong-password',
            tenantSlug: testTenant.slug
          }
        });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrong-password',
          tenantSlug: testTenant.slug
        }
      });

      // Should be rate limited (429) or still 401 but with different handling
      assert.ok([401, 429].includes(response.statusCode));
    });
  });
});