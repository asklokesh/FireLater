// Add validation for report template routes
fastify.get('/templates/:templateId', {
  schema: {
    tags: ['Reporting'],
    params: {
      type: 'object',
      properties: {
        templateId: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' }
      },
      required: ['templateId']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        templateId: { 
          type: 'string', 
          pattern: '^[a-zA-Z0-9_-]+$', 
          maxLength: 50 
        }
      },
      required: ['templateId']
    }
  })]
}, async (request, reply) => {
  // Route implementation would go here
});

// Add validation for report generation routes
fastify.post('/generate/:reportType', {
  schema: {
    tags: ['Reporting'],
    params: {
      type: 'object',
      properties: {
        reportType: { type: 'string' }
      },
      required: ['reportType']
    },
    body: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
        filters: { type: 'object' }
      }
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        reportType: { 
          type: 'string',
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