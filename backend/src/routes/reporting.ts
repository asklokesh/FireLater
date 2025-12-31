import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { BadRequestError } from '../utils/errors.js';

// Add date validation helper
const validateDateRange = (fromDate?: string, toDate?: string): void => {
  if (fromDate && isNaN(Date.parse(fromDate))) {
    throw new BadRequestError('Invalid fromDate parameter');
  }
  if (toDate && isNaN(Date.parse(toDate))) {
    throw new BadRequestError('Invalid toDate parameter');
  }
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new BadRequestError('fromDate must be before toDate');
  }
};

export async function reportingRoutes(fastify: FastifyInstance) {
  // GET /api/v1/reporting/analytics
  fastify.get(
    '/analytics',
    {
      preHandler: [authenticate, authorize('read:reports'), validatePagination],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            reportType: { type: 'string' },
            fromDate: { type: 'string', format: 'date-time' },
            toDate: { type: 'string', format: 'date-time' },
            groupBy: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { 
      reportType?: string; 
      fromDate?: string; 
      toDate?: string; 
      groupBy?: string;
    } }>) => {
      const { tenantSlug } = request.user!;
      const { reportType, fromDate, toDate, groupBy } = request.query;

      // Validate date parameters
      validateDateRange(fromDate, toDate);

      const data = await reportingService.getAnalytics(
        tenantSlug,
        reportType,
        fromDate,
        toDate,
        groupBy
      );
      return { data };
    }
  );
}