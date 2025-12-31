import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { BadRequestError } from '../utils/errors.js';
import { z } from 'zod';

// Add tenant slug validation utility
const isValidTenantSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/.test(slug) && slug.length <= 63;
};

// Add search parameter validation schema
const searchParamsSchema = z.object({
  query: z.string().max(500).optional(),
  filters: z.record(z.string(), z.string()).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

async function reportingRoutes(fastify: FastifyInstance) {
  // Validate tenant slug in all routes
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const tenantSlug = request.params['tenantSlug'] || request.body['tenantSlug'];
    if (tenantSlug && !isValidTenantSlug(tenantSlug)) {
      throw new BadRequestError('Invalid tenant identifier');
    }
  });

  // Add search parameter sanitization hook
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.query && typeof request.query === 'object') {
      try {
        // Validate and sanitize search parameters
        const sanitizedQuery = searchParamsSchema.parse(request.query);
        request.query = sanitizedQuery;
      } catch (error) {
        throw new BadRequestError('Invalid search parameters provided');
      }
    }
  });
}