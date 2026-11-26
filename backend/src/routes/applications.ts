import { FastifyInstance } from 'fastify';
import { applicationService } from '../services/applications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  appEnvParamSchema,
  appIdParamSchema,
  createApplicationSchema,
  createEnvironmentSchema,
  listAppsQuerySchema,
  updateApplicationSchema,
  updateEnvironmentSchema,
  type AppEnvParamInput,
  type AppIdParamInput,
  type CreateApplicationInput,
  type CreateEnvironmentInput,
  type UpdateApplicationInput,
  type UpdateEnvironmentInput,
  type ListAppsQueryInput,
} from '../schemas/applications.js';





// Parameter validation schemas


// Query parameter validation schema

export default async function applicationRoutes(app: FastifyInstance) {
  // List applications
  app.get('/', {
    preHandler: [requirePermission('applications:read'), validate({ query: listAppsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListAppsQueryInput;
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
    preHandler: [requirePermission('applications:read'), validate({ params: appIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AppIdParamInput;

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
    preHandler: [requirePermission('applications:create'), validate({ body: createApplicationSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateApplicationInput;

    const application = await applicationService.create(tenantSlug, body, userId);
    reply.status(201).send(application);
  });

  // Update application
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:update'), validate({ params: appIdParamSchema, body: updateApplicationSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as AppIdParamInput;
    const body = request.body as UpdateApplicationInput;

    const application = await applicationService.update(tenantSlug, id, body, userId);
    reply.send(application);
  });

  // Delete application
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('applications:delete'), validate({ params: appIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as AppIdParamInput;

    await applicationService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get application health score
  app.get<{ Params: { id: string } }>('/:id/health', {
    preHandler: [requirePermission('applications:read'), validate({ params: appIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AppIdParamInput;

    const health = await applicationService.getHealthScore(tenantSlug, id);
    reply.send(health);
  });

  // ========================================
  // ENVIRONMENTS
  // ========================================

  // List environments
  app.get<{ Params: { id: string } }>('/:id/environments', {
    preHandler: [requirePermission('applications:read'), validate({ params: appIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as AppIdParamInput;

    const environments = await applicationService.listEnvironments(tenantSlug, id);
    reply.send({ data: environments });
  });

  // Create environment
  app.post<{ Params: { id: string } }>('/:id/environments', {
    preHandler: [requirePermission('applications:update'), validate({ params: appIdParamSchema, body: createEnvironmentSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as AppIdParamInput;
    const body = request.body as CreateEnvironmentInput;

    const environment = await applicationService.createEnvironment(tenantSlug, id, body, userId);
    reply.status(201).send(environment);
  });

  // Update environment
  app.put<{ Params: { id: string; envId: string } }>('/:id/environments/:envId', {
    preHandler: [requirePermission('applications:update'), validate({ params: appEnvParamSchema, body: updateEnvironmentSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, envId } = request.params as AppEnvParamInput;
    const body = request.body as UpdateEnvironmentInput;

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
    preHandler: [requirePermission('applications:update'), validate({ params: appEnvParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, envId } = request.params as AppEnvParamInput;

    await applicationService.deleteEnvironment(tenantSlug, id, envId, userId);
    reply.status(204).send();
  });
}
