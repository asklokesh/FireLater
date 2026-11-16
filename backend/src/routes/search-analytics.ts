import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { searchAnalyticsService } from '../services/search-analytics.js';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export default async function searchAnalyticsRoutes(app: FastifyInstance) {
  app.get('/analytics', { preHandler: [requirePermission('admin:read')] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    return searchAnalyticsService.get(request.user.tenantSlug, parsed.data.days, parsed.data.limit);
  });
}
