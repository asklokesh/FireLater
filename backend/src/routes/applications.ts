import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { applicationService } from '../services/applications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createApplicationSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  tier: z.enum(['P1', 'P2', 'P3', 'P4']),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  lifecycleStage: z.enum(['development', 'staging', 'production', 'sunset']).optional(),
  ownerUserId: z.string().uuid().optional(),
  ownerGroupId: z.string().uuid().optional(),
  supportGroupId: z.string().uuid().optional(),
  businessUnit: z.string().max(255).optional(),
  criticality: z.enum(['mission_critical', 'business_critical', 'business_operational', 'administrative']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateApplicationSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).optional(),
  tier: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  lifecycleStage: z.enum(['development', 'staging', 'production', 'sunset']).optional(),
  ownerUserId: z.string().uuid().optional(),
  ownerGroupId: z.string().uuid().optional(),
  supportGroupId: z.string().uuid().optional(),
  businessUnit: z.string().max(255).optional(),
  criticality: z.enum(['mission_critical', 'business_critical', 'business_operational', 'administrative']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createEnvironmentSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['dev', 'test', 'staging', 'prod']),
  url: z.string().url().optional(),
  cloudProvider: z.enum(['aws', 'gcp', 'azure', 'on-prem']).optional(),
  cloudAccount: z.string().max(255).optional(),
  cloudRegion: z.string().max(50).optional(),
  resourceIds: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateEnvironmentSchema = createEnvironmentSchema.partial();

// Parameter validation schemas
const appIdParamSchema = z.object({
  id: z.string().uuid(),
});

const appEnvParamSchema = z.object({
  id: z.string().uuid(),
  envId: z.string().uuid(),
});

// Query parameter validation schema
const listAppsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  tier: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  owner_id: z.string().uuid().optional(),
  support_group_id: z.string().uuid().optional(),
});

export default async function applicationRoutes(app: FastifyInstance) {
  // List applications
  app.get('/', {
    preHandler: [requirePermission('applications:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listAppsQuerySchema.parse(query);
    const pagination = parsePagination(query);

    const filters = {
      tier: validatedQuery.tier,
      status: validatedQuery.status,
      search: validatedQuery.search || validatedQuery.q,
      ownerId: validatedQuery.owner_id,
      supportGroupId: validatedQuery.support_group_id,
    };

    const { applications, total } = await applicationService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(applications, total, pagination));
  });

  // Get application by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = appIdParamSchema.parse(request.params);

    const application = await applicationService.findById(tenantSlug, id);

    if (!application) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Application with id '${id}' not found`,
      });
    }

    reply.send(application);
  });

  // Create application
  app.post('/', {
    preHandler: [requirePermission('applications:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createApplicationSchema.parse(request.body);

    const application = await applicationService.create(tenantSlug, body, userId);
    reply.status(201).send(application);
  });

  // Update application
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = appIdParamSchema.parse(request.params);
    const body = updateApplicationSchema.parse(request.body);

    const application = await applicationService.update(tenantSlug, id, body, userId);
    reply.send(application);
  });

  // Delete application
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = appIdParamSchema.parse(request.params);

    await applicationService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get application health score
  app.get<{ Params: { id: string } }>('/:id/health', {
    preHandler: [requirePermission('applications:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = appIdParamSchema.parse(request.params);

    const health = await applicationService.getHealthScore(tenantSlug, id);
    reply.send(health);
  });

  // ========================================
  // ENVIRONMENTS
  // ========================================

  // List environments
  app.get<{ Params: { id: string } }>('/:id/environments', {
    preHandler: [requirePermission('applications:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = appIdParamSchema.parse(request.params);

    const environments = await applicationService.listEnvironments(tenantSlug, id);
    reply.send({ data: environments });
  });

  // Create environment
  app.post<{ Params: { id: string } }>('/:id/environments', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = appIdParamSchema.parse(request.params);
    const body = createEnvironmentSchema.parse(request.body);

    const environment = await applicationService.createEnvironment(tenantSlug, id, body, userId);
    reply.status(201).send(environment);
  });

  // Update environment
  app.put<{ Params: { id: string; envId: string } }>('/:id/environments/:envId', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, envId } = appEnvParamSchema.parse(request.params);
    const body = updateEnvironmentSchema.parse(request.body);

    const environment = await applicationService.updateEnvironment(
      tenantSlug,
      id,
      envId,
      body,
      userId
    );
    reply.send(environment);
  });

  // Delete environment
  app.delete<{ Params: { id: string; envId: string } }>('/:id/environments/:envId', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, envId } = appEnvParamSchema.parse(request.params);

    await applicationService.deleteEnvironment(tenantSlug, id, envId, userId);
    reply.status(204).send();
  });
}
