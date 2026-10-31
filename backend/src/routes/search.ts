import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { searchService, filterTemplateRepository } from '../services/search.js';
import { FilterGroup, FilterValidationError } from '../services/search-filters.js';
import { BadRequestError } from '../utils/errors.js';

const conditionSchema = z.object({
  field: z.string().max(64),
  op: z.enum(['eq', 'neq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null']),
  value: z.unknown().optional(),
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([conditionSchema, filterGroupSchema])).max(50),
  })
) as z.ZodType<FilterGroup>;

const searchBodySchema = z.object({
  q: z.string().max(500).optional(),
  filterGroup: filterGroupSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  query: z.string().max(500).optional(),
  filterGroup: filterGroupSchema.optional(),
  isShared: z.boolean().optional(),
});

function rethrowFilterError(err: unknown): never {
  if (err instanceof FilterValidationError) throw new BadRequestError(err.message);
  throw err;
}

export default async function searchRoutes(app: FastifyInstance) {
  // GET /v1/search?q=printer status:new
  app.get('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const params = searchBodySchema.parse(request.query);
    return searchService.search(tenantSlug, userId, params).catch(rethrowFilterError);
  });

  // POST /v1/search with a JSON filterGroup
  app.post('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const params = searchBodySchema.parse(request.body);
    return searchService.search(tenantSlug, userId, params).catch(rethrowFilterError);
  });

  app.post('/facets', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug } = request.user;
    const params = searchBodySchema.parse(request.body ?? {});
    return { facets: await searchService.facets(tenantSlug, params).catch(rethrowFilterError) };
  });

  app.get('/suggest', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const { prefix } = z.object({ prefix: z.string().max(200).default('') }).parse(request.query);
    return searchService.suggest(tenantSlug, userId, prefix);
  });

  app.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    return { data: await searchService.searchHistory(tenantSlug, userId) };
  });

  app.delete('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await searchService.clearHistory(tenantSlug, userId);
    return reply.status(204).send();
  });

  app.get('/templates', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    return { data: await filterTemplateRepository.list(tenantSlug, userId) };
  });

  app.post('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = templateSchema.parse(request.body);
    const template = await filterTemplateRepository.saveTemplate(tenantSlug, userId, body).catch(rethrowFilterError);
    return reply.status(201).send(template);
  });

  app.get<{ Params: { id: string } }>('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    return filterTemplateRepository.loadTemplate(tenantSlug, userId, request.params.id);
  });

  app.delete<{ Params: { id: string } }>('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await filterTemplateRepository.deleteTemplate(tenantSlug, userId, request.params.id);
    return reply.status(204).send();
  });

  app.get('/analytics', { preHandler: [requirePermission('reports:read')] }, async (request) => {
    const { tenantSlug } = request.user;
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
    return searchService.analytics(tenantSlug, days);
  });
}
