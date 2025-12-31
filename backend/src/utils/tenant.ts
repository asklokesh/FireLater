import { FastifyRequest } from 'fastify';

export function getTenantSlug(request: FastifyRequest): string {
  if (!request.user || !request.user.tenantSlug) {
    throw new Error('Tenant information not available in request');
  }
  return request.user.tenantSlug;
}