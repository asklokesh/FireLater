import type { RouteSchemaMap } from './types.js';
import { accountIdParamSchema, applicationCostsQuerySchema, applicationIdParamSchema, createAccountSchema, createMappingRuleSchema, listAccountsQuerySchema, listCostsQuerySchema, listResourcesQuerySchema, mapResourceSchema, mappingRuleIdParamSchema, resourceIdParamSchema, updateAccountSchema } from './cloud.js';

export const cloudRouteSchemas: RouteSchemaMap = {
  'GET /cloud/accounts': { query: listAccountsQuerySchema },
  'GET /cloud/accounts/:id': { params: accountIdParamSchema },
  'POST /cloud/accounts': { body: createAccountSchema },
  'PUT /cloud/accounts/:id': { body: updateAccountSchema, params: accountIdParamSchema },
  'DELETE /cloud/accounts/:id': { params: accountIdParamSchema },
  'POST /cloud/accounts/:id/test': { params: accountIdParamSchema },
  'GET /cloud/resources': { query: listResourcesQuerySchema },
  'GET /cloud/resources/:id': { params: resourceIdParamSchema },
  'POST /cloud/resources/:id/map': { body: mapResourceSchema, params: resourceIdParamSchema },
  'DELETE /cloud/resources/:id/map': { params: resourceIdParamSchema },
  'GET /cloud/applications/:applicationId/resources': { params: applicationIdParamSchema },
  'GET /cloud/costs': { query: listCostsQuerySchema },
  'GET /cloud/applications/:applicationId/costs': { params: applicationIdParamSchema, query: applicationCostsQuerySchema },
  'POST /cloud/mapping-rules': { body: createMappingRuleSchema },
  'DELETE /cloud/mapping-rules/:id': { params: mappingRuleIdParamSchema },
};
