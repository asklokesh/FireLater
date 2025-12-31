import { test, describe, beforeEach, afterEach } from 'node:test';
import { deepEqual, equal, rejects } from 'node:assert';
import { buildApp } from '../helpers/app.js';
import { createTestTenant, createTestUser } from '../helpers/auth.js';

describe('Integrations - Webhooks', () => {
  let app: any;
  let tenant: any;
  let user: any;
  let token: string;

  beforeEach(async () => {
    app = await buildApp();
    tenant = await createTestTenant();
    user = await createTestUser(tenant.id);
    token = await app.jwt.sign({ 
      userId: user.id, 
      tenantId: tenant.id,
      permissions: [] 
    });
  });

  afterEach(async () => {
    await app.close();
  });

  test('should process valid GitHub webhook', async () => {
    const payload = {
      action: 'opened',
      issue: {
        id: 123,
        title: 'Test issue'
      }
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/github',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload
    });

    equal(response.statusCode, 200);
    deepEqual(response.json(), { message: 'Webhook processed successfully' });
  });

  test('should reject unsupported provider', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/unsupported',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: { test: 'data' }
    });

    equal(response.statusCode, 400);
    deepEqual(response.json(), {
      error: 'Unsupported webhook provider',
      code: 'INVALID_PROVIDER'
    });
  });

  test('should handle validation error from service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhooks/github',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {} // Invalid payload
    });

    equal(response.statusCode, 400);
    deepEqual(response.json(), {
      error: 'Invalid webhook payload',
      code: 'VALIDATION_ERROR',
      details: 'Payload missing required fields'
    });
  });
});