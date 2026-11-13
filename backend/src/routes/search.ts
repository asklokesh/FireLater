import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';
import { filterGroupSchema } from '../utils/search-query.js';

const templateBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  entityType: z.string().max(50).optional(),
  query: z.string().max(500).nullable().optional(),
  filter: filterGroupSchema.nullable().optional(),
  isShared: z.boolean().optional(),
});

const templateUpdateSchema = templateBodySchema.partial();

const idParamSchema = z.object({ id: z.string().uuid() });

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const suggestionsQuerySchema = z.object({
  q: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { entityType?: string } }>('/templates', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const entityType = typeof request.query?.entityType === 'string' ? request.query.entityType : undefined;
    const data = await searchService.listTemplates(tenantSlug, userId, entityType);
    reply.send({ data });
  });

  app.post('/templates', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = templateBodySchema.parse(request.body ?? {});
    const template = await searchService.createTemplate(tenantSlug, userId, body);
    reply.status(201).send(template);
  });

  app.put<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    const body = templateUpdateSchema.parse(request.body ?? {});
    const template = await searchService.updateTemplate(tenantSlug, userId, id, body);
    reply.send(template);
  });

  app.delete<{ Params: { id: string } }>('/templates/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    await searchService.deleteTemplate(tenantSlug, userId, id);
    reply.status(204).send();
  });

  app.get('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    const data = await searchService.getHistory(tenantSlug, userId, limit);
    reply.send({ data });
  });

  app.delete('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const deleted = await searchService.clearHistory(tenantSlug, userId);
    reply.send({ deleted });
  });

  app.get('/suggestions', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { q, limit } = suggestionsQuerySchema.parse(request.query ?? {});
    const data = await searchService.getSuggestions(tenantSlug, userId, q, limit);
    reply.send({ data });
  });

  app.get('/analytics', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { from, to, limit } = analyticsQuerySchema.parse(request.query ?? {});
    const analytics = await searchService.getAnalytics(tenantSlug, { from, to, limit });
    reply.send(analytics);
  });
}
