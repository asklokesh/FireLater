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
          parameters: { type: 'object' },
          format: { type: 'string', enum: ['pdf', 'csv', 'json'] }
        },
        required: ['templateId', 'format']
      }
    })],
    handler: async (request, reply) => {
      // ... existing implementation
    }
  });
}