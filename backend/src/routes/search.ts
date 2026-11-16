import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { searchService, SEARCH_ENTITIES, ENTITY_PERMISSIONS, MAX_PER_PAGE, MAX_QUERY_LENGTH } from '../services/search.js';
import { searchHistoryService } from '../services/search-history.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

const entityEnum = z.enum(['issues', 'problems', 'requests', 'kb']);

const postSchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  entities: z.array(entityEnum).optional(),
  filter: z.unknown().optional(),
  sort: z.enum(['rank', 'date']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  facets: z.array(z.string().max(50)).max(10).optional(),
});

const csv = (v?: string): string[] | undefined =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

const getSchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  entities: z.string().optional(),
  facets: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
});

async function effectivePermissions(request: FastifyRequest): Promise<string[]> {
  const { userId, tenantSlug, roles } = request.user;
  if (roles.includes('admin')) return Object.values(ENTITY_PERMISSIONS);
  let perms = await authService.getCachedPermissions(userId, tenantSlug);
  if (!perms) {
    perms = await authService.getUserPermissions(userId, tenantService.getSchemaName(tenantSlug));
  }
  return perms;
}

interface RunInput {
  q: string;
  entities?: string[];
  filter?: unknown;
  sort?: 'rank' | 'date';
  page?: number;
  perPage?: number;
  facets?: string[];
}

async function run(request: FastifyRequest, reply: FastifyReply, input: RunInput) {
  const { userId, tenantSlug } = request.user;
  const permissions = await effectivePermissions(request);
  const allowed = searchService.permittedEntities(permissions, false, input.entities);
  if (searchService.permittedEntities(permissions).length === 0) {
    throw new ForbiddenError('You do not have permission to search');
  }
  const started = Date.now();
  let response;
  try {
    response = await searchService.search({ tenantSlug, userId, permissions, ...input });
  } catch (err) {
    if (err instanceof BadRequestError) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
    throw err;
  }
  if (input.q.trim()) {
    const total = Object.values(response.results).reduce((s, r) => s + (r?.total ?? 0), 0);
    await searchHistoryService.record({
      tenantSlug,
      userId,
      query: input.q,
      entity: allowed.join(','),
      filter: input.filter,
      resultCount: total,
      durationMs: Date.now() - started,
    });
  }
  return response;
}

export default async function searchRoutes(app: FastifyInstance) {
  const anyRead = requirePermission(...SEARCH_ENTITIES.map((e) => ENTITY_PERMISSIONS[e]));

  app.get('/', { preHandler: [anyRead] }, async (request, reply) => {
    const parsed = getSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    const { q, entities, facets, page, perPage } = parsed.data;
    return run(request, reply, { q, entities: csv(entities), facets: csv(facets), page, perPage });
  });

  app.post('/', { preHandler: [anyRead] }, async (request, reply) => {
    const parsed = postSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    return run(request, reply, parsed.data);
  });

  app.get('/history', { preHandler: [anyRead] }, async (request) => {
    const { userId, tenantSlug } = request.user;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(20).catch(10).optional() }).parse(request.query);
    return { data: await searchHistoryService.recent(tenantSlug, userId, limit ?? 10) };
  });

  app.delete('/history', { preHandler: [anyRead] }, async (request) => {
    const { userId, tenantSlug } = request.user;
    const deleted = await searchHistoryService.clear(tenantSlug, userId);
    return { deleted };
  });

  app.get('/suggestions', { preHandler: [anyRead] }, async (request) => {
    const { userId, tenantSlug } = request.user;
    const { prefix } = z.object({ prefix: z.string().max(MAX_QUERY_LENGTH).optional().default('') }).parse(request.query);
    return { data: await searchHistoryService.suggestions(tenantSlug, userId, prefix) };
  });
}
