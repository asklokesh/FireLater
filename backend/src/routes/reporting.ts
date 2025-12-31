fastify.get(
  '/templates/:id',
  {
    preHandler: [authenticate, authorize('read:reports')],
  },
  async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw fastify.httpErrors.badRequest('Invalid template ID format');
    }

    // Generate cache key with tenant scope
    const cacheKey = `report:${tenantSlug}:template:${id}`;
    
    // Try cache first
    const cachedResult = await fastify.redis.get(cacheKey);
    if (cachedResult) {
      request.headers['x-cache'] = 'HIT';
      return JSON.parse(cachedResult);
    }

    // Ensure tenant isolation in service call
    const template = await reportTemplateService.findById(tenantSlug, id);
    if (!template) {
      throw fastify.httpErrors.notFound('Report template not found');
    }
    
    // Cache for 10 minutes
    await fastify.redis.setex(cacheKey, 600, JSON.stringify(template));
    request.headers['x-cache'] = 'MISS';
    
    return template;
  }
);