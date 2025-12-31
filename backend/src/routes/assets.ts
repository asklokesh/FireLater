fastify.get('/', {
  schema: {
    tags: ['assets'],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        sort: { type: 'string' },
        order: { type: 'string', enum: ['asc', 'desc'] },
        status: { type: 'string', enum: ['active', 'inactive', 'maintenance', 'retired'] },
        type: { type: 'string' },
        categoryId: { type: 'string' },
        search: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          assets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' },
                category_id: { type: 'string' },
                serial_number: { type: 'string' },
                asset_tag: { type: 'string' },
                location: { type: 'string' },
                assigned_to: { type: 'string' },
                assigned_at: { type: 'string' },
                purchased_at: { type: 'string' },
                warranty_expires_at: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
                category_name: { type: 'string' },
                assigned_user_name: { type: 'string' },
                assigned_user_email: { type: 'string' }
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
  preHandler: [fastify.authenticate, fastify.authorize('read:assets')]
}, async (request, reply) => {
  const { page = 1, perPage = 20, sort, order, status, type, categoryId, search } = request.query as {
    page?: number;
    perPage?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    status?: AssetStatus;
    type?: string;
    categoryId?: string;
    search?: string;
  };

  const pagination: PaginationParams = { page, perPage, sort, order };
  const filters = { status, type, categoryId, search };

  // Generate cache key for asset listing
  const cacheKeyParams = {
    page,
    perPage,
    sort,
    order,
    status,
    type,
    categoryId,
    search
  };
  const cacheKey = `assets:list:${request.user.tenant}:${JSON.stringify(cacheKeyParams)}`;

  // Try cache first
  const cachedResult = await fastify.redis.get(cacheKey);
  if (cachedResult) {
    reply.header('X-Cache', 'HIT');
    return JSON.parse(cachedResult);
  }

  const { assets, total } = await assetService.listWithRelations(
    request.user.tenant,
    pagination,
    filters
  );

  const result = {
    assets,
    total,
    page: pagination.page,
    perPage: pagination.perPage
  };

  // Cache for 5 minutes
  await fastify.redis.setex(cacheKey, 300, JSON.stringify(result));
  reply.header('X-Cache', 'MISS');

  return result;
});