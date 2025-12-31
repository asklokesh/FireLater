import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  apiKeysService,
  webhooksService,
  integrationsService,
  WEBHOOK_EVENTS,
  INTEGRATION_TYPES,
} from '../services/integrations.js';
import { createHash } from 'crypto';

// Add cache key generation helper
const generateIntegrationsCacheKey = (tenantSlug: string, path: string, query: any = {}): string => {
  const keyData = `${tenantSlug}:${path}:${JSON.stringify(query)}`;
  return `integrations:${createHash('md5').update(keyData).digest('hex')}`;
};

// ... existing code ...

export default async function integrationsRoutes(fastify: FastifyInstance) {
  // ... existing code ...

  // List API keys with caching
  fastify.get('/api-keys', async (request, reply) => {
    const tenant = (request as any).tenant;
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, 'api-keys');
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const keys = await apiKeysService.list(tenant.slug);
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(keys));
    reply.header('X-Cache', 'MISS');
    
    return { data: keys };
  });

  // Get single API key with caching
  fastify.get('/api-keys/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, `api-keys/${id}`);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const key = await apiKeysService.findById(tenant.slug, id);
    
    if (!key) {
      return reply.code(404).send({ error: 'API key not found' });
    }
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(key));
    reply.header('X-Cache', 'MISS');
    
    return { data: key };
  });

  // List webhooks with caching
  fastify.get('/webhooks', async (request, reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as Record<string, any>;
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, 'webhooks', query);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const webhooks = await webhooksService.list(tenant.slug, query);
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(webhooks));
    reply.header('X-Cache', 'MISS');
    
    return { data: webhooks };
  });

  // Get single webhook with caching
  fastify.get('/webhooks/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, `webhooks/${id}`);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const webhook = await webhooksService.findById(tenant.slug, id);
    
    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(webhook));
    reply.header('X-Cache', 'MISS');
    
    return { data: webhook };
  });

  // List integrations with caching
  fastify.get('/integrations', async (request, reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as Record<string, any>;
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, 'integrations', query);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const integrations = await integrationsService.list(tenant.slug, query);
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(integrations));
    reply.header('X-Cache', 'MISS');
    
    return { data: integrations };
  });

  // Get single integration with caching
  fastify.get('/integrations/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    
    // Generate cache key
    const cacheKey = generateIntegrationsCacheKey(tenant.slug, `integrations/${id}`);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const integration = await integrationsService.findById(tenant.slug, id);
    
    if (!integration) {
      return reply.code(404).send({ error: 'Integration not found' });
    }
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(integration));
    reply.header('X-Cache', 'MISS');
    
    return { data: integration };
  });

  // ... rest of existing routes ...
}