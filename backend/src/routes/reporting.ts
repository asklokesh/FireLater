// Update the DELETE /api/reporting/templates/:id route
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
  preHandler: validate({
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      },
      required: ['id']
    }
  })
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  
  await reportingService.delete(request.tenantSlug!, id);
  return { message: 'Template deleted successfully' };
});