import { FastifyRequest } from 'fastify';

export function getTenantSlug(request: FastifyRequest): string {
  if (!request.tenantSlug) {
    throw new Error('Tenant slug not found in request');
  }
  return request.tenantSlug;
}