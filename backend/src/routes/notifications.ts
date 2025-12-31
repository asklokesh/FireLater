import { FastifyInstance } from 'fastify';
import { notificationService } from '../services/notifications.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';
import { jobQueue } from '../jobs/index.js';

// Webhook delivery job with retry logic
async function deliverWebhookWithRetry(tenantSlug: string, webhookId: string, payload: any, url: string, maxRetries = 3) {
  const job = await jobQueue.add('webhook-delivery', {
    tenantSlug,
    webhookId,
    payload,
    url,
    attempt: 1
  }, {
    attempts: maxRetries,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  });

  return job;
}

export async function notificationRoutes(fastify: FastifyInstance) {
  // POST /api/v1/notifications/webhooks/deliver
  fastify.post('/notifications/webhooks/deliver', {
    preHandler: [authenticate, authorize('send:notifications')],
    schema: {
      tags: ['Notifications'],
      body: {
        type: 'object',
        required: ['webhookId', 'payload'],
        properties: {
          webhookId: { type: 'string', format: 'uuid' },
          payload: { type: 'object' },
          metadata: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    if (!request.tenantSlug) {
      throw new BadRequestError('Tenant context required');
    }

    const { webhookId, payload, metadata } = request.body as {
      webhookId: string;
      payload: Record<string, any>;
      metadata?: Record<string, any>;
    };

    // Get webhook configuration
    const webhook = await notificationService.getWebhook(request.tenantSlug, webhookId);
    if (!webhook) {
      throw new BadRequestError('Webhook not found');
    }

    if (!webhook.isActive) {
      throw new BadRequestError('Webhook is not active');
    }

    // Queue webhook delivery with retry logic
    const job = await deliverWebhookWithRetry(
      request.tenantSlug,
      webhookId,
      { ...payload, metadata },
      webhook.url,
      webhook.retryAttempts || 3
    );

    return {
      jobId: job.id,
      message: 'Webhook delivery queued',
      webhookId
    };
  });
}