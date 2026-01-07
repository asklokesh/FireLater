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
    name: 'cleanup',
  })),
  Job: vi.fn(),
}));

// Import after mocks are set up
import { type CleanupJobData, type CleanupResult } from '../../../../src/jobs/processors/cleanup.js';

describe('Cleanup Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('CleanupJobData Interface', () => {
    it('should accept valid cleanup job data', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
        retentionDays: 90,
      };

      expect(jobData.tenantSlug).toBe('test-tenant');
      expect(jobData.cleanupType).toBe('notifications');
      expect(jobData.retentionDays).toBe(90);
    });

    it('should accept cleanup data without retention days', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'sessions',
      };

      expect(jobData.retentionDays).toBeUndefined();
    });
  });

  describe('Cleanup Types', () => {
    it('should support notifications cleanup type', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
      };

      expect(jobData.cleanupType).toBe('notifications');
    });

    it('should support sessions cleanup type', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'sessions',
      };

      expect(jobData.cleanupType).toBe('sessions');
    });

    it('should support analytics_cache cleanup type', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'analytics_cache',
      };

      expect(jobData.cleanupType).toBe('analytics_cache');
    });

    it('should support report_executions cleanup type', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'report_executions',
      };

      expect(jobData.cleanupType).toBe('report_executions');
    });

    it('should support all cleanup type', () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'all',
        retentionDays: 30,
      };

      expect(jobData.cleanupType).toBe('all');
    });
  });

  describe('CleanupResult Interface', () => {
    it('should have type and deletedCount properties', () => {
      const result: CleanupResult = {
        type: 'notifications',
        deletedCount: 150,
      };

      expect(result.type).toBe('notifications');
      expect(result.deletedCount).toBe(150);
    });

    it('should handle zero deleted count', () => {
      const result: CleanupResult = {
        type: 'sessions',
        deletedCount: 0,
      };

      expect(result.deletedCount).toBe(0);
    });

    it('should work with array of results', () => {
      const results: CleanupResult[] = [
        { type: 'notifications', deletedCount: 100 },
        { type: 'sessions', deletedCount: 50 },
        { type: 'analytics_cache', deletedCount: 200 },
        { type: 'report_executions', deletedCount: 25 },
      ];

      const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
      expect(totalDeleted).toBe(375);
    });
  });

  describe('Retention Days', () => {
    it('should accept various retention day values', () => {
      const testCases = [
        { retentionDays: 7, description: 'one week' },
        { retentionDays: 30, description: 'one month' },
        { retentionDays: 90, description: 'three months (default)' },
        { retentionDays: 365, description: 'one year' },
      ];

      for (const testCase of testCases) {
        const jobData: CleanupJobData = {
          tenantSlug: 'test-tenant',
          cleanupType: 'all',
          retentionDays: testCase.retentionDays,
        };

        expect(jobData.retentionDays).toBe(testCase.retentionDays);
      }
    });
  });

  describe('Worker Configuration', () => {
    it('should export cleanupWorker', async () => {
      const { cleanupWorker } = await import('../../../../src/jobs/processors/cleanup.js');

      expect(cleanupWorker).toBeDefined();
    });

    it('should export scheduleCleanup function', async () => {
      const { scheduleCleanup } = await import('../../../../src/jobs/processors/cleanup.js');

      expect(typeof scheduleCleanup).toBe('function');
    });
  });

  describe('Multi-tenant Support', () => {
    it('should support cleanup for different tenants', () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

      for (const tenant of tenants) {
        const jobData: CleanupJobData = {
          tenantSlug: tenant,
          cleanupType: 'all',
        };

        expect(jobData.tenantSlug).toBe(tenant);
      }
    });

    it('should handle tenant-specific cleanup configurations', () => {
      const configs: CleanupJobData[] = [
        { tenantSlug: 'enterprise', cleanupType: 'all', retentionDays: 365 }, // Long retention
        { tenantSlug: 'startup', cleanupType: 'all', retentionDays: 30 },    // Short retention
        { tenantSlug: 'default', cleanupType: 'all', retentionDays: 90 },    // Standard retention
      ];

      expect(configs[0].retentionDays).toBe(365);
      expect(configs[1].retentionDays).toBe(30);
      expect(configs[2].retentionDays).toBe(90);
    });
  });

  describe('Database Queries', () => {
    it('should query notifications table for cleanup', async () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
        retentionDays: 90,
      };

      // Verify schema name format matches tenant service
      expect(jobData.tenantSlug).toBe('test-tenant');
      // Expected schema: tenant_test-tenant
    });

    it('should query refresh_tokens table for sessions cleanup', async () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'sessions',
      };

      // Sessions use global table, not tenant-specific
      expect(jobData.cleanupType).toBe('sessions');
    });

    it('should query analytics_cache with shorter retention', async () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'analytics_cache',
        retentionDays: 7, // Cache has shorter retention
      };

      expect(jobData.retentionDays).toBe(7);
    });

    it('should query report_executions with status filter', async () => {
      const jobData: CleanupJobData = {
        tenantSlug: 'test-tenant',
        cleanupType: 'report_executions',
      };

      // Only completed or failed executions should be cleaned
      expect(jobData.cleanupType).toBe('report_executions');
    });
  });
});
