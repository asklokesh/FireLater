import { FastifyInstance } from 'fastify';
import { catalogCategoryService, catalogItemService } from '../services/catalog.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  categoryIdParamSchema,
  createCategorySchema,
  createItemSchema,
  itemIdParamSchema,
  listCategoriesQuerySchema,
  listItemsQuerySchema,
  updateCategorySchema,
  updateItemSchema,
  type CategoryIdParamInput,
  type CreateCategoryInput,
  type CreateItemInput,
  type ItemIdParamInput,
  type UpdateCategoryInput,
  type UpdateItemInput,
  type ListCategoriesQueryInput,
  type ListItemsQueryInput,
} from '../schemas/catalog.js';

// ============================================
// CATEGORY SCHEMAS
// ============================================



// ============================================
// ITEM SCHEMAS
// ============================================

// Validation rules that can be applied to form fields

// Default values constrained by primitive types only





// Parameter validation schemas


// Query parameter validation schemas


export default async function catalogRoutes(app: FastifyInstance) {
  // ========================================
  // CATEGORIES
  // ========================================

  // List categories
  app.get('/categories', {
    preHandler: [requirePermission('catalog:read'), validate({ query: listCategoriesQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const validatedQuery = request.query as ListCategoriesQueryInput;
    const includeInactive = validatedQuery.include_inactive === 'true';

    const categories = await catalogCategoryService.list(tenantSlug, includeInactive);
    reply.send({ data: categories });
  });

  // Get category by ID
  app.get<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:read'), validate({ params: categoryIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as CategoryIdParamInput;

    const category = await catalogCategoryService.findById(tenantSlug, id);

    if (!category) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Category with id '${id}' not found`,
      });
    }

    reply.send(category);
  });

  // Create category
  app.post('/categories', {
    preHandler: [requirePermission('catalog:create'), validate({ body: createCategorySchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateCategoryInput;

    const category = await catalogCategoryService.create(tenantSlug, body, userId);
    reply.status(201).send(category);
  });

  // Update category
  app.put<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:update'), validate({ params: categoryIdParamSchema, body: updateCategorySchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as CategoryIdParamInput;
    const body = request.body as UpdateCategoryInput;

    const category = await catalogCategoryService.update(tenantSlug, id, body, userId);
    reply.send(category);
  });

  // Delete category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:delete'), validate({ params: categoryIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as CategoryIdParamInput;

    await catalogCategoryService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // ========================================
  // ITEMS
  // ========================================

  // List items
  app.get('/items', {
    preHandler: [requirePermission('catalog:read'), validate({ query: listItemsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListItemsQueryInput;
    const pagination = parsePagination(query);

    const filters = {
      categoryId: validatedQuery.category_id,
      search: validatedQuery.search || validatedQuery.q,
      isActive: validatedQuery.is_active === 'true' ? true : validatedQuery.is_active === 'false' ? false : undefined,
      tags: validatedQuery.tags ? validatedQuery.tags.split(',') : undefined,
    };

    const { items, total } = await catalogItemService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(items, total, pagination));
  });

  // Get item by ID
  app.get<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:read'), validate({ params: itemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ItemIdParamInput;

    const item = await catalogItemService.findById(tenantSlug, id);

    if (!item) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Catalog item with id '${id}' not found`,
      });
    }

    reply.send(item);
  });

  // Create item
  app.post('/items', {
    preHandler: [requirePermission('catalog:create'), validate({ body: createItemSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateItemInput;

    const item = await catalogItemService.create(tenantSlug, body, userId);
    reply.status(201).send(item);
  });

  // Update item
  app.put<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:update'), validate({ params: itemIdParamSchema, body: updateItemSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ItemIdParamInput;
    const body = request.body as UpdateItemInput;

    const item = await catalogItemService.update(tenantSlug, id, body, userId);
    reply.send(item);
  });

  // Delete item
  app.delete<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:delete'), validate({ params: itemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ItemIdParamInput;

    await catalogItemService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });
}
