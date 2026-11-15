import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { search, getFacets } from '../services/search.js';
import { buildFilterClause, type FilterGroup } from '../lib/search-query.js';
import {
  createTemplate, listTemplates, updateTemplate, deleteTemplate,
  recentSearches, clearHistory, suggest, getAnalytics,
} from '../services/search-tracking.js';

export const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  entity: z.enum(['issues', 'problems']).default('issues'),
  filters: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      try {
        return JSON.parse(v) as FilterGroup;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters must be valid JSON' });
        return z.NEVER;
      }
    }),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']).optional(),
    conditions: z.array(
      z.union([
        z.object({ field: z.string(), op: z.string(), value: z.unknown().optional() }),
        filterGroupSchema,
      ])
    ),
  })
) as z.ZodType<FilterGroup>;

const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  entity: z.enum(['issues', 'problems']).default('issues'),
  query: z.string().max(200).nullable().optional(),
  filter: filterGroupSchema.nullable().optional(),
  isShared: z.boolean().optional(),
});
const templateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  entity: z.enum(['issues', 'problems']).optional(),
  query: z.string().max(200).nullable().optional(),
  filter: filterGroupSchema.nullable().optional(),
  isShared: z.boolean().optional(),
});
const idParamSchema = z.object({ id: z.string().uuid() });
const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const suggestSchema = z.object({
  prefix: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const analyticsSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = searchQuerySchema.parse(request.query);
    if (query.entity === 'problems') {
      await requirePermission('problems:read')(request, reply);
    }
    // Validates fields/ops/depth (throws ValidationError) before touching the database
    buildFilterClause(query.entity, query.filters);

    const params = {
      q: query.q,
      entity: query.entity,
      filters: query.filters,
      page: query.page,
      perPage: query.per_page,
    };
    const [{ results, total }, facets] = await Promise.all([
      search(tenantSlug, { ...params, userId: request.user.userId }),
      getFacets(tenantSlug, params),
    ]);
    reply.send({ results, total, facets });
  });

  // ---- Saved filter templates ----
  app.get('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    reply.send({ data: await listTemplates(tenantSlug, userId) });
  });

  app.post('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = templateCreateSchema.parse(request.body);
    reply.status(201).send(await createTemplate(tenantSlug, userId, body));
  });

  app.put('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    const body = templateUpdateSchema.parse(request.body);
    reply.send(await updateTemplate(tenantSlug, userId, id, body));
  });

  app.delete('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    await deleteTemplate(tenantSlug, userId, id);
    reply.status(204).send();
  });

  // ---- History, suggestions, analytics ----
  app.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { limit } = limitSchema.parse(request.query);
    reply.send({ data: await recentSearches(tenantSlug, userId, limit) });
  });

  app.delete('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await clearHistory(tenantSlug, userId);
    reply.status(204).send();
  });

  app.get('/suggestions', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { prefix, limit } = suggestSchema.parse(request.query);
    reply.send({ data: await suggest(tenantSlug, userId, prefix, limit) });
  });

  app.get('/analytics', { preHandler: [requirePermission('admin:read')] }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { days } = analyticsSchema.parse(request.query);
    reply.send(await getAnalytics(tenantSlug, days));
  });
}
