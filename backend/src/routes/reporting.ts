export async function reportingRoutes(fastify: FastifyInstance) {
  // Add date validation helper
  const dateParamsSchema = {
    type: 'object',
    properties: {
      startDate: { type: 'string', format: 'date' },
      endDate: { type: 'string', format: 'date' }
    }
  };

  // GET /api/v1/reporting/templates
  fastify.get('/templates', {
    preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantSlug: { type: 'string' }
        },
        required: ['tenantSlug']
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as {
      page?: number;
      perPage?: number;
      reportType?: string;
      isPublic?: boolean;
    };

    const result = await reportingService.list(tenantSlug, { page, perPage }, { reportType, isPublic });
    return reply.send(result);
  });

  // GET /api/v1/reporting/run/:templateId
  fastify.get('/run/:templateId', {
    preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantSlug: { type: 'string' },
          templateId: { type: 'string' }
        },
        required: ['tenantSlug', 'templateId']
      },
      querystring: dateParamsSchema
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { templateId } = request.params as { templateId: string };
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    const result = await reportingService.runReport(tenantSlug, templateId, { startDate, endDate });
    return reply.send(result);
  });
}