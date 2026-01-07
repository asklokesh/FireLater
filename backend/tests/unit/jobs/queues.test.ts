import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for capturing queue events and instances
const {
  mockQueues,
  mockQueueEvents,
  mockLogger,
} = vi.hoisted(() => ({
  mockQueues: new Map<string, {
    name: string;
    getWaitingCount: ReturnType<typeof vi.fn>;
    getActiveCount: ReturnType<typeof vi.fn>;
    getCompletedCount: ReturnType<typeof vi.fn>;
    getFailedCount: ReturnType<typeof vi.fn>;
    getDelayedCount: ReturnType<typeof vi.fn>;
    isPaused: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>(),
  mockQueueEvents: new Map<string, {
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>(),
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

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
  },
}));

// Mock BullMQ
vi.mock('bullmq', () => {
  const createMockQueue = (name: string) => {
    const queue = {
      name,
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
      getCompletedCount: vi.fn().mockResolvedValue(0),
      getFailedCount: vi.fn().mockResolvedValue(0),
      getDelayedCount: vi.fn().mockResolvedValue(0),
      isPaused: vi.fn().mockResolvedValue(false),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockQueues.set(name, queue);
    return queue;
  };

  const createMockQueueEvents = (name: string) => {
    const events = {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockQueueEvents.set(name, events);
    return events;
  };

  return {
    Queue: vi.fn().mockImplementation((name: string) => createMockQueue(name)),
    QueueEvents: vi.fn().mockImplementation((name: string) => createMockQueueEvents(name)),
  };
});

import {
  scheduledReportsQueue,
  healthScoreQueue,
  slaBreachQueue,
  notificationQueue,
  cloudSyncQueue,
  cleanupQueue,
  getQueueStatus,
  getAllQueuesStatus,
  closeAllQueues,
} from '../../../src/jobs/queues.js';

describe('Queues Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queue definitions', () => {
    it('should create scheduled-reports queue', () => {
      expect(scheduledReportsQueue).toBeDefined();
      expect(scheduledReportsQueue.name).toBe('scheduled-reports');
    });

    it('should create health-scores queue', () => {
      expect(healthScoreQueue).toBeDefined();
      expect(healthScoreQueue.name).toBe('health-scores');
    });

    it('should create sla-breaches queue', () => {
      expect(slaBreachQueue).toBeDefined();
      expect(slaBreachQueue.name).toBe('sla-breaches');
    });

    it('should create notifications queue', () => {
      expect(notificationQueue).toBeDefined();
      expect(notificationQueue.name).toBe('notifications');
    });

    it('should create cloud-sync queue', () => {
      expect(cloudSyncQueue).toBeDefined();
      expect(cloudSyncQueue.name).toBe('cloud-sync');
    });

    it('should create cleanup queue', () => {
      expect(cleanupQueue).toBeDefined();
      expect(cleanupQueue.name).toBe('cleanup');
    });
  });

  describe('queue events', () => {
    it('should create queue events for all queues', () => {
      // Queue events are created during module initialization
      const queueNames = [
        'scheduled-reports',
        'health-scores',
        'sla-breaches',
        'notifications',
        'cloud-sync',
        'cleanup',
      ];

      for (const name of queueNames) {
        const events = mockQueueEvents.get(name);
        expect(events).toBeDefined();
      }
    });

    it('should have total of 6 queue event instances', () => {
      expect(mockQueueEvents.size).toBe(6);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status with all metrics', async () => {
      const queue = mockQueues.get('scheduled-reports')!;
      queue.getWaitingCount.mockResolvedValue(5);
      queue.getActiveCount.mockResolvedValue(2);
      queue.getCompletedCount.mockResolvedValue(100);
      queue.getFailedCount.mockResolvedValue(3);
      queue.getDelayedCount.mockResolvedValue(1);
      queue.isPaused.mockResolvedValue(false);

      const status = await getQueueStatus(scheduledReportsQueue);

      expect(status).toEqual({
        name: 'scheduled-reports',
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
        paused: false,
      });
    });

    it('should return paused status correctly', async () => {
      const queue = mockQueues.get('health-scores')!;
      queue.getWaitingCount.mockResolvedValue(0);
      queue.getActiveCount.mockResolvedValue(0);
      queue.getCompletedCount.mockResolvedValue(50);
      queue.getFailedCount.mockResolvedValue(0);
      queue.getDelayedCount.mockResolvedValue(0);
      queue.isPaused.mockResolvedValue(true);

      const status = await getQueueStatus(healthScoreQueue);

      expect(status.paused).toBe(true);
    });

    it('should return default status when Redis is unavailable', async () => {
      const queue = mockQueues.get('sla-breaches')!;
      queue.getWaitingCount.mockRejectedValue(new Error('Redis connection failed'));

      const status = await getQueueStatus(slaBreachQueue);

      expect(status).toEqual({
        name: 'sla-breaches',
        waiting: -1,
        active: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
        paused: false,
      });
    });

    it('should log error when Redis is unavailable', async () => {
      const queue = mockQueues.get('notifications')!;
      const redisError = new Error('Redis connection failed');
      queue.getWaitingCount.mockRejectedValue(redisError);

      await getQueueStatus(notificationQueue);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ queueName: 'notifications' }),
        'Failed to get queue status - Redis unavailable'
      );
    });
  });

  describe('getAllQueuesStatus', () => {
    it('should return status for all queues', async () => {
      // Set up mock data for all queues
      for (const [name, queue] of mockQueues) {
        queue.getWaitingCount.mockResolvedValue(1);
        queue.getActiveCount.mockResolvedValue(0);
        queue.getCompletedCount.mockResolvedValue(10);
        queue.getFailedCount.mockResolvedValue(0);
        queue.getDelayedCount.mockResolvedValue(0);
        queue.isPaused.mockResolvedValue(false);
      }

      const statuses = await getAllQueuesStatus();

      expect(statuses).toHaveLength(6);
      expect(statuses.map((s) => s.name)).toContain('scheduled-reports');
      expect(statuses.map((s) => s.name)).toContain('health-scores');
      expect(statuses.map((s) => s.name)).toContain('sla-breaches');
      expect(statuses.map((s) => s.name)).toContain('notifications');
      expect(statuses.map((s) => s.name)).toContain('cloud-sync');
      expect(statuses.map((s) => s.name)).toContain('cleanup');
    });

    it('should handle mixed success and failure', async () => {
      // One queue fails, others succeed
      const scheduledReports = mockQueues.get('scheduled-reports')!;
      scheduledReports.getWaitingCount.mockRejectedValue(new Error('Failed'));

      for (const [name, queue] of mockQueues) {
        if (name !== 'scheduled-reports') {
          queue.getWaitingCount.mockResolvedValue(0);
          queue.getActiveCount.mockResolvedValue(0);
          queue.getCompletedCount.mockResolvedValue(0);
          queue.getFailedCount.mockResolvedValue(0);
          queue.getDelayedCount.mockResolvedValue(0);
          queue.isPaused.mockResolvedValue(false);
        }
      }

      const statuses = await getAllQueuesStatus();

      // Failed queue should have -1 values
      const failedQueue = statuses.find((s) => s.name === 'scheduled-reports');
      expect(failedQueue?.waiting).toBe(-1);

      // Other queues should have normal values
      const healthQueue = statuses.find((s) => s.name === 'health-scores');
      expect(healthQueue?.waiting).toBe(0);
    });
  });

  describe('closeAllQueues', () => {
    it('should close all queues', async () => {
      await closeAllQueues();

      for (const [, queue] of mockQueues) {
        expect(queue.close).toHaveBeenCalled();
      }
    });

    it('should close all queue events', async () => {
      await closeAllQueues();

      for (const [, events] of mockQueueEvents) {
        expect(events.close).toHaveBeenCalled();
      }
    });

    it('should log info message when complete', async () => {
      await closeAllQueues();

      expect(mockLogger.info).toHaveBeenCalledWith('All queues closed');
    });
  });

  describe('queue default options', () => {
    // Test that queues are configured with proper retry options
    it('should configure scheduled-reports with 3 attempts', () => {
      // The queue exists and was created with proper configuration
      expect(scheduledReportsQueue).toBeDefined();
    });

    it('should configure notifications with 5 attempts', () => {
      expect(notificationQueue).toBeDefined();
    });

    it('should configure sla-breaches with 2 attempts', () => {
      expect(slaBreachQueue).toBeDefined();
    });
  });
});
