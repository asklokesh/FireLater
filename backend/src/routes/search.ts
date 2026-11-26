import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
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
import { validate } from '../middleware/validation.js';
import {
  analyticsQuerySchema,
  entityTypeSchema,
  historyQuerySchema,
  idParamSchema,
  searchQuerySchema,
  suggestQuerySchema,
  templateSchema,
  type AnalyticsQueryInput,
  type HistoryQueryInput,
  type IdParamInput,
  type SearchQueryInput,
  type SuggestQueryInput,
  type TemplateInput,
  updateTemplateSchema,
  searchBodyDefaultSchema,
  type UpdateTemplateInput,
  type SearchBodyDefaultInput,
} from '../schemas/search.js';

// Any one of these grants access to search; results are then limited to the
// entity types the caller can actually read.
const SEARCH_READ_PERMISSIONS = SEARCH_ENTITY_TYPES.map((t) => SEARCH_ENTITIES[t].permission);
const ANALYTICS_PERMISSIONS = ['reports:read', 'admin:read'];









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
  app.get('/', {
    preHandler: [...searchGuard.preHandler, validate({ query: searchQuerySchema })],
  }, async (request, reply) => {
    const query = request.query as SearchQueryInput;
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
  app.post('/query', {
    preHandler: [...searchGuard.preHandler, validate({ body: searchBodyDefaultSchema })],
  }, async (request, reply) => {
    const body = request.body as SearchBodyDefaultInput;
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
  app.get('/suggest', {
    preHandler: [...searchGuard.preHandler, validate({ query: suggestQuerySchema })],
  }, async (request, reply) => {
    const query = request.query as SuggestQueryInput;
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
  app.get('/history', {
    preHandler: [...searchGuard.preHandler, validate({ query: historyQuerySchema })],
  }, async (request, reply) => {
    const query = request.query as HistoryQueryInput;
    const history = await searchService.getHistory(request.user.tenantSlug, request.user.userId, query.limit);
    reply.send({ data: history });
  });

  app.delete('/history', searchGuard, async (request, reply) => {
    const deleted = await searchService.clearHistory(request.user.tenantSlug, request.user.userId);
    reply.send({ deleted });
  });

  app.delete('/history/:id', {
    preHandler: [...searchGuard.preHandler, validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { id } = request.params as IdParamInput;
    await searchService.deleteHistoryEntry(request.user.tenantSlug, request.user.userId, id);
    reply.status(204).send();
  });

  // Saved search templates
  app.get('/templates', searchGuard, async (request, reply) => {
    const templates = await searchService.listTemplates(request.user.tenantSlug, request.user.userId);
    reply.send({ data: templates });
  });

  app.post('/templates', {
    preHandler: [...searchGuard.preHandler, validate({ body: templateSchema })],
  }, async (request, reply) => {
    const body = request.body as TemplateInput;
    const template = await searchService.createTemplate(request.user.tenantSlug, request.user.userId, body);
    reply.status(201).send(template);
  });

  app.get('/templates/:id', {
    preHandler: [...searchGuard.preHandler, validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { id } = request.params as IdParamInput;
    const template = await searchService.getTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.send(template);
  });

  app.patch('/templates/:id', {
    preHandler: [...searchGuard.preHandler, validate({ body: updateTemplateSchema, params: idParamSchema })],
  }, async (request, reply) => {
    const { id } = request.params as IdParamInput;
    const body = request.body as UpdateTemplateInput;
    const template = await searchService.updateTemplate(request.user.tenantSlug, request.user.userId, id, body);
    reply.send(template);
  });

  app.delete('/templates/:id', {
    preHandler: [...searchGuard.preHandler, validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { id } = request.params as IdParamInput;
    await searchService.deleteTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.status(204).send();
  });

  app.post('/templates/:id/use', {
    preHandler: [...searchGuard.preHandler, validate({ params: idParamSchema })],
  }, async (request, reply) => {
    const { id } = request.params as IdParamInput;
    const template = await searchService.useTemplate(request.user.tenantSlug, request.user.userId, id);
    reply.send(template);
  });

  // GET /v1/search/analytics?days=30  (tenant-wide, admin and report readers)
  app.get('/analytics', { preHandler: [requirePermission(...ANALYTICS_PERMISSIONS), validate({ query: analyticsQuerySchema })] }, async (request, reply) => {
    const query = request.query as AnalyticsQueryInput;
    const analytics = await searchService.getAnalytics(request.user.tenantSlug, query.days);
    reply.send(analytics);
  });
}
