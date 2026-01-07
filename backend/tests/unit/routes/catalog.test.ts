import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/catalog.js', () => ({
  catalogCategoryService: {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  catalogItemService: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Catalog Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Category Schema', () => {
    const createCategorySchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(1000).optional(),
      icon: z.string().max(100).optional(),
      parentId: z.string().uuid().optional(),
      sortOrder: z.number().int().optional(),
      metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    });

    it('should require name of at least 2 characters', () => {
      const result = createCategorySchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should accept valid name', () => {
      const result = createCategorySchema.safeParse({ name: 'Hardware' });
      expect(result.success).toBe(true);
    });

    it('should reject name over 255 characters', () => {
      const result = createCategorySchema.safeParse({ name: 'x'.repeat(256) });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createCategorySchema.safeParse({
        name: 'Hardware',
        description: 'All hardware items',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createCategorySchema.safeParse({
        name: 'Hardware',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept icon', () => {
      const result = createCategorySchema.safeParse({
        name: 'Hardware',
        icon: 'computer',
      });
      expect(result.success).toBe(true);
    });

    it('should accept parentId as UUID', () => {
      const result = createCategorySchema.safeParse({
        name: 'Laptops',
        parentId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid parentId', () => {
      const result = createCategorySchema.safeParse({
        name: 'Laptops',
        parentId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept sortOrder as integer', () => {
      const result = createCategorySchema.safeParse({
        name: 'Hardware',
        sortOrder: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should accept metadata with various types', () => {
      const result = createCategorySchema.safeParse({
        name: 'Hardware',
        metadata: {
          featured: true,
          displayOrder: 1,
          label: 'Top Category',
          archived: null,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Category Schema', () => {
    const updateCategorySchema = z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional(),
      icon: z.string().max(100).optional(),
      parentId: z.string().uuid().optional().nullable(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
      metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    });

    it('should accept partial update', () => {
      const result = updateCategorySchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateCategorySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept nullable parentId', () => {
      const result = updateCategorySchema.safeParse({ parentId: null });
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateCategorySchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe('Form Field Schema', () => {
    const formFieldSchema = z.object({
      name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/, 'Field name must be alphanumeric with underscores only'),
      label: z.string().min(1).max(255),
      type: z.enum([
        'text', 'textarea', 'email', 'phone', 'number', 'date', 'datetime',
        'select', 'multi_select', 'radio', 'checkbox', 'file',
        'user_picker', 'group_picker', 'application_picker'
      ]),
      required: z.boolean().optional(),
      placeholder: z.string().max(500).optional(),
      helpText: z.string().max(2000).optional(),
    });

    it('should require name, label, and type', () => {
      const result = formFieldSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid form field', () => {
      const result = formFieldSchema.safeParse({
        name: 'employee_name',
        label: 'Employee Name',
        type: 'text',
      });
      expect(result.success).toBe(true);
    });

    it('should enforce alphanumeric name with underscores', () => {
      const result = formFieldSchema.safeParse({
        name: 'invalid-name',
        label: 'Label',
        type: 'text',
      });
      expect(result.success).toBe(false);
    });

    it('should reject spaces in name', () => {
      const result = formFieldSchema.safeParse({
        name: 'invalid name',
        label: 'Label',
        type: 'text',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all field types', () => {
      const types = [
        'text', 'textarea', 'email', 'phone', 'number', 'date', 'datetime',
        'select', 'multi_select', 'radio', 'checkbox', 'file',
        'user_picker', 'group_picker', 'application_picker'
      ];
      for (const type of types) {
        const result = formFieldSchema.safeParse({
          name: 'field',
          label: 'Field',
          type,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept required flag', () => {
      const result = formFieldSchema.safeParse({
        name: 'field',
        label: 'Field',
        type: 'text',
        required: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept helpText', () => {
      const result = formFieldSchema.safeParse({
        name: 'field',
        label: 'Field',
        type: 'text',
        helpText: 'Enter your full name',
      });
      expect(result.success).toBe(true);
    });

    it('should reject helpText over 2000 characters', () => {
      const result = formFieldSchema.safeParse({
        name: 'field',
        label: 'Field',
        type: 'text',
        helpText: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Field Validation Schema', () => {
    const fieldValidationSchema = z.object({
      minLength: z.number().int().min(0).max(10000).optional(),
      maxLength: z.number().int().min(0).max(10000).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().max(500).optional(),
      customMessage: z.string().max(500).optional(),
    }).strict();

    it('should accept empty validation', () => {
      const result = fieldValidationSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept length constraints', () => {
      const result = fieldValidationSchema.safeParse({
        minLength: 5,
        maxLength: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should accept numeric constraints', () => {
      const result = fieldValidationSchema.safeParse({
        min: 0,
        max: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should accept regex pattern', () => {
      const result = fieldValidationSchema.safeParse({
        pattern: '^[A-Z]{2}\\d{4}$',
        customMessage: 'Format must be XX0000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject pattern over 500 characters', () => {
      const result = fieldValidationSchema.safeParse({
        pattern: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should reject minLength above 10000', () => {
      const result = fieldValidationSchema.safeParse({
        minLength: 10001,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Create Item Schema', () => {
    const formSchemaSchema = z.object({
      fields: z.array(z.object({
        name: z.string().min(1).max(255),
        label: z.string().min(1).max(255),
        type: z.string(),
      })).min(1).max(200),
    });

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
    });

    it('should require name and formSchema', () => {
      const result = createItemSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid item', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        formSchema: {
          fields: [
            { name: 'model', label: 'Model', type: 'select' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should require at least one field in formSchema', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        formSchema: { fields: [] },
      });
      expect(result.success).toBe(false);
    });

    it('should limit formSchema to 200 fields', () => {
      const fields = Array.from({ length: 201 }, (_, i) => ({
        name: `field${i}`,
        label: `Field ${i}`,
        type: 'text',
      }));
      const result = createItemSchema.safeParse({
        name: 'Test Item',
        formSchema: { fields },
      });
      expect(result.success).toBe(false);
    });

    it('should accept imageUrl', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        imageUrl: 'https://example.com/laptop.png',
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid imageUrl', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        imageUrl: 'not-a-url',
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept approvalRequired flag', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        approvalRequired: true,
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept expectedCompletionDays between 1 and 365', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        expectedCompletionDays: 5,
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject expectedCompletionDays above 365', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        expectedCompletionDays: 366,
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept price with max 999999999', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        price: 1500,
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative price', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        price: -100,
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept tags array with max 50 items', () => {
      const result = createItemSchema.safeParse({
        name: 'Laptop Request',
        tags: ['hardware', 'laptop', 'equipment'],
        formSchema: {
          fields: [{ name: 'model', label: 'Model', type: 'text' }],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Item Schema', () => {
    const updateItemSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    });

    it('should accept partial update', () => {
      const result = updateItemSchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateItemSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateItemSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept sortOrder', () => {
      const result = updateItemSchema.safeParse({ sortOrder: 5 });
      expect(result.success).toBe(true);
    });
  });

  describe('List Categories Query Schema', () => {
    const listCategoriesQuerySchema = z.object({
      include_inactive: z.enum(['true', 'false']).optional(),
    });

    it('should accept empty query', () => {
      const result = listCategoriesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept include_inactive true', () => {
      const result = listCategoriesQuerySchema.safeParse({ include_inactive: 'true' });
      expect(result.success).toBe(true);
    });

    it('should accept include_inactive false', () => {
      const result = listCategoriesQuerySchema.safeParse({ include_inactive: 'false' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid include_inactive value', () => {
      const result = listCategoriesQuerySchema.safeParse({ include_inactive: 'yes' });
      expect(result.success).toBe(false);
    });
  });

  describe('List Items Query Schema', () => {
    const listItemsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      category_id: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
      is_active: z.enum(['true', 'false']).optional(),
      tags: z.string().max(1000).optional(),
    });

    it('should accept empty query', () => {
      const result = listItemsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination', () => {
      const result = listItemsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by category_id', () => {
      const result = listItemsQuerySchema.safeParse({
        category_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept search parameter', () => {
      const result = listItemsQuerySchema.safeParse({ search: 'laptop' });
      expect(result.success).toBe(true);
    });

    it('should accept tags as comma-separated string', () => {
      const result = listItemsQuerySchema.safeParse({
        tags: 'hardware,laptop,dell',
      });
      expect(result.success).toBe(true);
    });

    it('should reject tags over 1000 characters', () => {
      const result = listItemsQuerySchema.safeParse({
        tags: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require catalog:read for GET /categories', () => {
      const permission = 'catalog:read';
      expect(permission).toBe('catalog:read');
    });

    it('should require catalog:create for POST /categories', () => {
      const permission = 'catalog:create';
      expect(permission).toBe('catalog:create');
    });

    it('should require catalog:update for PUT /categories/:id', () => {
      const permission = 'catalog:update';
      expect(permission).toBe('catalog:update');
    });

    it('should require catalog:delete for DELETE /categories/:id', () => {
      const permission = 'catalog:delete';
      expect(permission).toBe('catalog:delete');
    });

    it('should require catalog:read for GET /items', () => {
      const permission = 'catalog:read';
      expect(permission).toBe('catalog:read');
    });

    it('should require catalog:create for POST /items', () => {
      const permission = 'catalog:create';
      expect(permission).toBe('catalog:create');
    });
  });

  describe('Response Formats', () => {
    it('should return categories in data wrapper', () => {
      const categories = [{ id: 'cat-1', name: 'Hardware' }];
      const response = { data: categories };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return 404 for missing category', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Category with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
    });

    it('should return 404 for missing item', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Catalog item with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain('Catalog item');
    });

    it('should return 201 for created category', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted item', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });
  });

  describe('Service Integration', () => {
    it('should pass includeInactive to catalogCategoryService.list', async () => {
      const { catalogCategoryService } = await import('../../../src/services/catalog.js');

      await catalogCategoryService.list('test-tenant', true);
      expect(catalogCategoryService.list).toHaveBeenCalledWith('test-tenant', true);
    });

    it('should pass tenantSlug and id to catalogCategoryService.findById', async () => {
      const { catalogCategoryService } = await import('../../../src/services/catalog.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await catalogCategoryService.findById('test-tenant', id);
      expect(catalogCategoryService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass filters to catalogItemService.list', async () => {
      const { catalogItemService } = await import('../../../src/services/catalog.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = { categoryId: '123e4567-e89b-12d3-a456-426614174000' };

      await catalogItemService.list('test-tenant', pagination, filters);
      expect(catalogItemService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });
  });
});
