// Add tenant validation function
export const validateTenantAccess = async (request: FastifyRequest, reply: FastifyReply) => {
  const tenantId = request.headers['x-tenant-id'];
  if (!tenantId || tenantId !== request.user.tenantId) {
    throw request.server.httpErrors.forbidden('Tenant access violation');
  }
};