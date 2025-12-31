import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { BadRequestError } from '../utils/errors.js';

// Add this interface for date validation
interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

// Add this helper function for date validation
function validateDateRange(params: DateRangeParams): void {
  if (params.startDate && isNaN(Date.parse(params.startDate))) {
    throw new BadRequestError('Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD).');
  }
  
  if (params.endDate && isNaN(Date.parse(params.endDate))) {
    throw new BadRequestError('Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD).');
  }
  
  if (params.startDate && params.endDate) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    
    if (start > end) {
      throw new BadRequestError('startDate must be before or equal to endDate.');
    }
    
    // Limit date range to 1 year maximum
    const oneYearInMillis = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > oneYearInMillis) {
      throw new BadRequestError('Date range cannot exceed 1 year.');
    }
  }
}

export async function reportingRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['read:reports']));

  // GET /api/reporting/templates - List report templates
  fastify.get('/templates', {
    preHandler: validatePagination,
    schema: {
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
  }, async (request: FastifyRequest<{
    Querystring: { 
      page?: number; 
      perPage?: number; 
      reportType?: string; 
      isPublic?: boolean;
      startDate?: string;
      endDate?: string;
    }
  }>) => {
    const { page = 1, perPage = 20, reportType, isPublic, startDate, endDate } = request.query;
    
    // Validate date range parameters
    validateDateRange({ startDate, endDate });
    
    const filters = reportType || isPublic !== undefined ? { reportType, isPublic } : undefined;
    
    return reportService.list(request.tenantSlug!, { page, perPage }, filters);
  });

  // Add validation to other routes that might use date parameters
  fastify.get('/data', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          format: { type: 'string', enum: ['json', 'csv'] }
        },
        required: ['templateId']
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { 
      templateId: string; 
      startDate?: string; 
      endDate?: string;
      format?: string;
    }
  }>) => {
    const { templateId, startDate, endDate, format = 'json' } = request.query;
    
    // Validate date range parameters
    validateDateRange({ startDate, endDate });
    
    return reportService.generateReport(
      request.tenantSlug!, 
      templateId, 
      { startDate, endDate },
      format
    );
  });
}