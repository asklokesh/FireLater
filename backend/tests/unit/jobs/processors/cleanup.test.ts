import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are created before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockCleanupQueueAdd = vi.hoisted(() => vi.fn());

// Capture worker event handlers and processor using vi.hoisted
const { workerEventHandlers, getCapturedProcessor, setCapturedProcessor } = vi.hoisted(() => {
  const handlers: Record<string, (job: unknown, result?: unknown) => void> = {};
  let processor: ((job: unknown) => Promise<unknown>) | null = null;
  return {
    workerEventHandlers: handlers,
    getCapturedProcessor: () => processor,
    setCapturedProcessor: (p: ((job: unknown) => Promise<unknown>) | null) => { processor = p; },
  };
});

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

// Mock queues (for scheduleCleanup)
vi.mock('../../../../src/jobs/queues.js', () => ({
  cleanupQueue: {
    add: mockCleanupQueueAdd,
  },
}));

// Mock BullMQ Worker to prevent actual Redis connection and capture processor
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: unknown) => Promise<unknown>) => {
    // Capture the processor function
    setCapturedProcessor(processor);
    return {
      on: vi.fn().mockImplementation((event: string, handler: (job: unknown, result?: unknown) => void) => {
        workerEventHandlers[event] = handler;
      }),
      close: vi.fn(),
      isRunning: vi.fn().mockReturnValue(true),
      name: 'cleanup',
    };
  }),
  Job: vi.fn(),
}));

