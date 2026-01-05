import { test, expect } from '@playwright/test';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * End-to-End tests for webhook notification flows
 *
 * These tests verify:
 * 1. Creating webhooks via API
 * 2. Testing webhook deliveries
 * 3. Triggering webhooks on events (issue created, change approved, etc.)
 * 4. Webhook filtering and event matching
 * 5. Webhook retry logic
 * 6. Webhook delivery logs
 */

test.describe('Webhook Notification E2E Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  test.beforeAll(async () => {
    app = await createTestApp();
    authToken = generateTestToken(app);
    await app.ready();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test.describe('Webhook Management', () => {
    test('should create webhook with valid configuration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Test Webhook',
          description: 'Webhook for testing',
          url: 'https://webhook.site/unique-id',
          events: ['issue.created', 'issue.updated'],
          retryCount: 3,
          retryDelay: 60,
          timeout: 30,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.name).toBe('Test Webhook');
      expect(body.data.url).toBe('https://webhook.site/unique-id');
      expect(body.data.events).toEqual(['issue.created', 'issue.updated']);
      expect(body.data.is_active).toBe(true);
    });

    test('should list all webhooks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('should get webhook by ID', async () => {
      // First create a webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Get Test Webhook',
          url: 'https://webhook.site/test-get',
          events: ['change.approved'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Then get it
      const response = await app.inject({
        method: 'GET',
        url: `/v1/integrations/webhooks/${webhookId}`,
        headers: createAuthHeader(authToken),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(webhookId);
      expect(body.data.name).toBe('Get Test Webhook');
    });

    test('should update webhook configuration', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Update Test Webhook',
          url: 'https://webhook.site/test-update',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Update it
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/webhooks/${webhookId}`,
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Updated Webhook Name',
          events: ['issue.created', 'issue.resolved'],
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const body = JSON.parse(updateResponse.body);
      expect(body.data.name).toBe('Updated Webhook Name');
      expect(body.data.events).toEqual(['issue.created', 'issue.resolved']);
    });

    test('should deactivate webhook', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Deactivate Test Webhook',
          url: 'https://webhook.site/test-deactivate',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Deactivate it
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/webhooks/${webhookId}`,
        headers: createAuthHeader(authToken),
        payload: {
          isActive: false,
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const body = JSON.parse(updateResponse.body);
      expect(body.data.is_active).toBe(false);
    });

    test('should delete webhook', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Delete Test Webhook',
          url: 'https://webhook.site/test-delete',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Delete it
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/v1/integrations/webhooks/${webhookId}`,
        headers: createAuthHeader(authToken),
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify it's gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/v1/integrations/webhooks/${webhookId}`,
        headers: createAuthHeader(authToken),
      });

      expect(getResponse.statusCode).toBe(404);
    });
  });

  test.describe('Webhook Testing', () => {
    test('should test webhook delivery', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Test Delivery Webhook',
          url: 'https://webhook.site/test-delivery',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Test the webhook
      const testResponse = await app.inject({
        method: 'POST',
        url: `/v1/integrations/webhooks/${webhookId}/test`,
        headers: createAuthHeader(authToken),
      });

      expect(testResponse.statusCode).toBe(200);
      const body = JSON.parse(testResponse.body);
      expect(body.data).toBeDefined();
      expect(body.data.success).toBeDefined();
    });

    test('should retrieve webhook delivery logs', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Delivery Logs Webhook',
          url: 'https://webhook.site/test-logs',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Test webhook to create a delivery
      await app.inject({
        method: 'POST',
        url: `/v1/integrations/webhooks/${webhookId}/test`,
        headers: createAuthHeader(authToken),
      });

      // Get delivery logs
      const logsResponse = await app.inject({
        method: 'GET',
        url: `/v1/integrations/webhooks/${webhookId}/deliveries`,
        headers: createAuthHeader(authToken),
      });

      expect(logsResponse.statusCode).toBe(200);
      const body = JSON.parse(logsResponse.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('should filter delivery logs by status', async () => {
      // Create webhook
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Filter Logs Webhook',
          url: 'https://webhook.site/test-filter-logs',
          events: ['issue.created'],
        },
      });

      const webhookId = JSON.parse(createResponse.body).data.id;

      // Get delivery logs filtered by status
      const logsResponse = await app.inject({
        method: 'GET',
        url: `/v1/integrations/webhooks/${webhookId}/deliveries?status=success`,
        headers: createAuthHeader(authToken),
      });

      expect(logsResponse.statusCode).toBe(200);
      const body = JSON.parse(logsResponse.body);
      expect(body.data).toBeDefined();
    });
  });

  test.describe('Webhook Event Filtering', () => {
    test('should create webhook with event filters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Filtered Webhook',
          url: 'https://webhook.site/test-filter',
          events: ['issue.created'],
          filters: {
            priority: 'high',
            status: 'open',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.filters).toEqual({
        priority: 'high',
        status: 'open',
      });
    });

    test('should create webhook with custom headers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Custom Headers Webhook',
          url: 'https://webhook.site/test-custom-headers',
          events: ['issue.created'],
          customHeaders: {
            'X-Custom-Header': 'custom-value',
            'X-API-Key': 'secret-key',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.custom_headers).toEqual({
        'X-Custom-Header': 'custom-value',
        'X-API-Key': 'secret-key',
      });
    });
  });

  test.describe('Webhook Security', () => {
    test('should reject webhook with invalid URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'Invalid URL Webhook',
          url: 'not-a-valid-url',
          events: ['issue.created'],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should reject webhook with empty events array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'No Events Webhook',
          url: 'https://webhook.site/test-no-events',
          events: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should reject webhook targeting private IP addresses (SSRF protection)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/integrations/webhooks',
        headers: createAuthHeader(authToken),
        payload: {
          name: 'SSRF Test Webhook',
          url: 'http://localhost:3000/admin',
          events: ['issue.created'],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('SSRF');
    });

    test('should require authentication for webhook operations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/integrations/webhooks',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  test.describe('Webhook Available Events', () => {
    test('should list available webhook events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/integrations/webhooks/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // Verify some expected events
      expect(body.data).toContain('issue.created');
      expect(body.data).toContain('change.approved');
      expect(body.data).toContain('sla.breached');
    });
  });
});
