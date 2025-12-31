import { test, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer, teardownTestServer } from '../helpers/testServer.js';
import { createTestTenant, removeTestTenant } from '../helpers/testTenant.js';

let testServer: any;
let testTenant: any;

beforeAll(async () => {
  testServer = await setupTestServer();
  testTenant = await createTestTenant();
});

afterAll(async () => {
  await removeTestTenant(testTenant.slug);
  await teardownTestServer(testServer);
});

test('should handle incoming webhooks with valid signature', async () => {
  // Test webhook processing with valid authentication
  const response = await testServer.inject({
    method: 'POST',
    url: `/api/v1/integrations/webhook/${testTenant.slug}/github`,
    headers: {
      'x-hub-signature-256': 'sha256=validsignature',
      'content-type': 'application/json'
    },
    payload: {
      action: 'opened',
      issue: {
        id: 123,
        title: 'Test issue'
      }
    }
  });

  expect(response.statusCode).toBe(200);
});

test('should reject webhooks with invalid signature', async () => {
  // Test webhook rejection with invalid authentication
  const response = await testServer.inject({
    method: 'POST',
    url: `/api/v1/integrations/webhook/${testTenant.slug}/github`,
    headers: {
      'x-hub-signature-256': 'sha256=invalidsignature',
      'content-type': 'application/json'
    },
    payload: {
      action: 'opened',
      issue: {
        id: 123,
        title: 'Test issue'
      }
    }
  });

  expect(response.statusCode).toBe(401);
});

test('should process valid webhook payload and create ticket', async () => {
  // Test webhook processing creates expected resources
  const payload = {
    action: 'opened',
    issue: {
      id: 456,
      title: 'New issue from webhook',
      body: 'Issue description'
    }
  };

  const response = await testServer.inject({
    method: 'POST',
    url: `/api/v1/integrations/webhook/${testTenant.slug}/github`,
    headers: {
      'x-hub-signature-256': 'sha256=validsignature',
      'content-type': 'application/json'
    },
    payload
  });

  expect(response.statusCode).toBe(200);
  
  // Verify ticket was created
  const ticketResponse = await testServer.inject({
    method: 'GET',
    url: `/api/v1/requests?externalId=456`,
    headers: {
      'x-tenant-slug': testTenant.slug,
      'authorization': `Bearer ${testTenant.adminToken}`
    }
  });

  expect(ticketResponse.statusCode).toBe(200);
  const tickets = ticketResponse.json();
  expect(tickets.requests).toHaveLength(1);
  expect(tickets.requests[0].title).toBe('New issue from webhook');
});