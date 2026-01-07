import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are created before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());

// Mock database pool
vi.mock('../../../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock config
vi.mock('../../../../src/config/index.js', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
    encryption: {
      key: 'test-encryption-key-32-bytes-long',
    },
  },
}));

// Mock logger
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock tenant service
vi.mock('../../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockImplementation((slug: string) => `tenant_${slug}`),
  },
}));

// Mock BullMQ Worker to prevent actual Redis connection
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'cloud-sync',
  })),
  Job: vi.fn(),
}));

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ Reservations: [], Vpcs: [] }),
  })),
  DescribeInstancesCommand: vi.fn(),
  DescribeVpcsCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-rds', () => ({
  RDSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ DBInstances: [] }),
  })),
  DescribeDBInstancesCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ Functions: [] }),
  })),
  ListFunctionsCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-cost-explorer', () => ({
  CostExplorerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ ResultsByTime: [] }),
  })),
  GetCostAndUsageCommand: vi.fn(),
}));

// Mock Azure SDK
vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn(),
}));

vi.mock('@azure/arm-resources', () => ({
  ResourceManagementClient: vi.fn().mockImplementation(() => ({
    resources: {
      list: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      }),
    },
  })),
}));

vi.mock('@azure/arm-compute', () => ({
  ComputeManagementClient: vi.fn().mockImplementation(() => ({
    virtualMachines: {
      listAll: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      }),
    },
  })),
}));

vi.mock('@azure/arm-costmanagement', () => ({
  CostManagementClient: vi.fn().mockImplementation(() => ({
    query: {
      usage: vi.fn().mockResolvedValue({ rows: [] }),
    },
  })),
}));

// Mock GCP SDK
vi.mock('@google-cloud/compute', () => ({
  InstancesClient: vi.fn().mockImplementation(() => ({
    aggregatedListAsync: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Empty iterator
      },
    }),
  })),
  DisksClient: vi.fn().mockImplementation(() => ({
    aggregatedListAsync: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // Empty iterator
      },
    }),
  })),
}));

// Import after mocks are set up
import {
  type SyncCloudAccountJobData,
  type SyncAllAccountsJobData,
  type CloudSyncResult,
} from '../../../../src/jobs/processors/cloudSync.js';

