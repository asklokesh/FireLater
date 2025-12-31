import ipaddr from 'ipaddr.js';

// Add tenant validation function
export const validateTenantAccess = async (request: FastifyRequest, reply: FastifyReply) => {
  const tenantId = request.headers['x-tenant-id'];
  if (!tenantId || tenantId !== request.user.tenantId) {
    throw request.server.httpErrors.forbidden('Tenant access violation');
  }
};

// CIDR validation function
export const validateCIDR = (cidr: string): boolean => {
  try {
    ipaddr.parseCIDR(cidr);
    return true;
  } catch (error) {
    console.warn(`Invalid CIDR format: ${cidr}`);
    return false;
  }
};