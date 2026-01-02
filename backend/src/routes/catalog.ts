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
    const includeInactive = query.include_inactive === 'true';

    const categories = await catalogCategoryService.list(tenantSlug, includeInactive);
    reply.send({ data: categories });
  });

  // Get category by ID
  app.get<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const category = await catalogCategoryService.findById(tenantSlug, request.params.id);

    if (!category) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Category with id '${request.params.id}' not found`,
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
    const body = updateCategorySchema.parse(request.body);

    const category = await catalogCategoryService.update(tenantSlug, request.params.id, body, userId);
    reply.send(category);
  });

  // Delete category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    await catalogCategoryService.delete(tenantSlug, request.params.id, userId);
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
    const pagination = parsePagination(query);

    const filters = {
      categoryId: query.category_id,
      search: query.search || query.q,
      isActive: query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined,
      tags: query.tags ? query.tags.split(',') : undefined,
    };

    const { items, total } = await catalogItemService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(items, total, pagination));
  });

  // Get item by ID
  app.get<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const item = await catalogItemService.findById(tenantSlug, request.params.id);

    if (!item) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Catalog item with id '${request.params.id}' not found`,
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
    const body = updateItemSchema.parse(request.body);

    const item = await catalogItemService.update(tenantSlug, request.params.id, body, userId);
    reply.send(item);
  });

  // Delete item
  app.delete<{ Params: { id: string } }>('/items/:id', {
    preHandler: [requirePermission('catalog:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    await catalogItemService.delete(tenantSlug, request.params.id, userId);
    reply.status(204).send();
  });
}
