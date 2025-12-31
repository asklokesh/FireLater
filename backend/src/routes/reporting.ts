import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportingService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { BadRequestError } from '../utils/errors.js';
import { createHash } from 'crypto';

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

// Generate cache key for analytics requests
const generateAnalyticsCacheKey = (tenantSlug: string, query: any): string => {
  const keyData = `${tenantSlug}:${JSON.stringify(query)}`;
  return `analytics:${createHash('md5').update(keyData).digest('hex')}`;
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
      // Add rate limiting
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: { 
      reportType?: string; 
      fromDate?: string; 
      toDate?: string; 
      groupBy?: string;
    } }>, reply) => {
      const { tenantSlug } = request.user!;
      const { reportType, fromDate, toDate, groupBy } = request.query;

      // Validate date parameters
      validateDateRange(fromDate, toDate);

      // Generate cache key
      const cacheKey = generateAnalyticsCacheKey(tenantSlug, request.query);
      
      // Try to get from cache first
      const cachedData = await fastify.redis.get(cacheKey);
      if (cachedData) {
        reply.header('X-Cache', 'HIT');
        return { data: JSON.parse(cachedData) };
      }

      const data = await reportingService.getAnalytics(
        tenantSlug,
        reportType,
        fromDate,
        toDate,
        groupBy
      );

      // Cache the result for 5 minutes
      await fastify.redis.setex(cacheKey, 300, JSON.stringify(data));
      reply.header('X-Cache', 'MISS');
      
      return { data };
    }
  );
}