import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { savedFilterService } from '../services/saved-filters.js';
import { requirePermission } from '../middleware/auth.js';

const entityTypeSchema = z.enum(['issues', 'problems', 'requests']);

const definitionSchema = z
  .record(z.unknown())
  .refine((d) => JSON.stringify(d).length <= 20000, {
    message: 'definition must be at most 20000 serialized characters',
  });

const listQuerySchema = z.object({
  entity_type: entityTypeSchema.optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: entityTypeSchema,
  definition: definitionSchema,
  isShared: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  definition: definitionSchema.optional(),
  isShared: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function savedFilterRoutes(app: FastifyInstance) {
  const guard = requirePermission('issues:read', 'problems:read', 'requests:read');

  app.get('/', { preHandler: [guard] }, async (request) => {
    const { tenantSlug, userId } = request.user;
    const { entity_type } = listQuerySchema.parse(request.query);
    return savedFilterService.list(tenantSlug, userId, entity_type);
  });

  app.post('/', { preHandler: [guard] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createSchema.parse(request.body);
    const created = await savedFilterService.create(tenantSlug, userId, body);
    return reply.status(201).send(created);
  });

  app.put('/:id', { preHandler: [guard] }, async (request) => {
    const { tenantSlug, userId, roles } = request.user;
    const { id } = idParamSchema.parse(request.params);
    const body = updateSchema.parse(request.body);
    return savedFilterService.update(tenantSlug, id, userId, (roles ?? []).includes('admin'), body);
  });

  app.delete('/:id', { preHandler: [guard] }, async (request, reply) => {
    const { tenantSlug, userId, roles } = request.user;
    const { id } = idParamSchema.parse(request.params);
    await savedFilterService.delete(tenantSlug, id, userId, (roles ?? []).includes('admin'));
    return reply.status(204).send();
  });
}
