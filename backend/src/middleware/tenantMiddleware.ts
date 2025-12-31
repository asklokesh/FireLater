export const validateTenantSchema = (tenantSlug: string): void => {
  if (!tenantSlug) {
    throw new BadRequestError('Tenant slug is required');
  }
  
  if (typeof tenantSlug !== 'string') {
    throw new BadRequestError('Tenant slug must be a string');
  }
  
  if (!/^[a-zA-Z0-9_-]{3,63}$/.test(tenantSlug)) {
    throw new BadRequestError('Invalid tenant slug format');
  }
};