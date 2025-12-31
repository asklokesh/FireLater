import ipaddr from 'ipaddr.js';

// Add tenant validation function
export const validateTenantAccess = async (request: FastifyRequest, reply: FastifyReply) => {
  const tenantId = request.headers['x-tenant-id'];
  if (!tenantId || tenantId !== request.user.tenantId) {
    throw request.server.httpErrors.forbidden('Tenant access violation');
  }
};

// Enhanced CIDR validation function
export const validateCIDR = (cidr: string): boolean => {
  try {
    // Handle IPv6 ranges properly
    if (cidr.includes(':')) {
      // For IPv6, parseCIDR should work directly
      const [addr, range] = cidr.split('/');
      if (!addr || !range) return false;
      
      // Validate that range is a number
      const rangeNum = parseInt(range, 10);
      if (isNaN(rangeNum) || rangeNum < 0 || rangeNum > 128) return false;
      
      // Parse the IPv6 address
      ipaddr.IPv6.parse(addr);
      return true;
    } else {
      // For IPv4, use existing validation
      ipaddr.parseCIDR(cidr);
      return true;
    }
  } catch (error) {
    console.warn(`Invalid CIDR format: ${cidr}`, error);
    return false;
  }
};