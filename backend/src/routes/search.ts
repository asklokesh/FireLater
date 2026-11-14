import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';
import { filterSchema } from '../services/search-filters.js';
import { savedFilterService } from '../services/saved-filter.js';
import { searchHistoryService } from '../services/search-history.js';
import { searchAnalyticsService } from '../services/search-analytics.js';
import { logger } from '../utils/logger.js';

export const searchBodySchema = z.object({
  q: z.string().max(200).optional(),
  filter: filterSchema.optional(),
  sort: z.enum(['relevance', 'created_at', 'updated_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  facets: z.boolean().optional(),
});

const templateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  query: z.string().max(200).optional(),
  filter: filterSchema.optional(),
  isShared: z.boolean().optional(),
});

type Req = { tenant: { slug: string }; user?: { userId: string } };
function ctx(request: unknown): { tenantSlug: string; userId: string } {
  const r = request as Req;
  return { tenantSlug: r.tenant.slug, userId: r.user?.userId as string };
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const body = searchBodySchema.parse(request.body ?? {});
    const result = await searchService.search(tenantSlug, body);
    if (body.q && body.q.trim()) {
      try {
        await searchHistoryService.record(tenantSlug, userId, {
          query: body.q,
          filter: body.filter,
          resultCount: result?.pagination?.total ?? 0,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to record search history');
      }
    }
    return result;
  });

  fastify.get('/templates', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    return { data: await savedFilterService.list(tenantSlug, userId) };
  });

  fastify.post('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    const body = templateBodySchema.parse(request.body ?? {});
    const created = await savedFilterService.create(tenantSlug, userId, body);
    return reply.status(201).send(created);
  });

  fastify.delete('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await savedFilterService.delete(tenantSlug, userId, id);
    return reply.status(204).send();
  });

  fastify.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    return { data: await searchHistoryService.list(tenantSlug, userId) };
  });

  fastify.delete('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    await searchHistoryService.clear(tenantSlug, userId);
    return reply.status(204).send();
  });

  fastify.get('/suggest', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const { q } = z.object({ q: z.string().max(200).default('') }).parse(request.query ?? {});
    return { data: await searchHistoryService.suggest(tenantSlug, userId, q) };
  });

  fastify.get('/analytics', { preHandler: [requirePermission('reports:read')] }, async (request) => {
    const { tenantSlug } = ctx(request);
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query ?? {});
    return searchAnalyticsService.getAnalytics(tenantSlug, days);
  });
}
