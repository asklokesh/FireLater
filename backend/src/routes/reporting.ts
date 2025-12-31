// Add input sanitization utility at the top of the file
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>{}[\]|\\^`]/g, '').trim();
};

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Add validation schema for query parameters
  const queryParamsSchema = {
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

  // List report templates with validation
  fastify.get(
    '/templates',
    {
      preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
      schema: queryParamsSchema,
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
      
      // Sanitize and parse query parameters
      const pagination = {
        page: Math.max(1, Math.min(1000, parseInt(String(page), 10) || 1)),
        perPage: Math.min(100, Math.max(1, parseInt(String(perPage), 10) || 20))
      };
      
      const filters = {
        reportType: reportType ? sanitizeInput(reportType).substring(0, 50) : undefined,
        isPublic: isPublic !== undefined ? isPublic === 'true' : undefined
      };

      const result = await reportTemplateService.list(tenantSlug, pagination, filters);
      return reply.send(result);
    }
  );
}