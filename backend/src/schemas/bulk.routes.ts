import type { RouteSchemaMap } from './types.js';
import { jobIdParamSchema } from './bulk.js';

export const bulkRouteSchemas: RouteSchemaMap = {
  'GET /bulk/jobs/:id': { params: jobIdParamSchema },
};
