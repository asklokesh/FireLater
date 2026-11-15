import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { filterGroupSchema } from '../services/search/filter-builder.js';
import {
  searchIssues,
  listSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryEntry,
  getSuggestions,
} from '../services/search/search.js';

export const searchIssuesBodySchema = z.object({
  q: z.string().max(500).optional(),
  filter: filterGroupSchema.optional(),
  sort: z.enum(['relevance', 'created_at', 'updated_at', 'priority', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const suggestionsQuerySchema = z.object({
  q: z.string().max(500).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const historyIdParamsSchema = z.object({ id: z.string().uuid() });

export default async function searchRoutes(app: FastifyInstance) {
  app.post('/issues', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = searchIssuesBodySchema.parse(request.body ?? {});
    const result = await searchIssues(tenantSlug, userId, body);
    return reply.send(result);
  });

  app.get('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { limit } = historyQuerySchema.parse(request.query);
    const data = await listSearchHistory(tenantSlug, userId, limit);
    return reply.send({ data });
  });

  app.delete('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await clearSearchHistory(tenantSlug, userId);
    return reply.status(204).send();
  });

  app.delete('/history/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = historyIdParamsSchema.parse(request.params);
    await deleteSearchHistoryEntry(tenantSlug, userId, id);
    return reply.status(204).send();
  });

  app.get('/suggestions', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { q, limit } = suggestionsQuerySchema.parse(request.query);
    const data = await getSuggestions(tenantSlug, userId, q, limit);
    return reply.send({ data });
  });
}
