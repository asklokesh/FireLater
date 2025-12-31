// Add input sanitization utility
const sanitizeInput = (input: string): string => {
  return input.replace(/[^a-zA-Z0-9:_\-\. ]/g, '').trim();
};

// In the /templates GET route, sanitize inputs before using them
fastify.get(
  '/templates',
  {
    preHandler: [authenticate, authorize('read:reports'), validatePagination],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          reportType: { type: 'string' },
          isPublic: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  },
  async (request: FastifyRequest<{ Querystring: ReportTemplateQuery; Params: PaginationParams }>) => {
    const { tenantSlug } = request.user!;
    const { page, perPage } = request.query;
    const pagination: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    };

    const filters = {
      reportType: request.query.reportType ? sanitizeInput(request.query.reportType) : undefined,
      isPublic: request.query.isPublic ? request.query.isPublic === 'true' : undefined,
    };

    return reportTemplateService.list(tenantSlug, pagination, filters);
  }
);

// In the /templates/:id GET route, validate ID format
fastify.get(
  '/templates/:id',
  {
    preHandler: [authenticate, authorize('read:reports')],
  },
  async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw fastify.httpErrors.badRequest('Invalid template ID format');
    }

    const template = await reportTemplateService.findById(tenantSlug, id);
    if (!template) {
      throw fastify.httpErrors.notFound('Report template not found');
    }

    return template;
  }
);

// In the /templates POST route, add input sanitization
fastify.post(
  '/templates',
  {
    preHandler: [authenticate, authorize('write:reports')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'reportType'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          reportType: { type: 'string' },
          queryConfig: { type: 'object' },
          filters: { type: 'object' },
          groupings: { type: 'array', items: { type: 'string' },
          metrics: { type: 'array', items: { type: 'string' } },
          chartConfig: { type: 'object' },
          outputFormat: { type: 'string' },
          includeCharts: { type: 'boolean' },
          isPublic: { type: 'boolean' },
        },
      },
    },
  },
  async (request) => {
    const { tenantSlug, userId } = request.user!;
    const data = request.body as any;
    
    // Sanitize string inputs
    if (data.name) data.name = sanitizeInput(data.name);
    if (data.description) data.description = sanitizeInput(data.description);
    if (data.reportType) data.reportType = sanitizeInput(data.reportType);
    if (data.outputFormat) data.outputFormat = sanitizeInput(data.outputFormat);

    return reportTemplateService.create(tenantSlug, userId, data);
  }
);

// In the /templates/:id PUT route, validate ID and sanitize inputs
fastify.put(
  '/templates/:id',
  {
    preHandler: [authenticate, authorize('write:reports')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          reportType: { type: 'string' },
          queryConfig: { type: 'object' },
          filters: { type: 'object' },
          groupings: { type: 'array', items: { type: 'string' } },
          metrics: { type: 'array', items: { type: 'string' } },
          chartConfig: { type: 'object' },
          outputFormat: { type: 'string' },
          includeCharts: { type: 'boolean' },
          isPublic: { type: 'boolean' },
        },
      },
    },
  },
  async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw fastify.httpErrors.badRequest('Invalid template ID format');
    }
    
    const data = request.body as Partial<any>;
    
    // Sanitize string inputs
    if (data.name) data.name = sanitizeInput(data.name);
    if (data.description) data.description = sanitizeInput(data.description);
    if (data.reportType) data.reportType = sanitizeInput(data.reportType);
    if (data.outputFormat) data.outputFormat = sanitizeInput(data.outputFormat);

    return reportTemplateService.update(tenantSlug, id, data);
  }
);

// In the /templates/:id DELETE route, validate ID format
fastify.delete(
  '/templates/:id',
  {
    preHandler: [authenticate, authorize('delete:reports')],
  },
  async (request: FastifyRequest<{ Params: ReportTemplateParams }>) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw fastify.httpErrors.badRequest('Invalid template ID format');
    }

    await reportTemplateService.delete(tenantSlug, id);
    return { message: 'Report template deleted successfully' };
  }
);

// In the /run POST route, add input validation and sanitization
fastify.post(
  '/run',
  {
    preHandler: [authenticate, authorize('read:reports')],
    schema: {
      body: {
        type: 'object',
        required: ['templateId'],
        properties: {
          templateId: { type: 'string' },
          filters: { type: 'object' },
          fromDate: { type: 'string', format: 'date-time' },
          toDate: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  async (request) => {
    const { tenantSlug } = request.user!;
    const { templateId, filters, fromDate, toDate } = request.body as {
      templateId: string;
      filters?: Record<string, any>;
      fromDate?: string;
      toDate?: string;
    };
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId)) {
      throw fastify.httpErrors.badRequest('Invalid template ID format');
    }
    
    // Validate date formats if provided
    if (fromDate && isNaN(Date.parse(fromDate))) {
      throw fastify.httpErrors.badRequest('Invalid fromDate format');
    }
    
    if (toDate && isNaN(Date.parse(toDate))) {
      throw fastify.httpErrors.badRequest('Invalid toDate format');
    }

    return reportTemplateService.run(tenantSlug, templateId, {
      filters,
      fromDate,
      toDate
    });
  }
);