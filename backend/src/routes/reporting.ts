export default async function reportingRoutes(fastify: FastifyInstance) {
  // Add schema validation for query parameters
  const reportingQuerySchema = {
    tags: ['reporting'],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        reportType: { type: 'string', maxLength: 50 },
        isPublic: { type: 'string', enum: ['true', 'false'] }
      },
      additionalProperties: false
    }
  };

  fastify.get(
    '/templates',
    {
      preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
      schema: reportingQuerySchema,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const { page, perPage, reportType, isPublic } = request.query as ReportingQueryParams;
      
      // Remove manual sanitization - now handled by schema validation
      const pagination = { page, perPage };
      
      const filters = {
        reportType,
        isPublic: isPublic !== undefined ? isPublic === 'true' : undefined
      };

      const result = await reportTemplateService.list(tenantSlug, pagination, filters);
      return reply.send(result);
    }
  );
}