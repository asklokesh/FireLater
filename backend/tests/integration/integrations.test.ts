import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../utils/server.js';
import { createTestTenant, removeTestTenant } from '../utils/tenant.js';
import { webhooksService } from '../../src/services/webhooks.js';
import { vi, Mock } from 'vitest';

describe('Integrations - Webhooks', () => {
  let server: FastifyInstance;
  let tenantSlug: string;

  beforeEach(async () => {
    server = await buildTestServer();
    const tenant = await createTestTenant();
    tenantSlug = tenant.slug;
  });

  afterEach(async () => {
    await removeTestTenant(tenantSlug);
    await server.close();
  });

  describe('POST /api/integrations/webhooks/:provider', () => {
    it('should process valid webhook successfully', async () => {
      const processSpy = vi.spyOn(webhooksService, 'process').mockResolvedValueOnce(undefined);
      
      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/github',
        headers: {
          'x-tenant-slug': tenantSlug,
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
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
      expect(processSpy).toHaveBeenCalledWith(
        tenantSlug,
        'github',
        {
          action: 'opened',
          issue: {
            id: 123,
            title: 'Test issue'
          }
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      );
    });

    it('should reject invalid provider', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/invalidprovider',
        headers: {
          'x-tenant-slug': tenantSlug,
          'content-type': 'application/json'
        },
        payload: {
          test: 'data'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle service unavailable errors', async () => {
      vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        code: 'ECONNREFUSED'
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/github',
        headers: {
          'x-tenant-slug': tenantSlug,
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

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        message: 'External service unavailable',
        provider: 'github',
        error: 'SERVICE_UNAVAILABLE'
      });
    });

    it('should handle bad request errors', async () => {
      vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        response: {
          status: 400,
          data: { message: 'Invalid payload' }
        }
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/github',
        headers: {
          'x-tenant-slug': tenantSlug,
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

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        message: 'Invalid webhook payload or configuration',
        provider: 'github',
        error: 'BAD_REQUEST',
        details: { message: 'Invalid payload' }
      });
    });

    it('should handle external service errors', async () => {
      vi.spyOn(webhooksService, 'process').mockRejectedValueOnce({
        response: {
          status: 500
        }
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/github',
        headers: {
          'x-tenant-slug': tenantSlug,
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

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        message: 'External service error',
        provider: 'github',
        error: 'BAD_GATEWAY'
      });
    });

    it('should handle internal processing errors', async () => {
      vi.spyOn(webhooksService, 'process').mockRejectedValueOnce(new Error('Processing failed'));

      const response = await server.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/github',
        headers: {
          'x-tenant-slug': tenantSlug,
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

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        message: 'Failed to process webhook',
        provider: 'github',
        error: 'INTERNAL_ERROR'
      });
    });
  });
});