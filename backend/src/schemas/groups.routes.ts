import type { RouteSchemaMap } from './types.js';
import { addMemberSchema, createGroupSchema, groupIdParamSchema, groupMemberParamSchema, listGroupsQuerySchema, updateGroupSchema } from './groups.js';

export const groupsRouteSchemas: RouteSchemaMap = {
  'GET /groups': { query: listGroupsQuerySchema },
  'GET /groups/:id': { params: groupIdParamSchema },
  'POST /groups': { body: createGroupSchema },
  'PUT /groups/:id': { body: updateGroupSchema, params: groupIdParamSchema },
  'DELETE /groups/:id': { params: groupIdParamSchema },
  'GET /groups/:id/members': { params: groupIdParamSchema },
  'POST /groups/:id/members': { body: addMemberSchema, params: groupIdParamSchema },
  'DELETE /groups/:id/members/:userId': { params: groupMemberParamSchema },
};
