import type { RouteSchemaMap } from './types.js';
import { activitySchema, listGrantsQuerySchema, requestGrantSchema, summaryQuerySchema } from './pam.js';

export const pamRouteSchemas: RouteSchemaMap = {
  'POST /pam/grants': { body: requestGrantSchema },
  'GET /pam/grants': { query: listGrantsQuerySchema },
  'POST /pam/grants/:id/activity': { body: activitySchema },
  'GET /pam/summary': { query: summaryQuerySchema },
};
