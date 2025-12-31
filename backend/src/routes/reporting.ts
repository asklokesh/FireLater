import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticateTenant } from '../middleware/auth.js';
import { validateDateRange } from '../middleware/validation.js';

// Add date range validation middleware
async function validateReportingParams(request: FastifyRequest) {
  const { fromDate, toDate } = request.query as { fromDate?: string; toDate?: string };
  
  if (fromDate && isNaN(Date.parse(fromDate))) {
    throw new Error('Invalid fromDate parameter');
  }
  
  if (toDate && isNaN(Date.parse(toDate))) {
    throw new Error('Invalid toDate parameter');
  }
  
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new Error('fromDate must be before toDate');
  }
}

export async function reportingRoutes(fastify: FastifyInstance) {
  fastify.get('/templates', {
    preHandler: [authenticateTenant, validateReportingParams],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request;
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as {
      page?: number;
      perPage?: number;
      reportType?: string;
      isPublic?: boolean;
    };

    const result = await reportingService.list(tenantSlug, { page, perPage }, { reportType, isPublic });
    return result;
  });
}