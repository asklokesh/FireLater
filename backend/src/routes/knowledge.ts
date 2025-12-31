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
  preHandler: [fastify.authenticate, validate({
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
  })],
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute'
    }
  }
}, async (request, reply) => {