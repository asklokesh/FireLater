  fastify.get('/templates', {
    preHandler: [authenticate, authorize('read:reports'), validatePagination],
    schema: {
      tags: ['Reporting'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            templates: { type: 'array' },
            total: { type: 'integer' },
            page: { type: 'integer' },
            perPage: { type: 'integer' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { 
      page?: number; 
      perPage?: number; 
      reportType?: string; 
      isPublic?: boolean;
      startDate?: string;
      endDate?: string;
    }
  }>, reply) => {
    const { page = 1, perPage = 20, reportType, isPublic, startDate, endDate } = request.query;
    
    // Validate date parameters
    if (startDate && !validateDate(startDate)) {
      throw new BadRequestError('Invalid startDate format');
    }
    
    if (endDate && !validateDate(endDate)) {
      throw new BadRequestError('Invalid endDate format');
    }
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new BadRequestError('startDate must be before endDate');
    }

    const pagination = { page, perPage };
    const filters = { reportType, isPublic };
    
    const result = await reportingService.list(
      request.tenantSlug!,
      pagination,
      filters
    );
    
    return {
      templates: result.templates,
      total: result.total,
      page: pagination.page,
      perPage: pagination.perPage
    };
  });