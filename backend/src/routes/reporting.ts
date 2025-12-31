// Add validation for report template ID parameter
fastify.get('/reporting/templates/:templateId', {
  preHandler: [authenticate, authorize('read:reports')],
  schema: {
    tags: ['Reporting'],
    params: {
      type: 'object',
      required: ['templateId'],
      properties: {
        templateId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
      }
    }
  }
}, async (request: FastifyRequest<{ Params: { templateId: string } }>) => {
  const { templateId } = request.params;
  
  if (!request.tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
  
  // Validate templateId format
  if (!validateUUID(templateId)) {
    throw new BadRequestError('Invalid templateId format');
  }
  
  const template = await reportTemplateService.getById(
    request.tenantSlug,
    templateId
  );
  
  if (!template) {
    throw new NotFoundError('Report template not found');
  }
  
  return template;
});