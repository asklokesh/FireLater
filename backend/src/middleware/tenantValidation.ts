import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../utils/errors.js';

export async function validateTenantSchema(request: FastifyRequest, _reply: FastifyReply) {
  const tenantSlug = request.tenantSlug;
  
  if (!tenantSlug) {
    throw new UnauthorizedError('Tenant context required');
  }

  // Validate tenant slug format (alphanumeric, hyphens, underscores only)
  const tenantSlugRegex = /^[a-zA-Z0-9_-]+$/;
  if (!tenantSlugRegex.test(tenantSlug)) {
    throw new UnauthorizedError('Invalid tenant identifier');
  }

  // Additional tenant validation can be added here
  // For example, checking if tenant exists in database
}