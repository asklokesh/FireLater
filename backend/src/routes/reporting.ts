import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticateTenant } from '../middleware/auth.js';
import { validatePagination } from '../middleware/pagination.js';
import { BadRequestError } from '../utils/errors.js';

// Validation helper for date parameters
function validateDateParam(dateStr: string | undefined, paramName: string): Date | undefined {
  if (!dateStr) return undefined;
  
  // Check if it's a valid ISO 8601 date string
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(dateStr)) {
    throw new BadRequestError(`Invalid ${paramName} format. Must be ISO 8601.`);
  }
  
  const date = new Date(dateStr);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new BadRequestError(`Invalid ${paramName} value.`);
  }
  
  // Check if date is within reasonable range (not too far in past or future)
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(now.getFullYear() + 1);
  
  if (date < oneYearAgo || date > oneYearFromNow) {
    throw new BadRequestError(`${paramName} must be within one year of current date.`);
  }
  
  return date;
}

export async function reportingRoutes(fastify: FastifyInstance) {
  // GET /api/v1/reporting/templates
  fastify.get('/templates', {
    preHandler: [authenticateTenant, validatePagination],
    schema: {
      tags: ['reporting'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100 },
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
    const { tenantSlug } = request;
    const { page = 1, perPage = 20, reportType, isPublic, startDate, endDate } = request.query;
    
    // Validate date parameters if provided
    validateDateParam(startDate, 'startDate');
    validateDateParam(endDate, 'endDate');
    
    // Ensure startDate is before endDate
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new BadRequestError('startDate must be before endDate');
    }
    
    const pagination = { page, perPage };
    const filters = { reportType, isPublic };
    
    const result = await reportingService.list(tenantSlug, pagination, filters);
    
    return {
      templates: result.templates,
      total: result.total,
      page: pagination.page,
      perPage: pagination.perPage
    };
  });

  // GET /api/v1/reporting/generate
  fastify.get('/generate', {
    preHandler: authenticateTenant,
    schema: {
      tags: ['reporting'],
      querystring: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          format: { type: 'string', enum: ['json', 'csv'] }
        },
        required: ['templateId', 'startDate', 'endDate']
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { 
      templateId: string; 
      startDate: string; 
      endDate: string;
      format?: string;
    }
  }>, reply) => {
    const { tenantSlug } = request;
    const { templateId, startDate, endDate, format = 'json' } = request.query;
    
    // Validate date parameters
    const start = validateDateParam(startDate, 'startDate');
    const end = validateDateParam(endDate, 'endDate');
    
    if (!start || !end) {
      throw new BadRequestError('Both startDate and endDate are required');
    }
    
    // Ensure startDate is before endDate
    if (start > end) {
      throw new BadRequestError('startDate must be before endDate');
    }
    
    const result = await reportingService.generateReport(
      tenantSlug,
      templateId,
      start.toISOString(),
      end.toISOString(),
      format
    );
    
    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="report-${templateId}.csv"`);
      return result;
    }
    
    return result;
  });
}