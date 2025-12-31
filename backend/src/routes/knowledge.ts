  fastify.get('/articles', {
    preHandler: [authenticateTenant, validateTenantAccess],
    schema: {
      tags: ['knowledge'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          status: { type: 'string' },
          search: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      category?: string;
      status?: string;
      search?: string;
      page?: number;
      perPage?: number;
    }
  }>, reply) => {
    const { tenantSlug } = request;
    const { category, status, search, page = 1, perPage = 20 } = request.query;

    // Optimize search by using full-text search and proper indexing
    const filters = {
      category: category || undefined,
      status: status || undefined,
      search: search ? search.trim() : undefined
    };

    const pagination = { page, perPage };

    const result = await knowledgeService.listArticles(tenantSlug, filters, pagination);

    return {
      articles: result.articles,
      total: result.total,
      page: pagination.page,
      perPage: pagination.perPage
    };
  });