import { BadRequestError } from './errors.js';

export function validateTenantContext(tenantSlug: string | undefined): asserts tenantSlug is string {
  if (!tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
}