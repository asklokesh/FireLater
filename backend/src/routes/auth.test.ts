import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import buildServer from '../server';
import { createTestTenant, destroyTestTenant } from '../utils/testHelpers';

describe('Auth Routes - Edge Cases', () => {
  let fastify: any;
  let testTenant: any;

  beforeEach(async () => {
    fastify = buildServer();
    testTenant = await createTestTenant();
  });

  afterEach(async () => {
    await destroyTestTenant(testTenant.slug);
    await fastify.close();
  });

  describe('POST /auth/register', () => {
    test('should reject registration with missing email', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('email'));
    });

    test('should reject registration with invalid email format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('email'));
    });

    test('should reject registration with weak password', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123',
          firstName: 'Test',
          lastName: 'User'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('password'));
    });

    test('should reject registration with missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.error, 'Bad Request');
    });

    test('should reject registration for existing email', async () => {
      // First registration
      await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });

      // Second registration with same email
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'duplicate@example.com',
          password: 'password123',
          firstName: 'Test2',
          lastName: 'User2'
        }
      });
      
      assert.equal(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('already exists'));
    });

    test('should handle database connection errors gracefully', async () => {
      // Simulate database error by closing connection
      await fastify.pg.pool.end();
      
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });
      
      assert.equal(response.statusCode, 500);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('database'));
    });
  });

  describe('POST /auth/login', () => {
    test('should reject login with missing credentials', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {}
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('email') || body.error.includes('password'));
    });

    test('should reject login with non-existent user', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'password123'
        }
      });
      
      assert.equal(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('Invalid credentials'));
    });

    test('should reject login with incorrect password', async () => {
      // First create a user
      await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });

      // Try to login with wrong password
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword'
        }
      });
      
      assert.equal(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('Invalid credentials'));
    });

    test('should reject login with malformed email', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'not-an-email',
          password: 'password123'
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('email'));
    });

    test('should handle database errors during login', async () => {
      // Create a user first
      await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        }
      });

      // Close database connection to simulate error
      await fastify.pg.pool.end();
      
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123'
        }
      });
      
      assert.equal(response.statusCode, 500);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('database'));
    });
  });

  describe('POST /auth/refresh', () => {
    test('should reject refresh with missing token', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {}
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('refresh token'));
    });

    test('should reject refresh with invalid token format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: 'invalid-token-format'
        }
      });
      
      assert.equal(response.statusCode, 401);
      const body = JSON.parse(response.body);
      assert.ok(body.message.includes('Invalid token'));
    });

    test('should reject refresh with expired token', async () => {
      // This test would require mocking token expiration
      // Implementation depends on how tokens are generated in the service
    });

    test('should reject refresh with malformed request body', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: null
        }
      });
      
      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('refreshToken'));
    });
  });
});