import type { RouteSchemaMap } from './types.js';
import { createEmergencyChangeSchema, idParamSchema, postHocReviewSchema } from './emergency-change.js';

export const emergencyChangeRouteSchemas: RouteSchemaMap = {
  'POST /emergency-changes': { body: createEmergencyChangeSchema },
  'GET /emergency-changes/:id': { params: idParamSchema },
  'POST /emergency-changes/:id/review': { body: postHocReviewSchema, params: idParamSchema },
};
