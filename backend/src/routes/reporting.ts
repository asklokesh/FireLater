  fastify.get('/reports/usage', {
    preHandler: [
      authenticate,
      authorize(['admin', 'manager']),
      validate(dateRangeSchema)
    ],
    schema: {
      tags: ['Reporting'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { startDate, endDate } = request.query as { 
      startDate?: string; 
      endDate?: string 
    };
    
    // Additional validation to ensure tenant isolation
    const tenantId = request.user.tenant;
    
    // Implementation would now have validated date parameters
    const result = await reportingService.getUsageReport(tenantId, { startDate, endDate });
    return result;
  });