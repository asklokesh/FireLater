// In the GET /requests route handler, replace individual asset fetching with batch fetching
// Find where related assets are fetched for each request and replace with:
const requestIds = requests.map((req: any) => req.id);
const assetsByRequest = await requestService.getRelatedAssets(tenantSlug, requestIds);

// Then when building the response, attach assets:
const requestsWithAssets = requests.map((req: any) => ({
  ...req,
  assets: assetsByRequest[req.id] || []
}));