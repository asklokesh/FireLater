import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { applicationService } from '../services/applications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { createApplicationSchema, updateApplicationSchema, createEnvironmentSchema, appIdParamSchema, appEnvParamSchema, listAppsQuerySchema } from '../schemas/applications.js';

const updateEnvironmentSchema = createEnvironmentSchema.partial();

// Parameter validation schemas

// Query parameter validation schema

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
    const { id } = request.params as z.infer<typeof appIdParamSchema>;

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
    const body = request.body as z.infer<typeof createApplicationSchema>;

    const application = await applicationService.create(tenantSlug, body, userId);
    reply.status(201).send(application);
  });

  // Update application
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof appIdParamSchema>;
    const body = request.body as z.infer<typeof updateApplicationSchema>;

    const application = await applicationService.update(tenantSlug, id, body, userId);
    reply.send(application);
  });

  // Delete application
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof appIdParamSchema>;

    await applicationService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get application health score
  app.get<{ Params: { id: string } }>('/:id/health', {
    preHandler: [requirePermission('applications:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof appIdParamSchema>;

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
    const { id } = request.params as z.infer<typeof appIdParamSchema>;

    const environments = await applicationService.listEnvironments(tenantSlug, id);
    reply.send({ data: environments });
  });

  // Create environment
  app.post<{ Params: { id: string } }>('/:id/environments', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof appIdParamSchema>;
    const body = request.body as z.infer<typeof createEnvironmentSchema>;

    const environment = await applicationService.createEnvironment(tenantSlug, id, body, userId);
    reply.status(201).send(environment);
  });

  // Update environment
  app.put<{ Params: { id: string; envId: string } }>('/:id/environments/:envId', {
    preHandler: [requirePermission('applications:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, envId } = request.params as z.infer<typeof appEnvParamSchema>;
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
    const { id, envId } = request.params as z.infer<typeof appEnvParamSchema>;

    await applicationService.deleteEnvironment(tenantSlug, id, envId, userId);
    reply.status(204).send();
  });
}
