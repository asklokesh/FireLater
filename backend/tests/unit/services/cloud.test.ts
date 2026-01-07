import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for Cloud Services
 * Testing cloud account, resource, cost, and mapping rule operations
 *
 * Key coverage areas:
 * - Cloud account CRUD with credential encryption
 * - Cloud resource listing, upsert, and application mapping
 * - Cloud cost tracking and reporting
 * - Cloud mapping rules for auto-discovery
 * - Cache invalidation
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

// Mock credential encryption
vi.mock('../../../src/jobs/processors/cloudSync.js', () => ({
  encryptCredentials: vi.fn((creds: Record<string, unknown>) => `encrypted:${JSON.stringify(creds)}`),
  decryptCredentials: vi.fn(async (encrypted: string) => {
    if (encrypted.startsWith('encrypted:')) {
      return JSON.parse(encrypted.replace('encrypted:', ''));
    }
    return JSON.parse(encrypted || '{}');
  }),
}));

// Mock AWS SDK
vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ Regions: [] }),
  })),
  DescribeRegionsCommand: vi.fn(),
}));

// Mock Azure SDK
vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@azure/arm-resources', () => ({
  ResourceManagementClient: vi.fn().mockImplementation(() => ({
    resourceGroups: {
      list: vi.fn().mockReturnValue({
        next: vi.fn().mockResolvedValue({ done: true }),
      }),
    },
  })),
}));

// Mock GCP SDK
vi.mock('@google-cloud/compute', () => ({
  InstancesClient: vi.fn().mockImplementation(() => ({
    aggregatedListAsync: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield {};
      },
    }),
  })),
}));

// Import after mocks
import {
  cloudAccountService,
  cloudResourceService,
  cloudCostService,
  cloudMappingRuleService,
} from '../../../src/services/cloud.js';
import { cacheService } from '../../../src/utils/cache.js';
import { logger } from '../../../src/utils/logger.js';

const tenantSlug = 'test';
const accountId = 'account-123';
const resourceId = 'resource-456';

