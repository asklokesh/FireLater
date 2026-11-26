import type { RouteSchemaMap } from './types.js';
import { appEnvParamSchema, appIdParamSchema, createApplicationSchema, createEnvironmentSchema, listAppsQuerySchema, updateApplicationSchema } from './applications.js';

export const applicationsRouteSchemas: RouteSchemaMap = {
  'GET /applications': { query: listAppsQuerySchema },
  'GET /applications/:id': { params: appIdParamSchema },
  'POST /applications': { body: createApplicationSchema },
  'PUT /applications/:id': { body: updateApplicationSchema, params: appIdParamSchema },
  'DELETE /applications/:id': { params: appIdParamSchema },
  'GET /applications/:id/health': { params: appIdParamSchema },
  'GET /applications/:id/environments': { params: appIdParamSchema },
  'POST /applications/:id/environments': { body: createEnvironmentSchema, params: appIdParamSchema },
  'PUT /applications/:id/environments/:envId': { params: appEnvParamSchema },
  'DELETE /applications/:id/environments/:envId': { params: appEnvParamSchema },
};
