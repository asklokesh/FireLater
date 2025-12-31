export async function reportingRoutes(fastify: FastifyInstance) {
  // Add date validation helper
  const dateParamsSchema = {
    type: 'object',
    properties: {
      startDate: { type: 'string', format: 'date' },
      endDate: { type: 'string', format: 'date' }
    },
    required: ['startDate', 'endDate'],
    additionalProperties: false
  };

  // GET /api/v1/reporting/templates
  fastify.get('/templates', {
    preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
    schema: {
      params: {
        type: 'object',
        properties: {
          tenantSlug: { type: 'string', pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' }
        },
        required: ['tenantSlug'],
        additionalProperties: false
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string', maxLength: 50 },
          isPublic: { type: 'boolean' }
        },
        additionalProperties: false
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
          tenantSlug: { type: 'string', pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' },
          templateId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
        },
        required: ['tenantSlug', 'templateId'],
        additionalProperties: false
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