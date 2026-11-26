import { FastifyInstance } from 'fastify';
import { userService } from '../services/users.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  assignRolesSchema,
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  type AssignRolesInput,
  type CreateUserInput,
  type UpdateUserInput,
  type UserIdParamInput,
} from '../schemas/users.js';




// Parameter validation schema

export default async function userRoutes(app: FastifyInstance) {
  // List users
  app.get('/', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      search: query.search || query.q,
    };

    const { users, total } = await userService.list(tenantSlug, pagination, filters);

    reply.send(createPaginatedResponse(users, total, pagination));
  });

  // Get user by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:read'), validate({ params: userIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as UserIdParamInput;
    const user = await userService.findById(tenantSlug, id);

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `User with id '${id}' not found`,
      });
    }

    reply.send(user);
  });

  // Create user
  app.post('/', {
    preHandler: [requirePermission('users:create'), validate({ body: createUserSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateUserInput;

    const user = await userService.create(tenantSlug, body, userId);
    reply.status(201).send(user);
  });

  // Update user
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:update'), validate({ params: userIdParamSchema, body: updateUserSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as UserIdParamInput;
    const body = request.body as UpdateUserInput;

    const user = await userService.update(tenantSlug, id, body, userId);
    reply.send(user);
  });

  // Delete user
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:delete'), validate({ params: userIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as UserIdParamInput;

    await userService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get user's groups
  app.get<{ Params: { id: string } }>('/:id/groups', {
    preHandler: [requirePermission('users:read'), validate({ params: userIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as UserIdParamInput;

    const groups = await userService.getUserGroups(tenantSlug, id);
    reply.send({ data: groups });
  });

  // Assign roles to user
  app.put<{ Params: { id: string } }>('/:id/roles', {
    preHandler: [requirePermission('users:update'), validate({ params: userIdParamSchema, body: assignRolesSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as UserIdParamInput;
    const body = request.body as AssignRolesInput;

    await userService.assignRoles(tenantSlug, id, body.roleIds, userId);
    reply.send({ message: 'Roles assigned successfully' });
  });
}
