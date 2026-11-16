import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';

const conditionSchema = z.object({
  field: z.string().max(64),
  op: z.enum(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null']),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])
    .optional(),
});

// Recursive tree; depth and size are enforced again by the query builder
const filterSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    conditionSchema,
    z.object({ and: z.array(filterSchema).max(50) }).strict(),
    z.object({ or: z.array(filterSchema).max(50) }).strict(),
  ])
);

const searchBodySchema = z.object({
  q: z.string().max(500).optional(),
  filter: filterSchema.optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  sort: z.enum(['relevance', 'created_at', 'updated_at']).optional(),
});

const savedFilterSchema = z.object({
  name: z.string().min(1).max(255),
  query: z.string().max(500).optional(),
  filter: filterSchema.optional(),
  isShared: z.boolean().optional(),
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const body = searchBodySchema.parse(request.body);
    return searchService.searchIssues(tenantSlug, userId, body as never);
  });

  fastify.post('/facets', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug } = request.user;
    const body = searchBodySchema.pick({ q: true, filter: true }).parse(request.body);
    return searchService.facets(tenantSlug, body as never);
  });

  fastify.get('/filters', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    return { filters: await searchService.listFilters(tenantSlug, userId) };
  });

  fastify.post('/filters', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = savedFilterSchema.parse(request.body);
    const created = await searchService.createFilter(tenantSlug, userId, body as never);
    return reply.status(201).send(created);
  });

  fastify.delete('/filters/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await searchService.deleteFilter(tenantSlug, userId, id);
    return reply.status(204).send();
  });

  fastify.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    return { history: await searchService.history(tenantSlug, userId) };
  });

  fastify.get('/suggest', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const { q } = z.object({ q: z.string().min(1).max(200) }).parse(request.query);
    return { suggestions: await searchService.suggest(tenantSlug, userId, q) };
  });

  fastify.get('/analytics', { preHandler: [requirePermission('admin:read')] }, async (request) => {
    const { tenantSlug } = request.user;
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).parse(request.query);
    return searchService.analytics(tenantSlug, days);
  });
}
