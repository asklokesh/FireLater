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
  // Validate ID format
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) {
    throw fastify.httpErrors.badRequest(`Invalid template ID: ${idResult.error.errors[0].message}`);
  }
  
  await reportingService.delete(request.tenantSlug!, id);
  return { message: 'Template deleted successfully' };
});