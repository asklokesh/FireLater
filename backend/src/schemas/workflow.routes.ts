import type { RouteSchemaMap } from './types.js';
import { createWorkflowRuleSchema, updateWorkflowRuleSchema } from './workflow.js';

export const workflowRouteSchemas: RouteSchemaMap = {
  'POST /workflows/rules': { body: createWorkflowRuleSchema },
  'PATCH /workflows/rules/:id': { body: updateWorkflowRuleSchema },
};
