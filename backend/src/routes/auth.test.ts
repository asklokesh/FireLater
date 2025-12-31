import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import buildServer from '../server';

describe('Auth Routes', () => {
  let fastify: any;

  beforeEach(async () => {
    fastify = buildServer();
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /login', () => {
    test('should return 429 when rate limit exceeded', async () => {
      // Make 6 requests to exceed the limit of 5
      for (let i = 0; i < 6; i++) {
        await fastify.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: `test${i}@example.com`,
            password: 'password123'
          }
        });
      }

      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123'
        }
      });

      assert.strictEqual(response.statusCode, 429);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Rate limit exceeded'));
    });

    test('should return 400 for invalid email format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'password123'
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Invalid email format'));
    });

    test('should return 400 for password too short', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: '123'
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Password must be at least 8 characters'));
    });
  });

  describe('POST /register', () => {
    test('should return 429 when rate limit exceeded', async () => {
      // Make 4 requests to exceed the limit of 3
      for (let i = 0; i < 4; i++) {
        await fastify.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: `test${i}@example.com`,
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            companyName: `Company ${i}`
          }
        });
      }

      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          companyName: 'Test Company'
        }
      });

      assert.strictEqual(response.statusCode, 429);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Rate limit exceeded'));
    });

    test('should return 400 for missing required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123'
          // Missing firstName, lastName, companyName
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 400 for invalid email format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          companyName: 'Test Company'
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Invalid email format'));
    });

    test('should return 400 for password too short', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123',
          firstName: 'Test',
          lastName: 'User',
          companyName: 'Test Company'
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Password must be at least 8 characters'));
    });

    test('should return 400 for missing name fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: '',
          lastName: '',
          companyName: 'Test Company'
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('First name and last name are required'));
    });

    test('should return 400 for missing company name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          companyName: ''
        }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.ok(body.error.includes('Company name is required'));
    });
  });
});