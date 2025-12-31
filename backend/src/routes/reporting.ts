export default async function reportingRoutes(fastify: FastifyInstance) {
  // Apply validation to the list route
  fastify.get('/templates', {
    preHandler: [authenticate, authorize(['read:reports']), validate(reportListSchema)],
    handler: async (request, reply) => {
      // ... existing implementation
    }
  });
  
  // Add validation for report generation route
  fastify.post('/generate', {
    preHandler: [authenticate, authorize(['create:reports']), validate({
      body: {
        type: 'object',
        properties: {
          templateId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
          parameters: { 
            type: 'object',
            additionalProperties: true,
            properties: {
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
              tenantId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
            }
          },
          format: { type: 'string', enum: ['pdf', 'csv', 'json'] }
        },
        required: ['templateId', 'format'],
        additionalProperties: false
      }
    })],
    handler: async (request, reply) => {
      // ... existing implementation
    }
  });
}