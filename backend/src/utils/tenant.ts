// Add new utility function:
export async function getTenantSchema(request: FastifyRequest, tenantSlug: string) {
  const tenant = await tenantService.getBySlug(tenantSlug);
  if (!tenant) {
    throw request.server.httpErrors.notFound('Tenant not found');
  }
  if (tenant.slug !== request.user.tenant) {
    throw request.server.httpErrors.forbidden('Access denied');
  }
  return tenant;
}