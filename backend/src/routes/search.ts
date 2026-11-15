import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService, type FilterGroup } from '../services/search.js';
import { searchTemplateService, templateCreateSchema, templateUpdateSchema } from '../services/searchTemplates.js';
import { searchHistoryService, MAX_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT } from '../services/searchHistory.js';
import { searchAnalyticsService } from '../services/searchAnalytics.js';
import { requirePermission } from '../middleware/auth.js';
import { createPaginatedResponse, paginationSchema } from '../utils/pagination.js';

export const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  filters: z
    .string()
    .max(10000)
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val === '') return undefined;
      try {
        return JSON.parse(val) as FilterGroup;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters must be valid JSON' });
        return z.NEVER;
      }
    }),
  page: paginationSchema.shape.page,
  per_page: paginationSchema.shape.per_page,
});

export const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const templateIdParamsSchema = z.object({ id: z.string().uuid() });

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_LIMIT).default(DEFAULT_HISTORY_LIMIT),
});

export const analyticsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .transform((v) => {
    const to = v.to ?? new Date();
    const from = v.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  })
  .refine((v) => v.from <= v.to, { message: 'from must be before to' });

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = searchQuerySchema.parse(request.query);
    const pagination = { page: query.page, perPage: query.per_page };

    const result = await searchService.search(tenantSlug, pagination, {
      q: query.q,
      filters: query.filters,
    });

    // Non-fatal: record() logs and swallows its own failures
    try {
      await searchHistoryService.record(tenantSlug, request.user.userId, {
        query: query.q,
        filters: query.filters,
        resultCount: result.total,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to record search history');
    }

    reply.send({
      ...createPaginatedResponse(result.issues, result.total, pagination),
      facets: result.facets,
    });
  });

  app.get('/suggest', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { q } = suggestQuerySchema.parse(request.query);
    const data = await searchService.suggest(tenantSlug, q);
    reply.send({ data });
  });

  app.get('/templates', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = await searchTemplateService.list(tenantSlug, userId);
    reply.send({ data });
  });

  app.post('/templates', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = templateCreateSchema.parse(request.body);
    const data = await searchTemplateService.create(tenantSlug, userId, body);
    reply.status(201).send(data);
  });

  app.get('/templates/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = templateIdParamsSchema.parse(request.params);
    reply.send(await searchTemplateService.get(tenantSlug, userId, id));
  });

  app.put('/templates/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = templateIdParamsSchema.parse(request.params);
    const body = templateUpdateSchema.parse(request.body);
    reply.send(await searchTemplateService.update(tenantSlug, userId, id, body));
  });

  app.delete('/templates/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = templateIdParamsSchema.parse(request.params);
    await searchTemplateService.delete(tenantSlug, userId, id);
    reply.status(204).send();
  });

  app.get('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { limit } = historyQuerySchema.parse(request.query);
    const data = await searchHistoryService.recent(tenantSlug, userId, limit);
    reply.send({ data });
  });

  app.delete('/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await searchHistoryService.clear(tenantSlug, userId);
    reply.status(204).send();
  });

  app.get('/analytics', {
    preHandler: [requirePermission('admin:read', 'reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const range = analyticsQuerySchema.parse(request.query);
    reply.send(await searchAnalyticsService.getAnalytics(tenantSlug, range));
  });
}
