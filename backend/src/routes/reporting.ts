// Add this helper function near the top of the file, after imports
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

// Update the getReports schema to include date validation
const getReports = {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        reportType: { type: 'string' },
        isPublic: { type: 'boolean' },
        fromDate: { type: 'string', format: 'date-time' },
        toDate: { type: 'string', format: 'date-time' }
      },
      additionalProperties: false
    },
    response: {
      200: {
        type: 'object',
        properties: {
          templates: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              perPage: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' }
            }
          }
        }
      }
    }
  },
  handler: async (request: FastifyRequest<{ Querystring: { 
    page?: number; 
    perPage?: number; 
    reportType?: string; 
    isPublic?: boolean;
    fromDate?: string;
    toDate?: string;
  } }>, reply: FastifyReply) => {
    const { page = 1, perPage = 20, reportType, isPublic, fromDate, toDate } = request.query;
    
    // Validate date parameters
    if (fromDate && !isValidDate(fromDate)) {
      throw new BadRequestError('Invalid fromDate parameter');
    }
    
    if (toDate && !isValidDate(toDate)) {
      throw new BadRequestError('Invalid toDate parameter');
    }
    
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      throw new BadRequestError('fromDate must be before toDate');
    }

    const pagination = { page, perPage };
    const filters = { reportType, isPublic };

    const result = await reportTemplateService.list(
      request.tenantSlug!,
      pagination,
      filters
    );

    return {
      templates: result.templates,
      total: result.total,
      pagination: {
        page,
        perPage,
        total: result.total,
        totalPages: Math.ceil(result.total / perPage)
      }
    };
  }
};