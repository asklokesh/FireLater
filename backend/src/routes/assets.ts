// In the route handler where assets are fetched, replace individual health score lookups with batch fetching
// Example pattern to fix (assuming there's a section like this):
// const assets = await assetService.list(tenantSlug, filters);
// for (const asset of assets) {
//   asset.healthScore = await healthService.getAssetScore(asset.id); // N+1 query
// }

// Should be changed to:
const assets = await assetService.list(tenantSlug, filters);
const assetIds = assets.map(asset => asset.id);
const healthScores = await healthService.getAssetScoresBatch(tenantSlug, assetIds);

// Then merge the scores back into assets
const scoresMap = new Map(healthScores.map(score => [score.assetId, score]));
for (const asset of assets) {
  asset.healthScore = scoresMap.get(asset.id)?.score || null;
}