describe('Cloud Account Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('list', () => {
    it('should list cloud accounts with pagination and caching', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'acc-1', provider: 'aws', name: 'Production AWS', status: 'active' },
            { id: 'acc-2', provider: 'azure', name: 'Dev Azure', status: 'active' },
          ],
        });

      const result = await cloudAccountService.list(tenantSlug, { page: 1, perPage: 20 });

      expect(result.total).toBe(5);
      expect(result.accounts).toHaveLength(2);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('test:cloud:accounts:list'),
        expect.any(Function),
        { ttl: 600 }
      );
    });

    it('should filter by provider', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudAccountService.list(tenantSlug, { page: 1, perPage: 20 }, { provider: 'aws' });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND provider = $1'),
        expect.arrayContaining(['aws'])
      );
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudAccountService.list(tenantSlug, { page: 1, perPage: 20 }, { status: 'error' });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND status = $1'),
        expect.arrayContaining(['error'])
      );
    });
  });

  describe('findById', () => {
    it('should find cloud account by ID with caching', async () => {
      const account = { id: accountId, provider: 'aws', name: 'Test AWS' };
      mockQuery.mockResolvedValueOnce({ rows: [account] });

      const result = await cloudAccountService.findById(tenantSlug, accountId);

      expect(result).toEqual(account);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `test:cloud:account:${accountId}`,
        expect.any(Function),
        { ttl: 600 }
      );
    });

    it('should return null when account not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await cloudAccountService.findById(tenantSlug, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a cloud account with encrypted credentials', async () => {
      // Check duplicate
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'aws',
          account_id: '123456789',
          name: 'Production AWS',
          credentials_encrypted: 'encrypted:...',
        }],
      });

      const result = await cloudAccountService.create(tenantSlug, {
        provider: 'aws',
        accountId: '123456789',
        name: 'Production AWS',
        credentialType: 'access_key',
        credentials: { accessKeyId: 'AKIA...', secretAccessKey: 'secret' },
      });

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('credentials_encrypted');
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tenant_test.cloud_accounts'),
        expect.arrayContaining(['aws', '123456789', 'Production AWS'])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'cloud');
    });

    it('should throw error for duplicate account', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      await expect(
        cloudAccountService.create(tenantSlug, {
          provider: 'aws',
          accountId: '123456789',
          name: 'Duplicate',
          credentialType: 'access_key',
        })
      ).rejects.toThrow('Cloud account aws:123456789 already exists');
    });

    it('should use default values for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: accountId }] });

      await cloudAccountService.create(tenantSlug, {
        provider: 'gcp',
        accountId: 'project-123',
        name: 'GCP Project',
        credentialType: 'service_account',
      });

      // Check that defaults are applied
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining([
          'gcp',
          'project-123',
          'GCP Project',
          null, // description
          'service_account',
          '', // empty encrypted credentials
          null, // roleArn
          null, // externalId
          true, // syncEnabled default
          3600, // syncInterval default
          true, // syncResources default
          true, // syncCosts default
          false, // syncMetrics default
          null, // regions
        ])
      );
    });
  });

  describe('update', () => {
    it('should update cloud account', async () => {
      const existingAccount = { id: accountId, provider: 'aws', name: 'Old Name' };
      mockQuery
        .mockResolvedValueOnce({ rows: [existingAccount] }) // findById
        .mockResolvedValueOnce({ rows: [{ ...existingAccount, name: 'New Name' }] }); // update

      const result = await cloudAccountService.update(tenantSlug, accountId, {
        name: 'New Name',
        syncEnabled: false,
      });

      expect(result.name).toBe('New Name');
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenant_test.cloud_accounts SET'),
        expect.arrayContaining(['New Name', false, accountId])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'cloud');
    });

    it('should throw NotFoundError when account does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        cloudAccountService.update(tenantSlug, 'nonexistent', { name: 'Test' })
      ).rejects.toThrow('Cloud account');
    });

    it('should return existing account when no updates provided', async () => {
      const existingAccount = { id: accountId, provider: 'aws', name: 'Test' };
      mockQuery.mockResolvedValueOnce({ rows: [existingAccount] });

      const result = await cloudAccountService.update(tenantSlug, accountId, {});

      expect(result).toEqual(existingAccount);
    });
  });

  describe('delete', () => {
    it('should delete cloud account', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: accountId }] }) // findById
        .mockResolvedValueOnce({ rowCount: 1 }); // delete

      await cloudAccountService.delete(tenantSlug, accountId);

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM tenant_test.cloud_accounts'),
        [accountId]
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'cloud');
    });

    it('should throw NotFoundError when account does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        cloudAccountService.delete(tenantSlug, 'nonexistent')
      ).rejects.toThrow('Cloud account');
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await cloudAccountService.updateSyncStatus(tenantSlug, accountId, 'success');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.cloud_accounts'),
        [accountId, 'success', null]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('last_sync_status = $2'),
        expect.any(Array)
      );
    });

    it('should update sync status with error message', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await cloudAccountService.updateSyncStatus(tenantSlug, accountId, 'error', 'Connection failed');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [accountId, 'error', 'Connection failed']
      );
    });
  });

  describe('testConnection', () => {
    it('should test AWS connection successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'aws',
          credentials_encrypted: 'encrypted:{"accessKeyId":"AKIA","secretAccessKey":"secret","region":"us-east-1"}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('AWS connection successful');
    });

    it('should return error for missing AWS credentials', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'aws',
          credentials_encrypted: 'encrypted:{}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('AWS credentials not configured');
    });

    it('should return error for missing Azure credentials', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'azure',
          credentials_encrypted: 'encrypted:{}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Azure credentials not configured');
    });

    it('should return error for missing Azure subscriptionId', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'azure',
          credentials_encrypted: 'encrypted:{"tenantId":"t","clientId":"c","clientSecret":"s"}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Azure subscriptionId is required');
    });

    it('should return error for missing GCP credentials', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'gcp',
          credentials_encrypted: 'encrypted:{}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('GCP credentials not configured');
    });

    it('should return error for unsupported provider', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: accountId,
          provider: 'unknown',
          credentials_encrypted: 'encrypted:{}',
        }],
      });

      const result = await cloudAccountService.testConnection(tenantSlug, accountId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unsupported provider: unknown');
    });

    it('should throw NotFoundError for nonexistent account', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        cloudAccountService.testConnection(tenantSlug, 'nonexistent')
      ).rejects.toThrow('Cloud account');
    });
  });
});

