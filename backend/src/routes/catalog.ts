import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { catalogCategoryService, catalogItemService } from '../services/catalog.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { createCategorySchema, updateCategorySchema, fieldValidationSchema, defaultValueSchema, formFieldSchema, formSchemaSchema, createItemSchema, updateItemSchema, categoryIdParamSchema, itemIdParamSchema, listCategoriesQuerySchema, listItemsQuerySchema } from '../schemas/catalog.js';

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
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listCategoriesQuerySchema.parse(query);
    const includeInactive = validatedQuery.include_inactive === 'true';

    const categories = await catalogCategoryService.list(tenantSlug, includeInactive);
    reply.send({ data: categories });
  });

  // Get category by ID
  app.get<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof categoryIdParamSchema>;

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
    preHandler: [requirePermission('catalog:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createCategorySchema>;

    const category = await catalogCategoryService.create(tenantSlug, body, userId);
    reply.status(201).send(category);
  });

  // Update category
  app.put<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof categoryIdParamSchema>;
    const body = request.body as z.infer<typeof updateCategorySchema>;

    const category = await catalogCategoryService.update(tenantSlug, id, body, userId);
    reply.send(category);
  });

  // Delete category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof categoryIdParamSchema>;

    await catalogCategoryService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // ========================================
  // ITEMS
  // ========================================

  // List items
  app.get('/items', {
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listItemsQuerySchema.parse(query);
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
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as z.infer<typeof itemIdParamSchema>;

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
    preHandler: [requirePermission('catalog:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as z.infer<typeof createItemSchema>;

    const item = await catalogItemService.create(tenantSlug, body, userId);
    reply.status(201).send(item);
  });

  // Update item
  app.put<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof itemIdParamSchema>;
    const body = request.body as z.infer<typeof updateItemSchema>;

    const item = await catalogItemService.update(tenantSlug, id, body, userId);
    reply.send(item);
  });

  // Delete item
  app.delete<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as z.infer<typeof itemIdParamSchema>;

    await catalogItemService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });
}
