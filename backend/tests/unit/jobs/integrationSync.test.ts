import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store captured handlers for testing using hoisted variables
const {
  capturedProcessor,
  capturedFailedHandler,
  capturedErrorHandler,
  mockSyncIntegration,
  mockHandleSyncFailure,
  mockLogger
} = vi.hoisted(() => ({
  capturedProcessor: { fn: null as ((job: Record<string, unknown>) => Promise<void>) | null },
  capturedFailedHandler: { fn: null as ((job: Record<string, unknown> | undefined, error: Error) => void) | null },
  capturedErrorHandler: { fn: null as ((error: Error) => void) | null },
  mockSyncIntegration: vi.fn(),
  mockHandleSyncFailure: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock integrationsService
vi.mock('../../../src/services/integrations.js', () => ({
  integrationsService: {
    syncIntegration: (...args: unknown[]) => mockSyncIntegration(...args),
    handleSyncFailure: (...args: unknown[]) => mockHandleSyncFailure(...args),
  },
}));

// Mock Redis connection
vi.mock('../../../src/config/redis.js', () => ({
  redisConnection: {
    host: 'localhost',
    port: 6379,
  },
}));

// Mock BullMQ
vi.mock('bullmq', () => {
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn(),
  }));

  const MockWorker = vi.fn().mockImplementation((_name: string, processor: (job: Record<string, unknown>) => Promise<void>) => {
    capturedProcessor.fn = processor;
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'failed') {
          capturedFailedHandler.fn = handler as typeof capturedFailedHandler.fn;
        } else if (event === 'error') {
          capturedErrorHandler.fn = handler as typeof capturedErrorHandler.fn;
        }
      }),
      close: vi.fn(),
    };
  });

  return {
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

import { integrationsService } from '../../../src/services/integrations.js';
import '../../../src/jobs/integrationSync.js';

describe('Integration Sync Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('worker processor', () => {
    it('should process job with valid data', async () => {
      mockSyncIntegration.mockResolvedValue(undefined);

      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-123',
          tenantSlug: 'test-tenant',
        },
      };

      await capturedProcessor.fn!(mockJob);

      expect(mockSyncIntegration).toHaveBeenCalledWith('test-tenant', 'int-123');
    });

    it('should log info when starting sync', async () => {
      mockSyncIntegration.mockResolvedValue(undefined);

      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-456',
          tenantSlug: 'another-tenant',
        },
      };

      await capturedProcessor.fn!(mockJob);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting integration sync for int-456 in tenant another-tenant'
      );
    });

    it('should log info when sync completes', async () => {
      mockSyncIntegration.mockResolvedValue(undefined);

      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-789',
          tenantSlug: 'my-tenant',
        },
      };

      await capturedProcessor.fn!(mockJob);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Completed integration sync for int-789 in tenant my-tenant'
      );
    });

    it('should throw error when integrationId is missing', async () => {
      const mockJob = {
        id: 'job-1',
        data: {
          tenantSlug: 'test-tenant',
        },
      };

      await expect(capturedProcessor.fn!(mockJob)).rejects.toThrow(
        'Missing required job data: integrationId or tenantSlug'
      );
    });

    it('should throw error when tenantSlug is missing', async () => {
      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-123',
        },
      };

      await expect(capturedProcessor.fn!(mockJob)).rejects.toThrow(
        'Missing required job data: integrationId or tenantSlug'
      );
    });

    it('should log error and rethrow when sync fails', async () => {
      const syncError = new Error('Sync failed');
      mockSyncIntegration.mockRejectedValue(syncError);

      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-fail',
          tenantSlug: 'failing-tenant',
        },
      };

      await expect(capturedProcessor.fn!(mockJob)).rejects.toThrow('Sync failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'int-fail',
          tenantSlug: 'failing-tenant',
          error: 'Sync failed',
        }),
        'Integration sync failed for int-fail in tenant failing-tenant'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockSyncIntegration.mockRejectedValue('String error');

      const mockJob = {
        id: 'job-1',
        data: {
          integrationId: 'int-str',
          tenantSlug: 'str-tenant',
        },
      };

      await expect(capturedProcessor.fn!(mockJob)).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'String error',
          stack: undefined,
        }),
        expect.any(String)
      );
    });
  });

  describe('failed event handler', () => {
    it('should log error when job fails after all retries', () => {
      // handleSyncFailure must return a Promise to avoid .catch() errors
      mockHandleSyncFailure.mockResolvedValue(undefined);

      const mockJob = {
        id: 'job-failed',
        data: {
          integrationId: 'int-retry-fail',
          tenantSlug: 'retry-tenant',
        },
      };

      const error = new Error('All retries exhausted');

      capturedFailedHandler.fn!(mockJob, error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-failed',
          integrationId: 'int-retry-fail',
          tenantSlug: 'retry-tenant',
          error: 'All retries exhausted',
        }),
        'Job job-failed failed after all retries'
      );
    });

    it('should call handleSyncFailure on persistent failure', () => {
      mockHandleSyncFailure.mockResolvedValue(undefined);

      const mockJob = {
        id: 'job-notify',
        data: {
          integrationId: 'int-notify',
          tenantSlug: 'notify-tenant',
        },
      };

      const error = new Error('Persistent failure');

      capturedFailedHandler.fn!(mockJob, error);

      expect(mockHandleSyncFailure).toHaveBeenCalledWith(
        'notify-tenant',
        'int-notify',
        error
      );
    });

    it('should log error if handleSyncFailure fails', async () => {
      const notifyError = new Error('Notification failed');
      mockHandleSyncFailure.mockRejectedValue(notifyError);

      const mockJob = {
        id: 'job-notify-fail',
        data: {
          integrationId: 'int-notify-fail',
          tenantSlug: 'notify-fail-tenant',
        },
      };

      capturedFailedHandler.fn!(mockJob, new Error('Job failed'));

      // Wait for the async catch to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Notification failed',
        }),
        'Failed to handle sync failure notification'
      );
    });

    it('should handle undefined job gracefully', () => {
      const error = new Error('Job error');

      // Should not throw when job is undefined
      expect(() => capturedFailedHandler.fn!(undefined, error)).not.toThrow();
    });
  });

  describe('error event handler', () => {
    it('should log worker errors', () => {
      const workerError = new Error('Worker crashed');

      capturedErrorHandler.fn!(workerError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Worker crashed',
        }),
        'Integration sync worker error'
      );
    });
  });
});
