import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Asset Service
 * Testing CMDB (Configuration Management Database) operations
 *
 * Key coverage areas:
 * - Asset CRUD operations with caching
 * - Asset tag generation
 * - Asset relationships (parent/child in CMDB)
 * - Asset linking to issues/changes
 * - Batch operations for N+1 prevention
 * - Asset statistics
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
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
import {
  assetService,
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetRelationships,
  batchGetAssetRelationships,
  createAssetRelationship,
  deleteAssetRelationship,
  linkAssetToIssue,
  unlinkAssetFromIssue,
  getAssetIssues,
  batchGetAssetIssues,
  getAssetChanges,
  batchGetAssetChanges,
  getAssetStats,
} from '../../../src/services/asset.js';
import { cacheService } from '../../../src/utils/cache.js';

describe('Asset Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // ASSET CRUD OPERATIONS
  // ============================================
  describe('listAssets', () => {
    it('should list all assets with pagination', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total: '100',
            id: 'asset-1',
            asset_tag: 'AST-000001',
            name: 'Production Server',
            asset_type: 'hardware',
            category: 'server',
            status: 'active',
            owner_name: 'IT Admin',
          },
          {
            total: '100',
            id: 'asset-2',
            asset_tag: 'AST-000002',
            name: 'Office Laptop',
            asset_type: 'hardware',
            category: 'laptop',
            status: 'active',
            assigned_to_name: 'John Doe',
          },
        ],
      });

      const result = await listAssets('test-tenant');

      expect(result.total).toBe(100);
      expect(result.assets).toHaveLength(2);
      expect(result.assets[0].name).toBe('Production Server');
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should filter by assetType', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { assetType: 'software' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('asset_type = $1'),
        expect.arrayContaining(['software'])
      );
    });

    it('should filter by category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { category: 'server' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('category = $1'),
        expect.arrayContaining(['server'])
      );
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { status: 'maintenance' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['maintenance'])
      );
    });

    it('should filter by ownerId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { ownerId: 'user-1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('owner_id = $'),
        expect.arrayContaining(['user-1'])
      );
    });

    it('should filter by assignedToId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { assignedToId: 'user-2' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('assigned_to_id = $'),
        expect.arrayContaining(['user-2'])
      );
    });

    it('should filter by department', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { department: 'Engineering' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('department = $'),
        expect.arrayContaining(['Engineering'])
      );
    });

    it('should search across name, asset_tag, serial_number, hostname', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { search: 'prod-server' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('name ILIKE $'),
        expect.arrayContaining(['%prod-server%'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('asset_tag ILIKE $'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('serial_number ILIKE $'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('hostname ILIKE $'),
        expect.any(Array)
      );
    });

    it('should paginate correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', { page: 3, limit: 25 });

      // Offset should be (3-1) * 25 = 50
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([25, 50])
      );
    });

    it('should return 0 total when no assets exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await listAssets('test-tenant');

      expect(result.total).toBe(0);
      expect(result.assets).toEqual([]);
    });

    it('should combine multiple filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listAssets('test-tenant', {
        assetType: 'hardware',
        category: 'server',
        status: 'active',
        department: 'IT',
      });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('asset_type = $1');
      expect(query).toContain('category = $2');
      expect(query).toContain('status = $3');
      expect(query).toContain('department = $4');
    });
  });

  describe('getAsset', () => {
    it('should get asset by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'asset-1',
          asset_tag: 'AST-000001',
          name: 'Production Server',
          asset_type: 'hardware',
          category: 'server',
          status: 'active',
          manufacturer: 'Dell',
          model: 'PowerEdge R740',
          serial_number: 'SN12345',
          owner_name: 'IT Team',
        }],
      });

      const result = await getAsset('test-tenant', 'asset-1');

      expect(result?.id).toBe('asset-1');
      expect(result?.name).toBe('Production Server');
      expect(result?.manufacturer).toBe('Dell');
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test-tenant:assets:asset:asset-1',
        expect.any(Function),
        { ttl: 600 }
      );
    });

    it('should return null if asset not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getAsset('test-tenant', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should include owner and assigned user names from join', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'asset-1',
          owner_id: 'user-1',
          owner_name: 'John Owner',
          assigned_to_id: 'user-2',
          assigned_to_name: 'Jane Assigned',
        }],
      });

      const result = await getAsset('test-tenant', 'asset-1');

      expect(result?.owner_name).toBe('John Owner');
      expect(result?.assigned_to_name).toBe('Jane Assigned');
    });
  });

  describe('createAsset', () => {
    it('should create asset with generated tag', async () => {
      // Generate asset tag
      mockQuery.mockResolvedValueOnce({
        rows: [{ prefix: 'AST', current_value: 42 }],
      });
      // Insert asset
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-asset',
          asset_tag: 'AST-000042',
          name: 'New Server',
          asset_type: 'hardware',
          category: 'server',
          status: 'active',
        }],
      });

      const result = await createAsset('test-tenant', {
        name: 'New Server',
        assetType: 'hardware',
        category: 'server',
      });

      expect(result.id).toBe('new-asset');
      expect(result.asset_tag).toBe('AST-000042');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'assets');
    });

    it('should initialize sequence if it does not exist', async () => {
      // First attempt returns empty (sequence doesn't exist)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Initialize sequence
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert asset
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-asset', asset_tag: 'AST-000001' }],
      });

      const result = await createAsset('test-tenant', {
        name: 'First Asset',
        assetType: 'hardware',
        category: 'workstation',
      });

      expect(result.asset_tag).toBe('AST-000001');
      // Verify sequence initialization was called (second call after UPDATE returned empty)
      expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO tenant_test.id_sequences");
    });

    it('should create asset with all fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ prefix: 'AST', current_value: 100 }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-asset',
          asset_tag: 'AST-000100',
          name: 'Complete Asset',
        }],
      });

      await createAsset('test-tenant', {
        name: 'Complete Asset',
        description: 'Full description',
        assetType: 'software',
        category: 'software_license',
        status: 'active',
        location: 'Data Center 1',
        department: 'IT',
        ownerId: 'user-1',
        assignedToId: 'user-2',
        manufacturer: 'Microsoft',
        model: 'Office 365',
        serialNumber: 'SN-999',
        version: '2025',
        licenseType: 'subscription',
        licenseCount: 100,
        licenseExpiry: '2026-12-31',
        purchaseDate: '2025-01-01',
        purchaseCost: 5000,
        warrantyExpiry: '2026-12-31',
        vendor: 'Microsoft Corp',
        poNumber: 'PO-12345',
        ipAddress: '192.168.1.100',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        hostname: 'server-01',
        attributes: { customField: 'customValue' },
      }, 'admin-user');

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tenant_test.assets'),
        expect.arrayContaining([
          'AST-000100',
          'Complete Asset',
          'Full description',
          'software',
          'software_license',
          'active',
          'Data Center 1',
          'IT',
          'user-1',
          'user-2',
          'Microsoft',
          'Office 365',
          'SN-999',
          '2025',
          'subscription',
          100,
          '2026-12-31',
          '2025-01-01',
          5000,
          '2026-12-31',
          'Microsoft Corp',
          'PO-12345',
          '192.168.1.100',
          'AA:BB:CC:DD:EE:FF',
          'server-01',
          '{"customField":"customValue"}',
          'admin-user',
        ])
      );
    });

    it('should use default status when not provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ prefix: 'AST', current_value: 1 }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-asset', status: 'active' }],
      });

      await createAsset('test-tenant', {
        name: 'Test Asset',
        assetType: 'hardware',
        category: 'laptop',
      });

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining(['active'])
      );
    });
  });

  describe('updateAsset', () => {
    it('should update asset name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1', name: 'Updated Name' }],
      });

      const result = await updateAsset('test-tenant', 'asset-1', {
        name: 'Updated Name',
      });

      expect(result?.name).toBe('Updated Name');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        expect.arrayContaining(['Updated Name', 'asset-1'])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'assets');
    });

    it('should update multiple fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        name: 'New Name',
        status: 'maintenance',
        location: 'Rack 42',
        department: 'DevOps',
        ownerId: 'user-3',
      });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('name = $1');
      expect(query).toContain('status = $2');
      expect(query).toContain('location = $3');
      expect(query).toContain('department = $4');
      expect(query).toContain('owner_id = $5');
    });

    it('should update hardware-specific fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        manufacturer: 'HP',
        model: 'ProLiant DL380',
        serialNumber: 'SN-NEW-123',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('manufacturer = $1'),
        expect.arrayContaining(['HP', 'ProLiant DL380', 'SN-NEW-123', 'asset-1'])
      );
    });

    it('should update software-specific fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        version: '3.0',
        licenseType: 'perpetual',
        licenseCount: 50,
        licenseExpiry: '2027-01-01',
      });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('version = $');
      expect(query).toContain('license_type = $');
      expect(query).toContain('license_count = $');
      expect(query).toContain('license_expiry = $');
    });

    it('should update financial fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        purchaseDate: '2025-06-01',
        purchaseCost: 15000,
        warrantyExpiry: '2028-06-01',
        vendor: 'New Vendor',
        poNumber: 'PO-67890',
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain('2025-06-01');
      expect(params).toContain(15000);
      expect(params).toContain('2028-06-01');
      expect(params).toContain('New Vendor');
      expect(params).toContain('PO-67890');
    });

    it('should update network fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        ipAddress: '10.0.0.100',
        macAddress: '11:22:33:44:55:66',
        hostname: 'new-hostname',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ip_address = $'),
        expect.arrayContaining(['10.0.0.100', '11:22:33:44:55:66', 'new-hostname', 'asset-1'])
      );
    });

    it('should update attributes (JSON)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        attributes: { env: 'production', tier: 'critical' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('attributes = $1'),
        expect.arrayContaining(['{"env":"production","tier":"critical"}', 'asset-1'])
      );
    });

    it('should return existing asset if no updates provided', async () => {
      // When no updates, it calls getAsset
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1', name: 'Unchanged' }],
      });

      const result = await updateAsset('test-tenant', 'asset-1', {});

      expect(result?.name).toBe('Unchanged');
      // Should call getAsset's query pattern
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.id = $1'),
        ['asset-1']
      );
    });

    it('should return null if asset not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateAsset('test-tenant', 'nonexistent', {
        name: 'New Name',
      });

      expect(result).toBeNull();
    });

    it('should handle null values for nullable fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'asset-1' }],
      });

      await updateAsset('test-tenant', 'asset-1', {
        ownerId: null,
        assignedToId: null,
        licenseExpiry: null,
        purchaseDate: null,
        purchaseCost: null,
        warrantyExpiry: null,
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(null);
    });
  });

  describe('deleteAsset', () => {
    it('should delete asset and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteAsset('test-tenant', 'asset-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.assets'),
        ['asset-1']
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'assets');
    });

    it('should return false if asset not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteAsset('test-tenant', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // ASSET RELATIONSHIPS (CMDB)
  // ============================================
  describe('getAssetRelationships', () => {
    it('should get both parent and child relationships', async () => {
      // Parents query (where asset is child)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rel-1',
            parent_asset_id: 'parent-1',
            parent_asset_name: 'Data Center',
            child_asset_id: 'asset-1',
            child_asset_name: 'Server',
            relationship_type: 'contains',
          },
        ],
      });
      // Children query (where asset is parent)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rel-2',
            parent_asset_id: 'asset-1',
            parent_asset_name: 'Server',
            child_asset_id: 'child-1',
            child_asset_name: 'VM Instance',
            relationship_type: 'hosts',
          },
          {
            id: 'rel-3',
            parent_asset_id: 'asset-1',
            parent_asset_name: 'Server',
            child_asset_id: 'child-2',
            child_asset_name: 'Database',
            relationship_type: 'runs',
          },
        ],
      });

      const result = await getAssetRelationships('test-tenant', 'asset-1');

      expect(result.parents).toHaveLength(1);
      expect(result.parents[0].parent_asset_name).toBe('Data Center');
      expect(result.children).toHaveLength(2);
      expect(result.children[0].child_asset_name).toBe('VM Instance');
    });

    it('should return empty arrays when no relationships exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getAssetRelationships('test-tenant', 'isolated-asset');

      expect(result.parents).toEqual([]);
      expect(result.children).toEqual([]);
    });
  });

  describe('batchGetAssetRelationships', () => {
    it('should batch load relationships for multiple assets', async () => {
      // Parents query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { child_asset_id: 'asset-1', parent_asset_id: 'parent-1', parent_asset_name: 'DC1', relationship_type: 'contains' },
          { child_asset_id: 'asset-2', parent_asset_id: 'parent-1', parent_asset_name: 'DC1', relationship_type: 'contains' },
        ],
      });
      // Children query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { parent_asset_id: 'asset-1', child_asset_id: 'vm-1', child_asset_name: 'VM1', relationship_type: 'hosts' },
        ],
      });

      const result = await batchGetAssetRelationships('test-tenant', ['asset-1', 'asset-2', 'asset-3']);

      expect(result.size).toBe(3);
      expect(result.get('asset-1')?.parents).toHaveLength(1);
      expect(result.get('asset-1')?.children).toHaveLength(1);
      expect(result.get('asset-2')?.parents).toHaveLength(1);
      expect(result.get('asset-2')?.children).toHaveLength(0);
      expect(result.get('asset-3')?.parents).toHaveLength(0);
      expect(result.get('asset-3')?.children).toHaveLength(0);
    });

    it('should return empty map for empty input', async () => {
      const result = await batchGetAssetRelationships('test-tenant', []);

      expect(result.size).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should use ANY clause for efficient batch query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await batchGetAssetRelationships('test-tenant', ['a-1', 'a-2']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY($1::uuid[])'),
        [['a-1', 'a-2']]
      );
    });
  });

  describe('createAssetRelationship', () => {
    it('should create relationship between assets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-rel',
          parent_asset_id: 'parent-1',
          child_asset_id: 'child-1',
          relationship_type: 'contains',
          created_at: '2025-01-01',
        }],
      });

      const result = await createAssetRelationship('test-tenant', 'parent-1', 'child-1', 'contains');

      expect(result.id).toBe('new-rel');
      expect(result.parent_asset_id).toBe('parent-1');
      expect(result.child_asset_id).toBe('child-1');
      expect(result.relationship_type).toBe('contains');
    });
  });

  describe('deleteAssetRelationship', () => {
    it('should delete relationship and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteAssetRelationship('test-tenant', 'rel-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.asset_relationships'),
        ['rel-1']
      );
    });

    it('should return false if relationship not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteAssetRelationship('test-tenant', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // ASSET-ISSUE LINKING
  // ============================================
  describe('linkAssetToIssue', () => {
    it('should link asset to issue with upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await linkAssetToIssue('test-tenant', 'asset-1', 'issue-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.asset_issue_links'),
        ['asset-1', 'issue-1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (asset_id, issue_id) DO NOTHING'),
        expect.any(Array)
      );
    });
  });

  describe('unlinkAssetFromIssue', () => {
    it('should remove link between asset and issue', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await unlinkAssetFromIssue('test-tenant', 'asset-1', 'issue-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.asset_issue_links'),
        ['asset-1', 'issue-1']
      );
    });
  });

  describe('getAssetIssues', () => {
    it('should get issues linked to asset', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'issue-1', issue_number: 'INC-001', title: 'Server Down', status: 'open' },
          { id: 'issue-2', issue_number: 'INC-002', title: 'Performance Issue', status: 'resolved' },
        ],
      });

      const result = await getAssetIssues('test-tenant', 'asset-1');

      expect(result).toHaveLength(2);
      expect(result[0].issue_number).toBe('INC-001');
      expect(result[0].title).toBe('Server Down');
    });

    it('should return empty array when no linked issues', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getAssetIssues('test-tenant', 'asset-1');

      expect(result).toEqual([]);
    });
  });

  describe('batchGetAssetIssues', () => {
    it('should batch load issues for multiple assets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { asset_id: 'asset-1', id: 'issue-1', issue_number: 'INC-001', title: 'Issue 1', status: 'open' },
          { asset_id: 'asset-1', id: 'issue-2', issue_number: 'INC-002', title: 'Issue 2', status: 'open' },
          { asset_id: 'asset-2', id: 'issue-3', issue_number: 'INC-003', title: 'Issue 3', status: 'closed' },
        ],
      });

      const result = await batchGetAssetIssues('test-tenant', ['asset-1', 'asset-2', 'asset-3']);

      expect(result.size).toBe(3);
      expect(result.get('asset-1')).toHaveLength(2);
      expect(result.get('asset-2')).toHaveLength(1);
      expect(result.get('asset-3')).toHaveLength(0);
    });

    it('should return empty map for empty input', async () => {
      const result = await batchGetAssetIssues('test-tenant', []);

      expect(result.size).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // ASSET-CHANGE LINKING
  // ============================================
  describe('getAssetChanges', () => {
    it('should get changes linked to asset', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'change-1', change_number: 'CHG-001', title: 'Server Upgrade', status: 'approved' },
          { id: 'change-2', change_number: 'CHG-002', title: 'Patch Update', status: 'implemented' },
        ],
      });

      const result = await getAssetChanges('test-tenant', 'asset-1');

      expect(result).toHaveLength(2);
      expect(result[0].change_number).toBe('CHG-001');
    });

    it('should return empty array when no linked changes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getAssetChanges('test-tenant', 'asset-1');

      expect(result).toEqual([]);
    });
  });

  describe('batchGetAssetChanges', () => {
    it('should batch load changes for multiple assets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { asset_id: 'asset-1', id: 'change-1', change_number: 'CHG-001', title: 'Change 1', status: 'approved' },
          { asset_id: 'asset-2', id: 'change-2', change_number: 'CHG-002', title: 'Change 2', status: 'pending' },
          { asset_id: 'asset-2', id: 'change-3', change_number: 'CHG-003', title: 'Change 3', status: 'approved' },
        ],
      });

      const result = await batchGetAssetChanges('test-tenant', ['asset-1', 'asset-2', 'asset-3']);

      expect(result.size).toBe(3);
      expect(result.get('asset-1')).toHaveLength(1);
      expect(result.get('asset-2')).toHaveLength(2);
      expect(result.get('asset-3')).toHaveLength(0);
    });

    it('should return empty map for empty input', async () => {
      const result = await batchGetAssetChanges('test-tenant', []);

      expect(result.size).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // ASSET STATISTICS
  // ============================================
  describe('getAssetStats', () => {
    it('should return all asset statistics', async () => {
      // Metrics query (total, expiring warranties/software)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: '250',
          expiring_warranties: '15',
          expiring_software: '8',
        }],
      });
      // Grouped aggregations (GROUPING SETS)
      mockQuery.mockResolvedValueOnce({
        rows: [
          // By type
          { asset_type: 'hardware', status: null, category: null, count: '100' },
          { asset_type: 'software', status: null, category: null, count: '80' },
          { asset_type: 'network', status: null, category: null, count: '70' },
          // By status
          { asset_type: null, status: 'active', category: null, count: '200' },
          { asset_type: null, status: 'maintenance', category: null, count: '30' },
          { asset_type: null, status: 'retired', category: null, count: '20' },
          // By category
          { asset_type: null, status: null, category: 'server', count: '50' },
          { asset_type: null, status: null, category: 'laptop', count: '80' },
          { asset_type: null, status: null, category: 'software_license', count: '120' },
        ],
      });

      const result = await getAssetStats('test-tenant');

      expect(result.total).toBe(250);
      expect(result.expiringWarranties).toBe(15);
      expect(result.expiringSoftware).toBe(8);
      expect(result.byType.hardware).toBe(100);
      expect(result.byType.software).toBe(80);
      expect(result.byStatus.active).toBe(200);
      expect(result.byStatus.maintenance).toBe(30);
      expect(result.byCategory.server).toBe(50);
      expect(result.byCategory.laptop).toBe(80);
    });

    it('should return zeros when no assets exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0', expiring_warranties: '0', expiring_software: '0' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getAssetStats('test-tenant');

      expect(result.total).toBe(0);
      expect(result.expiringWarranties).toBe(0);
      expect(result.expiringSoftware).toBe(0);
      expect(result.byType).toEqual({});
      expect(result.byStatus).toEqual({});
      expect(result.byCategory).toEqual({});
    });

    it('should use GROUPING SETS for efficient aggregation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10', expiring_warranties: '0', expiring_software: '0' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAssetStats('test-tenant');

      // Second query should use GROUPING SETS
      expect(mockQuery.mock.calls[1][0]).toContain('GROUPING SETS ((asset_type), (status), (category))');
    });
  });

  // ============================================
  // SERVICE EXPORT OBJECT
  // ============================================
  describe('assetService export', () => {
    it('should export all functions', () => {
      expect(assetService.listAssets).toBe(listAssets);
      expect(assetService.getAsset).toBe(getAsset);
      expect(assetService.createAsset).toBe(createAsset);
      expect(assetService.updateAsset).toBe(updateAsset);
      expect(assetService.deleteAsset).toBe(deleteAsset);
      expect(assetService.getAssetRelationships).toBe(getAssetRelationships);
      expect(assetService.batchGetAssetRelationships).toBe(batchGetAssetRelationships);
      expect(assetService.createAssetRelationship).toBe(createAssetRelationship);
      expect(assetService.deleteAssetRelationship).toBe(deleteAssetRelationship);
      expect(assetService.linkAssetToIssue).toBe(linkAssetToIssue);
      expect(assetService.unlinkAssetFromIssue).toBe(unlinkAssetFromIssue);
      expect(assetService.getAssetIssues).toBe(getAssetIssues);
      expect(assetService.batchGetAssetIssues).toBe(batchGetAssetIssues);
      expect(assetService.getAssetChanges).toBe(getAssetChanges);
      expect(assetService.batchGetAssetChanges).toBe(batchGetAssetChanges);
      expect(assetService.getAssetStats).toBe(getAssetStats);
    });
  });
});
