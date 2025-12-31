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
  
  // Validate tenant context
  if (!request.tenantSlug) {
    return reply.code(400).send({ message: 'Tenant context required' });
  }
  
  try {
    await reportingService.delete(request.tenantSlug, id);
    return { message: 'Template deleted successfully' };
  } catch (error: any) {
    request.log.error({ err: error, templateId: id, tenant: request.tenantSlug }, 'Failed to delete template');
    
    if (error.code === 'P2025') { // Prisma record not found
      return reply.code(404).send({ message: 'Template not found' });
    }
    
    return reply.code(500).send({ message: 'Failed to delete template' });
  }
});