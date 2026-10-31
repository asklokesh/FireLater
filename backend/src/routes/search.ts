import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';
import { searchService, filterTemplateRepository } from '../services/search.js';
import { filterGroupSchema } from '../services/search-filters.js';

// ============================================
// SCHEMAS
// ============================================

const entityTypeSchema = z.enum(['issue', 'problem']);

export const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  entityType: entityTypeSchema.default('issue'),
  filter: z.string().max(20000).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchBodySchema = z.object({
  q: z.string().max(500).optional(),
  entityType: entityTypeSchema.default('issue'),
  filter: filterGroupSchema.optional(),
  page: z.number().int().min(1).max(10000).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

const facetsQuerySchema = z.object({
  q: z.string().max(500).optional(),
  entityType: entityTypeSchema.default('issue'),
});

const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const templateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  entityType: entityTypeSchema.default('issue'),
  query: z.string().max(500).optional(),
  filter: filterGroupSchema.optional(),
  isShared: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Parse the JSON `filter` query-string parameter into a validated filter tree. */
export function parseFilterParam(raw: string | undefined) {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestError('filter must be valid JSON');
  }
  const result = filterGroupSchema.safeParse(parsed);
  if (!result.success) {
    throw new BadRequestError(`Invalid filter: ${result.error.issues.map((i) => i.message).join('; ')}`);
  }
  return result.data;
}

function ctx(request: FastifyRequest): { tenantSlug: string; userId: string } {
  const { tenantSlug, userId } = request.user;
  return { tenantSlug, userId };
}

// ============================================
// ROUTE REGISTRATION
// ============================================

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /search?q=...&entityType=issue&filter={json}
  fastify.get('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const query = searchQuerySchema.parse(request.query);
    return searchService.search(tenantSlug, userId, {
      q: query.q,
      entityType: query.entityType,
      filter: parseFilterParam(query.filter),
      page: query.page,
      perPage: query.perPage,
    });
  });

  // POST /search with a structured filter body
  fastify.post('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const body = searchBodySchema.parse(request.body);
    return searchService.search(tenantSlug, userId, body);
  });

  fastify.get('/facets', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug } = ctx(request);
    const query = facetsQuerySchema.parse(request.query);
    return { facets: await searchService.getFacets(tenantSlug, query.entityType, query.q) };
  });

  fastify.get('/suggest', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const query = suggestQuerySchema.parse(request.query);
    return { suggestions: await searchService.suggest(tenantSlug, userId, query.q, query.limit) };
  });

  // Search history
  fastify.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const query = historyQuerySchema.parse(request.query);
    return { history: await searchService.getHistory(tenantSlug, userId, query.limit) };
  });

  fastify.delete('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    await searchService.clearHistory(tenantSlug, userId);
    return reply.status(204).send();
  });

  // Search analytics
  fastify.get('/analytics', { preHandler: [requirePermission('reports:read')] }, async (request) => {
    const { tenantSlug } = ctx(request);
    const query = analyticsQuerySchema.parse(request.query);
    return searchService.getSearchAnalytics(tenantSlug, query.days);
  });

  // Filter templates
  fastify.get('/templates', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const { entityType } = z.object({ entityType: entityTypeSchema.optional() }).parse(request.query);
    return { templates: await filterTemplateRepository.list(tenantSlug, userId, entityType) };
  });

  fastify.get('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const { id } = idParamSchema.parse(request.params);
    return filterTemplateRepository.loadTemplate(tenantSlug, userId, id);
  });

  fastify.post('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    const body = templateSchema.parse(request.body);
    const template = await filterTemplateRepository.saveTemplate(tenantSlug, userId, body);
    return reply.status(201).send(template);
  });

  fastify.put('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const { tenantSlug, userId } = ctx(request);
    const { id } = idParamSchema.parse(request.params);
    const body = templateSchema.partial().parse(request.body);
    return filterTemplateRepository.updateTemplate(tenantSlug, userId, id, body);
  });

  fastify.delete('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = ctx(request);
    const { id } = idParamSchema.parse(request.params);
    await filterTemplateRepository.deleteTemplate(tenantSlug, userId, id);
    return reply.status(204).send();
  });
}
