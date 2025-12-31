fastify.delete('/templates/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  })]
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  
  // Validate tenant context with proper validation
  if (!request.tenantSlug) {
    return reply.code(400).send({ message: 'Tenant context required' });
  }