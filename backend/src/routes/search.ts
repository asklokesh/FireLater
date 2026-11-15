import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService, type FilterGroup } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';
import { createPaginatedResponse, paginationSchema } from '../utils/pagination.js';

export const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  filters: z
    .string()
    .max(10000)
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val === '') return undefined;
      try {
        return JSON.parse(val) as FilterGroup;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters must be valid JSON' });
        return z.NEVER;
      }
    }),
  page: paginationSchema.shape.page,
  per_page: paginationSchema.shape.per_page,
});

export const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = searchQuerySchema.parse(request.query);
    const pagination = { page: query.page, perPage: query.per_page };

    const result = await searchService.search(tenantSlug, pagination, {
      q: query.q,
      filters: query.filters,
    });

    reply.send({
      ...createPaginatedResponse(result.issues, result.total, pagination),
      facets: result.facets,
    });
  });

  app.get('/suggest', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { q } = suggestQuerySchema.parse(request.query);
    const data = await searchService.suggest(tenantSlug, q);
    reply.send({ data });
  });
}
