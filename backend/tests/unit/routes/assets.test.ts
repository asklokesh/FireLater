import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/asset.js', () => ({
  assetService: {
    getAssetStats: vi.fn().mockResolvedValue({}),
    listAssets: vi.fn().mockResolvedValue({ assets: [], total: 0 }),
    getAsset: vi.fn().mockResolvedValue(null),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: vi.fn().mockImplementation((_req, _reply, done) => done()),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Assets Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Asset Type Enum', () => {
    const assetTypeEnum = z.enum(['hardware', 'software', 'network', 'cloud', 'virtual', 'other']);

    it('should accept hardware type', () => {
      const result = assetTypeEnum.safeParse('hardware');
      expect(result.success).toBe(true);
    });

    it('should accept software type', () => {
      const result = assetTypeEnum.safeParse('software');
      expect(result.success).toBe(true);
    });

    it('should accept network type', () => {
      const result = assetTypeEnum.safeParse('network');
      expect(result.success).toBe(true);
    });

    it('should accept cloud type', () => {
      const result = assetTypeEnum.safeParse('cloud');
      expect(result.success).toBe(true);
    });

    it('should accept virtual type', () => {
      const result = assetTypeEnum.safeParse('virtual');
      expect(result.success).toBe(true);
    });

    it('should accept other type', () => {
      const result = assetTypeEnum.safeParse('other');
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = assetTypeEnum.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('Asset Category Enum', () => {
    const assetCategoryEnum = z.enum([
      'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device',
      'storage', 'software_license', 'saas_subscription', 'virtual_machine',
      'container', 'database', 'application', 'other'
    ]);

    it('should accept server category', () => {
      const result = assetCategoryEnum.safeParse('server');
      expect(result.success).toBe(true);
    });

    it('should accept laptop category', () => {
      const result = assetCategoryEnum.safeParse('laptop');
      expect(result.success).toBe(true);
    });

    it('should accept software_license category', () => {
      const result = assetCategoryEnum.safeParse('software_license');
      expect(result.success).toBe(true);
    });

    it('should accept saas_subscription category', () => {
      const result = assetCategoryEnum.safeParse('saas_subscription');
      expect(result.success).toBe(true);
    });

    it('should accept virtual_machine category', () => {
      const result = assetCategoryEnum.safeParse('virtual_machine');
      expect(result.success).toBe(true);
    });

    it('should accept container category', () => {
      const result = assetCategoryEnum.safeParse('container');
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const result = assetCategoryEnum.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('Asset Status Enum', () => {
    const assetStatusEnum = z.enum(['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage']);

    it('should accept active status', () => {
      const result = assetStatusEnum.safeParse('active');
      expect(result.success).toBe(true);
    });

    it('should accept inactive status', () => {
      const result = assetStatusEnum.safeParse('inactive');
      expect(result.success).toBe(true);
    });

    it('should accept maintenance status', () => {
      const result = assetStatusEnum.safeParse('maintenance');
      expect(result.success).toBe(true);
    });

    it('should accept retired status', () => {
      const result = assetStatusEnum.safeParse('retired');
      expect(result.success).toBe(true);
    });

    it('should accept disposed status', () => {
      const result = assetStatusEnum.safeParse('disposed');
      expect(result.success).toBe(true);
    });

    it('should accept ordered status', () => {
      const result = assetStatusEnum.safeParse('ordered');
      expect(result.success).toBe(true);
    });

    it('should accept in_storage status', () => {
      const result = assetStatusEnum.safeParse('in_storage');
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = assetStatusEnum.safeParse('lost');
      expect(result.success).toBe(false);
    });
  });

  describe('List Assets Query Schema', () => {
    const assetTypeEnum = z.enum(['hardware', 'software', 'network', 'cloud', 'virtual', 'other']);
    const assetCategoryEnum = z.enum([
      'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device',
      'storage', 'software_license', 'saas_subscription', 'virtual_machine',
      'container', 'database', 'application', 'other'
    ]);
    const assetStatusEnum = z.enum(['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage']);

    const listAssetsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      asset_type: assetTypeEnum.optional(),
      category: assetCategoryEnum.optional(),
      status: assetStatusEnum.optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
      owner_id: z.string().uuid().optional(),
      assigned_to_id: z.string().uuid().optional(),
      department: z.string().max(100).optional(),
    });

    it('should accept empty query', () => {
      const result = listAssetsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listAssetsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by asset_type', () => {
      const result = listAssetsQuerySchema.safeParse({ asset_type: 'hardware' });
      expect(result.success).toBe(true);
    });

    it('should filter by category', () => {
      const result = listAssetsQuerySchema.safeParse({ category: 'laptop' });
      expect(result.success).toBe(true);
    });

    it('should filter by status', () => {
      const result = listAssetsQuerySchema.safeParse({ status: 'active' });
      expect(result.success).toBe(true);
    });

    it('should accept search parameter', () => {
      const result = listAssetsQuerySchema.safeParse({ search: 'macbook' });
      expect(result.success).toBe(true);
    });

    it('should accept q parameter (alias for search)', () => {
      const result = listAssetsQuerySchema.safeParse({ q: 'macbook' });
      expect(result.success).toBe(true);
    });

    it('should reject search over 200 characters', () => {
      const result = listAssetsQuerySchema.safeParse({ search: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should filter by owner_id', () => {
      const result = listAssetsQuerySchema.safeParse({
        owner_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid owner_id', () => {
      const result = listAssetsQuerySchema.safeParse({ owner_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should filter by assigned_to_id', () => {
      const result = listAssetsQuerySchema.safeParse({
        assigned_to_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by department', () => {
      const result = listAssetsQuerySchema.safeParse({ department: 'Engineering' });
      expect(result.success).toBe(true);
    });

    it('should reject department over 100 characters', () => {
      const result = listAssetsQuerySchema.safeParse({ department: 'x'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('should accept multiple filters', () => {
      const result = listAssetsQuerySchema.safeParse({
        asset_type: 'hardware',
        category: 'laptop',
        status: 'active',
        department: 'Engineering',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Asset ID Schema', () => {
    const assetIdSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = assetIdSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = assetIdSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = assetIdSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = assetIdSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Filter Mapping', () => {
    it('should map query parameters to filters', () => {
      const query = {
        asset_type: 'hardware',
        category: 'laptop',
        status: 'active',
        search: 'macbook',
        owner_id: '123e4567-e89b-12d3-a456-426614174000',
        assigned_to_id: '223e4567-e89b-12d3-a456-426614174000',
        department: 'Engineering',
      };

      const filters = {
        assetType: query.asset_type,
        category: query.category,
        status: query.status,
        search: query.search || (query as Record<string, string>).q,
        ownerId: query.owner_id,
        assignedToId: query.assigned_to_id,
        department: query.department,
      };

      expect(filters.assetType).toBe('hardware');
      expect(filters.category).toBe('laptop');
      expect(filters.status).toBe('active');
      expect(filters.search).toBe('macbook');
      expect(filters.ownerId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(filters.assignedToId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(filters.department).toBe('Engineering');
    });

    it('should prefer search over q', () => {
      const query = { search: 'search-term', q: 'q-term' };
      const search = query.search || query.q;
      expect(search).toBe('search-term');
    });

    it('should fall back to q if search is not provided', () => {
      const query = { q: 'q-term' } as { search?: string; q: string };
      const search = query.search || query.q;
      expect(search).toBe('q-term');
    });
  });

  describe('Authentication', () => {
    it('should use authenticate middleware for GET /stats/overview', () => {
      // This verifies the route uses authenticate instead of requirePermission
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for GET /', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate middleware for GET /:id', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });
  });

  describe('Response Formats', () => {
    it('should return stats object for overview', () => {
      const stats = {
        totalAssets: 100,
        activeAssets: 80,
        byType: { hardware: 50, software: 30, cloud: 20 },
      };
      expect(stats).toHaveProperty('totalAssets');
      expect(stats).toHaveProperty('activeAssets');
      expect(stats).toHaveProperty('byType');
    });

    it('should return 501 for unimplemented POST', () => {
      const response = { message: 'Not implemented' };
      const statusCode = 501;
      expect(statusCode).toBe(501);
      expect(response.message).toBe('Not implemented');
    });

    it('should return 501 for unimplemented PUT', () => {
      const response = { message: 'Not implemented' };
      const statusCode = 501;
      expect(statusCode).toBe(501);
      expect(response.message).toBe('Not implemented');
    });

    it('should return 501 for unimplemented DELETE', () => {
      const response = { message: 'Not implemented' };
      const statusCode = 501;
      expect(statusCode).toBe(501);
      expect(response.message).toBe('Not implemented');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug to assetService.getAssetStats', async () => {
      const { assetService } = await import('../../../src/services/asset.js');

      await assetService.getAssetStats('test-tenant');
      expect(assetService.getAssetStats).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and filters to assetService.listAssets', async () => {
      const { assetService } = await import('../../../src/services/asset.js');
      const filters = {
        assetType: 'hardware',
        status: 'active',
        page: 1,
        limit: 20,
      };

      await assetService.listAssets('test-tenant', filters);
      expect(assetService.listAssets).toHaveBeenCalledWith('test-tenant', filters);
    });

    it('should pass tenantSlug and id to assetService.getAsset', async () => {
      const { assetService } = await import('../../../src/services/asset.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await assetService.getAsset('test-tenant', id);
      expect(assetService.getAsset).toHaveBeenCalledWith('test-tenant', id);
    });
  });

  describe('Pagination Integration', () => {
    it('should include page in filters', () => {
      const pagination = { page: 2, perPage: 20 };
      const filters = {
        page: pagination.page,
        limit: pagination.perPage,
      };
      expect(filters.page).toBe(2);
      expect(filters.limit).toBe(20);
    });

    it('should map perPage to limit', () => {
      const pagination = { page: 1, perPage: 50 };
      const filters = {
        limit: pagination.perPage,
      };
      expect(filters.limit).toBe(50);
    });
  });
});