describe('Cloud Resource Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('list', () => {
    it('should list cloud resources with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'r-1', resource_id: 'i-123', resource_type: 'ec2:instance', provider: 'aws' },
            { id: 'r-2', resource_id: 'vm-456', resource_type: 'compute:instance', provider: 'azure' },
          ],
        });

      const result = await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 });

      expect(result.total).toBe(100);
      expect(result.resources).toHaveLength(2);
      // Default filter excludes deleted resources
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND r.is_deleted = false'),
        expect.any(Array)
      );
    });

    it('should filter by cloud account', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 }, { cloudAccountId: accountId });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND r.cloud_account_id = $1'),
        expect.arrayContaining([accountId])
      );
    });

    it('should filter by resource type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 }, { resourceType: 'ec2:instance' });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND r.resource_type = $1'),
        expect.arrayContaining(['ec2:instance'])
      );
    });

    it('should filter by application', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 }, { applicationId: 'app-123' });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND r.application_id = $1'),
        expect.arrayContaining(['app-123'])
      );
    });

    it('should include deleted resources when specified', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 }, { isDeleted: true });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND r.is_deleted = $1'),
        expect.arrayContaining([true])
      );
    });
  });

  describe('findById', () => {
    it('should find resource by ID with joined data', async () => {
      const resource = {
        id: resourceId,
        resource_id: 'i-123',
        resource_type: 'ec2:instance',
        provider: 'aws',
        account_name: 'Production AWS',
        application_name: 'Web App',
      };
      mockQuery.mockResolvedValueOnce({ rows: [resource] });

      const result = await cloudResourceService.findById(tenantSlug, resourceId);

      expect(result).toEqual(resource);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN tenant_test.cloud_accounts'),
        [resourceId]
      );
    });

    it('should return null when resource not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await cloudResourceService.findById(tenantSlug, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should create new resource', async () => {
      const resource = {
        id: resourceId,
        cloud_account_id: accountId,
        resource_id: 'i-new-123',
        resource_type: 'ec2:instance',
        name: 'Web Server 1',
      };
      mockQuery.mockResolvedValueOnce({ rows: [resource] });

      const result = await cloudResourceService.upsert(tenantSlug, {
        cloudAccountId: accountId,
        resourceId: 'i-new-123',
        resourceType: 'ec2:instance',
        name: 'Web Server 1',
        region: 'us-east-1',
        status: 'running',
        tags: { Environment: 'Production' },
      });

      expect(result).toEqual(resource);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.cloud_resources'),
        expect.arrayContaining([accountId, 'i-new-123', 'ec2:instance', 'Web Server 1'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (cloud_account_id, resource_id)'),
        expect.any(Array)
      );
    });

    it('should update existing resource on conflict', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: resourceId,
          resource_id: 'i-existing',
          status: 'stopped',
        }],
      });

      await cloudResourceService.upsert(tenantSlug, {
        cloudAccountId: accountId,
        resourceId: 'i-existing',
        resourceType: 'ec2:instance',
        status: 'stopped',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DO UPDATE SET'),
        expect.any(Array)
      );
    });
  });

  describe('mapToApplication', () => {
    it('should map resource to application', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: resourceId }] }) // findById
        .mockResolvedValueOnce({
          rows: [{
            id: resourceId,
            application_id: 'app-123',
            environment_id: 'env-456',
          }],
        });

      const result = await cloudResourceService.mapToApplication(tenantSlug, resourceId, 'app-123', 'env-456');

      expect(result.application_id).toBe('app-123');
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SET application_id = $2, environment_id = $3'),
        [resourceId, 'app-123', 'env-456']
      );
    });

    it('should throw NotFoundError for nonexistent resource', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        cloudResourceService.mapToApplication(tenantSlug, 'nonexistent', 'app-123')
      ).rejects.toThrow('Cloud resource');
    });
  });

  describe('unmapFromApplication', () => {
    it('should unmap resource from application', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: resourceId }] }) // findById
        .mockResolvedValueOnce({
          rows: [{
            id: resourceId,
            application_id: null,
            environment_id: null,
          }],
        });

      const result = await cloudResourceService.unmapFromApplication(tenantSlug, resourceId);

      expect(result.application_id).toBeNull();
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SET application_id = NULL, environment_id = NULL'),
        [resourceId]
      );
    });
  });

  describe('markDeleted', () => {
    it('should mark resources as deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      await cloudResourceService.markDeleted(tenantSlug, accountId, ['r-1', 'r-2', 'r-3', 'r-4', 'r-5']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET is_deleted = true, deleted_at = NOW()'),
        [accountId, ['r-1', 'r-2', 'r-3', 'r-4', 'r-5']]
      );
    });
  });

  describe('getResourceTypes', () => {
    it('should return resource types with counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: 'ec2:instance', count: '50' },
          { type: 's3:bucket', count: '30' },
          { type: 'rds:instance', count: '10' },
        ],
      });

      const result = await cloudResourceService.getResourceTypes(tenantSlug);

      expect(result).toEqual([
        { type: 'ec2:instance', count: 50 },
        { type: 's3:bucket', count: 30 },
        { type: 'rds:instance', count: 10 },
      ]);
    });
  });

  describe('getResourcesByApplication', () => {
    it('should return resources for an application', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'r-1', resource_type: 'ec2:instance', provider: 'aws' },
          { id: 'r-2', resource_type: 's3:bucket', provider: 'aws' },
        ],
      });

      const result = await cloudResourceService.getResourcesByApplication(tenantSlug, 'app-123');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.application_id = $1 AND r.is_deleted = false'),
        ['app-123']
      );
    });
  });
});

