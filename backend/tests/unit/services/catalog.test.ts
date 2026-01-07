import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../../src/utils/errors.js';

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug}`,
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { catalogCategoryService, catalogItemService } from '../../../src/services/catalog.js';

describe('CatalogCategoryService', () => {
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should list active categories by default', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Hardware', sort_order: 0, is_active: true, item_count: '5' },
        { id: 'cat-2', name: 'Software', sort_order: 1, is_active: true, item_count: '10' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockCategories });

      const result = await catalogCategoryService.list(tenantSlug);

      expect(result).toEqual(mockCategories);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_active = true')
      );
    });

    it('should include inactive categories when includeInactive is true', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Hardware', is_active: true },
        { id: 'cat-2', name: 'Legacy', is_active: false },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockCategories });

      const result = await catalogCategoryService.list(tenantSlug, true);

      expect(result).toEqual(mockCategories);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE is_active = true')
      );
    });

    it('should include item_count and parent_name in results', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Laptops', parent_id: 'cat-0', parent_name: 'Hardware', item_count: '3' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockCategories });

      const result = await catalogCategoryService.list(tenantSlug);

      expect(result[0].item_count).toBe('3');
      expect(result[0].parent_name).toBe('Hardware');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('item_count')
      );
    });

    it('should order by sort_order and name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await catalogCategoryService.list(tenantSlug);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY c.sort_order, c.name')
      );
    });
  });

  describe('findById', () => {
    it('should return category by id with item_count', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Hardware',
        description: 'Physical items',
        icon: 'hardware',
        parent_id: null,
        sort_order: 0,
        is_active: true,
        item_count: '5',
        parent_name: null,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockCategory] });

      const result = await catalogCategoryService.findById(tenantSlug, 'cat-1');

      expect(result).toEqual(mockCategory);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.id = $1'),
        ['cat-1']
      );
    });

    it('should return null for nonexistent category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await catalogCategoryService.findById(tenantSlug, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should include parent_name for child categories', async () => {
      const mockCategory = {
        id: 'cat-2',
        name: 'Laptops',
        parent_id: 'cat-1',
        parent_name: 'Hardware',
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockCategory] });

      const result = await catalogCategoryService.findById(tenantSlug, 'cat-2');

      expect(result?.parent_name).toBe('Hardware');
    });
  });

  describe('create', () => {
    it('should create category with all fields', async () => {
      const mockCreated = {
        id: 'cat-new',
        name: 'New Category',
        description: 'Test description',
        icon: 'folder',
        parent_id: 'cat-1',
        sort_order: 5,
        is_active: true,
        metadata: {},
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // audit_logs
        .mockResolvedValueOnce({ rows: [mockCreated] }); // findById

      const result = await catalogCategoryService.create(
        tenantSlug,
        {
          name: 'New Category',
          description: 'Test description',
          icon: 'folder',
          parentId: 'cat-1',
          sortOrder: 5,
          metadata: {},
        },
        userId
      );

      expect(result).toEqual(mockCreated);
      expect(mockQuery.mock.calls[0][1]).toEqual([
        'New Category',
        'Test description',
        'folder',
        'cat-1',
        5,
        '{}',
      ]);
    });

    it('should use defaults for optional fields', async () => {
      const mockCreated = { id: 'cat-new', name: 'Simple' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreated] });

      await catalogCategoryService.create(tenantSlug, { name: 'Simple' }, userId);

      expect(mockQuery.mock.calls[0][1]).toEqual([
        'Simple',
        null,
        null,
        null,
        0,
        '{}',
      ]);
    });

    it('should create audit log entry', async () => {
      const mockCreated = { id: 'cat-new', name: 'Test' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreated] });

      await catalogCategoryService.create(tenantSlug, { name: 'Test' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('audit_logs');
      expect(mockQuery.mock.calls[1][1]).toContain(userId);
      expect(mockQuery.mock.calls[1][1]).toContain('cat-new');
    });
  });

  describe('update', () => {
    const existingCategory = {
      id: 'cat-1',
      name: 'Original',
      description: null,
      icon: null,
      parent_id: null,
      sort_order: 0,
      is_active: true,
    };

    it('should update category fields', async () => {
      const updated = { ...existingCategory, name: 'Updated' };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] }) // findById (existing check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [updated] }); // findById (return)

      const result = await catalogCategoryService.update(
        tenantSlug,
        'cat-1',
        { name: 'Updated' },
        userId
      );

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundError for nonexistent category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        catalogCategoryService.update(tenantSlug, 'nonexistent', { name: 'Test' }, userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should return existing if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [existingCategory] });

      const result = await catalogCategoryService.update(tenantSlug, 'cat-1', {}, userId);

      expect(result).toEqual(existingCategory);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should update parentId to null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingCategory, parent_id: null }] });

      await catalogCategoryService.update(tenantSlug, 'cat-1', { parentId: null }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('parent_id = $1');
      expect(mockQuery.mock.calls[1][1]).toContain(null);
    });

    it('should update metadata as JSON', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingCategory] });

      await catalogCategoryService.update(
        tenantSlug,
        'cat-1',
        { metadata: { custom: 'value' } },
        userId
      );

      expect(mockQuery.mock.calls[1][1]).toContain('{"custom":"value"}');
    });

    it('should update isActive flag', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingCategory, is_active: false }] });

      await catalogCategoryService.update(tenantSlug, 'cat-1', { isActive: false }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('is_active = $1');
    });

    it('should update category icon', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingCategory, icon: 'folder' }] });

      await catalogCategoryService.update(tenantSlug, 'cat-1', { icon: 'folder' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('icon = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('folder');
    });

    it('should update category sortOrder', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingCategory, sort_order: 5 }] });

      await catalogCategoryService.update(tenantSlug, 'cat-1', { sortOrder: 5 }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('sort_order = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe(5);
    });

    it('should update category description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingCategory] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingCategory, description: 'New description' }] });

      await catalogCategoryService.update(tenantSlug, 'cat-1', { description: 'New description' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('description = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('New description');
    });
  });

  describe('delete', () => {
    it('should soft delete category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] }) // findById
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      await catalogCategoryService.delete(tenantSlug, 'cat-1', userId);

      expect(mockQuery.mock.calls[1][0]).toContain('is_active = false');
    });

    it('should throw NotFoundError for nonexistent category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        catalogCategoryService.delete(tenantSlug, 'nonexistent', userId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});

describe('CatalogItemService', () => {
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';
  const formSchema = { fields: [{ name: 'reason', label: 'Reason', type: 'text', required: true }] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should list items with pagination', async () => {
      const mockItems = [
        { id: 'item-1', name: 'Laptop', category_name: 'Hardware' },
        { id: 'item-2', name: 'Monitor', category_name: 'Hardware' },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // COUNT
        .mockResolvedValueOnce({ rows: mockItems }); // SELECT

      const result = await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(2);
    });

    it('should filter by categoryId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });

      await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 }, { categoryId: 'cat-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('category_id = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('cat-1');
    });

    it('should filter by isActive', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 }, { isActive: true });

      expect(mockQuery.mock.calls[0][0]).toContain('is_active = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe(true);
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'laptop' });

      expect(mockQuery.mock.calls[0][0]).toContain('name ILIKE $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('%laptop%');
    });

    it('should filter by tags', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 }, { tags: ['hardware', 'it'] });

      expect(mockQuery.mock.calls[0][0]).toContain('tags && $1');
      expect(mockQuery.mock.calls[0][1][0]).toEqual(['hardware', 'it']);
    });

    it('should include related names in results', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Laptop',
          category_name: 'Hardware',
          fulfillment_group_name: 'IT Support',
          approval_group_name: 'Managers',
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: mockItems });

      const result = await catalogItemService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.items[0].category_name).toBe('Hardware');
      expect(result.items[0].fulfillment_group_name).toBe('IT Support');
      expect(result.items[0].approval_group_name).toBe('Managers');
    });

    it('should combine multiple filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await catalogItemService.list(
        tenantSlug,
        { page: 1, perPage: 10 },
        { categoryId: 'cat-1', isActive: true, search: 'laptop' }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('category_id = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = $2');
      expect(mockQuery.mock.calls[0][0]).toContain('ILIKE $3');
    });
  });

  describe('findById', () => {
    it('should return item by id with related names', async () => {
      const mockItem = {
        id: 'item-1',
        name: 'Laptop',
        short_description: 'Business laptop',
        description: 'High performance laptop',
        category_id: 'cat-1',
        category_name: 'Hardware',
        fulfillment_group_id: 'group-1',
        fulfillment_group_name: 'IT Support',
        approval_group_id: 'group-2',
        approval_group_name: 'Managers',
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockItem] });

      const result = await catalogItemService.findById(tenantSlug, 'item-1');

      expect(result).toEqual(mockItem);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE i.id = $1'),
        ['item-1']
      );
    });

    it('should return null for nonexistent item', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await catalogItemService.findById(tenantSlug, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create item with all fields', async () => {
      const mockCreated = {
        id: 'item-new',
        name: 'New Laptop',
        short_description: 'Quick desc',
        description: 'Full description',
        category_id: 'cat-1',
        icon: 'laptop',
        image_url: 'http://example.com/laptop.jpg',
        form_schema: formSchema,
        fulfillment_group_id: 'group-1',
        approval_required: true,
        approval_group_id: 'group-2',
        expected_completion_days: 3,
        cost_center: 'IT-001',
        price: 1500,
        tags: ['hardware', 'laptop'],
        metadata: { brand: 'Dell' },
        is_active: true,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // audit_logs
        .mockResolvedValueOnce({ rows: [mockCreated] }); // findById

      const result = await catalogItemService.create(
        tenantSlug,
        {
          name: 'New Laptop',
          shortDescription: 'Quick desc',
          description: 'Full description',
          categoryId: 'cat-1',
          icon: 'laptop',
          imageUrl: 'http://example.com/laptop.jpg',
          formSchema: formSchema,
          fulfillmentGroupId: 'group-1',
          approvalRequired: true,
          approvalGroupId: 'group-2',
          expectedCompletionDays: 3,
          costCenter: 'IT-001',
          price: 1500,
          tags: ['hardware', 'laptop'],
          metadata: { brand: 'Dell' },
        },
        userId
      );

      expect(result).toEqual(mockCreated);
    });

    it('should use defaults for optional fields', async () => {
      const mockCreated = { id: 'item-new', name: 'Simple Item' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreated] });

      await catalogItemService.create(
        tenantSlug,
        { name: 'Simple Item', formSchema },
        userId
      );

      // Check defaults in params
      const insertParams = mockQuery.mock.calls[0][1];
      expect(insertParams[1]).toBeNull(); // shortDescription
      expect(insertParams[2]).toBeNull(); // description
      expect(insertParams[3]).toBeNull(); // categoryId
      expect(insertParams[7]).toBeNull(); // fulfillmentGroupId
      expect(insertParams[8]).toBe(false); // approvalRequired
      expect(insertParams[10]).toBe(5); // expectedCompletionDays
    });

    it('should create audit log entry', async () => {
      const mockCreated = { id: 'item-new', name: 'Test Item' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreated] });

      await catalogItemService.create(tenantSlug, { name: 'Test Item', formSchema }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('audit_logs');
      expect(mockQuery.mock.calls[1][1]).toContain('item-new');
      expect(mockQuery.mock.calls[1][1]).toContain(userId);
    });

    it('should store formSchema as JSON', async () => {
      const mockCreated = { id: 'item-new' };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockCreated] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreated] });

      await catalogItemService.create(tenantSlug, { name: 'Test', formSchema }, userId);

      expect(mockQuery.mock.calls[0][1][6]).toBe(JSON.stringify(formSchema));
    });
  });

  describe('update', () => {
    const existingItem = {
      id: 'item-1',
      name: 'Original',
      short_description: null,
      is_active: true,
      form_schema: formSchema,
    };

    it('should update item fields', async () => {
      const updated = { ...existingItem, name: 'Updated' };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] }) // findById (existing check)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [updated] }); // findById (return)

      const result = await catalogItemService.update(
        tenantSlug,
        'item-1',
        { name: 'Updated' },
        userId
      );

      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundError for nonexistent item', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        catalogItemService.update(tenantSlug, 'nonexistent', { name: 'Test' }, userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should return existing if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [existingItem] });

      const result = await catalogItemService.update(tenantSlug, 'item-1', {}, userId);

      expect(result).toEqual(existingItem);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should update categoryId to null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { categoryId: null }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('category_id = $1');
      expect(mockQuery.mock.calls[1][1]).toContain(null);
    });

    it('should update formSchema as JSON', async () => {
      const newSchema = { fields: [{ name: 'notes', label: 'Notes', type: 'textarea' }] };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { formSchema: newSchema }, userId);

      expect(mockQuery.mock.calls[1][1]).toContain(JSON.stringify(newSchema));
    });

    it('should update multiple fields at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(
        tenantSlug,
        'item-1',
        {
          name: 'Updated',
          shortDescription: 'New desc',
          price: 1000,
          approvalRequired: true,
        },
        userId
      );

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain('name = $');
      expect(updateQuery).toContain('short_description = $');
      expect(updateQuery).toContain('price = $');
      expect(updateQuery).toContain('approval_required = $');
    });

    it('should update isActive flag', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { isActive: false }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('is_active = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe(false);
    });

    it('should update tags array', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { tags: ['new', 'tags'] }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('tags = $1');
      expect(mockQuery.mock.calls[1][1]).toContainEqual(['new', 'tags']);
    });

    it('should update metadata as JSON', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(
        tenantSlug,
        'item-1',
        { metadata: { custom: 'value' } },
        userId
      );

      expect(mockQuery.mock.calls[1][1]).toContain('{"custom":"value"}');
    });

    it('should update costCenter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { costCenter: 'IT-001' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('cost_center = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('IT-001');
    });

    it('should update sortOrder', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { sortOrder: 10 }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('sort_order = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe(10);
    });

    it('should update approvalGroupId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { approvalGroupId: 'group-123' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('approval_group_id = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('group-123');
    });

    it('should update expectedCompletionDays', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { expectedCompletionDays: 5 }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('expected_completion_days = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe(5);
    });

    it('should update imageUrl', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { imageUrl: 'https://example.com/image.png' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('image_url = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('https://example.com/image.png');
    });

    it('should update fulfillmentGroupId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { fulfillmentGroupId: 'fulfillment-team' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('fulfillment_group_id = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('fulfillment-team');
    });

    it('should update description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { description: 'Full detailed description' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('description = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('Full detailed description');
    });

    it('should update icon', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingItem] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingItem] });

      await catalogItemService.update(tenantSlug, 'item-1', { icon: 'laptop' }, userId);

      expect(mockQuery.mock.calls[1][0]).toContain('icon = $1');
      expect(mockQuery.mock.calls[1][1][0]).toBe('laptop');
    });
  });

  describe('delete', () => {
    it('should soft delete item', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] }) // findById
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      await catalogItemService.delete(tenantSlug, 'item-1', userId);

      expect(mockQuery.mock.calls[1][0]).toContain('is_active = false');
    });

    it('should throw NotFoundError for nonexistent item', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        catalogItemService.delete(tenantSlug, 'nonexistent', userId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
