import type { RouteSchemaMap } from './types.js';
import { slaPolicySchema, slaTargetSchema, updateSlaPolicySchema, updateSlaTargetSchema } from './sla.js';

export const slaRouteSchemas: RouteSchemaMap = {
  'POST /sla/policies': { body: slaPolicySchema },
  'PATCH /sla/policies/:id': { body: updateSlaPolicySchema },
  'POST /sla/policies/:policyId/targets': { body: slaTargetSchema },
  'PATCH /sla/targets/:id': { body: updateSlaTargetSchema },
};