describe('Cloud Cost Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('getCostsByApplication', () => {
    it('should return costs for an application', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { application_id: 'app-123', period_type: 'monthly', total_cost: 1500 },
          { application_id: 'app-123', period_type: 'monthly', total_cost: 1400 },
        ],
      });

      const result = await cloudCostService.getCostsByApplication(tenantSlug, 'app-123');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE application_id = $1 AND period_type = $2'),
        ['app-123', 'monthly']
      );
    });

    it('should support different period types', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await cloudCostService.getCostsByApplication(tenantSlug, 'app-123', 'daily');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['app-123', 'daily']
      );
    });
  });

  describe('getCostSummary', () => {
    it('should return cost summary with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '24' }] })
        .mockResolvedValueOnce({
          rows: [
            { cloud_account_id: accountId, total_cost: 5000, provider: 'aws' },
          ],
        });

      const result = await cloudCostService.getCostSummary(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(24);
      expect(result.costs).toHaveLength(1);
    });

    it('should filter by cloud account', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '12' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudCostService.getCostSummary(tenantSlug, { page: 1, perPage: 10 }, { cloudAccountId: accountId });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND cloud_account_id = $1'),
        expect.arrayContaining([accountId])
      );
    });

    it('should filter by period type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '12' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cloudCostService.getCostSummary(tenantSlug, { page: 1, perPage: 10 }, { periodType: 'monthly' });

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND period_type = $1'),
        expect.arrayContaining(['monthly'])
      );
    });
  });

  describe('recordCost', () => {
    it('should record cost with change percentage', async () => {
      // Previous cost query
      mockQuery.mockResolvedValueOnce({ rows: [{ total_cost: 1000 }] });
      // Insert cost
      mockQuery.mockResolvedValueOnce({
        rows: [{
          cloud_account_id: accountId,
          total_cost: 1100,
          previous_period_cost: 1000,
          cost_change_percent: 10,
        }],
      });

      const result = await cloudCostService.recordCost(tenantSlug, {
        cloudAccountId: accountId,
        periodType: 'monthly',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
        totalCost: 1100,
        costByService: { EC2: 500, S3: 300, RDS: 300 },
      });

      expect(result.cost_change_percent).toBe(10);
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO tenant_test.cloud_cost_reports'),
        expect.any(Array)
      );
    });

    it('should handle first cost record with no previous', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No previous cost
      mockQuery.mockResolvedValueOnce({
        rows: [{
          cloud_account_id: accountId,
          total_cost: 500,
          previous_period_cost: null,
          cost_change_percent: null,
        }],
      });

      const result = await cloudCostService.recordCost(tenantSlug, {
        cloudAccountId: accountId,
        periodType: 'monthly',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
        totalCost: 500,
      });

      expect(result.previous_period_cost).toBeNull();
      expect(result.cost_change_percent).toBeNull();
    });

    it('should use USD as default currency', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ currency: 'USD' }] });

      await cloudCostService.recordCost(tenantSlug, {
        cloudAccountId: accountId,
        periodType: 'monthly',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
        totalCost: 500,
      });

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining(['USD'])
      );
    });
  });
});

