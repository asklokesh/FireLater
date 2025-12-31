// Add comprehensive test suite for auth routes covering rate limiting, validation and error states
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app';
import { FastifyInstance } from 'fastify';

describe('Auth Routes', () => {
  let app: FastifyInstance;
  
  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    test('should reject registration with missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com'
          // Missing password, firstName, lastName, companyName
        }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject registration with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Company'
        }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject registration with weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Company'
        }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    test('should enforce rate limiting on registration', async () => {
      // Make 4 requests to trigger rate limit
      for (let i = 0; i < 4; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: `test${i}@example.com`,
            password: 'Password123!',
            firstName: 'John',
            lastName: 'Doe',
            companyName: 'Test Company'
          }
        });
      }
      
      // 5th request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test5@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Company'
        }
      });
      
      assert.strictEqual(response.statusCode, 429);
    });
  });

  describe('POST /auth/login', () => {
    test('should reject login with missing credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com'
          // Missing password
        }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    test('should reject login with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'Password123!'
        }
      });
      
      assert.strictEqual(response.statusCode, 400);
    });

    test('should return 401 for invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'Password123!'
        }
      });
      
      assert.strictEqual(response.statusCode, 401);
    });

    test('should enforce rate limiting on login', async () => {
      // Make 6 requests to trigger rate limit (default max is 5)
      for (let i = 0; i < 6; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: `test${i}@example.com`,
            password: 'Password123!'
          }
        });
      }
      
      // 7th request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test7@example.com',
          password: 'Password123!'
        }
      });
      
      assert.strictEqual(response.statusCode, 429);
    });
  });
});