import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { search, getFacets } from '../services/search.js';
import { buildFilterClause, type FilterGroup } from '../lib/search-query.js';

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
      search(tenantSlug, params),
      getFacets(tenantSlug, params),
    ]);
    reply.send({ results, total, facets });
  });
}
