import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchService, ENTITY_CONFIG, MAX_LIMIT, type SearchEntity, type FilterGroup } from '../services/search.js';
import { filterTemplateRepository, searchHistoryService } from '../services/search-filters.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const ENTITY_PERMISSIONS: Record<SearchEntity, string> = {
  issues: 'issues:read',
  problems: 'problems:read',
  changes: 'changes:read',
  requests: 'requests:read',
};

const entitySchema = z.enum(['issues', 'problems', 'changes', 'requests']);

const conditionSchema = z.object({
  field: z.string().min(1).max(64),
  op: z.enum(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte']),
  value: z.union([z.string().max(500), z.number(), z.array(z.union([z.string().max(500), z.number()])).max(100)]),
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([conditionSchema, filterGroupSchema])).max(50),
  })
);

// Query string: q (websearch syntax), simple field filters, or a JSON filter tree.
const searchQuerySchema = z.object({
  entity: entitySchema.default('issues'),
  q: z.string().max(500).optional(),
  status: z.string().max(200).optional(),
  priority: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  filters: z.string().max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const saveTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  entity: entitySchema,
  queryText: z.string().max(500).optional(),
  filters: filterGroupSchema.optional(),
  isShared: z.boolean().optional(),
});

function tenantOf(request: FastifyRequest): string {
  return (request.user as { tenantSlug: string }).tenantSlug;
}

function userOf(request: FastifyRequest): string {
  return (request.user as { userId: string }).userId;
}

/** Convert simple comma-separated params (status=new,assigned) into a filter tree ANDed with any JSON tree. */
export function toFilterGroup(input: z.infer<typeof searchQuerySchema>): FilterGroup | undefined {
  const conditions: FilterGroup['conditions'] = [];
  const fields = ENTITY_CONFIG[input.entity].fields;
  for (const key of ['status', 'priority', 'category'] as const) {
    const raw = input[key];
    if (!raw || !fields[key]) continue;
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
    if (values.length) conditions.push({ field: key, op: 'in', value: values });
  }
  if (input.filters) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.filters);
    } catch {
      throw new Error('INVALID_FILTERS');
    }
    const tree = filterGroupSchema.safeParse(parsed);
    if (!tree.success) throw new Error('INVALID_FILTERS');
    conditions.push(tree.data);
  }
  return conditions.length ? { logic: 'AND', conditions } : undefined;
}

function badRequest(reply: FastifyReply, message: string, details?: unknown) {
  return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message, details });
}

async function parseSearch(request: FastifyRequest, reply: FastifyReply) {
  const parsed = searchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    badRequest(reply, 'Invalid search query', parsed.error.flatten());
    return null;
  }
  await requirePermission(ENTITY_PERMISSIONS[parsed.data.entity])(request, reply);
  if (reply.sent) return null;
  let filters: FilterGroup | undefined;
  try {
    filters = toFilterGroup(parsed.data);
  } catch {
    badRequest(reply, 'filters must be a valid JSON filter group');
    return null;
  }
  return { ...parsed.data, filters };
}

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /search?entity=issues&q=...&status=new,assigned&filters={...}
  fastify.get('/search', async (request, reply) => {
    const params = await parseSearch(request, reply);
    if (!params) return reply;
    const started = Date.now();
    const result = await searchService.search(tenantOf(request), params);
    if (params.q && params.q.trim() && (params.offset ?? 0) === 0) {
      await searchHistoryService.recordSearch(tenantOf(request), userOf(request), {
        queryText: params.q,
        entity: params.entity,
        resultCount: result.total,
        durationMs: Date.now() - started,
      }).catch((err) => request.log.warn({ err }, 'Failed to record search history'));
    }
    return result;
  });

  // GET /search/facets: counts per status/priority/category for the same query
  fastify.get('/search/facets', async (request, reply) => {
    const params = await parseSearch(request, reply);
    if (!params) return reply;
    return { facets: await searchService.facets(tenantOf(request), params) };
  });

  // GET /search/suggest?prefix=...
  fastify.get('/search/suggest', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = z.object({ prefix: z.string().max(200).default(''), limit: z.coerce.number().int().min(1).max(20).optional() })
      .safeParse(request.query);
    if (!parsed.success) return badRequest(reply, 'Invalid suggest query', parsed.error.flatten());
    const user = userOf(request);
    const tenant = tenantOf(request);
    if (!parsed.data.prefix.trim()) {
      const recent = await searchHistoryService.getRecent(tenant, user, parsed.data.limit ?? 8);
      return { suggestions: recent.map((r) => r.query_text) };
    }
    return { suggestions: await searchHistoryService.suggest(tenant, user, parsed.data.prefix, parsed.data.limit ?? 8) };
  });

  // GET /search/history: the current user's recent searches
  fastify.get('/search/history', { preHandler: [authenticate] }, async (request) => {
    return { data: await searchHistoryService.getRecent(tenantOf(request), userOf(request), 20) };
  });

  // GET /search/analytics: popular and zero-result queries (admin only)
  fastify.get('/search/analytics', { preHandler: [requirePermission('admin:read')] }, async (request, reply) => {
    const parsed = z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).safeParse(request.query);
    if (!parsed.success) return badRequest(reply, 'Invalid analytics query', parsed.error.flatten());
    return searchHistoryService.getAnalytics(tenantOf(request), parsed.data.days ?? 30);
  });

  // Filter templates (saved filters), scoped by tenant_id and user
  fastify.get('/search/filter-templates', { preHandler: [authenticate] }, async (request) => {
    return { data: await filterTemplateRepository.listFilterTemplates(tenantOf(request), userOf(request)) };
  });

  fastify.get<{ Params: { id: string } }>('/search/filter-templates/:id', { preHandler: [authenticate] }, async (request) => {
    return filterTemplateRepository.loadFilterTemplate(tenantOf(request), userOf(request), request.params.id);
  });

  fastify.post('/search/filter-templates', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = saveTemplateSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'Invalid filter template', parsed.error.flatten());
    const tenant_id = tenantOf(request);
    const saved = await filterTemplateRepository.saveFilterTemplate(tenant_id, userOf(request), parsed.data);
    return reply.status(201).send(saved);
  });

  fastify.delete<{ Params: { id: string } }>('/search/filter-templates/:id', { preHandler: [authenticate] }, async (request, reply) => {
    await filterTemplateRepository.deleteFilterTemplate(tenantOf(request), userOf(request), request.params.id);
    return reply.status(204).send();
  });
}
