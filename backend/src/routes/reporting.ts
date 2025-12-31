// Add cache key generation utility
const generateReportCacheKey = (tenantSlug: string, reportType: string, params: Record<string, any>): string => {
  const sanitizedParams = JSON.parse(JSON.stringify(params));
  // Remove sensitive or non-cacheable fields
  delete sanitizedParams.apiKey;
  return `report:${tenantSlug}:${reportType}:${JSON.stringify(sanitizedParams)}`;
};

// Add input sanitization utility at the top of the file
const sanitizeInput = (input: string): string => {
  return input.replace(/[^a-zA-Z0-9:_\-\. ]/g, '').trim();
};

// In the /templates GET route, add caching
fastify.get(
  '/templates',
  {
    preHandler: [authenticate, authorize('read:reports'), validatePagination],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          reportType: { type: 'string' },
          isPublic: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  },
  async (request: FastifyRequest<{ Querystring: ReportTemplateQuery; Params: PaginationParams }>) => {
    const { tenantSlug } = request.user!;
    const { page, perPage } = request.query;
    const pagination: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    };

    const filters = {
      reportType: request.query.reportType ? sanitizeInput(request.query.reportType) : undefined,
      isPublic: request.query.isPublic ? request.query.isPublic === 'true' : undefined,
    };

    // Generate cache key
    const cacheKey = generateReportCacheKey(tenantSlug, 'templates', { pagination, filters });
    
    // Try cache first
    const cachedResult = await fastify.redis.get(cacheKey);
    if (cachedResult) {
      request.headers['x-cache'] = 'HIT';
      return JSON.parse(cachedResult);
    }

    const result = await reportTemplateService.list(tenantSlug, pagination, filters);
    
    // Cache for 5 minutes
    await fastify.redis.setex(cacheKey, 300, JSON.stringify(result));
    request.headers['x-cache'] = 'MISS';
    
    return result;
  }
);

// In the /templates/:id GET route, add caching
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

    // Generate cache key
    const cacheKey = `report:${tenantSlug}:template:${id}`;
    
    // Try cache first
    const cachedResult = await fastify.redis.get(cacheKey);
    if (cachedResult) {
      request.headers['x-cache'] = 'HIT';
      return JSON.parse(cachedResult);
    }

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