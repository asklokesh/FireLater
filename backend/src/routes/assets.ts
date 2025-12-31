// In the health score calculation section, replace individual queries with batched approach
fastify.get('/assets/health', {
  preHandler: [authenticate, authorize(['admin', 'manager', 'technician'])]
}, async (request, reply) => {
  const tenantId = request.user.tenant;
  
  // Fetch all assets first
  const assets = await assetService.getAllAssets(tenantId);
  
  // Batch fetch health data for all assets instead of individual queries
  const assetIds = assets.map(asset => asset.id);
  const healthData = await assetService.getBatchHealthData(assetIds, tenantId);
  
  // Calculate health scores using batched data
  const healthScores = assets.map(asset => {
    const data = healthData.find(d => d.assetId === asset.id);
    return {
      assetId: asset.id,
      score: data ? calculateHealthScore(data) : 0,
      lastChecked: data?.lastChecked || null
    };
  });
  
  return { healthScores };
});