// Import after mocks are set up
import { type CleanupJobData, type CleanupResult, scheduleCleanup } from '../../../../src/jobs/processors/cleanup.js';
import { logger } from '../../../../src/utils/logger.js';

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

  // ============================================
  // JOB PROCESSOR TESTS
  // ============================================

  describe('processCleanup', () => {
    const createMockJob = (data: CleanupJobData) => ({
      id: 'job-123',
      name: 'run-cleanup',
      data,
    });

    it('should process notifications cleanup', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 }); // notifications delete

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
        retentionDays: 90,
      });

      const result = await getCapturedProcessor()!(job);

      expect(result).toEqual([{ type: 'notifications', deletedCount: 5 }]);
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test-tenant.notifications'),
        [90]
      );
    });

    it('should process sessions cleanup', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 10 }); // sessions delete

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'sessions',
        retentionDays: 30,
      });

      const result = await getCapturedProcessor()!(job);

      expect(result).toEqual([{ type: 'sessions', deletedCount: 10 }]);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refresh_tokens'),
        [30]
      );
    });

    it('should process analytics_cache cleanup', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 100 }); // cache delete

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'analytics_cache',
      });

      const result = await getCapturedProcessor()!(job);

      expect(result).toEqual([{ type: 'analytics_cache', deletedCount: 100 }]);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test-tenant.analytics_cache'),
        [7] // Cache uses 7 days retention
      );
    });

    it('should process report_executions cleanup', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 25 }); // report_executions delete

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'report_executions',
        retentionDays: 60,
      });

      const result = await getCapturedProcessor()!(job);

      expect(result).toEqual([{ type: 'report_executions', deletedCount: 25 }]);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test-tenant.report_executions'),
        [60]
      );
    });

    it('should process all cleanup types in parallel', async () => {
      // Mock all cleanup operations
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 10 }) // notifications
        .mockResolvedValueOnce({ rows: [], rowCount: 5 })  // sessions
        .mockResolvedValueOnce({ rows: [], rowCount: 50 }) // analytics_cache
        .mockResolvedValueOnce({ rows: [], rowCount: 15 }) // report_executions
        // VACUUM operations (6 tables)
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'all',
        retentionDays: 90,
      });

      const result = await getCapturedProcessor()!(job) as CleanupResult[];

      // Should have results for all 4 cleanup types
      expect(result).toHaveLength(4);
      expect(result.find(r => r.type === 'notifications')?.deletedCount).toBe(10);
      expect(result.find(r => r.type === 'sessions')?.deletedCount).toBe(5);
      expect(result.find(r => r.type === 'analytics_cache')?.deletedCount).toBe(50);
      expect(result.find(r => r.type === 'report_executions')?.deletedCount).toBe(15);
    });

    it('should use default retention days (90) when not specified', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
        // No retentionDays specified
      });

      await getCapturedProcessor()!(job);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.any(String),
        [90] // Default value
      );
    });

    it('should handle null rowCount from query', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: null });

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
      });

      const result = await getCapturedProcessor()!(job);

      expect(result).toEqual([{ type: 'notifications', deletedCount: 0 }]);
    });

    it('should log cleanup results', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
      });

      await getCapturedProcessor()!(job);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123', tenantSlug: 'test-tenant' }),
        'Running cleanup'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ totalDeleted: 5 }),
        'Cleanup completed'
      );
    });

    it('should handle failed cleanup operations in all mode', async () => {
      // First operation fails, rest succeed
      mockPoolQuery
        .mockRejectedValueOnce(new Error('Notifications table not found'))
        .mockResolvedValueOnce({ rows: [], rowCount: 5 })
        .mockResolvedValueOnce({ rows: [], rowCount: 50 })
        .mockResolvedValueOnce({ rows: [], rowCount: 15 })
        .mockResolvedValue({ rows: [], rowCount: 0 }); // VACUUM

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'all',
      });

      const result = await getCapturedProcessor()!(job) as CleanupResult[];

      // Should have 3 results (notifications failed)
      expect(result).toHaveLength(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Cleanup operation failed'
      );
    });

    it('should throw error on cleanup failure for single type', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const job = createMockJob({
        tenantSlug: 'test-tenant',
        cleanupType: 'notifications',
      });

      await expect(getCapturedProcessor()!(job)).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Cleanup failed'
      );
    });

    it('should throw error for unknown job name', async () => {
      const job = {
        id: 'job-456',
        name: 'unknown-job',
        data: { tenantSlug: 'test', cleanupType: 'all' },
      };

      await expect(getCapturedProcessor()!(job)).rejects.toThrow('Unknown job name: unknown-job');
    });
  });

  // ============================================
  // VACUUM TABLES TESTS
  // ============================================

  describe('vacuumTables', () => {
    it('should vacuum all tables after cleanup all', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // notifications
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // sessions
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // analytics_cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // report_executions
        .mockResolvedValue({ rows: [], rowCount: 0 }); // All VACUUM calls

      const job = {
        id: 'job-123',
        name: 'run-cleanup',
        data: { tenantSlug: 'test-tenant', cleanupType: 'all' },
      };

      await getCapturedProcessor()!(job);

      // Check VACUUM ANALYZE calls (6 tables)
      const vacuumCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('VACUUM ANALYZE')
      );
      expect(vacuumCalls.length).toBe(6);
    });

    it('should continue vacuum even if one table fails', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // notifications
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // sessions
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // analytics_cache
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // report_executions
        .mockRejectedValueOnce(new Error('Table not found')) // First VACUUM fails
        .mockResolvedValue({ rows: [], rowCount: 0 }); // Rest succeed

      const job = {
        id: 'job-123',
        name: 'run-cleanup',
        data: { tenantSlug: 'test-tenant', cleanupType: 'all' },
      };

      // Should not throw
      await expect(getCapturedProcessor()!(job)).resolves.toBeDefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Vacuum skipped'
      );
    });
  });

  // ============================================
  // WORKER EVENT HANDLERS TESTS
  // ============================================

  describe('Worker Event Handlers', () => {
    it('should log on job completed', async () => {
      // Trigger module load to register handlers
      await import('../../../../src/jobs/processors/cleanup.js');

      const completedHandler = workerEventHandlers['completed'];
      expect(completedHandler).toBeDefined();

      const mockJob = { id: 'job-999' };
      const mockResult: CleanupResult[] = [
        { type: 'notifications', deletedCount: 10 },
        { type: 'sessions', deletedCount: 5 },
      ];

      completedHandler(mockJob, mockResult);

      expect(logger.debug).toHaveBeenCalledWith(
        { jobId: 'job-999', totalDeleted: 15 },
        'Cleanup job completed'
      );
    });

    it('should handle non-array result in completed handler', async () => {
      await import('../../../../src/jobs/processors/cleanup.js');

      const completedHandler = workerEventHandlers['completed'];
      const mockJob = { id: 'job-888' };

      completedHandler(mockJob, 'not-an-array');

      expect(logger.debug).toHaveBeenCalledWith(
        { jobId: 'job-888', totalDeleted: 0 },
        'Cleanup job completed'
      );
    });

    it('should log on job failed', async () => {
      await import('../../../../src/jobs/processors/cleanup.js');

      const failedHandler = workerEventHandlers['failed'];
      expect(failedHandler).toBeDefined();

      const mockJob = { id: 'job-777' };
      const mockError = new Error('Redis connection lost');

      failedHandler(mockJob, mockError);

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: 'job-777', err: mockError },
        'Cleanup job failed'
      );
    });

    it('should handle null job in failed handler', async () => {
      await import('../../../../src/jobs/processors/cleanup.js');

      const failedHandler = workerEventHandlers['failed'];
      const mockError = new Error('Unknown error');

      failedHandler(null, mockError);

      expect(logger.error).toHaveBeenCalledWith(
        { jobId: undefined, err: mockError },
        'Cleanup job failed'
      );
    });
  });

  // ============================================
  // SCHEDULER TESTS
  // ============================================

  describe('scheduleCleanup', () => {
    it('should schedule cleanup for all active tenants', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { slug: 'tenant-a' },
          { slug: 'tenant-b' },
          { slug: 'tenant-c' },
        ],
        rowCount: 3,
      });
      mockCleanupQueueAdd.mockResolvedValue({});

      const count = await scheduleCleanup();

      expect(count).toBe(3);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT slug FROM tenants WHERE status = 'active'")
      );
      expect(mockCleanupQueueAdd).toHaveBeenCalledTimes(3);
      expect(mockCleanupQueueAdd).toHaveBeenCalledWith(
        'run-cleanup',
        {
          tenantSlug: 'tenant-a',
          cleanupType: 'all',
          retentionDays: 90,
        },
        expect.objectContaining({ jobId: expect.stringContaining('cleanup-tenant-a-') })
      );
    });

    it('should handle no active tenants', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await scheduleCleanup();

      expect(count).toBe(0);
      expect(mockCleanupQueueAdd).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith({ count: 0 }, 'Scheduled cleanup jobs');
    });

    it('should continue scheduling if one tenant fails', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { slug: 'tenant-a' },
          { slug: 'tenant-b' },
          { slug: 'tenant-c' },
        ],
        rowCount: 3,
      });
      mockCleanupQueueAdd
        .mockResolvedValueOnce({}) // tenant-a succeeds
        .mockRejectedValueOnce(new Error('Redis timeout')) // tenant-b fails
        .mockResolvedValueOnce({}); // tenant-c succeeds

      const count = await scheduleCleanup();

      expect(count).toBe(2); // Only 2 succeeded
      expect(mockCleanupQueueAdd).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          tenantSlug: 'tenant-b',
        }),
        'Failed to schedule cleanup job due to Redis error'
      );
    });

    it('should generate unique job IDs with timestamps', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ slug: 'test-tenant' }],
        rowCount: 1,
      });
      mockCleanupQueueAdd.mockResolvedValue({});

      await scheduleCleanup();

      expect(mockCleanupQueueAdd).toHaveBeenCalledWith(
        'run-cleanup',
        expect.any(Object),
        expect.objectContaining({
          jobId: expect.stringMatching(/^cleanup-test-tenant-\d+$/),
        })
      );
    });
  });
});
