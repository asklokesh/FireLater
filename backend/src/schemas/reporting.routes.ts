import type { RouteSchemaMap } from './types.js';
import { idParamSchema } from './reporting.js';

export const reportingRouteSchemas: RouteSchemaMap = {
  'GET /reports/templates/:id': { params: idParamSchema },
  'PUT /reports/templates/:id': { params: idParamSchema },
  'DELETE /reports/templates/:id': { params: idParamSchema },
  'GET /reports/schedules/:id': { params: idParamSchema },
  'PUT /reports/schedules/:id': { params: idParamSchema },
  'DELETE /reports/schedules/:id': { params: idParamSchema },
  'GET /reports/executions/:id': { params: idParamSchema },
  'DELETE /reports/saved/:id': { params: idParamSchema },
  'PUT /reports/widgets/:id': { params: idParamSchema },
  'DELETE /reports/widgets/:id': { params: idParamSchema },
};
