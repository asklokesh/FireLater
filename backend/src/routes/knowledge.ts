fastify.get('/search', {
  schema: {
    tags: ['knowledge'],
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 255 },
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        sort: { type: 'string', maxLength: 50 },
        order: { type: 'string', enum: ['asc', 'desc'] },
        type: { type: 'string', enum: ['how_to', 'troubleshooting', 'faq', 'reference', 'policy', 'known_error'] },
        visibility: { type: 'string', enum: ['public', 'internal', 'restricted'] },
        categoryId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      additionalProperties: false
    }
  },
  preHandler: [fastify.authenticate],
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute'
    }
  }
}, async (request, reply) => {
  // Remove manual sanitization - now handled by global hook
  let { q, page = 1, perPage = 20, sort, order, type, visibility, categoryId } = request.query as {
    q?: string;
    page?: number;
    perPage?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    type?: ArticleType;
    visibility?: ArticleVisibility;
    categoryId?: string;
  };

  // Remove manual sanitization logic - validation schema handles constraints
  const pagination: PaginationParams = { 
    page, 
    perPage,
    sort,
    order
  };
  const filters = { type, visibility, categoryId };

  // Generate cache key for knowledge search
  const cacheKeyParams = {
    q,
    page: pagination.page,
    perPage: pagination.perPage,
    sort,
    order,
    type,
    visibility,
    categoryId
  };
  const cacheKey = `knowledge:search:${request.user.tenant}:${JSON.stringify(cacheKeyParams)}`;

  // Try cache first
  const cachedResult = await fastify.redis.get(cacheKey);
  if (cachedResult) {
    reply.header('X-Cache', 'HIT');
    return JSON.parse(cachedResult);
  }

  // Batch fetch articles with related data to avoid N+1 queries
  const { articles, total } = await knowledgeService.searchArticlesWithRelations(
    request.user.tenant,
    q || '',
    pagination,
    filters
  );

  const result = {
    articles,
    total,
    page: pagination.page,
    perPage: pagination.perPage
  };

  // Cache for 5 minutes
  await fastify.redis.setex(cacheKey, 300, JSON.stringify(result));
  reply.header('X-Cache', 'MISS');

  return result;
});