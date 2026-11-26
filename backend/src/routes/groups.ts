import { FastifyInstance } from 'fastify';
import { groupService } from '../services/groups.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  addMemberSchema,
  createGroupSchema,
  groupIdParamSchema,
  groupMemberParamSchema,
  listGroupsQuerySchema,
  updateGroupSchema,
  type AddMemberInput,
  type CreateGroupInput,
  type GroupIdParamInput,
  type GroupMemberParamInput,
  type UpdateGroupInput,
  type ListGroupsQueryInput,
} from '../schemas/groups.js';




// Parameter validation schemas


// Query parameter validation schema

export default async function groupRoutes(app: FastifyInstance) {
  // List groups
  app.get('/', {
    preHandler: [requirePermission('groups:read'), validate({ query: listGroupsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListGroupsQueryInput;
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
    preHandler: [requirePermission('groups:read'), validate({ params: groupIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as GroupIdParamInput;

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
    preHandler: [requirePermission('groups:create'), validate({ body: createGroupSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateGroupInput;

    const group = await groupService.create(tenantSlug, body, userId);
    reply.status(201).send(group);
  });

  // Update group
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('groups:update'), validate({ params: groupIdParamSchema, body: updateGroupSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as GroupIdParamInput;
    const body = request.body as UpdateGroupInput;

    const group = await groupService.update(tenantSlug, id, body, userId);
    reply.send(group);
  });

  // Delete group
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('groups:delete'), validate({ params: groupIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as GroupIdParamInput;

    await groupService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get group members
  app.get<{ Params: { id: string } }>('/:id/members', {
    preHandler: [requirePermission('groups:read'), validate({ params: groupIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as GroupIdParamInput;

    const members = await groupService.getMembers(tenantSlug, id);
    reply.send({ data: members });
  });

  // Add member to group
  app.post<{ Params: { id: string } }>('/:id/members', {
    preHandler: [requirePermission('groups:update'), validate({ params: groupIdParamSchema, body: addMemberSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as GroupIdParamInput;
    const body = request.body as AddMemberInput;

    await groupService.addMember(tenantSlug, id, body.userId, body.role, userId);
    reply.status(201).send({ message: 'Member added successfully' });
  });

  // Remove member from group
  app.delete<{ Params: { id: string; userId: string } }>('/:id/members/:userId', {
    preHandler: [requirePermission('groups:update'), validate({ params: groupMemberParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const params = request.params as GroupMemberParamInput;

    await groupService.removeMember(tenantSlug, params.id, params.userId, userId);
    reply.status(204).send();
  });
}
