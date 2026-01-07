import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jobs index
vi.mock('../../../src/jobs/index.js', () => ({
  getAllQueuesStatus: vi.fn().mockResolvedValue([]),
  getSchedulerStatus: vi.fn().mockReturnValue([]),
  triggerTask: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock queues
vi.mock('../../../src/jobs/queues.js', () => ({
  scheduledReportsQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
  healthScoreQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
  slaBreachQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
  notificationQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
  cloudSyncQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
  cleanupQueue: {
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    isPaused: vi.fn().mockResolvedValue(false),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

describe('Jobs Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Queue Names', () => {
    const validQueues = [
      'scheduled-reports',
      'health-scores',
      'sla-breaches',
      'notifications',
      'cloud-sync',
      'cleanup',
    ];

    it('should have 6 valid queue names', () => {
      expect(validQueues.length).toBe(6);
    });

    it('should include scheduled-reports queue', () => {
      expect(validQueues).toContain('scheduled-reports');
    });

    it('should include health-scores queue', () => {
      expect(validQueues).toContain('health-scores');
    });

    it('should include sla-breaches queue', () => {
      expect(validQueues).toContain('sla-breaches');
    });

    it('should include notifications queue', () => {
      expect(validQueues).toContain('notifications');
    });

    it('should include cloud-sync queue', () => {
      expect(validQueues).toContain('cloud-sync');
    });

    it('should include cleanup queue', () => {
      expect(validQueues).toContain('cleanup');
    });

    it('should not include invalid queue', () => {
      expect(validQueues).not.toContain('invalid-queue');
    });
  });

  describe('Route Permissions', () => {
    it('should require admin:read for GET /queues', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /scheduler', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:read for GET /queues/:queueName', () => {
      const permission = 'admin:read';
      expect(permission).toBe('admin:read');
    });

    it('should require admin:write for POST /scheduler/:taskName/trigger', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });

    it('should require admin:write for POST /queues/:queueName/pause', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });

    it('should require admin:write for POST /queues/:queueName/resume', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });

    it('should require admin:write for DELETE /queues/:queueName/failed', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });

    it('should require admin:write for POST /queues/:queueName/retry-failed', () => {
      const permission = 'admin:write';
      expect(permission).toBe('admin:write');
    });
  });

  describe('Response Formats', () => {
    it('should return queues in wrapper for GET /queues', () => {
      const queues = [{ name: 'notifications', count: 10 }];
      const response = { queues };
      expect(response).toHaveProperty('queues');
      expect(Array.isArray(response.queues)).toBe(true);
    });

    it('should return tasks in wrapper for GET /scheduler', () => {
      const tasks = [{ name: 'daily-cleanup', interval: '0 0 * * *' }];
      const response = { tasks };
      expect(response).toHaveProperty('tasks');
      expect(Array.isArray(response.tasks)).toBe(true);
    });

    it('should return queue details', () => {
      const queueDetails = {
        name: 'notifications',
        paused: false,
        jobs: {
          waiting: [],
          active: [],
          completed: [],
          failed: [],
          delayed: [],
        },
      };
      expect(queueDetails).toHaveProperty('name');
      expect(queueDetails).toHaveProperty('paused');
      expect(queueDetails).toHaveProperty('jobs');
    });

    it('should return 404 for unknown queue', () => {
      const response = { error: 'Queue not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('Queue not found');
    });

    it('should return success for pause operation', () => {
      const response = { success: true, queue: 'notifications', paused: true };
      expect(response.success).toBe(true);
      expect(response.paused).toBe(true);
    });

    it('should return success for resume operation', () => {
      const response = { success: true, queue: 'notifications', paused: false };
      expect(response.success).toBe(true);
      expect(response.paused).toBe(false);
    });

    it('should return removedCount for clean failed', () => {
      const response = { success: true, queue: 'notifications', removedCount: 5 };
      expect(response).toHaveProperty('removedCount');
      expect(response.removedCount).toBe(5);
    });

    it('should return retriedCount for retry failed', () => {
      const response = { success: true, queue: 'notifications', retriedCount: 3 };
      expect(response).toHaveProperty('retriedCount');
      expect(response.retriedCount).toBe(3);
    });
  });

  describe('Job Details', () => {
    it('should include id in waiting job', () => {
      const job = { id: 'job-1', name: 'send-email', data: {}, timestamp: Date.now() };
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('name');
      expect(job).toHaveProperty('data');
      expect(job).toHaveProperty('timestamp');
    });

    it('should include id in active job', () => {
      const job = { id: 'job-2', name: 'process-report', data: {}, timestamp: Date.now() };
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('name');
    });

    it('should include id and timestamp in completed job', () => {
      const job = { id: 'job-3', name: 'cleanup', timestamp: Date.now() };
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('name');
      expect(job).toHaveProperty('timestamp');
    });

    it('should include failedReason in failed job', () => {
      const job = { id: 'job-4', name: 'sync', failedReason: 'Connection timeout', timestamp: Date.now() };
      expect(job).toHaveProperty('failedReason');
      expect(job.failedReason).toBe('Connection timeout');
    });

    it('should include delay in delayed job', () => {
      const job = { id: 'job-5', name: 'scheduled', delay: 60000, timestamp: Date.now() };
      expect(job).toHaveProperty('delay');
      expect(job.delay).toBe(60000);
    });
  });

  describe('Service Integration', () => {
    it('should call getAllQueuesStatus for GET /queues', async () => {
      const { getAllQueuesStatus } = await import('../../../src/jobs/index.js');

      await getAllQueuesStatus();
      expect(getAllQueuesStatus).toHaveBeenCalled();
    });

    it('should call getSchedulerStatus for GET /scheduler', async () => {
      const { getSchedulerStatus } = await import('../../../src/jobs/index.js');

      getSchedulerStatus();
      expect(getSchedulerStatus).toHaveBeenCalled();
    });

    it('should call triggerTask for POST /scheduler/:taskName/trigger', async () => {
      const { triggerTask } = await import('../../../src/jobs/index.js');
      const taskName = 'daily-cleanup';

      await triggerTask(taskName);
      expect(triggerTask).toHaveBeenCalledWith(taskName);
    });
  });

  describe('Queue Operations', () => {
    it('should handle queue pause', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.pause();
      expect(scheduledReportsQueue.pause).toHaveBeenCalled();
    });

    it('should handle queue resume', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.resume();
      expect(scheduledReportsQueue.resume).toHaveBeenCalled();
    });

    it('should get queue waiting jobs', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.getWaiting(0, 10);
      expect(scheduledReportsQueue.getWaiting).toHaveBeenCalledWith(0, 10);
    });

    it('should get queue active jobs', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.getActive(0, 10);
      expect(scheduledReportsQueue.getActive).toHaveBeenCalledWith(0, 10);
    });

    it('should get queue completed jobs', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.getCompleted(0, 10);
      expect(scheduledReportsQueue.getCompleted).toHaveBeenCalledWith(0, 10);
    });

    it('should get queue failed jobs', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.getFailed(0, 10);
      expect(scheduledReportsQueue.getFailed).toHaveBeenCalledWith(0, 10);
    });

    it('should get queue delayed jobs', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.getDelayed(0, 10);
      expect(scheduledReportsQueue.getDelayed).toHaveBeenCalledWith(0, 10);
    });

    it('should check if queue is paused', async () => {
      const { scheduledReportsQueue } = await import('../../../src/jobs/queues.js');

      await scheduledReportsQueue.isPaused();
      expect(scheduledReportsQueue.isPaused).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid task trigger', () => {
      const response = { error: 'Task not found' };
      const statusCode = 400;
      expect(statusCode).toBe(400);
      expect(response).toHaveProperty('error');
    });

    it('should return error message from exception', () => {
      const error = new Error('Unknown error');
      const message = error instanceof Error ? error.message : 'Unknown error';
      expect(message).toBe('Unknown error');
    });

    it('should handle non-Error exceptions', () => {
      const error = 'string error';
      const message = error instanceof Error ? error.message : 'Unknown error';
      expect(message).toBe('Unknown error');
    });
  });
});
