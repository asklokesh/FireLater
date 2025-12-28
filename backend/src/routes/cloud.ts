import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cloudAccountService,
  cloudResourceService,
  cloudCostService,
  cloudMappingRuleService,
} from '../services/cloud.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// ============================================
// SCHEMAS
// ============================================

const createAccountSchema = z.object({
  provider: z.enum(['aws', 'azure', 'gcp']),
  accountId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  credentialType: z.enum(['access_key', 'role_arn', 'service_account']),
  credentials: z.record(z.unknown()).optional(),
  roleArn: z.string().optional(),
  externalId: z.string().optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().min(300).optional(),
  syncResources: z.boolean().optional(),
  syncCosts: z.boolean().optional(),
  syncMetrics: z.boolean().optional(),
  regions: z.array(z.string()).optional(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  credentialType: z.enum(['access_key', 'role_arn', 'service_account']).optional(),
  credentials: z.record(z.unknown()).optional(),
  roleArn: z.string().optional(),
  externalId: z.string().optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().min(300).optional(),
  syncResources: z.boolean().optional(),
  syncCosts: z.boolean().optional(),
  syncMetrics: z.boolean().optional(),
  regions: z.array(z.string()).optional(),
});

const mapResourceSchema = z.object({
  applicationId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
});

const createMappingRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  priority: z.number().min(1).optional(),
  provider: z.enum(['aws', 'azure', 'gcp']).optional(),
  resourceType: z.string().optional(),
  tagKey: z.string().min(1),
  tagValuePattern: z.string().optional(),
  applicationId: z.string().uuid(),
  environmentType: z.string().optional(),
});

export default async function cloudRoutes(app: FastifyInstance) {
  // ============================================
  // CLOUD ACCOUNTS
  // ============================================

  // List cloud accounts
  app.get('/accounts', {
    preHandler: [requirePermission('cloud_accounts:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { accounts, total } = await cloudAccountService.list(tenantSlug, pagination, {
      provider: query.provider,
      status: query.status,
    });
    reply.send(createPaginatedResponse(accounts, total, pagination));
  });

  // Get cloud account
  app.get<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const account = await cloudAccountService.findById(tenantSlug, request.params.id);

    if (!account) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud account '${request.params.id}' not found`,
      });
    }

    reply.send({ account });
  });

  // Create cloud account
  app.post('/accounts', {
    preHandler: [requirePermission('cloud_accounts:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = createAccountSchema.parse(request.body);
    const account = await cloudAccountService.create(tenantSlug, data);
    reply.status(201).send({ account });
  });

  // Update cloud account
  app.put<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = updateAccountSchema.parse(request.body);
    const account = await cloudAccountService.update(tenantSlug, request.params.id, data);
    reply.send({ account });
  });

  // Delete cloud account
  app.delete<{ Params: { id: string } }>('/accounts/:id', {
    preHandler: [requirePermission('cloud_accounts:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await cloudAccountService.delete(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // Test cloud account connection
  app.post<{ Params: { id: string } }>('/accounts/:id/test', {
    preHandler: [requirePermission('cloud_accounts:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const result = await cloudAccountService.testConnection(tenantSlug, request.params.id);
    reply.send(result);
  });

  // ============================================
  // CLOUD RESOURCES
  // ============================================

  // List cloud resources
  app.get('/resources', {
    preHandler: [requirePermission('cloud_resources:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { resources, total } = await cloudResourceService.list(tenantSlug, pagination, {
      cloudAccountId: query.cloud_account_id,
      resourceType: query.resource_type,
      applicationId: query.application_id,
      environmentId: query.environment_id,
      region: query.region,
      isDeleted: query.is_deleted === 'true',
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
    preHandler: [requirePermission('cloud_resources:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const resource = await cloudResourceService.findById(tenantSlug, request.params.id);

    if (!resource) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Cloud resource '${request.params.id}' not found`,
      });
    }

    reply.send({ resource });
  });

  // Map resource to application
  app.post<{ Params: { id: string } }>('/resources/:id/map', {
    preHandler: [requirePermission('cloud_resources:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { applicationId, environmentId } = mapResourceSchema.parse(request.body);

    const resource = await cloudResourceService.mapToApplication(
      tenantSlug,
      request.params.id,
      applicationId,
      environmentId
    );
    reply.send({ resource });
  });

  // Unmap resource from application
  app.delete<{ Params: { id: string } }>('/resources/:id/map', {
    preHandler: [requirePermission('cloud_resources:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const resource = await cloudResourceService.unmapFromApplication(tenantSlug, request.params.id);
    reply.send({ resource });
  });

  // Get resources by application
  app.get<{ Params: { applicationId: string } }>('/applications/:applicationId/resources', {
    preHandler: [requirePermission('cloud_resources:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const resources = await cloudResourceService.getResourcesByApplication(
      tenantSlug,
      request.params.applicationId
    );
    reply.send({ resources });
  });

  // ============================================
  // CLOUD COSTS
  // ============================================

  // List cost reports
  app.get('/costs', {
    preHandler: [requirePermission('cloud_costs:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { costs, total } = await cloudCostService.getCostSummary(tenantSlug, pagination, {
      cloudAccountId: query.cloud_account_id,
      periodType: query.period_type,
    });
    reply.send(createPaginatedResponse(costs, total, pagination));
  });

  // Get costs by application
  app.get<{ Params: { applicationId: string }; Querystring: { period_type?: string } }>('/applications/:applicationId/costs', {
    preHandler: [requirePermission('cloud_costs:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const periodType = request.query.period_type || 'monthly';

    const costs = await cloudCostService.getCostsByApplication(
      tenantSlug,
      request.params.applicationId,
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
    preHandler: [requirePermission('cloud_resources:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const data = createMappingRuleSchema.parse(request.body);
    const rule = await cloudMappingRuleService.create(tenantSlug, data);
    reply.status(201).send({ rule });
  });

  // Delete mapping rule
  app.delete<{ Params: { id: string } }>('/mapping-rules/:id', {
    preHandler: [requirePermission('cloud_resources:manage')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await cloudMappingRuleService.delete(tenantSlug, request.params.id);
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
