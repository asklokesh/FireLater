import type { RouteSchemaMap } from './types.js';
import { createScheduleSchema, generateReportSchema, idParamSchema, updateScheduleSchema } from './compliance-reports.js';

export const complianceReportsRouteSchemas: RouteSchemaMap = {
  'POST /compliance-reports/compliance-reports/generate': { body: generateReportSchema },
  'POST /compliance-reports/compliance-reports/schedules': { body: createScheduleSchema },
  'PUT /compliance-reports/compliance-reports/schedules/:id': { body: updateScheduleSchema, params: idParamSchema },
};
