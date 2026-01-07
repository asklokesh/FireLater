import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Application Service
 * Testing IT Application Registry (CMDB) operations
 *
 * Key coverage areas:
 * - Application CRUD operations with caching
 * - Application ID generation
 * - Environment management
 * - Health score calculations
 * - Filtering and pagination
 * - Cache invalidation
 */

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { applicationService } from '../../../src/services/applications.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, ConflictError } from '../../../src/utils/errors.js';

describe('ApplicationService', () => {
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // APPLICATION LIST OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list all applications with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '50' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-1',
              app_id: 'APP-000001',
              name: 'Payment Gateway',
              description: 'Payment processing service',
              tier: 'tier1',
              status: 'active',
              lifecycle_stage: 'production',
              owner_user_id: 'user-1',
              owner_group_id: null,
              support_group_id: 'group-1',
              business_unit: 'Finance',
              criticality: 'high',
              health_score: 95,
              environment_count: '3',
              owner_user_name: 'John Doe',
              owner_group_name: null,
              support_group_name: 'Platform Team',
            },
            {
              id: 'app-2',
              app_id: 'APP-000002',
              name: 'User Portal',
              description: 'Customer-facing portal',
              tier: 'tier2',
              status: 'active',
              lifecycle_stage: 'production',
              owner_user_id: null,
              owner_group_id: 'group-2',
              support_group_id: 'group-1',
              business_unit: 'Engineering',
              criticality: 'medium',
              health_score: 85,
              environment_count: '2',
              owner_user_name: null,
              owner_group_name: 'Engineering Team',
              support_group_name: 'Platform Team',
            },
          ],
        });

      const result = await applicationService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(50);
      expect(result.applications).toHaveLength(2);
      expect(result.applications[0].name).toBe('Payment Gateway');
      expect(result.applications[0].tier).toBe('tier1');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter applications by tier', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 }, { tier: 'tier1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND a.tier = $1'),
        expect.arrayContaining(['tier1'])
      );
    });

    it('should filter applications by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 }, { status: 'active' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND a.status = $1'),
        expect.arrayContaining(['active'])
      );
    });

    it('should filter applications by owner', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 }, { ownerId: 'user-123' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('owner_user_id = $1 OR a.owner_group_id = $1'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should filter applications by support group', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 }, { supportGroupId: 'group-1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND a.support_group_id = $1'),
        expect.arrayContaining(['group-1'])
      );
    });

    it('should search applications by name, app_id, or description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'payment' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('a.name ILIKE $1 OR a.app_id ILIKE $1 OR a.description ILIKE $1'),
        expect.arrayContaining(['%payment%'])
      );
    });

    it('should use default sorting by name ascending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY a.name asc'),
        expect.any(Array)
      );
    });

    it('should sort by valid column in descending order', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10, sort: 'health_score', order: 'desc' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY a.health_score desc'),
        expect.any(Array)
      );
    });

    it('should prevent SQL injection by ignoring invalid sort columns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10, sort: 'DROP TABLE; --' as any });

      // Should fall back to default 'name' column
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY a.name asc'),
        expect.any(Array)
      );
    });

    it('should use caching for list operations', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`${tenantSlug}:applications:list`),
        expect.any(Function),
        { ttl: 600 }
      );
    });
  });

  // ============================================
  // APPLICATION FIND BY ID
  // ============================================
  describe('findById', () => {
    const mockApplication = {
      id: 'app-uuid-1',
      app_id: 'APP-000001',
      name: 'Test Application',
      description: 'Test description',
      tier: 'tier2',
      status: 'active',
      lifecycle_stage: 'production',
      owner_user_id: 'user-1',
      owner_group_id: null,
      support_group_id: 'group-1',
      business_unit: 'Engineering',
      criticality: 'medium',
      health_score: 90,
      health_score_updated_at: new Date('2026-01-01'),
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-12-01'),
      owner_user_name: 'John Doe',
      owner_user_email: 'john@example.com',
      owner_group_name: null,
      support_group_name: 'Support Team',
    };

    it('should find application by UUID', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      mockQuery.mockResolvedValueOnce({ rows: [mockApplication] });

      const result = await applicationService.findById(tenantSlug, uuid);

      expect(result).toBeDefined();
      expect(result?.app_id).toBe('APP-000001');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.id = $1'),
        [uuid]
      );
    });

    it('should find application by app_id format', async () => {
      const appId = 'APP-000001';
      mockQuery.mockResolvedValueOnce({ rows: [mockApplication] });

      const result = await applicationService.findById(tenantSlug, appId);

      expect(result).toBeDefined();
      expect(result?.name).toBe('Test Application');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.app_id = $1'),
        [appId]
      );
    });

    it('should return null for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await applicationService.findById(tenantSlug, 'non-existent');

      expect(result).toBeNull();
    });

    it('should include owner and support group details', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockApplication] });

      const result = await applicationService.findById(tenantSlug, 'APP-000001');

      expect(result?.owner_user_name).toBe('John Doe');
      expect(result?.owner_user_email).toBe('john@example.com');
      expect(result?.support_group_name).toBe('Support Team');
    });

    it('should use caching for findById operations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockApplication] });

      await applicationService.findById(tenantSlug, 'APP-000001');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:applications:app:APP-000001`,
        expect.any(Function),
        { ttl: 600 }
      );
    });
  });

  // ============================================
  // APPLICATION CREATE
  // ============================================
  describe('create', () => {
    it('should create application with generated app_id', async () => {
      const mockApp = {
        id: 'new-app-id',
        app_id: 'APP-000010',
        name: 'New Application',
        tier: 'tier2',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ app_id: 'APP-000010' }] }) // next_id
        .mockResolvedValueOnce({ rows: [mockApp] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [mockApp] }); // findById refetch

      const result = await applicationService.create(
        tenantSlug,
        {
          name: 'New Application',
          tier: 'tier2',
        },
        userId
      );

      expect(result.app_id).toBe('APP-000010');
      // First query should be to get next_id
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("next_id('application')")
      );
    });

    it('should create application with all optional fields', async () => {
      const mockApp = {
        id: 'new-app-id',
        app_id: 'APP-000011',
        name: 'Full Application',
        tier: 'tier1',
        status: 'active',
        lifecycle_stage: 'development',
        owner_user_id: 'owner-1',
        owner_group_id: 'group-1',
        support_group_id: 'support-1',
        business_unit: 'Engineering',
        criticality: 'high',
        tags: ['critical', 'payment'],
        metadata: { version: '2.0' },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ app_id: 'APP-000011' }] })
        .mockResolvedValueOnce({ rows: [mockApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockApp] });

      const result = await applicationService.create(
        tenantSlug,
        {
          name: 'Full Application',
          description: 'Comprehensive app',
          tier: 'tier1',
          status: 'active',
          lifecycleStage: 'development',
          ownerUserId: 'owner-1',
          ownerGroupId: 'group-1',
          supportGroupId: 'support-1',
          businessUnit: 'Engineering',
          criticality: 'high',
          tags: ['critical', 'payment'],
          metadata: { version: '2.0' },
        },
        userId
      );

      expect(result.tier).toBe('tier1');
      expect(result.criticality).toBe('high');
    });

    it('should use default values when optional fields not provided', async () => {
      const mockApp = {
        id: 'new-app-id',
        app_id: 'APP-000012',
        name: 'Minimal App',
        tier: 'tier3',
        status: 'active',
        lifecycle_stage: 'production',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ app_id: 'APP-000012' }] })
        .mockResolvedValueOnce({ rows: [mockApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockApp] });

      await applicationService.create(
        tenantSlug,
        { name: 'Minimal App', tier: 'tier3' },
        userId
      );

      // Check that defaults are used in the INSERT
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['APP-000012', 'Minimal App', null, 'tier3', 'active', 'production'])
      );
    });

    it('should create audit log entry on application creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ app_id: 'APP-000013' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'app-id', app_id: 'APP-000013', name: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [{ id: 'app-id', app_id: 'APP-000013', name: 'Test' }] });

      await applicationService.create(tenantSlug, { name: 'Test', tier: 'tier2' }, userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.audit_logs'),
        expect.arrayContaining([userId, 'app-id'])
      );
    });

    it('should invalidate cache after creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ app_id: 'APP-000014' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'app-id', name: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'app-id', name: 'Test' }] });

      await applicationService.create(tenantSlug, { name: 'Test', tier: 'tier2' }, userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'applications');
    });
  });

  // ============================================
  // APPLICATION UPDATE
  // ============================================
  describe('update', () => {
    const existingApp = {
      id: 'app-uuid',
      app_id: 'APP-000001',
      name: 'Existing App',
      tier: 'tier2',
      status: 'active',
    };

    beforeEach(() => {
      // Mock findById to return existing app
      mockQuery.mockResolvedValueOnce({ rows: [existingApp] });
    });

    it('should update application name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [{ ...existingApp, name: 'Updated Name' }] }); // findById refetch

      const result = await applicationService.update(
        tenantSlug,
        'APP-000001',
        { name: 'Updated Name' },
        userId
      );

      expect(result.name).toBe('Updated Name');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.applications SET name = $1'),
        expect.arrayContaining(['Updated Name', 'app-uuid'])
      );
    });

    it('should update multiple fields at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingApp, tier: 'tier1', status: 'inactive' }] });

      await applicationService.update(
        tenantSlug,
        'APP-000001',
        {
          tier: 'tier1',
          status: 'inactive',
          criticality: 'high',
        },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE.*tier.*status.*criticality/s),
        expect.any(Array)
      );
    });

    it('should return existing app when no updates provided', async () => {
      const result = await applicationService.update(tenantSlug, 'APP-000001', {}, userId);

      expect(result).toEqual(existingApp);
      // Should only call findById, not update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.update(tenantSlug, 'non-existent', { name: 'New' }, userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should allow setting owner fields to null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingApp, owner_user_id: null }] });

      await applicationService.update(
        tenantSlug,
        'APP-000001',
        { ownerUserId: null },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('owner_user_id = $1'),
        expect.arrayContaining([null])
      );
    });

    it('should update metadata as JSON', async () => {
      const metadata = { env: 'production', version: '3.0' };
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingApp, metadata }] });

      await applicationService.update(
        tenantSlug,
        'APP-000001',
        { metadata },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('metadata = $1'),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should create audit log on update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingApp] });

      await applicationService.update(
        tenantSlug,
        'APP-000001',
        { name: 'Updated' },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'update', 'application'"),
        expect.arrayContaining([userId, 'app-uuid'])
      );
    });

    it('should invalidate cache after update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingApp] });

      await applicationService.update(
        tenantSlug,
        'APP-000001',
        { name: 'Updated' },
        userId
      );

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'applications');
    });
  });

  // ============================================
  // APPLICATION DELETE (SOFT DELETE)
  // ============================================
  describe('delete', () => {
    const existingApp = {
      id: 'app-uuid',
      app_id: 'APP-000001',
      name: 'App to Delete',
    };

    it('should soft delete application by setting status to deprecated', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // update status
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await applicationService.delete(tenantSlug, 'APP-000001', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'deprecated'"),
        ['app-uuid']
      );
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.delete(tenantSlug, 'non-existent', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should create audit log on delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.delete(tenantSlug, 'APP-000001', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'delete', 'application'"),
        expect.arrayContaining([userId, 'app-uuid'])
      );
    });

    it('should invalidate cache after delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await applicationService.delete(tenantSlug, 'APP-000001', userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'applications');
    });
  });

  // ============================================
  // ENVIRONMENT MANAGEMENT
  // ============================================
  describe('listEnvironments', () => {
    const existingApp = { id: 'app-uuid', app_id: 'APP-000001', name: 'Test App' };

    it('should list all environments for an application', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] }) // findById
        .mockResolvedValueOnce({
          rows: [
            { id: 'env-1', name: 'Production', type: 'production', url: 'https://prod.example.com' },
            { id: 'env-2', name: 'Staging', type: 'staging', url: 'https://staging.example.com' },
            { id: 'env-3', name: 'Development', type: 'development', url: null },
          ],
        });

      const result = await applicationService.listEnvironments(tenantSlug, 'APP-000001');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Production');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM tenant_test.environments WHERE application_id = $1'),
        ['app-uuid']
      );
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.listEnvironments(tenantSlug, 'non-existent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return empty array when no environments exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await applicationService.listEnvironments(tenantSlug, 'APP-000001');

      expect(result).toEqual([]);
    });
  });

  describe('createEnvironment', () => {
    const existingApp = { id: 'app-uuid', app_id: 'APP-000001', name: 'Test App' };

    it('should create environment with required fields', async () => {
      const newEnv = {
        id: 'env-new',
        name: 'Production',
        type: 'production',
        application_id: 'app-uuid',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // check duplicate
        .mockResolvedValueOnce({ rows: [newEnv] }); // insert

      const result = await applicationService.createEnvironment(
        tenantSlug,
        'APP-000001',
        { name: 'Production', type: 'production' },
        userId
      );

      expect(result.name).toBe('Production');
      expect(result.type).toBe('production');
    });

    it('should create environment with all optional fields', async () => {
      const newEnv = {
        id: 'env-new',
        name: 'AWS Production',
        type: 'production',
        url: 'https://app.example.com',
        cloud_provider: 'aws',
        cloud_account: '123456789',
        cloud_region: 'us-east-1',
        resource_ids: ['i-123', 'i-456'],
        metadata: { version: '2.0' },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newEnv] });

      const result = await applicationService.createEnvironment(
        tenantSlug,
        'APP-000001',
        {
          name: 'AWS Production',
          type: 'production',
          url: 'https://app.example.com',
          cloudProvider: 'aws',
          cloudAccount: '123456789',
          cloudRegion: 'us-east-1',
          resourceIds: ['i-123', 'i-456'],
          metadata: { version: '2.0' },
        },
        userId
      );

      expect(result.cloud_provider).toBe('aws');
      expect(result.cloud_region).toBe('us-east-1');
    });

    it('should throw ConflictError for duplicate environment name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-env' }] }); // duplicate found

      await expect(
        applicationService.createEnvironment(
          tenantSlug,
          'APP-000001',
          { name: 'Production', type: 'production' },
          userId
        )
      ).rejects.toThrow(ConflictError);
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.createEnvironment(
          tenantSlug,
          'non-existent',
          { name: 'Production', type: 'production' },
          userId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should invalidate cache after environment creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'env-new', name: 'Test' }] });

      await applicationService.createEnvironment(
        tenantSlug,
        'APP-000001',
        { name: 'Test', type: 'development' },
        userId
      );

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'applications');
    });
  });

  describe('updateEnvironment', () => {
    const existingApp = { id: 'app-uuid', app_id: 'APP-000001', name: 'Test App' };
    const existingEnv = { id: 'env-uuid', name: 'Staging', type: 'staging' };

    it('should update environment fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [{ ...existingEnv, name: 'Updated Staging', url: 'https://new.example.com' }] });

      const result = await applicationService.updateEnvironment(
        tenantSlug,
        'APP-000001',
        'env-uuid',
        { name: 'Updated Staging', url: 'https://new.example.com' },
        userId
      );

      expect(result.name).toBe('Updated Staging');
    });

    it('should return existing environment when no updates provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [existingEnv] });

      const result = await applicationService.updateEnvironment(
        tenantSlug,
        'APP-000001',
        'env-uuid',
        {},
        userId
      );

      expect(result).toEqual(existingEnv);
    });

    it('should throw NotFoundError for non-existent environment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        applicationService.updateEnvironment(
          tenantSlug,
          'APP-000001',
          'non-existent',
          { name: 'New Name' },
          userId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.updateEnvironment(
          tenantSlug,
          'non-existent',
          'env-uuid',
          { name: 'New Name' },
          userId
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteEnvironment', () => {
    const existingApp = { id: 'app-uuid', app_id: 'APP-000001', name: 'Test App' };

    it('should delete environment successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await applicationService.deleteEnvironment(tenantSlug, 'APP-000001', 'env-uuid', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.environments WHERE id = $1 AND application_id = $2'),
        ['env-uuid', 'app-uuid']
      );
    });

    it('should throw NotFoundError for non-existent environment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        applicationService.deleteEnvironment(tenantSlug, 'APP-000001', 'non-existent', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.deleteEnvironment(tenantSlug, 'non-existent', 'env-uuid', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should invalidate cache after environment deletion', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingApp] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await applicationService.deleteEnvironment(tenantSlug, 'APP-000001', 'env-uuid', userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'applications');
    });
  });

  // ============================================
  // HEALTH SCORE
  // ============================================
  describe('getHealthScore', () => {
    it('should return health score with excellent status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'Healthy App',
          tier: 'tier1',
          health_score: 95,
          health_score_updated_at: new Date('2026-01-01'),
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.healthScore).toBe(95);
      expect(result.status).toBe('excellent');
    });

    it('should return good status for score >= 75', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'Good App',
          tier: 'tier2',
          health_score: 80,
          health_score_updated_at: new Date(),
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.status).toBe('good');
    });

    it('should return warning status for score >= 50', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'Warning App',
          tier: 'tier2',
          health_score: 60,
          health_score_updated_at: new Date(),
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.status).toBe('warning');
    });

    it('should return critical status for score < 50', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'Critical App',
          tier: 'tier1',
          health_score: 30,
          health_score_updated_at: new Date(),
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.status).toBe('critical');
    });

    it('should return not_calculated status when health_score is null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'New App',
          tier: 'tier3',
          health_score: null,
          health_score_updated_at: null,
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.healthScore).toBeNull();
      expect(result.status).toBe('not_calculated');
    });

    it('should throw NotFoundError for non-existent application', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        applicationService.getHealthScore(tenantSlug, 'non-existent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should include application identifiers in response', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'app-uuid',
          app_id: 'APP-000001',
          name: 'Test App',
          tier: 'tier2',
          health_score: 88,
          health_score_updated_at: new Date(),
        }],
      });

      const result = await applicationService.getHealthScore(tenantSlug, 'APP-000001');

      expect(result.applicationId).toBe('app-uuid');
      expect(result.appId).toBe('APP-000001');
      expect(result.name).toBe('Test App');
      expect(result.tier).toBe('tier2');
    });
  });
});
