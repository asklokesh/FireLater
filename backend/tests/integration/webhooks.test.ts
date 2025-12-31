import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../test-utils.js';
import { WebhooksService } from '../../src/services/webhooks.js';

describe('Webhooks Integration Tests', () => {
  let app: FastifyInstance;
  let webhooksService: WebhooksService;

  beforeEach(async () => {
    app = await buildTestServer();
    webhooksService = new WebhooksService();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /webhooks/:provider', () => {
    const validPayload = { 
      action: 'created',
      issue: {
        id: 123,
        title: 'Test issue'
      }
    };

    test('should process GitHub webhook successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
    });

    test('should process Slack webhook successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/slack',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: { type: 'event_callback', event: { type: 'message' } }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
    });

    test('should process PagerDuty webhook successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/pagerduty',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: { event: { event_type: 'incident.triggered' } }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
    });

    test('should process Datadog webhook successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/datadog',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: { alert: { id: 456, title: 'Test alert' } }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
    });

    test('should reject invalid provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/invalidprovider',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(400);
    });

    test('should handle service unavailable errors', async () => {
      // Mock the webhooks service to throw a connection error
      const processSpy = vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        code: 'ECONNREFUSED'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        message: 'External service unavailable',
        provider: 'github',
        error: 'SERVICE_UNAVAILABLE'
      });

      processSpy.mockRestore();
    });

    test('should handle bad request errors', async () => {
      const processSpy = vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid payload' }
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        message: 'Invalid webhook payload or configuration',
        provider: 'github',
        error: 'BAD_REQUEST',
        details: { error: 'Invalid payload' }
      });

      processSpy.mockRestore();
    });

    test('should handle timeout errors', async () => {
      const processSpy = vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        code: 'ECONNABORTED'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(408);
      expect(response.json()).toEqual({
        message: 'Request timeout when connecting to external service',
        provider: 'github',
        error: 'REQUEST_TIMEOUT'
      });

      processSpy.mockRestore();
    });

    test('should handle internal server errors', async () => {
      const processSpy = vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        message: 'Internal error'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'authorization': 'Bearer test-token'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        message: 'Failed to process webhook',
        provider: 'github',
        error: 'INTERNAL_ERROR'
      });

      processSpy.mockRestore();
    });
  });
});