import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { FilterGroupSchema } from '../lib/filter-builder.js';
import { searchService, SEARCH_TYPES, MAX_PER_PAGE, type SearchType } from '../services/search.js';

const csv = (allowed?: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .refine((arr) => !arr || !allowed || arr.every((x) => allowed.includes(x)), { message: 'Invalid value in list' });

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  types: csv(SEARCH_TYPES),
  status: csv(),
  priority: csv(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(20),
});

const advancedSchema = z.object({
  entityType: z.enum(['issues', 'problems', 'requests']),
  filter: FilterGroupSchema,
  q: z.string().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(25),
});

const TYPE_PERMISSION: Record<SearchType, string> = {
  issue: 'issues:read',
  problem: 'problems:read',
  request: 'requests:read',
  kb: 'kb:read',
};

async function getPermissions(request: FastifyRequest, reply: FastifyReply): Promise<string[] | 'all'> {
  await authenticate(request, reply);
  if (request.user.roles.includes('admin')) return 'all';
  const { userId, tenantSlug } = request.user;
  let perms = await authService.getCachedPermissions(userId, tenantSlug);
  if (!perms) {
    perms = await authService.getUserPermissions(userId, tenantService.getSchemaName(tenantSlug));
    await authService.cacheUserPermissions(userId, tenantSlug, perms);
  }
  return perms;
}

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const perms = await getPermissions(request, reply);
    const query = searchQuerySchema.parse(request.query);
    const readable = SEARCH_TYPES.filter((t) => perms === 'all' || perms.includes(TYPE_PERMISSION[t]));
    if (readable.length === 0) throw new ForbiddenError('You do not have permission to search');
    const requested = (query.types ?? [...SEARCH_TYPES]) as SearchType[];
    const types = requested.filter((t) => readable.includes(t));
    return searchService.search(request.user.tenantSlug, {
      q: query.q,
      types,
      status: query.status,
      priority: query.priority,
      page: query.page,
      perPage: query.per_page,
    });
  });

  app.post('/query', async (request, reply) => {
    const perms = await getPermissions(request, reply);
    const parsed = advancedSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid search query: ' + parsed.error.issues.map((i) => i.message).join('; '));
    }
    const body = parsed.data;
    const perm = { issues: 'issues:read', problems: 'problems:read', requests: 'requests:read' }[body.entityType];
    if (perms !== 'all' && !perms.includes(perm)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
    return searchService.advancedQuery(request.user.tenantSlug, body);
  });
}
