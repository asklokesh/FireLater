import type { RouteSchemaMap } from './types.js';
import { jobIdParamSchema } from './migration.js';

export const migrationRouteSchemas: RouteSchemaMap = {
  'POST /migration/:jobId/execute': { params: jobIdParamSchema },
  'GET /migration/:jobId': { params: jobIdParamSchema },
};