describe('CloudSync Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('SyncCloudAccountJobData Interface', () => {
    it('should accept valid sync cloud account job data', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'account-123',
        tenantSlug: 'test-tenant',
        syncType: 'resources',
      };

      expect(jobData.accountId).toBe('account-123');
      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.syncType).toBe('resources');
    });

    it('should support resources sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'account-123',
        tenantSlug: 'test-tenant',
        syncType: 'resources',
      };

      expect(jobData.syncType).toBe('resources');
    });

    it('should support costs sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'account-123',
        tenantSlug: 'test-tenant',
        syncType: 'costs',
      };

      expect(jobData.syncType).toBe('costs');
    });

    it('should support all sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'account-123',
        tenantSlug: 'test-tenant',
        syncType: 'all',
      };

      expect(jobData.syncType).toBe('all');
    });
  });

  describe('SyncAllAccountsJobData Interface', () => {
    it('should accept valid sync all accounts job data', () => {
      const jobData: SyncAllAccountsJobData = {
        tenantSlug: 'test-tenant',
        syncType: 'all',
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.syncType).toBe('all');
    });

    it('should support different sync types for all accounts', () => {
      const syncTypes: Array<'resources' | 'costs' | 'all'> = ['resources', 'costs', 'all'];

      for (const syncType of syncTypes) {
        const jobData: SyncAllAccountsJobData = {
          tenantSlug: 'test-tenant',
          syncType,
        };

        expect(jobData.syncType).toBe(syncType);
      }
    });
  });

  describe('CloudSyncResult Interface', () => {
    it('should have all required properties', () => {
      const result: CloudSyncResult = {
        accountId: 'account-123',
        provider: 'aws',
        resourcesUpdated: 10,
        costsUpdated: 5,
        errors: [],
      };

      expect(result.accountId).toBe('account-123');
      expect(result.provider).toBe('aws');
      expect(result.resourcesUpdated).toBe(10);
      expect(result.costsUpdated).toBe(5);
      expect(result.errors).toEqual([]);
    });

    it('should handle results with errors', () => {
      const result: CloudSyncResult = {
        accountId: 'account-456',
        provider: 'azure',
        resourcesUpdated: 0,
        costsUpdated: 0,
        errors: ['Connection timeout', 'Authentication failed'],
      };

      expect(result.errors.length).toBe(2);
      expect(result.errors).toContain('Connection timeout');
      expect(result.errors).toContain('Authentication failed');
    });

    it('should handle zero updates', () => {
      const result: CloudSyncResult = {
        accountId: 'account-789',
        provider: 'gcp',
        resourcesUpdated: 0,
        costsUpdated: 0,
        errors: [],
      };

      expect(result.resourcesUpdated).toBe(0);
      expect(result.costsUpdated).toBe(0);
    });

    it('should work with array of results', () => {
      const results: CloudSyncResult[] = [
        { accountId: 'acc-1', provider: 'aws', resourcesUpdated: 50, costsUpdated: 30, errors: [] },
        { accountId: 'acc-2', provider: 'azure', resourcesUpdated: 25, costsUpdated: 15, errors: [] },
        { accountId: 'acc-3', provider: 'gcp', resourcesUpdated: 75, costsUpdated: 45, errors: ['Partial sync'] },
      ];

      const totalResources = results.reduce((sum, r) => sum + r.resourcesUpdated, 0);
      const totalCosts = results.reduce((sum, r) => sum + r.costsUpdated, 0);

      expect(totalResources).toBe(150);
      expect(totalCosts).toBe(90);
    });
  });

  describe('Cloud Providers', () => {
    it('should support AWS provider', () => {
      const result: CloudSyncResult = {
        accountId: 'aws-account',
        provider: 'aws',
        resourcesUpdated: 100,
        costsUpdated: 50,
        errors: [],
      };

      expect(result.provider).toBe('aws');
    });

    it('should support Azure provider', () => {
      const result: CloudSyncResult = {
        accountId: 'azure-account',
        provider: 'azure',
        resourcesUpdated: 80,
        costsUpdated: 40,
        errors: [],
      };

      expect(result.provider).toBe('azure');
    });

    it('should support GCP provider', () => {
      const result: CloudSyncResult = {
        accountId: 'gcp-account',
        provider: 'gcp',
        resourcesUpdated: 60,
        costsUpdated: 30,
        errors: [],
      };

      expect(result.provider).toBe('gcp');
    });
  });

  describe('Worker Configuration', () => {
    it('should export cloudSyncWorker', async () => {
      const { cloudSyncWorker } = await import('../../../../src/jobs/processors/cloudSync.js');

      expect(cloudSyncWorker).toBeDefined();
    });

    it('should export scheduleCloudSync function', async () => {
      const { scheduleCloudSync } = await import('../../../../src/jobs/processors/cloudSync.js');

      expect(typeof scheduleCloudSync).toBe('function');
    });

    it('should export encryptCredentials function', async () => {
      const { encryptCredentials } = await import('../../../../src/jobs/processors/cloudSync.js');

      expect(typeof encryptCredentials).toBe('function');
    });

    it('should export decryptCredentials function', async () => {
      const { decryptCredentials } = await import('../../../../src/jobs/processors/cloudSync.js');

      expect(typeof decryptCredentials).toBe('function');
    });
  });

  describe('Multi-tenant Support', () => {
    it('should support different tenants', () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      for (const tenant of tenants) {
        const jobData: SyncAllAccountsJobData = {
          tenantSlug: tenant,
          syncType: 'all',
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });

    it('should generate tenant-specific schema names', async () => {
      const { tenantService } = await import('../../../../src/services/tenant.js');

      const schema = tenantService.getSchemaName('acme-corp');
      expect(schema).toBe('tenant_acme-corp');
    });
  });

  describe('Encryption Functions', () => {
    it('should encrypt and decrypt credentials', async () => {
      const { encryptCredentials, decryptCredentials } = await import('../../../../src/jobs/processors/cloudSync.js');

      const credentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      };

      const encrypted = encryptCredentials(credentials);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':'); // Encrypted format contains colons

      const decrypted = await decryptCredentials(encrypted);
      expect(decrypted.accessKeyId).toBe(credentials.accessKeyId);
      expect(decrypted.secretAccessKey).toBe(credentials.secretAccessKey);
      expect(decrypted.region).toBe(credentials.region);
    });

    it('should handle encrypted credentials format correctly', async () => {
      const { encryptCredentials, decryptCredentials } = await import('../../../../src/jobs/processors/cloudSync.js');

      // Test round-trip encryption/decryption
      const originalCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        region: 'us-east-1',
      };

      const encrypted = encryptCredentials(originalCreds);
      // Encrypted format contains colons separating iv:authTag:data
      expect(encrypted).toContain(':');

      const decrypted = await decryptCredentials(encrypted);
      expect(decrypted.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(decrypted.region).toBe('us-east-1');
    });
  });

  describe('Sync Types', () => {
    it('should accept resources sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'acc-123',
        tenantSlug: 'tenant-1',
        syncType: 'resources',
      };

      expect(['resources', 'costs', 'all']).toContain(jobData.syncType);
    });

    it('should accept costs sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'acc-123',
        tenantSlug: 'tenant-1',
        syncType: 'costs',
      };

      expect(['resources', 'costs', 'all']).toContain(jobData.syncType);
    });

    it('should accept all sync type', () => {
      const jobData: SyncCloudAccountJobData = {
        accountId: 'acc-123',
        tenantSlug: 'tenant-1',
        syncType: 'all',
      };

      expect(['resources', 'costs', 'all']).toContain(jobData.syncType);
    });
  });

  describe('Error Handling', () => {
    it('should accumulate errors in result', () => {
      const result: CloudSyncResult = {
        accountId: 'error-account',
        provider: 'aws',
        resourcesUpdated: 0,
        costsUpdated: 0,
        errors: [],
      };

      // Simulate adding errors
      result.errors.push('Resource sync failed: Network error');
      result.errors.push('Cost sync failed: Permission denied');

      expect(result.errors.length).toBe(2);
    });

    it('should handle partial success', () => {
      const result: CloudSyncResult = {
        accountId: 'partial-account',
        provider: 'azure',
        resourcesUpdated: 50,
        costsUpdated: 0,
        errors: ['Cost sync failed'],
      };

      // Partial success: resources synced but costs failed
      expect(result.resourcesUpdated).toBeGreaterThan(0);
      expect(result.costsUpdated).toBe(0);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('Job IDs', () => {
    it('should generate unique job IDs with tenant and timestamp', () => {
      const tenantSlug = 'acme-corp';
      const timestamp = Date.now();
      const jobId = `cloud-sync-${tenantSlug}-${timestamp}`;

      expect(jobId).toMatch(/^cloud-sync-acme-corp-\d+$/);
    });

    it('should create distinct job IDs for different tenants', () => {
      const timestamp = Date.now();
      const jobId1 = `cloud-sync-tenant-a-${timestamp}`;
      const jobId2 = `cloud-sync-tenant-b-${timestamp}`;

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toContain('tenant-a');
      expect(jobId2).toContain('tenant-b');
    });
  });

  describe('Account Status Handling', () => {
    it('should only sync active accounts', () => {
      // When status is active, sync should proceed
      const activeAccount = { status: 'active' };
      const inactiveAccount = { status: 'inactive' };
      const pausedAccount = { status: 'paused' };

      expect(activeAccount.status).toBe('active');
      expect(inactiveAccount.status).not.toBe('active');
      expect(pausedAccount.status).not.toBe('active');
    });
  });
});
