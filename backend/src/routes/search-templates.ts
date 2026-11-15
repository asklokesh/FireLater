import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { filterGroupSchema } from '../services/search/filter-builder.js';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/search/templates.js';

export const TEMPLATES_PERMISSION = 'issues:read';

export const templateDefinitionSchema = z.object({
  q: z.string().max(500).optional(),
  filter: filterGroupSchema.optional(),
  sort: z.enum(['relevance', 'created_at', 'updated_at', 'priority', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const createTemplateBodySchema = z.object({
  name: z.string().min(1).max(100),
  definition: templateDefinitionSchema,
  isShared: z.boolean().optional(),
});

export const updateTemplateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  definition: templateDefinitionSchema.optional(),
  isShared: z.boolean().optional(),
});

export const templateIdParamsSchema = z.object({ id: z.string().uuid() });

export default async function searchTemplateRoutes(app: FastifyInstance) {
  const pre = [requirePermission(TEMPLATES_PERMISSION)];

  app.get('/', { preHandler: pre }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const data = await listTemplates(tenantSlug, userId);
    return reply.send({ data });
  });

  app.post('/', { preHandler: pre }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createTemplateBodySchema.parse(request.body ?? {});
    const row = await createTemplate(tenantSlug, userId, body);
    return reply.status(201).send(row);
  });

  app.put('/:id', { preHandler: pre }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = templateIdParamsSchema.parse(request.params);
    const body = updateTemplateBodySchema.parse(request.body ?? {});
    const row = await updateTemplate(tenantSlug, userId, id, body);
    return reply.send(row);
  });

  app.delete('/:id', { preHandler: pre }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = templateIdParamsSchema.parse(request.params);
    await deleteTemplate(tenantSlug, userId, id);
    return reply.status(204).send();
  });
}
