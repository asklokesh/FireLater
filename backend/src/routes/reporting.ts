import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { BadRequestError } from '../utils/errors.js';

// Add tenant slug validation utility
const isValidTenantSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/.test(slug) && slug.length <= 63;
};

async function reportingRoutes(fastify: FastifyInstance) {
  // Validate tenant slug in all routes
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const tenantSlug = request.params['tenantSlug'] || request.body['tenantSlug'];
    if (tenantSlug && !isValidTenantSlug(tenantSlug)) {
      throw new BadRequestError('Invalid tenant identifier');
    }
  });
}