import type { RouteSchemaMap } from './types.js';
import { applicationIdParamSchema, historyQuerySchema, tierParamSchema, updateConfigSchema } from './health.js';

export const healthRouteSchemas: RouteSchemaMap = {
  'GET /health/config/:tier': { params: tierParamSchema },
  'PUT /health/config/:tier': { body: updateConfigSchema, params: tierParamSchema },
  'GET /health/applications/:applicationId': { params: applicationIdParamSchema },
  'GET /health/applications/:applicationId/history': { params: applicationIdParamSchema, query: historyQuerySchema },
  'POST /health/applications/:applicationId/calculate': { params: applicationIdParamSchema },
};
