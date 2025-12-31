// Replace the entire list handler function with this optimized version
async function listAssetsHandler(request: FastifyRequest<{ Querystring: AssetListQuery }>, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string };
  const { page = 1, perPage = 20, search, categoryId, status, locationId, custodianId } = request.query;
  
  const pagination: PaginationParams = { page, perPage };
  const filters = { search, categoryId, status, locationId, custodianId };
  
  const result = await assetService.list(tenantSlug, pagination, filters);
  
  return reply.send({
    assets: result.assets,
    pagination: {
      page: pagination.page,
      perPage: pagination.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / pagination.perPage)
    }
  });
}