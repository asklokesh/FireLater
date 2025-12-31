import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../../helpers/server.js';
import { webhooksService } from '../../../src/services/webhooks.js';

vi.mock('../../../src/services/webhooks.js', () => ({
  webhooksService: {
    process: vi.fn()
  }
}));

describe('Integration Routes - Webhooks', () => {
  let server: FastifyInstance;
  
  beforeEach(async () => {
    server = await buildTestServer();
    vi.resetAllMocks();
  });
  
  afterEach(async () => {
    await server.close();
  });
  
  describe('POST /api/v1/integrations/webhooks/:provider', () => {
    it('should process valid webhook successfully', async () => {
      const provider = 'github';
      const payload = { action: 'opened', issue: { id: 123 } };
      
      vi.mocked(webhooksService.process).mockResolvedValueOnce(undefined);
      
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/integrations/webhooks/${provider}`,
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'Webhook processed successfully' });
      expect(webhooksService.process).toHaveBeenCalledWith(
        'test-tenant',
        provider,
        payload,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      );
    });
    
    it('should handle sync job errors', async () => {
      const provider = 'jira';
      const payload = { webhookEvent: 'jira:issue_created' };
      const error = new Error('Sync failed');
      (error as any).name = 'SyncJobError';
      (error as any).jobId = 'job-123';
      
      vi.mocked(webhooksService.process).mockRejectedValueOnce(error);
      
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/integrations/webhooks/${provider}`,
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload
      });
      
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        message: 'Integration sync job failed',
        provider,
        jobId: 'job-123',
        error: 'SYNC_JOB_FAILED'
      });
    });
    
    it('should handle network connectivity errors', async () => {
      const provider = 'slack';
      const payload = { type: 'event_callback' };
      const error = new Error('Connection refused');
      (error as any).code = 'ECONNREFUSED';
      
      vi.mocked(webhooksService.process).mockRejectedValueOnce(error);
      
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/integrations/webhooks/${provider}`,
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload
      });
      
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        message: 'External service unavailable',
        provider,
        error: 'SERVICE_UNAVAILABLE'
      });
    });
    
    it('should handle client errors (4xx)', async () => {
      const provider = 'pagerduty';
      const payload = { event: { id: 'evt1' } };
      const error = new Error('Bad request');
      (error as any).response = {
        status: 400,
        data: { message: 'Invalid payload' }
      };
      
      vi.mocked(webhooksService.process).mockRejectedValueOnce(error);
      
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/integrations/webhooks/${provider}`,
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload
      });
      
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        message: 'Invalid webhook payload or configuration',
        provider,
        error: 'BAD_REQUEST',
        details: { message: 'Invalid payload' }
      });
    });
    
    it('should handle server errors (5xx)', async () => {
      const provider = 'datadog';
      const payload = { alert: { id: 'alert1' } };
      const error = new Error('Internal server error');
      (error as any).response = {
        status: 500
      };
      
      vi.mocked(webhooksService.process).mockRejectedValueOnce(error);
      
      const response = await server.inject({
        method: 'POST',
        url: `/api/v1/integrations/webhooks/${provider}`,
        headers: {
          'x-tenant-slug': 'test-tenant',
          'authorization': 'Bearer test-token'
        },
        payload
      });
      
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        message: 'External service error',
        provider,
        error: 'BAD_GATEWAY'
      });
    });
  });
});