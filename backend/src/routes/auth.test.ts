import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../app';
import { createTestTenant, removeTestTenant } from '../utils/test-utils';

describe('Authentication', () => {
  let tenant1Id: string;
  let tenant2Id: string;

  beforeAll(async () => {
    // Create test tenants
    tenant1Id = await createTestTenant('test1');
    tenant2Id = await createTestTenant('test2');
  });

  afterAll(async () => {
    // Clean up test tenants
    await removeTestTenant(tenant1Id);
    await removeTestTenant(tenant2Id);
  });

  it('should register and login users in isolated tenant schemas', async () => {
    // Register user in tenant 1
    const registerResponse1 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'x-tenant-id': tenant1Id
      },
      payload: {
        email: 'user1@test.com',
        password: 'password123',
        name: 'Test User 1'
      }
    });

    expect(registerResponse1.statusCode).toBe(201);

    // Register user with same email in tenant 2
    const registerResponse2 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'x-tenant-id': tenant2Id
      },
      payload: {
        email: 'user1@test.com',
        password: 'password456',
        name: 'Test User 2'
      }
    });

    // Should succeed - same email allowed in different tenants
    expect(registerResponse2.statusCode).toBe(201);

    // Login as tenant 1 user
    const loginResponse1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'x-tenant-id': tenant1Id
      },
      payload: {
        email: 'user1@test.com',
        password: 'password123'
      }
    });

    expect(loginResponse1.statusCode).toBe(200);
    const { token: token1 } = JSON.parse(loginResponse1.body);

    // Login as tenant 2 user
    const loginResponse2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'x-tenant-id': tenant2Id
      },
      payload: {
        email: 'user1@test.com',
        password: 'password456'
      }
    });

    expect(loginResponse2.statusCode).toBe(200);
    const { token: token2 } = JSON.parse(loginResponse2.body);

    // Verify tokens are different
    expect(token1).not.toBe(token2);
  });

  it('should reject expired JWT tokens', async () => {
    // Register and login user
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'x-tenant-id': tenant1Id
      },
      payload: {
        email: 'expiring@test.com',
        password: 'password123',
        name: 'Expiring User'
      }
    });

    expect(registerResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: {
        'x-tenant-id': tenant1Id
      },
      payload: {
        email: 'expiring@test.com',
        password: 'password123'
      }
    });

    expect(loginResponse.statusCode).toBe(200);
    const { token } = JSON.parse(loginResponse.body);

    // Simulate token expiration by waiting
    // Note: In real tests, we would mock the JWT verification to simulate expiration
    // For this example, we'll create an already expired token
    const expiredToken = app.jwt.sign(
      { userId: 'test-user-id', tenantId: tenant1Id },
      { expiresIn: '-1h' } // Expired 1 hour ago
    );

    // Try to access protected route with expired token
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/users/profile',
      headers: {
        authorization: `Bearer ${expiredToken}`,
        'x-tenant-id': tenant1Id
      }
    });

    expect(protectedResponse.statusCode).toBe(401);
    const responseBody = JSON.parse(protectedResponse.body);
    expect(responseBody.message).toBe('Token expired');
  });
});