import type { RouteSchemaMap } from './types.js';
import { assetIdSchema, listAssetsQuerySchema } from './assets.js';

export const assetsRouteSchemas: RouteSchemaMap = {
  'GET /assets': { query: listAssetsQuerySchema },
  'GET /assets/:id': { params: assetIdSchema },
  'PUT /assets/:id': { params: assetIdSchema },
  'DELETE /assets/:id': { params: assetIdSchema },
};
