fastify.post('/generate/:reportType', {
  schema: {
    tags: ['Reporting'],
    params: {
      type: 'object',
      properties: {
        reportType: { 
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
          enum: ['incidents', 'changes', 'services', 'oncall', 'costs']
        }
      },
      required: ['reportType']
    },
    body: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        filters: { type: 'object' }
      },
      required: ['startDate', 'endDate']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        reportType: { 
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
          enum: ['incidents', 'changes', 'services', 'oncall', 'costs']
        }
      },
      required: ['reportType']
    },
    body: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        filters: { 
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['startDate', 'endDate']
    }
  })]
}, async (request, reply) => {
  // Route implementation would go here
});