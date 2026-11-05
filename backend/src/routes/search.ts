import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchService } from '../services/search.js';
import { requirePermission } from '../middleware/auth.js';
import { filterSchema } from '../utils/search-query-builder.js';

const templateBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  entityType: z.string().min(1).max(50).optional(),
  query: z.string().max(200).nullable().optional(),
  filter: filterSchema.nullable().optional(),
  isShared: z.boolean().optional(),
});
const templateUpdate = templateBody.partial();
const idParams = z.object({ id: z.string().uuid() });

function bad(reply: import('fastify').FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Bad Request',
    message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  });
}

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/templates', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    return reply.send({ data: await searchService.listTemplates(tenantSlug, userId) });
  });

  app.post('/templates', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const parsed = templateBody.safeParse(request.body ?? {});
    if (!parsed.success) return bad(reply, parsed.error);
    const tpl = await searchService.createTemplate(tenantSlug, userId, parsed.data);
    return reply.status(201).send(tpl);
  });

  app.get('/templates/:id', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const p = idParams.safeParse(request.params);
    if (!p.success) return bad(reply, p.error);
    return reply.send(await searchService.getTemplate(tenantSlug, userId, p.data.id));
  });

  app.put('/templates/:id', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const p = idParams.safeParse(request.params);
    if (!p.success) return bad(reply, p.error);
    const parsed = templateUpdate.safeParse(request.body ?? {});
    if (!parsed.success) return bad(reply, parsed.error);
    return reply.send(await searchService.updateTemplate(tenantSlug, userId, p.data.id, parsed.data));
  });

  app.delete('/templates/:id', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const p = idParams.safeParse(request.params);
    if (!p.success) return bad(reply, p.error);
    await searchService.deleteTemplate(tenantSlug, userId, p.data.id);
    return reply.status(204).send();
  });

  app.get('/history', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })
      .safeParse(request.query ?? {});
    if (!parsed.success) return bad(reply, parsed.error);
    return reply.send({ data: await searchService.getHistory(tenantSlug, userId, parsed.data.limit) });
  });

  app.delete('/history', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const deleted = await searchService.clearHistory(tenantSlug, userId);
    return reply.send({ deleted });
  });

  app.get('/suggestions', async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const parsed = z.object({ q: z.string().trim().min(1).max(200) }).safeParse(request.query ?? {});
    if (!parsed.success) return bad(reply, parsed.error);
    return reply.send({ data: await searchService.getSuggestions(tenantSlug, userId, parsed.data.q) });
  });

  app.get('/analytics', {
    preHandler: [requirePermission('reports:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const parsed = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .safeParse(request.query ?? {});
    if (!parsed.success) return bad(reply, parsed.error);
    return reply.send(await searchService.getAnalytics(tenantSlug, parsed.data.days));
  });
}
