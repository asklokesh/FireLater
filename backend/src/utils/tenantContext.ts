import { FastifyRequest } from 'fastify';
import { UnauthorizedError } from './errors.js';

export function getTenantContext(request: FastifyRequest): { tenantSlug: string } {
  const tenantSlug = request.user?.tenantSlug || request.headers['x-tenant-slug'];
  
  if (!tenantSlug) {
    throw new UnauthorizedError('Tenant context required');
  }
  
  return { tenantSlug: tenantSlug as string };
}