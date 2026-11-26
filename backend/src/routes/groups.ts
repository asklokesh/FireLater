import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { groupService } from '../services/groups.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { createGroupSchema, updateGroupSchema, addMemberSchema, groupIdParamSchema, groupMemberParamSchema, listGroupsQuerySchema } from '../schemas/groups.js';

// Parameter validation schemas

// Query parameter validation schema

export default async function groupRoutes(app: FastifyInstance) {
  // List groups
  app.get('/', {
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listGroupsQuerySchema.parse(query);
    const pagination = parsePagination(query);

    const filters = {
      type: validatedQuery.type,
      search: validatedQuery.search || validatedQuery.q,
    };

    const { groups, total } = await groupService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(groups, total, pagination));
  });

  // Get group by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof groupIdParamSchema>;

    const group = await groupService.findById(tenantSlug, id);

    if (!group) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Group with id '${id}' not found`,
      });
    }

    reply.send(group);
  });

  // Create group
  app.post('/', {
    preHandler: [requirePermission('groups:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createGroupSchema>;

    const group = await groupService.create(tenantSlug, body, userId);
    reply.status(201).send(group);
  });

  // Update group
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('groups:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof groupIdParamSchema>;
    const body = request.body as z.infer<typeof updateGroupSchema>;

    const group = await groupService.update(tenantSlug, id, body, userId);
    reply.send(group);
  });

  // Delete group
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('groups:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof groupIdParamSchema>;

    await groupService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get group members
  app.get<{ Params: { id: string } }>('/:id/members', {
    preHandler: [requirePermission('groups:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof groupIdParamSchema>;

    const members = await groupService.getMembers(tenantSlug, id);
    reply.send({ data: members });
  });

  // Add member to group
  app.post<{ Params: { id: string } }>('/:id/members', {
    preHandler: [requirePermission('groups:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof groupIdParamSchema>;
    const body = request.body as z.infer<typeof addMemberSchema>;

    await groupService.addMember(tenantSlug, id, body.userId, body.role, userId);
    reply.status(201).send({ message: 'Member added successfully' });
  });

  // Remove member from group
  app.delete<{ Params: { id: string; userId: string } }>('/:id/members/:userId', {
    preHandler: [requirePermission('groups:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const params = request.params as z.infer<typeof groupMemberParamSchema>;

    await groupService.removeMember(tenantSlug, params.id, params.userId, userId);
    reply.status(204).send();
  });
}
