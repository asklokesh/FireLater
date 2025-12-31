import { FastifyRequest } from 'fastify';

export interface TenantInfo {
  slug: string;
  id: string;
}

export function getTenantFromRequest(request: FastifyRequest): TenantInfo {
  // Centralized tenant resolution logic
  if (!request.user || !request.user.tenant) {
    throw new Error('Tenant information not available in request');
  }
  
  return {
    slug: request.user.tenant,
    id: request.user.tenantId || ''
  };
}