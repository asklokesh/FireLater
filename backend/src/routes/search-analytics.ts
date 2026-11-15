import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { getSearchAnalytics } from '../services/search/analytics.js';

export const ANALYTICS_PERMISSION = 'reports:read';

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export default async function searchAnalyticsRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [requirePermission(ANALYTICS_PERMISSION)],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { days } = analyticsQuerySchema.parse(request.query);
    return reply.send(await getSearchAnalytics(tenantSlug, days));
  });
}
