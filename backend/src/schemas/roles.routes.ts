import type { RouteSchemaMap } from './types.js';
import { createRoleSchema, roleIdParamSchema, updateRoleSchema } from './roles.js';

export const rolesRouteSchemas: RouteSchemaMap = {
  'GET /roles/:id': { params: roleIdParamSchema },
  'POST /roles': { body: createRoleSchema },
  'PUT /roles/:id': { body: updateRoleSchema, params: roleIdParamSchema },
  'DELETE /roles/:id': { params: roleIdParamSchema },
};
