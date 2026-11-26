import type { RouteSchemaMap } from './types.js';
import { createUserSchema, updateUserSchema, assignRolesSchema, userIdParamSchema } from './users.js';

export const userRouteSchemas: RouteSchemaMap = {
  'POST /users': { body: createUserSchema },
  'GET /users/:id': { params: userIdParamSchema },
  'PUT /users/:id': { params: userIdParamSchema, body: updateUserSchema },
  'DELETE /users/:id': { params: userIdParamSchema },
  'GET /users/:id/groups': { params: userIdParamSchema },
  'PUT /users/:id/roles': { params: userIdParamSchema, body: assignRolesSchema },
};
