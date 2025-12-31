// Replace the individual health score fetching with a bulk query
// Find the section where health scores are fetched for multiple assets
// It likely looks something like:
// const assetsWithScores = await Promise.all(
//   assets.map(async (asset) => {
//     const healthScore = await assetService.getHealthScore(tenantSlug, asset.id);
//     return { ...asset, healthScore };
//   })
// );

// Change to:
const assetIds = assets.map(asset => asset.id);
const healthScores = await assetService.getBulkHealthScores(tenantSlug, assetIds);

const assetsWithScores = assets.map(asset => {
  const healthScore = healthScores.find(score => score.assetId === asset.id)?.score || 0;
  return { ...asset, healthScore };
});