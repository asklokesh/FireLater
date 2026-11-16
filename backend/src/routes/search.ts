import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchService, MAX_PER_PAGE } from '../services/search.js';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { requirePermission } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';
import {
  SEARCH_ENTITIES,
  SEARCH_ENTITY_TYPES,
  allowedEntityTypes,
  type SearchEntityType,
} from '../lib/search/entities.js';
import { FILTER_OPERATORS, filterGroupSchema, type FilterGroup } from '../lib/search/filters.js';
import { MAX_QUERY_LENGTH } from '../lib/search/query-parser.js';

// Any one of these grants access to search; results are then limited to the
// entity types the caller can actually read.
const SEARCH_READ_PERMISSIONS = SEARCH_ENTITY_TYPES.map((t) => SEARCH_ENTITIES[t].permission);
const ANALYTICS_PERMISSIONS = ['reports:read', 'admin:read'];

const entityTypeSchema = z.enum(SEARCH_ENTITY_TYPES as [SearchEntityType, ...SearchEntityType[]]);
const sortSchema = z.enum(['relevance', 'updated', 'created']);

const searchBodySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional(),
  filters: filterGroupSchema.nullable().optional(),
  entityTypes: z.array(entityTypeSchema).max(SEARCH_ENTITY_TYPES.length).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  sort: sortSchema.optional(),
});

const searchQuerySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional(),
  types: z.string().max(200).optional(),
  filters: z.string().max(10000).optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  sort: sortSchema.optional(),
});

const suggestQuerySchema = z.object({
  q: z.string().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  queryText: z.string().max(MAX_QUERY_LENGTH).optional(),
  filters: filterGroupSchema.nullable().optional(),
  entityTypes: z.array(entityTypeSchema).max(SEARCH_ENTITY_TYPES.length).optional(),
  isShared: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

function parseTypes(raw: string | undefined): SearchEntityType[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  return z.array(entityTypeSchema).parse(values);
}

function parseFiltersParam(raw: string | undefined): FilterGroup | undefined {
  if (!raw) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BadRequestError('filters must be valid JSON');
  }
  return filterGroupSchema.parse(json);
}

/** Resolves which entity types the authenticated user may search. */
export async function resolveAllowedTypes(request: FastifyRequest): Promise<SearchEntityType[]> {
  const { userId, tenantSlug, roles } = request.user;
  const isAdmin = roles?.includes('admin') ?? false;
  if (isAdmin) return allowedEntityTypes([], true);

  let permissions = await authService.getCachedPermissions(userId, tenantSlug);
  if (!permissions) {
    permissions = await authService.getUserPermissions(userId, tenantService.getSchemaName(tenantSlug));
    await authService.cacheUserPermissions(userId, tenantSlug, permissions);
  }
  return allowedEntityTypes(permissions, false);
}

export default async function searchRoutes(app: FastifyInstance) {
  const searchGuard = { preHandler: [requirePermission(...SEARCH_READ_PERMISSIONS)] };

  // GET /v1/search?q=...&types=issue,problem&filters={json}&page=1&per_page=20&sort=relevance
  app.get('/', searchGuard, async (request, reply) => {
    const query = searchQuerySchema.parse(request.query);
    const allowedTypes = await resolveAllowedTypes(request);
    const result = await searchService.search(
      request.user.tenantSlug,
      { userId: request.user.userId, allowedTypes },
      {
        q: query.q,
        entityTypes: parseTypes(query.types),
        filters: parseFiltersParam(query.filters),
        page: query.page,
        perPage: query.per_page,
        sort: query.sort,
      }
    );
    reply.send(result);
  });

  // POST /v1/search/query  (same as GET, for large filter trees)
  app.post('/query', searchGuard, async (request, reply) => {
    const body = searchBodySchema.parse(request.body ?? {});
    const allowedTypes = await resolveAllowedTypes(request);
    const result = await searchService.search(
      request.user.tenantSlug,
      { userId: request.user.userId, allowedTypes },
      body
    );
    reply.send(result);
  });

  // GET /v1/search/fields  (filter builder metadata for the caller)
  app.get('/fields', searchGuard, async (request, reply) => {
    const allowedTypes = await resolveAllowedTypes(request);
    reply.send({
      operators: FILTER_OPERATORS,
      entities: allowedTypes.map((type) => ({
        type,
        fields: Object.entries(SEARCH_ENTITIES[type].fields).map(([name, def]) => ({ name, type: def.type })),
      })),
    });
  });

  // GET /v1/search/suggest?q=pass  (autocomplete)
  app.get('/suggest', searchGuard, async (request, reply) => {
    const query = suggestQuerySchema.parse(request.query);
    const allowedTypes = await resolveAllowedTypes(request);
    const suggestions = await searchService.suggest(
      request.user.tenantSlug,
      { userId: request.user.userId, allowedTypes },
      query.q,
      query.limit
    );
    reply.send(suggestions);
  });

  // Search history (always scoped to the calling user)
  app.get('/history', searchGuard, async (request, reply) => {
    const query = historyQuerySchema.parse(request.query);
    const history = await searchService.getHistory(request.user.tenantSlug, request.user.userId, query.limit);
    reply.send({ data: history });
  });

  app.delete('/history', searchGuard, async (request, reply) => {
    const deleted = await searchService.clearHistory(request.user.tenantSlug, request.user.userId);
    reply.send({ deleted });
  });

  app.delete('/history/:id', searchGuard, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await searchService.deleteHistoryEntry(request.user.tenantSlug, request.user.userId, id);
    reply.status(204).send();
  });

  // Saved search templates
  app.get('/templates', searchGuard, async (request, reply) => {
    const templates = await searchService.listTemplates(request.user.tenantSlug, request.user.userId);
    reply.send({ data: templates });
  });

  app.post('/templates', searchGuard, async (request, reply) => {
    const body = templateSchema.parse(request.body);
    const template = await searchService.createTemplate(request.user.tenantSlug, request.user.userId, body);
    reply.status(201).send(template);
  });

  app.get('/templates/:id', searchGuard, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const template = await searchService.getTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.send(template);
  });

  app.patch('/templates/:id', searchGuard, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = templateSchema.partial().parse(request.body);
    const template = await searchService.updateTemplate(request.user.tenantSlug, request.user.userId, id, body);
    reply.send(template);
  });

  app.delete('/templates/:id', searchGuard, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await searchService.deleteTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.status(204).send();
  });

  app.post('/templates/:id/use', searchGuard, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const template = await searchService.useTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.send(template);
  });

  // GET /v1/search/analytics?days=30  (tenant-wide, admin and report readers)
  app.get('/analytics', { preHandler: [requirePermission(...ANALYTICS_PERMISSIONS)] }, async (request, reply) => {
    const query = analyticsQuerySchema.parse(request.query);
    const analytics = await searchService.getAnalytics(request.user.tenantSlug, query.days);
    reply.send(analytics);
  });
}
