import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';
import { FILTER_FIELDS, FILTER_OPERATORS, type FilterNode } from '../services/search-filters.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);

const conditionSchema = z.object({
  field: z.enum(FILTER_FIELDS),
  operator: z.enum(FILTER_OPERATORS as [string, ...string[]]),
  value: z.union([scalar, z.array(scalar)]),
});

const filterSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.enum(['and', 'or']), conditions: z.array(filterSchema).min(1).max(50) }),
    conditionSchema,
  ])
) as z.ZodType<FilterNode>;

export const searchBodySchema = z.object({
  q: z.string().max(200).optional(),
  filter: filterSchema.optional(),
  sort: z.enum(['relevance', 'created_at', 'updated_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  facets: z.boolean().optional(),
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/', { preHandler: [requirePermission('issues:read')] }, async (request) => {
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;
    const body = searchBodySchema.parse(request.body ?? {});
    return searchService.search(tenantSlug, body);
  });
}
