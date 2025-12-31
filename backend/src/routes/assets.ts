import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assetsService } from '../services/assets.js';
import { requirePermission } from '../middleware/auth.js';
import { createHash } from 'crypto';

// Add cache key generation helper
const generateAssetsCacheKey = (tenantSlug: string, query: any): string => {
  const keyData = `${tenantSlug}:${JSON.stringify(query)}`;
  return `assets:${createHash('md5').update(keyData).digest('hex')}`;
};

// ... existing code ...

export default async function assetsRoutes(fastify: FastifyInstance) {
  // ... existing code ...

  // List assets with caching
  fastify.get('/', {
    preHandler: [requirePermission('assets:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const query = request.query as Record<string, any>;
    
    // Generate cache key
    const cacheKey = generateAssetsCacheKey(tenantSlug, query);
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const assets = await assetsService.list(tenantSlug, query);
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(assets));
    reply.header('X-Cache', 'MISS');
    
    return { data: assets };
  });

  // Get asset by ID with caching
  fastify.get('/:id', {
    preHandler: [requirePermission('assets:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as { id: string };
    
    // Generate cache key
    const cacheKey = `asset:${tenantSlug}:${id}`;
    
    // Try to get from cache first
    const cachedData = await fastify.redis.get(cacheKey);
    if (cachedData) {
      reply.header('X-Cache', 'HIT');
      return { data: JSON.parse(cachedData) };
    }
    
    const asset = await assetsService.findById(tenantSlug, id);
    
    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }
    
    // Cache the result for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(asset));
    reply.header('X-Cache', 'MISS');
    
    return { data: asset };
  });

  // ... rest of existing routes ...
}