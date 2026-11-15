import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { searchHistoryService } from '../services/search-history.js';

const recordSchema = z.object({
  query: z.string().trim().min(1).max(200),
  entityTypes: z.array(z.string()).optional(),
  resultCount: z.number().int().min(0),
  tookMs: z.number().int().optional(),
});
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const suggestSchema = z.object({
  prefix: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});
const analyticsSchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

const readGuard = requirePermission('issues:read', 'problems:read', 'requests:read', 'kb:read');

export default async function searchHistoryRoutes(app: FastifyInstance) {
  app.post('/history', { preHandler: [readGuard] }, async (request, reply) => {
    const body = recordSchema.parse(request.body);
    const { tenantSlug, userId } = request.user;
    await searchHistoryService.record(tenantSlug, userId, body);
    reply.status(201).send({ success: true });
  });

  app.get('/history', { preHandler: [readGuard] }, async (request, reply) => {
    const { limit } = listSchema.parse(request.query);
    const { tenantSlug, userId } = request.user;
    const data = await searchHistoryService.listRecent(tenantSlug, userId, limit);
    reply.send({ data });
  });

  app.delete('/history', { preHandler: [readGuard] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await searchHistoryService.clear(tenantSlug, userId);
    reply.status(204).send();
  });

  app.get('/suggestions', { preHandler: [readGuard] }, async (request, reply) => {
    const { prefix, limit } = suggestSchema.parse(request.query);
    const { tenantSlug, userId } = request.user;
    const data = await searchHistoryService.suggest(tenantSlug, userId, prefix, limit);
    reply.send({ data });
  });

  app.get('/analytics', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { days } = analyticsSchema.parse(request.query);
    const { tenantSlug } = request.user;
    reply.send(await searchHistoryService.analytics(tenantSlug, days));
  });
}
