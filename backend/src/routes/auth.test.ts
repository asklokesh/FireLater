import { test, describe, beforeEach, afterEach } from 'node:test';
import { build } from '../../test/helpers';
import { closeDB, resetDB } from '../../test/helpers/db';
import { FastifyInstance } from 'fastify';

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await build();
    await resetDB();
  });

  afterEach(async () => {
    await closeDB();
  });

  describe('POST /register', () => {
    test('should reject registration with missing email', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with invalid email format', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with missing password', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with short password', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with missing firstName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with empty firstName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: '',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with missing lastName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with missing companyName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with excessively long firstName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'A'.repeat(100),
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with excessively long lastName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'D'.repeat(100),
          companyName: 'Test Co'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject registration with excessively long companyName', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'C'.repeat(200)
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });
  });

  describe('POST /login', () => {
    test('should reject login with missing email', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          password: 'Password123!'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject login with invalid email format', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'Password123!'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject login with missing password', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com'
        }
      });

      t.assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject login with incorrect password', async (t) => {
      // First register a user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Co'
        }
      });

      // Try to login with wrong password
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'WrongPassword123!'
        }
      });

      t.assert.equal(response.statusCode, 401);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });

    test('should reject login for non-existent user', async (t) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'Password123!'
        }
      });

      t.assert.equal(response.statusCode, 401);
      const body = JSON.parse(response.body);
      t.assert.ok(body.error);
    });
  });
});