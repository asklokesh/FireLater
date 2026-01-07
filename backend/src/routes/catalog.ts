import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { catalogCategoryService, catalogItemService } from '../services/catalog.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// ============================================
// CATEGORY SCHEMAS
// ============================================

const createCategorySchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(100).optional(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

// ============================================
// ITEM SCHEMAS
// ============================================

// Validation rules that can be applied to form fields
const fieldValidationSchema = z.object({
  minLength: z.number().int().min(0).max(10000).optional(),
  maxLength: z.number().int().min(0).max(10000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(500).optional(), // Regex pattern
  customMessage: z.string().max(500).optional(),
}).strict();

// Default values constrained by primitive types only
const defaultValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(255)).max(100), // For multi-select defaults
]);

const formFieldSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Field name must be alphanumeric with underscores only'),
  label: z.string().min(1).max(255),
  type: z.enum([
    'text', 'textarea', 'email', 'phone', 'number', 'date', 'datetime',
    'select', 'multi_select', 'radio', 'checkbox', 'file',
    'user_picker', 'group_picker', 'application_picker'
  ]),
  required: z.boolean().optional(),
  options: z.array(z.object({
    value: z.string().max(500),
    label: z.string().max(500),
  })).max(500).optional(), // Limit to 500 options to prevent DoS
  placeholder: z.string().max(500).optional(),
  helpText: z.string().max(2000).optional(),
  defaultValue: defaultValueSchema.optional(),
  validation: fieldValidationSchema.optional(),
  conditional: z.object({
    field: z.string().min(1).max(255),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_empty']),
    value: z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
  }).optional(),
}).strict();

const formSchemaSchema = z.object({
  fields: z.array(formFieldSchema).min(1).max(200), // Max 200 fields to prevent DoS
  sections: z.array(z.object({
    name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Section name must be alphanumeric with underscores only'),
    label: z.string().min(1).max(255),
    fields: z.array(z.string().max(255)).min(1).max(50), // Max 50 fields per section
  })).max(50).optional(), // Max 50 sections
}).strict();

const createItemSchema = z.object({
  name: z.string().min(2).max(255),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  icon: z.string().max(100).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  formSchema: formSchemaSchema,
  fulfillmentGroupId: z.string().uuid().optional(),
  approvalRequired: z.boolean().optional(),
  approvalGroupId: z.string().uuid().optional(),
  expectedCompletionDays: z.number().int().min(1).max(365).optional(),
  costCenter: z.string().max(100).optional(),
  price: z.number().min(0).max(999999999).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  icon: z.string().max(100).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  formSchema: formSchemaSchema.optional(),
  fulfillmentGroupId: z.string().uuid().optional().nullable(),
  approvalRequired: z.boolean().optional(),
  approvalGroupId: z.string().uuid().optional().nullable(),
  expectedCompletionDays: z.number().int().min(1).max(365).optional(),
  costCenter: z.string().max(100).optional(),
  price: z.number().min(0).max(999999999).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

// Parameter validation schemas
const categoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

const itemIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter validation schemas
const listCategoriesQuerySchema = z.object({
  include_inactive: z.enum(['true', 'false']).optional(),
});

const listItemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  category_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  tags: z.string().max(1000).optional(), // Comma-separated tags
});

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
    const { id } = categoryIdParamSchema.parse(request.params);

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
    const body = createCategorySchema.parse(request.body);

    const category = await catalogCategoryService.create(tenantSlug, body, userId);
    reply.status(201).send(category);
  });

  // Update category
  app.put<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = categoryIdParamSchema.parse(request.params);
    const body = updateCategorySchema.parse(request.body);

    const category = await catalogCategoryService.update(tenantSlug, id, body, userId);
    reply.send(category);
  });

  // Delete category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = categoryIdParamSchema.parse(request.params);

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
    const { id } = itemIdParamSchema.parse(request.params);

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
    const body = createItemSchema.parse(request.body);

    const item = await catalogItemService.create(tenantSlug, body, userId);
    reply.status(201).send(item);
  });

  // Update item
  app.put<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = itemIdParamSchema.parse(request.params);
    const body = updateItemSchema.parse(request.body);

    const item = await catalogItemService.update(tenantSlug, id, body, userId);
    reply.send(item);
  });

  // Delete item
  app.delete<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = itemIdParamSchema.parse(request.params);

    await catalogItemService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });
}
