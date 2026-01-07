import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock processors
vi.mock('../../../src/jobs/processors/scheduledReports.js', () => ({
  scheduledReportsWorker: {
    name: 'scheduled-reports',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/jobs/processors/healthScores.js', () => ({
  healthScoreWorker: {
    name: 'health-scores',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/jobs/processors/slaBreaches.js', () => ({
  slaBreachWorker: {
    name: 'sla-breaches',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/jobs/processors/notifications.js', () => ({
  notificationWorker: {
    name: 'notifications',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
  queueNotification: vi.fn().mockResolvedValue('job-1'),
}));

vi.mock('../../../src/jobs/processors/cloudSync.js', () => ({
  cloudSyncWorker: {
    name: 'cloud-sync',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/jobs/processors/cleanup.js', () => ({
  cleanupWorker: {
    name: 'cleanup',
    isRunning: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock queues
vi.mock('../../../src/jobs/queues.js', () => ({
  scheduledReportsQueue: {},
  healthScoreQueue: {},
  slaBreachQueue: {},
  notificationQueue: {},
  cloudSyncQueue: {},
  cleanupQueue: {},
  getAllQueuesStatus: vi.fn().mockResolvedValue([]),
  closeAllQueues: vi.fn().mockResolvedValue(undefined),
}));

// Mock scheduler
vi.mock('../../../src/jobs/scheduler.js', () => ({
  startScheduler: vi.fn(),
  stopScheduler: vi.fn(),
  getSchedulerStatus: vi.fn().mockReturnValue([]),
  triggerTask: vi.fn().mockResolvedValue({ success: true }),
  triggerAllTasks: vi.fn().mockResolvedValue([]),
}));

describe('Jobs Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeJobs', () => {
    it('should initialize jobs and start scheduler', async () => {
      const { initializeJobs } = await import('../../../src/jobs/index.js');
      const { startScheduler } = await import('../../../src/jobs/scheduler.js');
      const { logger } = await import('../../../src/utils/logger.js');

      await initializeJobs();

      expect(startScheduler).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Initializing background jobs');
      expect(logger.info).toHaveBeenCalledWith('Background jobs initialized');
    });

    it('should log worker statuses', async () => {
      const { initializeJobs } = await import('../../../src/jobs/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      await initializeJobs();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ worker: expect.any(String), running: expect.any(Boolean) }),
        'Worker status'
      );
    });
  });

  describe('shutdownJobs', () => {
    it('should stop scheduler', async () => {
      const { shutdownJobs } = await import('../../../src/jobs/index.js');
      const { stopScheduler } = await import('../../../src/jobs/scheduler.js');

      await shutdownJobs();

      expect(stopScheduler).toHaveBeenCalled();
    });

    it('should close all queues', async () => {
      const { shutdownJobs } = await import('../../../src/jobs/index.js');
      const { closeAllQueues } = await import('../../../src/jobs/queues.js');

      await shutdownJobs();

      expect(closeAllQueues).toHaveBeenCalled();
    });

    it('should log shutdown messages', async () => {
      const { shutdownJobs } = await import('../../../src/jobs/index.js');
      const { logger } = await import('../../../src/utils/logger.js');

      await shutdownJobs();

      expect(logger.info).toHaveBeenCalledWith('Shutting down background jobs');
      expect(logger.info).toHaveBeenCalledWith('Background jobs shutdown complete');
    });

    it('should close all workers', async () => {
      const { shutdownJobs } = await import('../../../src/jobs/index.js');
      const { scheduledReportsWorker } = await import('../../../src/jobs/processors/scheduledReports.js');
      const { healthScoreWorker } = await import('../../../src/jobs/processors/healthScores.js');

      await shutdownJobs();

      expect(scheduledReportsWorker.close).toHaveBeenCalled();
      expect(healthScoreWorker.close).toHaveBeenCalled();
    });
  });

  describe('Queue Exports', () => {
    it('should export scheduledReportsQueue', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/index.js');
      expect(scheduledReportsQueue).toBeDefined();
    });

    it('should export healthScoreQueue', async () => {
      const { healthScoreQueue } = await import('../../../src/jobs/index.js');
      expect(healthScoreQueue).toBeDefined();
    });

    it('should export slaBreachQueue', async () => {
      const { slaBreachQueue } = await import('../../../src/jobs/index.js');
      expect(slaBreachQueue).toBeDefined();
    });

    it('should export notificationQueue', async () => {
      const { notificationQueue } = await import('../../../src/jobs/index.js');
      expect(notificationQueue).toBeDefined();
    });

    it('should export cloudSyncQueue', async () => {
      const { cloudSyncQueue } = await import('../../../src/jobs/index.js');
      expect(cloudSyncQueue).toBeDefined();
    });

    it('should export cleanupQueue', async () => {
      const { cleanupQueue } = await import('../../../src/jobs/index.js');
      expect(cleanupQueue).toBeDefined();
    });

    it('should export getAllQueuesStatus', async () => {
      const { getAllQueuesStatus } = await import('../../../src/jobs/index.js');
      expect(getAllQueuesStatus).toBeDefined();
      expect(typeof getAllQueuesStatus).toBe('function');
    });

    it('should export closeAllQueues', async () => {
      const { closeAllQueues } = await import('../../../src/jobs/index.js');
      expect(closeAllQueues).toBeDefined();
      expect(typeof closeAllQueues).toBe('function');
    });
  });

  describe('Worker Exports', () => {
    it('should export scheduledReportsWorker', async () => {
      const { scheduledReportsWorker } = await import('../../../src/jobs/index.js');
      expect(scheduledReportsWorker).toBeDefined();
    });

    it('should export healthScoreWorker', async () => {
      const { healthScoreWorker } = await import('../../../src/jobs/index.js');
      expect(healthScoreWorker).toBeDefined();
    });

    it('should export slaBreachWorker', async () => {
      const { slaBreachWorker } = await import('../../../src/jobs/index.js');
      expect(slaBreachWorker).toBeDefined();
    });

    it('should export notificationWorker', async () => {
      const { notificationWorker } = await import('../../../src/jobs/index.js');
      expect(notificationWorker).toBeDefined();
    });

    it('should export cloudSyncWorker', async () => {
      const { cloudSyncWorker } = await import('../../../src/jobs/index.js');
      expect(cloudSyncWorker).toBeDefined();
    });

    it('should export cleanupWorker', async () => {
      const { cleanupWorker } = await import('../../../src/jobs/index.js');
      expect(cleanupWorker).toBeDefined();
    });

    it('should export queueNotification', async () => {
      const { queueNotification } = await import('../../../src/jobs/index.js');
      expect(queueNotification).toBeDefined();
      expect(typeof queueNotification).toBe('function');
    });
  });

  describe('Scheduler Exports', () => {
    it('should export startScheduler', async () => {
      const { startScheduler } = await import('../../../src/jobs/index.js');
      expect(startScheduler).toBeDefined();
      expect(typeof startScheduler).toBe('function');
    });

    it('should export stopScheduler', async () => {
      const { stopScheduler } = await import('../../../src/jobs/index.js');
      expect(stopScheduler).toBeDefined();
      expect(typeof stopScheduler).toBe('function');
    });

    it('should export getSchedulerStatus', async () => {
      const { getSchedulerStatus } = await import('../../../src/jobs/index.js');
      expect(getSchedulerStatus).toBeDefined();
      expect(typeof getSchedulerStatus).toBe('function');
    });

    it('should export triggerTask', async () => {
      const { triggerTask } = await import('../../../src/jobs/index.js');
      expect(triggerTask).toBeDefined();
      expect(typeof triggerTask).toBe('function');
    });

    it('should export triggerAllTasks', async () => {
      const { triggerAllTasks } = await import('../../../src/jobs/index.js');
      expect(triggerAllTasks).toBeDefined();
      expect(typeof triggerAllTasks).toBe('function');
    });
  });
});
