// Replace the entire list handler with optimized batch queries
async function listAssetsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string };
  const { page = 1, perPage = 20, search, categoryId, status } = request.query as {
    page?: number;
    perPage?: number;
    search?: string;
    categoryId?: string;
    status?: string;
  };

  const pagination = { page, perPage };
  const filters = { search, categoryId, status };

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