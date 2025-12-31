// Before: individual queries for each asset health score
// const assetsWithHealth = await Promise.all(
//   assets.map(async (asset) => {
//     const healthScore = await assetService.getHealthScore(tenantSlug, asset.id);
//     return { ...asset, healthScore };
//   })
// );

// After: batch fetch all health scores in a single query
const assetIds = assets.map((asset: any) => asset.id);
const healthScores = await assetService.getHealthScoresBatch(tenantSlug, assetIds);

const assetsWithHealth = assets.map((asset: any) => {
  const healthScore = healthScores.find((h: any) => h.assetId === asset.id)?.score || null;
  return { ...asset, healthScore };
});