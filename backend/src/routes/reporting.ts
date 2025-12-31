fastify.get('/reports', {
  schema: {
    tags: ['Reporting'],
    querystring: {
      type: 'object',
      properties: {
        type: { type: 'string', maxLength: 50 },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        tenantId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      },
      additionalProperties: false
    }
  },
  preHandler: [fastify.authenticate, validate({
    querystring: {
      type: 'object',
      properties: {
        type: { type: 'string', maxLength: 50 },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        tenantId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
        page: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      },
      additionalProperties: false
    }
  })]
}, async (request, reply) => {