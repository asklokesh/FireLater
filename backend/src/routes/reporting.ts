import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

// Add date validation helper
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Expected YYYY-MM-DD');

// Add validation middleware for date parameters
async function validateDateRange(request: FastifyRequest) {
  const { fromDate, toDate } = request.query as { fromDate?: string; toDate?: string };
  
  if (fromDate) {
    const fromResult = dateSchema.safeParse(fromDate);
    if (!fromResult.success) {
      throw new Error(`Invalid fromDate: ${fromResult.error.errors[0].message}`);
    }
  }
  
  if (toDate) {
    const toResult = dateSchema.safeParse(toDate);
    if (!toResult.success) {
      throw new Error(`Invalid toDate: ${toResult.error.errors[0].message}`);
    }
  }
  
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new Error('fromDate must be before toDate');
  }
}

export async function reportingRoutes(fastify: FastifyInstance) {
  // Apply authentication and authorization middleware
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['read:reports']));

  // GET /api/reporting/templates - List report templates
  fastify.get('/templates', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
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
    },
    preHandler: validate
  }, async (request, reply) => {
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as {
      page?: number;
      perPage?: number;
      reportType?: string;
      isPublic?: boolean;
    };

    const result = await reportingService.list(request.tenantSlug!, {
      page,
      perPage
    }, {
      reportType,
      isPublic
    });

    return {
      templates: result.templates,
      total: result.total,
      page,
      perPage
    };
  });

  // GET /api/reporting/templates/:id - Get report template
  fastify.get('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await reportingService.getById(request.tenantSlug!, id);
    return template;
  });

  // POST /api/reporting/templates - Create report template
  fastify.post('/templates', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          reportType: { type: 'string' },
          config: { type: 'object' },
          isPublic: { type: 'boolean' },
          schedule: { type: 'object' }
        },
        required: ['name', 'reportType', 'config']
      }
    }
  }, async (request, reply) => {
    const templateData = request.body as any;
    const template = await reportingService.create(
      request.tenantSlug!,
      request.user!.id,
      templateData
    );
    return template;
  });

  // PUT /api/reporting/templates/:id - Update report template
  fastify.put('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          config: { type: 'object' },
          isPublic: { type: 'boolean' },
          schedule: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updateData = request.body as any;
    const template = await reportingService.update(
      request.tenantSlug!,
      id,
      updateData
    );
    return template;
  });

  // DELETE /api/reporting/templates/:id - Delete report template
  fastify.delete('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await reportingService.delete(request.tenantSlug!, id);
    return { message: 'Template deleted successfully' };
  });

  // GET /api/reporting/run/:templateId - Run report
  fastify.get('/run/:templateId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          templateId: { type: 'string' }
        },
        required: ['templateId']
      },
      querystring: {
        type: 'object',
        properties: {
          fromDate: { type: 'string' },
          toDate: { type: 'string' }
        }
      }
    },
    preHandler: validateDateRange
  }, async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const { fromDate, toDate } = request.query as { fromDate?: string; toDate?: string };
    
    const report = await reportingService.runReport(
      request.tenantSlug!,
      templateId,
      { fromDate, toDate }
    );
    
    return report;
  });

  // GET /api/reporting/scheduled - List scheduled reports
  fastify.get('/scheduled', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    preHandler: validate
  }, async (request, reply) => {
    const { page = 1, perPage = 20 } = request.query as { page?: number; perPage?: number };

    const result = await reportingService.listScheduled(request.tenantSlug!, {
      page,
      perPage
    });

    return {
      scheduledReports: result.reports,
      total: result.total,
      page,
      perPage
    };
  });
}