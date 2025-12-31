fastify.get('/search', {
  schema: {
    tags: ['knowledge'],
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        sort: { type: 'string' },
        order: { type: 'string', enum: ['asc', 'desc'] },
        type: { type: 'string', enum: ['how_to', 'troubleshooting', 'faq', 'reference', 'policy', 'known_error'] },
        visibility: { type: 'string', enum: ['public', 'internal', 'restricted'] },
        categoryId: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          articles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                article_number: { type: 'string' },
                title: { type: 'string' },
                slug: { type: 'string' },
                summary: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' },
                visibility: { type: 'string' },
                category_id: { type: 'string' },
                author_id: { type: 'string' },
                view_count: { type: 'integer' },
                helpful_count: { type: 'integer' },
                not_helpful_count: { type: 'integer' },
                published_at: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
                author_name: { type: 'string' },
                author_email: { type: 'string' },
                category_name: { type: 'string' },
                related_problem_number: { type: 'string' },
                related_issue_number: { type: 'string' }
              }
            }
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          perPage: { type: 'integer' }
        }
      }
    }
  },
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
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

  // Sanitize inputs with improved validation
  if (q) {
    q = sanitizeInput(q);
    // Limit search query length
    if (q.length > 255) {
      q = q.substring(0, 255);
    }
  }
  
  if (sort) {
    sort = sanitizeInput(sort);
    // Validate sort field against allowed values
    const allowedSortFields = ['title', 'created_at', 'updated_at', 'view_count'];
    if (!allowedSortFields.includes(sort)) {
      sort = 'created_at'; // Default to safe value
    }
  }
  
  if (categoryId) {
    categoryId = sanitizeInput(categoryId);
    // Validate UUID format for category ID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      categoryId = undefined; // Ignore invalid category ID
    }
  }

  const pagination: PaginationParams = { page, perPage, sort, order };
  const filters = { type, visibility, categoryId };

  // Generate cache key for knowledge search
  const cacheKeyParams = {
    q,
    page,
    perPage,
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