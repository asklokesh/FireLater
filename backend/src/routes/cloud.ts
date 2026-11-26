import { FastifyInstance } from 'fastify';
import {
  cloudAccountService,
  cloudResourceService,
  cloudCostService,
  cloudMappingRuleService,
} from '../services/cloud.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  accountIdParamSchema,
  applicationCostsQuerySchema,
  applicationIdParamSchema,
  createAccountSchema,
  createMappingRuleSchema,
  listAccountsQuerySchema,
  listCostsQuerySchema,
  listResourcesQuerySchema,
  mapResourceSchema,
  mappingRuleIdParamSchema,
  resourceIdParamSchema,
  updateAccountSchema,
  type AccountIdParamInput,
  type ApplicationCostsQueryInput,
  type ApplicationIdParamInput,
  type CreateAccountInput,
  type CreateMappingRuleInput,
  type MapResourceInput,
  type MappingRuleIdParamInput,
  type ResourceIdParamInput,
  type UpdateAccountInput,
  type ListAccountsQueryInput,
  type ListResourcesQueryInput,
  type ListCostsQueryInput,
} from '../schemas/cloud.js';

// ============================================
// SCHEMAS
// ============================================





// Parameter validation schemas




// Query validation schemas




export default async function cloudRoutes(app: FastifyInstance) {
  // ============================================
  // CLOUD ACCOUNTS
  // ============================================

  // List cloud accounts
  app.get('/accounts', {
    preHandler: [requirePermission('cloud_accounts:read'), validate({ query: listAccountsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListAccountsQueryInput;
    const pagination = parsePagination(query);

    const { accounts, total } = await cloudAccountService.list(tenantSlug, pagination, {
      provider: validatedQuery.provider,
      status: validatedQuery.status,
    });
    reply.send(createPaginatedResponse(accounts, total, pagination));
  });

  // Get cloud account
  app.get<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:read'), validate({ params: accountIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AccountIdParamInput;

    const account = await cloudAccountService.findById(tenantSlug, id);

    if (!account) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud account '${id}' not found`,
      });
    }

    reply.send({ account });
  });

  // Create cloud account
  app.post('/accounts', {
    preHandler: [requirePermission('cloud_accounts:manage'), validate({ body: createAccountSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = request.body as CreateAccountInput;
    const account = await cloudAccountService.create(tenantSlug, data);
    reply.status(201).send({ account });
  });

  // Update cloud account
  app.put<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:manage'), validate({ params: accountIdParamSchema, body: updateAccountSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AccountIdParamInput;
    const data = request.body as UpdateAccountInput;

    const account = await cloudAccountService.update(tenantSlug, id, data);
    reply.send({ account });
  });

  // Delete cloud account
  app.delete<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:manage'), validate({ params: accountIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AccountIdParamInput;

    await cloudAccountService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // Test cloud account connection
  app.post<{ Params: { id: string } }>('/accounts/:id/test', {
    preHandler: [requirePermission('cloud_accounts:manage'), validate({ params: accountIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AccountIdParamInput;

    const result = await cloudAccountService.testConnection(tenantSlug, id);
    reply.send(result);
  });

  // ============================================
  // CLOUD RESOURCES
  // ============================================

  // List cloud resources
  app.get('/resources', {
    preHandler: [requirePermission('cloud_resources:read'), validate({ query: listResourcesQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListResourcesQueryInput;
    const pagination = parsePagination(query);

    const { resources, total } = await cloudResourceService.list(tenantSlug, pagination, {
      cloudAccountId: validatedQuery.cloud_account_id,
      resourceType: validatedQuery.resource_type,
      applicationId: validatedQuery.application_id,
      environmentId: validatedQuery.environment_id,
      region: validatedQuery.region,
      isDeleted: validatedQuery.is_deleted === 'true',
    });
    reply.send(createPaginatedResponse(resources, total, pagination));
  });

  // Get resource types summary
  app.get('/resources/types', {
    preHandler: [requirePermission('cloud_resources:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const types = await cloudResourceService.getResourceTypes(tenantSlug);
    reply.send({ types });
  });

  // Get cloud resource
  app.get<{ Params: { id: string } }>('/resources/:id', {
    preHandler: [requirePermission('cloud_resources:read'), validate({ params: resourceIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ResourceIdParamInput;

    const resource = await cloudResourceService.findById(tenantSlug, id);

    if (!resource) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud resource '${id}' not found`,
      });
    }

    reply.send({ resource });
  });

  // Map resource to application
  app.post<{ Params: { id: string } }>('/resources/:id/map', {
    preHandler: [requirePermission('cloud_resources:manage'), validate({ params: resourceIdParamSchema, body: mapResourceSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ResourceIdParamInput;
    const { applicationId, environmentId } = request.body as MapResourceInput;

    const resource = await cloudResourceService.mapToApplication(
      tenantSlug,
      id,
      applicationId,
      environmentId
    );
    reply.send({ resource });
  });

  // Unmap resource from application
  app.delete<{ Params: { id: string } }>('/resources/:id/map', {
    preHandler: [requirePermission('cloud_resources:manage'), validate({ params: resourceIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ResourceIdParamInput;

    const resource = await cloudResourceService.unmapFromApplication(tenantSlug, id);
    reply.send({ resource });
  });

  // Get resources by application
  app.get<{ Params: { applicationId: string } }>('/applications/:applicationId/resources', {
    preHandler: [requirePermission('cloud_resources:read'), validate({ params: applicationIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { applicationId } = request.params as ApplicationIdParamInput;

    const resources = await cloudResourceService.getResourcesByApplication(
      tenantSlug,
      applicationId
    );
    reply.send({ resources });
  });

  // ============================================
  // CLOUD COSTS
  // ============================================

  // List cost reports
  app.get('/costs', {
    preHandler: [requirePermission('cloud_costs:read'), validate({ query: listCostsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListCostsQueryInput;
    const pagination = parsePagination(query);

    const { costs, total } = await cloudCostService.getCostSummary(tenantSlug, pagination, {
      cloudAccountId: validatedQuery.cloud_account_id,
      periodType: validatedQuery.period_type,
    });
    reply.send(createPaginatedResponse(costs, total, pagination));
  });

  // Get costs by application
  app.get<{ Params: { applicationId: string }; Querystring: { period_type?: string } }>('/applications/:applicationId/costs', {
    preHandler: [requirePermission('cloud_costs:read'), validate({ params: applicationIdParamSchema, query: applicationCostsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { applicationId } = request.params as ApplicationIdParamInput;
    const queryParams = request.query as ApplicationCostsQueryInput;
    const periodType = queryParams.period_type || 'monthly';

    const costs = await cloudCostService.getCostsByApplication(
      tenantSlug,
      applicationId,
      periodType
    );
    reply.send({ costs });
  });

  // ============================================
  // MAPPING RULES
  // ============================================

  // List mapping rules
  app.get('/mapping-rules', {
    preHandler: [requirePermission('cloud_resources:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const rules = await cloudMappingRuleService.list(tenantSlug);
    reply.send({ rules });
  });

  // Create mapping rule
  app.post('/mapping-rules', {
    preHandler: [requirePermission('cloud_resources:manage'), validate({ body: createMappingRuleSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = request.body as CreateMappingRuleInput;
    const rule = await cloudMappingRuleService.create(tenantSlug, data);
    reply.status(201).send({ rule });
  });

  // Delete mapping rule
  app.delete<{ Params: { id: string } }>('/mapping-rules/:id', {
    preHandler: [requirePermission('cloud_resources:manage'), validate({ params: mappingRuleIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as MappingRuleIdParamInput;

    await cloudMappingRuleService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // Apply mapping rules
  app.post('/mapping-rules/apply', {
    preHandler: [requirePermission('cloud_resources:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const result = await cloudMappingRuleService.applyRules(tenantSlug);
    reply.send(result);
  });
}
