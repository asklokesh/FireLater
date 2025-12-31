import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportTemplateService, reportingService } from '../services/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { BadRequestError } from '../utils/errors.js';

// Add this validation function for date parameters
function validateDateRange(fromDate?: string, toDate?: string): void {
  if (fromDate && isNaN(Date.parse(fromDate))) {
    throw new BadRequestError('Invalid fromDate parameter');
  }
  if (toDate && isNaN(Date.parse(toDate))) {
    throw new BadRequestError('Invalid toDate parameter');
  }
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new BadRequestError('fromDate cannot be after toDate');
  }
}

export async function reportingRoutes(fastify: FastifyInstance) {
  // GET /api/v1/reporting/templates
  fastify.get('/reporting/templates', {
    preHandler: [authenticate, authorize('read:reports'), validatePagination],
    schema: {
      tags: ['Reporting'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { page?: number; perPage?: number; reportType?: string; isPublic?: boolean } }>) => {
    const { page = 1, perPage = 20, reportType, isPublic } = request.query;
    const pagination = { page, perPage };
    
    const templates = await reportTemplateService.list(
      request.tenantSlug!,
      pagination,
      { reportType, isPublic }
    );
    
    return templates;
  });

  // GET /api/v1/reporting/generate
  fastify.get('/reporting/generate', {
    preHandler: [authenticate, authorize('read:reports')],
    schema: {
      tags: ['Reporting'],
      querystring: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          fromDate: { type: 'string', format: 'date-time' },
          toDate: { type: 'string', format: 'date-time' }
        },
        required: ['templateId']
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { templateId: string; fromDate?: string; toDate?: string } }>) => {
    const { templateId, fromDate, toDate } = request.query;
    
    // Validate date parameters
    validateDateRange(fromDate, toDate);
    
    const report = await reportingService.generateReport(
      request.tenantSlug!,
      templateId,
      fromDate,
      toDate
    );
    
    return report;
  });
}