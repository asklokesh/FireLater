// Replace the sequential health scoring calls with batch processing
fastify.get('/assets', {
  schema: assetsListSchema,
  preHandler: [authHook, tenantHook]
}, async (request, reply) => {
  const { tenantSlug } = request;
  const { page = 1, perPage = 20, search, status, categoryId } = request.query as any;
  
  const pagination = { page: parseInt(page), perPage: parseInt(perPage) };
  const filters = { search, status, categoryId };
  
  const result = await assetService.list(tenantSlug, pagination, filters);
  
  // Batch calculate health scores instead of sequential calls
  const assetIds = result.assets.map((asset: any) => asset.id);
  const healthScores = await assetService.getHealthScoresBatch(tenantSlug, assetIds);
  
  // Merge health scores with assets
  const assetsWithHealth = result.assets.map((asset: any) => ({
    ...asset,
    health_score: healthScores[asset.id] || 0
  }));
  
  return reply.send({
    assets: assetsWithHealth,
    total: result.total
  });
});