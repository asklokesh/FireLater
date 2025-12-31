import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app.js';
import { createTestTenant, cleanupTestTenant } from '../utils/testHelpers.js';

describe('Auth Routes', () => {
  let app: ReturnType<typeof buildApp>;
  let testTenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    app = buildApp();
    testTenant = await createTestTenant();
  });

  afterEach(async () => {
    await cleanupTestTenant(testTenant);
    await app.close();
  });

  describe('POST /register', () => {
    test('should register a new user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User',
          tenantName: 'Test Company',
          tenantSlug: 'test-company'
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const data = JSON.parse(response.body);
      assert.strictEqual(data.email, 'newuser@example.com');
      assert.strictEqual(data.tenant.slug, 'test-company');
    });

    test('should reject invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'SecurePass123!',
          name: 'New User',
          tenantName: 'Test Company',
          tenantSlug: 'test-company'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: '123',
          name: 'New User',
          tenantName: 'Test Company',
          tenantSlug: 'test-company'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });
  });

  describe('POST /login', () => {
    beforeEach(async () => {
      // Create a test user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'loginuser@example.com',
          password: 'SecurePass123!',
          name: 'Login User',
          tenantName: 'Login Company',
          tenantSlug: 'login-company'
        }
      });
    });

    test('should login existing user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@example.com',
          password: 'SecurePass123!',
          tenantSlug: 'login-company'
        }
      });

      assert.strictEqual(response.statusCode, 200);
      const data = JSON.parse(response.body);
      assert.strictEqual(data.email, 'loginuser@example.com');
      assert.ok(data.token);
    });

    test('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'loginuser@example.com',
          password: 'WrongPassword!',
          tenantSlug: 'login-company'
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /reset-password', () => {
    beforeEach(async () => {
      // Create a test user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'resetuser@example.com',
          password: 'SecurePass123!',
          name: 'Reset User',
          tenantName: 'Reset Company',
          tenantSlug: 'reset-company'
        }
      });
    });

    test('should initiate password reset for existing user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          email: 'resetuser@example.com'
        }
      });

      assert.strictEqual(response.statusCode, 200);
    });

    test('should handle non-existent email gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          email: 'nonexistent@example.com'
        }
      });

      // Should still return 200 to prevent email enumeration
      assert.strictEqual(response.statusCode, 200);
    });
  });
});