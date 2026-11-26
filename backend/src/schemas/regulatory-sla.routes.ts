import type { RouteSchemaMap } from './types.js';
import { classifyIncidentSchema, createDeadlineSchema, createFrameworkSchema, recordNotificationSchema, summaryQuerySchema } from './regulatory-sla.js';

export const regulatorySlaRouteSchemas: RouteSchemaMap = {
  'POST /regulatory-sla/incidents/:incidentId/classify': { body: classifyIncidentSchema },
  'POST /regulatory-sla/clocks/:clockId/notify': { body: recordNotificationSchema },
  'GET /regulatory-sla/summary': { query: summaryQuerySchema },
  'POST /regulatory-sla/frameworks': { body: createFrameworkSchema },
  'POST /regulatory-sla/frameworks/:id/deadlines': { body: createDeadlineSchema },
};
