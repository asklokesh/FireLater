import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { buildApp } from '../app.js';
import { tenantService } from '../services/tenant.js';
import { authService } from '../services/auth.js';
import { createTestTenant, createTestUser } from '../utils/test-helpers.js';

describe('Auth Routes', () => {
  let app: any;
  let testTenant: any;
  let testUser: any;
  let refreshToken: string;

  beforeEach(async () => {
    app = buildApp();
    testTenant = await createTestTenant();
    testUser = await createTestUser(testTenant.slug);
  });

  afterEach(async () => {
    await app.close();
  });

  test('should authenticate user and return access token with tenant isolation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 200);
    const payload = JSON.parse(response.payload);
    assert(payload.accessToken);
    assert(payload.refreshToken);
    
    // Verify tenant isolation by checking schema
    const userFromDb = await app.pg.query(
      `SELECT * FROM ${tenantService.getSchemaName(testTenant.slug)}.users WHERE id = $1`,
      [testUser.id]
    );
    assert.strictEqual(userFromDb.rows[0].id, testUser.id);
  });

  test('should refresh JWT token with proper validation', async () => {
    // First login to get refresh token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: 'password123'
      }
    });

    const loginPayload = JSON.parse(loginResponse.payload);
    refreshToken = loginPayload.refreshToken;

    // Use refresh token
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken
      }
    });

    assert.strictEqual(refreshResponse.statusCode, 200);
    const refreshPayload = JSON.parse(refreshResponse.payload);
    assert(refreshPayload.accessToken);
    assert.notStrictEqual(refreshPayload.accessToken, loginPayload.accessToken);
  });

  test('should reject refresh with invalid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: 'invalid-token'
      }
    });

    assert.strictEqual(response.statusCode, 401);
  });

  test('should reject refresh with expired token', async () => {
    // Create expired token
    const expiredToken = await authService.generateRefreshToken(testUser.id, testTenant.slug, -1000);
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: expiredToken
      }
    });

    assert.strictEqual(response.statusCode, 401);
  });
});