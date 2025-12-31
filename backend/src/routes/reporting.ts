// Remove the local sanitizeInput function since it's now global

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Remove manual sanitization in route handlers
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
      
      // Remove manual sanitization - now handled by global hook
      const pagination = {
        page: Math.max(1, Math.min(1000, parseInt(String(page), 10) || 1)),
        perPage: Math.min(100, Math.max(1, parseInt(String(perPage), 10) || 20))
      };
      
      const filters = {
        reportType: reportType ? reportType.substring(0, 50) : undefined,
        isPublic: isPublic !== undefined ? isPublic === 'true' : undefined
      };

      const result = await reportTemplateService.list(tenantSlug, pagination, filters);
      return reply.send(result);
    }
  );
}