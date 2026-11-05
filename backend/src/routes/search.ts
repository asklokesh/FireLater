import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { searchTemplatesService } from '../services/searchTemplates.js';
import { searchHistoryService } from '../services/searchHistory.js';
import type { FilterGroup } from '../utils/searchFilterBuilder.js';

const filterNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().max(100),
      operator: z.string().max(20),
      value: z.unknown().optional(),
    }),
    z.object({
      op: z.enum(['AND', 'OR']),
      conditions: z.array(filterNodeSchema).max(25),
    }),
  ])
);

const filterSchema = z.object({
  op: z.enum(['AND', 'OR']),
  conditions: z.array(filterNodeSchema).max(25),
});

const templateBodySchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.string().min(1).max(50).optional(),
  query: z.string().max(200).nullable().optional(),
  filter: filterSchema.nullable().optional(),
  isShared: z.boolean().optional(),
});
const templateUpdateSchema = templateBodySchema.partial();
const idParamSchema = z.object({ id: z.string().uuid() });
const templateListQuerySchema = z.object({ entityType: z.string().max(50).optional() });
const historyQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const suggestQuerySchema = z.object({
  prefix: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.get('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { entityType } = templateListQuerySchema.parse(request.query ?? {});
    const data = await searchTemplatesService.list(tenantSlug, userId, entityType);
    reply.send({ data });
  });

  app.post('/templates', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = templateBodySchema.parse(request.body ?? {});
    const created = await searchTemplatesService.create(tenantSlug, userId, {
      ...body,
      filter: body.filter as FilterGroup | null | undefined,
    });
    reply.status(201).send(created);
  });

  app.get('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    reply.send(await searchTemplatesService.get(tenantSlug, userId, id));
  });

  app.put('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    const body = templateUpdateSchema.parse(request.body ?? {});
    const updated = await searchTemplatesService.update(tenantSlug, userId, id, {
      ...body,
      filter: body.filter as FilterGroup | null | undefined,
    });
    reply.send(updated);
  });

  app.delete('/templates/:id', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = idParamSchema.parse(request.params);
    await searchTemplatesService.delete(tenantSlug, userId, id);
    reply.status(204).send();
  });

  app.get('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    reply.send({ data: await searchHistoryService.listRecent(tenantSlug, userId, limit) });
  });

  app.delete('/history', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    await searchHistoryService.clear(tenantSlug, userId);
    reply.status(204).send();
  });

  app.get('/suggestions', { preHandler: [requirePermission('issues:read')] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { prefix, limit } = suggestQuerySchema.parse(request.query ?? {});
    reply.send({ data: await searchHistoryService.suggest(tenantSlug, userId, prefix, limit) });
  });
}
