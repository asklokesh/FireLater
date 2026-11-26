import type { RouteSchemaMap } from './types.js';
import { categoryIdParamSchema, createCategorySchema, createItemSchema, itemIdParamSchema, listCategoriesQuerySchema, listItemsQuerySchema, updateCategorySchema, updateItemSchema } from './catalog.js';

export const catalogRouteSchemas: RouteSchemaMap = {
  'GET /catalog/categories': { query: listCategoriesQuerySchema },
  'GET /catalog/categories/:id': { params: categoryIdParamSchema },
  'POST /catalog/categories': { body: createCategorySchema },
  'PUT /catalog/categories/:id': { body: updateCategorySchema, params: categoryIdParamSchema },
  'DELETE /catalog/categories/:id': { params: categoryIdParamSchema },
  'GET /catalog/items': { query: listItemsQuerySchema },
  'GET /catalog/items/:id': { params: itemIdParamSchema },
  'POST /catalog/items': { body: createItemSchema },
  'PUT /catalog/items/:id': { body: updateItemSchema, params: itemIdParamSchema },
  'DELETE /catalog/items/:id': { params: itemIdParamSchema },
};
