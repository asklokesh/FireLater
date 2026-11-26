import { FastifyInstance } from 'fastify';
import {
  apiKeysService,
  webhooksService,
  integrationsService,
  WEBHOOK_EVENTS,
  INTEGRATION_TYPES,
} from '../services/integrations.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  createApiKeySchema,
  createWebhookSchema,
  validateApiKeySchema,
  createIntegrationSchema,
  updateApiKeySchema,
  updateIntegrationSchema,
  updateWebhookSchema,
  type CreateApiKeyInput,
  type CreateWebhookInput,
  type CreateIntegrationInput,
  type UpdateApiKeyInput,
  type UpdateIntegrationInput,
  type UpdateWebhookInput,
} from '../schemas/integrations.js';

// re-exported for existing importers/tests
export { createApiKeySchema, createWebhookSchema };

// ============================================
// INTEGRATIONS, WEBHOOKS & API KEYS ROUTES
// ============================================

// Integration Schemas


// Export schemas for testing
export { updateWebhookSchema, createIntegrationSchema, updateIntegrationSchema };

export default async function integrationsRoutes(fastify: FastifyInstance) {
  // ============================================
  // METADATA ENDPOINTS
  // ============================================

  // Get available webhook events (no auth required)
  fastify.get('/webhooks/events', async () => {
    return { data: WEBHOOK_EVENTS };
  });

  // Get available integration types (no auth required)
  fastify.get('/types', async () => {
    return { data: INTEGRATION_TYPES };
  });

  // ============================================
  // API KEYS ENDPOINTS
  // ============================================

  // List API keys
  fastify.get('/api-keys', { preHandler: [authenticate] }, async (request) => {
    const { tenantSlug } = request.user;
    const keys = await apiKeysService.list(tenantSlug);
    return { data: keys };
  });

  // Get single API key
  fastify.get('/api-keys/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    const key = await apiKeysService.findById(tenantSlug, id);

    if (!key) {
      return reply.code(404).send({ error: 'API key not found' });
    }

    return { data: key };
  });

  // Create API key
  fastify.post('/api-keys', { preHandler: [authenticate, validate({ body: createApiKeySchema })] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateApiKeyInput;

    try {
      const result = await apiKeysService.create(tenantSlug, userId, {
        name: body.name,
        description: body.description,
        permissions: body.permissions,
        rateLimit: body.rateLimit,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        ipWhitelist: body.ipWhitelist,
      });

      // Return the full key only on creation
      return reply.code(201).send({
        data: result.apiKey,
        key: result.key,
        message: 'Store this key securely - it will not be shown again',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create API key';
      return reply.code(400).send({ error: message });
    }
  });

  // Update API key
  fastify.patch('/api-keys/:id', { preHandler: [authenticate, validate({ body: updateApiKeySchema })] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as UpdateApiKeyInput;

    try {
      const key = await apiKeysService.update(tenantSlug, id, {
        name: body.name,
        description: body.description ?? undefined,
        permissions: body.permissions,
        rateLimit: body.rateLimit,
        isActive: body.isActive,
        expiresAt: body.expiresAt === null ? null : body.expiresAt ? new Date(body.expiresAt) : undefined,
        ipWhitelist: body.ipWhitelist,
      });

      if (!key) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      return { data: key };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update API key';
      return reply.code(400).send({ error: message });
    }
  });

  // Delete API key
  fastify.delete('/api-keys/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const deleted = await apiKeysService.delete(tenantSlug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete API key';
      return reply.code(400).send({ error: message });
    }
  });

  // Validate API key (for testing)
  fastify.post('/api-keys/validate', { preHandler: [authenticate, validate({ body: validateApiKeySchema })] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as { key: string };

    if (!body.key) {
      return reply.code(400).send({ error: 'API key is required' });
    }

    const apiKey = await apiKeysService.validateKey(tenantSlug, body.key);

    return { data: { valid: !!apiKey, apiKey } };
  });

  // ============================================
  // WEBHOOKS ENDPOINTS
  // ============================================

  // List webhooks
  fastify.get('/webhooks', { preHandler: [authenticate] }, async (request) => {
    const { tenantSlug } = request.user;
    const webhooks = await webhooksService.list(tenantSlug);
    return { data: webhooks };
  });

  // Get single webhook
  fastify.get('/webhooks/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    const webhook = await webhooksService.findById(tenantSlug, id);

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    return { data: webhook };
  });

  // Create webhook
  fastify.post('/webhooks', { preHandler: [authenticate, validate({ body: createWebhookSchema })] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateWebhookInput;

    try {
      const webhook = await webhooksService.create(tenantSlug, userId, {
        name: body.name,
        description: body.description,
        url: body.url,
        secret: body.secret,
        events: body.events,
        filters: body.filters,
        retryCount: body.retryCount,
        retryDelay: body.retryDelay,
        timeout: body.timeout,
        customHeaders: body.customHeaders,
      });

      return reply.code(201).send({ data: webhook });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create webhook';
      return reply.code(400).send({ error: message });
    }
  });

  // Update webhook
  fastify.patch('/webhooks/:id', { preHandler: [authenticate, validate({ body: updateWebhookSchema })] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as UpdateWebhookInput;

    try {
      const webhook = await webhooksService.update(tenantSlug, id, {
        name: body.name,
        description: body.description ?? undefined,
        url: body.url,
        events: body.events,
        filters: body.filters,
        isActive: body.isActive,
        retryCount: body.retryCount,
        retryDelay: body.retryDelay,
        timeout: body.timeout,
        customHeaders: body.customHeaders,
      });

      if (!webhook) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      return { data: webhook };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update webhook';
      return reply.code(400).send({ error: message });
    }
  });

  // Delete webhook
  fastify.delete('/webhooks/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const deleted = await webhooksService.delete(tenantSlug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete webhook';
      return reply.code(400).send({ error: message });
    }
  });

  // Test webhook
  fastify.post('/webhooks/:id/test', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const result = await webhooksService.testWebhook(tenantSlug, id);
      return { data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test webhook';
      return reply.code(400).send({ error: message });
    }
  });

  // Get webhook deliveries
  fastify.get('/webhooks/:id/deliveries', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const query = request.query as {
      status?: string;
      page?: string;
      limit?: string;
    };

    const webhook = await webhooksService.findById(tenantSlug, id);

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    const limit = query.limit ? parseInt(query.limit) : 50;

    const deliveries = await webhooksService.getDeliveries(tenantSlug, id, limit);

    return {
      data: deliveries,
      meta: {
        total: deliveries.length,
        limit,
      },
    };
  });

  // ============================================
  // INTEGRATIONS ENDPOINTS
  // ============================================

  // List integrations
  fastify.get('/', { preHandler: [authenticate] }, async (request) => {
    const { tenantSlug } = request.user;

    const integrations = await integrationsService.list(tenantSlug);

    return { data: integrations };
  });

  // Get single integration
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    const integration = await integrationsService.findById(tenantSlug, id);

    if (!integration) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    return { data: integration };
  });

  // Create integration
  fastify.post('/', { preHandler: [authenticate, validate({ body: createIntegrationSchema })] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateIntegrationInput;

    try {
      const integration = await integrationsService.create(tenantSlug, userId, {
        name: body.name,
        type: body.type,
        description: body.description,
        config: body.config,
        credentials: body.credentials,
        syncEnabled: body.syncEnabled,
        syncInterval: body.syncInterval,
        syncDirection: body.syncDirection,
        fieldMappings: body.fieldMappings,
      });

      return reply.code(201).send({ data: integration });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create integration';
      return reply.code(400).send({ error: message });
    }
  });

  // Update integration
  fastify.patch('/:id', { preHandler: [authenticate, validate({ body: updateIntegrationSchema })] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as UpdateIntegrationInput;

    try {
      const integration = await integrationsService.update(tenantSlug, id, {
        name: body.name,
        description: body.description ?? undefined,
        config: body.config,
        credentials: body.credentials,
        isActive: body.isActive,
        syncEnabled: body.syncEnabled,
        syncInterval: body.syncInterval,
        syncDirection: body.syncDirection,
        fieldMappings: body.fieldMappings,
      });

      if (!integration) {
        return reply.code(404).send({ error: 'Integration not found' });
      }

      return { data: integration };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update integration';
      return reply.code(400).send({ error: message });
    }
  });

  // Delete integration
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const deleted = await integrationsService.delete(tenantSlug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Integration not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete integration';
      return reply.code(400).send({ error: message });
    }
  });

  // Test integration connection
  fastify.post('/:id/test', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };

    try {
      const result = await integrationsService.testConnection(tenantSlug, id);
      return { data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test integration';
      return reply.code(400).send({ error: message });
    }
  });

  // Get integration sync logs
  fastify.get('/:id/logs', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const query = request.query as {
      direction?: string;
      status?: string;
      page?: string;
      limit?: string;
    };

    const integration = await integrationsService.findById(tenantSlug, id);

    if (!integration) {
      return reply.code(404).send({ error: 'Integration not found' });
    }

    const limit = query.limit ? parseInt(query.limit) : 50;

    const logs = await integrationsService.getSyncLogs(tenantSlug, id, limit);

    return {
      data: logs,
      meta: {
        total: logs.length,
        limit,
      },
    };
  });
}
