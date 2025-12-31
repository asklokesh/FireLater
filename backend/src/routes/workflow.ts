import { FastifyInstance } from 'fastify';
import { getTenantContext } from '../utils/tenantContext.js';
import { BadRequestError } from '../utils/errors.js';

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Example route that needs tenant context and validation
  fastify.get('/workflows', {
    preHandler: [/* auth middleware */],
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    
    if (!tenantSlug) {
      throw new BadRequestError('Tenant context required');
    }

    // Business logic here
  });
}