describe('Cloud Mapping Rule Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('list', () => {
    it('should list mapping rules with caching', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'rule-1', name: 'Production Tag Rule', tag_key: 'Environment', application_name: 'Web App' },
          { id: 'rule-2', name: 'Cost Center Rule', tag_key: 'CostCenter', application_name: 'API Service' },
        ],
      });

      const result = await cloudMappingRuleService.list(tenantSlug);

      expect(result).toHaveLength(2);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test:cloud:mapping_rules:list',
        expect.any(Function),
        { ttl: 900 }
      );
    });
  });

  describe('create', () => {
    it('should create mapping rule', async () => {
      const rule = {
        id: 'rule-new',
        name: 'New Rule',
        tag_key: 'Application',
        application_id: 'app-123',
      };
      mockQuery.mockResolvedValueOnce({ rows: [rule] });

      const result = await cloudMappingRuleService.create(tenantSlug, {
        name: 'New Rule',
        tagKey: 'Application',
        applicationId: 'app-123',
        priority: 50,
      });

      expect(result).toEqual(rule);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.cloud_resource_mapping_rules'),
        expect.arrayContaining(['New Rule', 'Application', 'app-123'])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'cloud');
    });

    it('should use default priority of 100', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rule-1' }] });

      await cloudMappingRuleService.create(tenantSlug, {
        name: 'Test Rule',
        tagKey: 'Test',
        applicationId: 'app-123',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([100]) // default priority
      );
    });
  });

  describe('delete', () => {
    it('should delete mapping rule', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await cloudMappingRuleService.delete(tenantSlug, 'rule-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.cloud_resource_mapping_rules'),
        ['rule-123']
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'cloud');
    });
  });

  describe('applyRules', () => {
    it('should apply rules and return mapped count', async () => {
      // Get rules
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            tag_key: 'Environment',
            tag_value_pattern: 'prod.*',
            application_id: 'app-prod',
            provider: 'aws',
            resource_type: null,
          },
        ],
      });
      // Update resources
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const result = await cloudMappingRuleService.applyRules(tenantSlug);

      expect(result.mapped).toBe(5);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE is_active = true ORDER BY priority ASC')
      );
    });

    it('should handle multiple rules', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'rule-1', tag_key: 'Env', application_id: 'app-1', provider: null, resource_type: null },
          { id: 'rule-2', tag_key: 'Team', application_id: 'app-2', provider: null, resource_type: null },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });
      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      const result = await cloudMappingRuleService.applyRules(tenantSlug);

      expect(result.mapped).toBe(5);
    });

    it('should return 0 when no rules exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await cloudMappingRuleService.applyRules(tenantSlug);

      expect(result.mapped).toBe(0);
    });
  });
});

describe('SQL injection prevention', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  it('should use parameterized queries for cloud account creation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: accountId }] });

    await cloudAccountService.create(tenantSlug, {
      provider: "'; DROP TABLE accounts; --",
      accountId: '123',
      name: 'Test',
      credentialType: 'access_key',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.arrayContaining(["'; DROP TABLE accounts; --"])
    );
  });

  it('should use parameterized queries for resource listing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await cloudResourceService.list(tenantSlug, { page: 1, perPage: 20 }, {
      resourceType: "'; DELETE FROM resources; --",
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.arrayContaining(["'; DELETE FROM resources; --"])
    );
  });
});
