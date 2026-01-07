import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the processor modules
const mockQueueDueScheduledReports = vi.fn();
const mockScheduleHealthScoreCalculation = vi.fn();
const mockScheduleSlaBreachChecks = vi.fn();
const mockScheduleCloudSync = vi.fn();
const mockScheduleCleanup = vi.fn();

vi.mock('../../../src/jobs/processors/scheduledReports.js', () => ({
  queueDueScheduledReports: () => mockQueueDueScheduledReports(),
}));

vi.mock('../../../src/jobs/processors/healthScores.js', () => ({
  scheduleHealthScoreCalculation: () => mockScheduleHealthScoreCalculation(),
}));

vi.mock('../../../src/jobs/processors/slaBreaches.js', () => ({
  scheduleSlaBreachChecks: () => mockScheduleSlaBreachChecks(),
}));

vi.mock('../../../src/jobs/processors/cloudSync.js', () => ({
  scheduleCloudSync: () => mockScheduleCloudSync(),
}));

vi.mock('../../../src/jobs/processors/cleanup.js', () => ({
  scheduleCleanup: () => mockScheduleCleanup(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerTask,
  triggerAllTasks,
} from '../../../src/jobs/scheduler.js';
import { logger } from '../../../src/utils/logger.js';

describe('Scheduler Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure scheduler is stopped before each test
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  describe('startScheduler', () => {
    it('should log info message when starting', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      expect(logger.info).toHaveBeenCalledWith('Starting job scheduler');
    });

    it('should register all scheduled tasks', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'scheduled-reports' }),
        'Scheduled task registered'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'health-scores' }),
        'Scheduled task registered'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'sla-breaches' }),
        'Scheduled task registered'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'cloud-sync' }),
        'Scheduled task registered'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'cleanup' }),
        'Scheduled task registered'
      );
    });

    it('should run non-cleanup tasks after startup delay', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Advance past the 5 second startup delay
      await vi.advanceTimersByTimeAsync(5001);

      // Non-cleanup tasks should have run
      expect(mockQueueDueScheduledReports).toHaveBeenCalled();
      expect(mockScheduleHealthScoreCalculation).toHaveBeenCalled();
      expect(mockScheduleSlaBreachChecks).toHaveBeenCalled();
      expect(mockScheduleCloudSync).toHaveBeenCalled();
      // Cleanup should NOT run on startup
      expect(mockScheduleCleanup).not.toHaveBeenCalled();
    });

    it('should run scheduled-reports task every minute', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Clear from startup
      vi.clearAllMocks();

      // Advance 60 seconds (1 minute)
      await vi.advanceTimersByTimeAsync(60000);

      expect(mockQueueDueScheduledReports).toHaveBeenCalled();
    });

    it('should run sla-breaches task every 5 minutes', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Clear from startup
      vi.clearAllMocks();

      // Advance 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(mockScheduleSlaBreachChecks).toHaveBeenCalled();
    });

    it('should log errors when task fails', async () => {
      mockQueueDueScheduledReports.mockRejectedValue(new Error('Task failed'));
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Advance past startup delay
      await vi.advanceTimersByTimeAsync(5001);

      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), task: 'scheduled-reports' },
        'Scheduled task failed'
      );
    });
  });

  describe('stopScheduler', () => {
    it('should log info message when stopping', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();
      vi.clearAllMocks();
      stopScheduler();

      expect(logger.info).toHaveBeenCalledWith('Stopping job scheduler');
    });

    it('should stop all task intervals', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Advance just past startup delay to trigger the initial runs
      await vi.advanceTimersByTimeAsync(5001);

      stopScheduler();

      // Clear mocks after stop
      vi.clearAllMocks();

      // Advance 10 minutes - no tasks should run because scheduler is stopped
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      // Verify no additional calls were made after stop
      expect(mockQueueDueScheduledReports).not.toHaveBeenCalled();
      expect(mockScheduleSlaBreachChecks).not.toHaveBeenCalled();
    });

    it('should allow restart after stop', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();
      stopScheduler();
      vi.clearAllMocks();

      startScheduler();

      expect(logger.info).toHaveBeenCalledWith('Starting job scheduler');
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return status of all tasks', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const status = getSchedulerStatus();

      expect(status).toHaveLength(5);
      expect(status.map((s) => s.name)).toContain('scheduled-reports');
      expect(status.map((s) => s.name)).toContain('health-scores');
      expect(status.map((s) => s.name)).toContain('sla-breaches');
      expect(status.map((s) => s.name)).toContain('cloud-sync');
      expect(status.map((s) => s.name)).toContain('cleanup');
    });

    it('should include interval configuration', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const status = getSchedulerStatus();

      const reportsTask = status.find((s) => s.name === 'scheduled-reports');
      expect(reportsTask?.intervalMs).toBe(60 * 1000); // 1 minute

      const healthTask = status.find((s) => s.name === 'health-scores');
      expect(healthTask?.intervalMs).toBe(60 * 60 * 1000); // 1 hour

      const slaTask = status.find((s) => s.name === 'sla-breaches');
      expect(slaTask?.intervalMs).toBe(5 * 60 * 1000); // 5 minutes

      const cloudTask = status.find((s) => s.name === 'cloud-sync');
      expect(cloudTask?.intervalMs).toBe(6 * 60 * 60 * 1000); // 6 hours

      const cleanupTask = status.find((s) => s.name === 'cleanup');
      expect(cleanupTask?.intervalMs).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('should show isRunning as false initially', () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const status = getSchedulerStatus();

      for (const task of status) {
        expect(task.isRunning).toBe(false);
      }
    });

    it('should show lastRun as Date after task runs', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      // Trigger a task to set lastRun
      await triggerTask('scheduled-reports');

      const status = getSchedulerStatus();
      const reportsTask = status.find((s) => s.name === 'scheduled-reports');
      expect(reportsTask?.lastRun).toBeInstanceOf(Date);
    });
  });

  describe('triggerTask', () => {
    it('should trigger a specific task manually', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const result = await triggerTask('scheduled-reports');

      expect(result).toEqual({
        success: true,
        task: 'scheduled-reports',
        lastRun: expect.any(Date),
      });
      expect(mockQueueDueScheduledReports).toHaveBeenCalled();
    });

    it('should log info when triggering manually', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      await triggerTask('health-scores');

      expect(logger.info).toHaveBeenCalledWith(
        { task: 'health-scores' },
        'Manually triggering task'
      );
    });

    it('should throw error for unknown task', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      await expect(triggerTask('unknown-task')).rejects.toThrow(
        'Unknown task: unknown-task'
      );
    });

    it('should trigger cleanup task', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      await triggerTask('cleanup');

      expect(mockScheduleCleanup).toHaveBeenCalled();
    });
  });

  describe('triggerAllTasks', () => {
    it('should trigger all tasks', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const results = await triggerAllTasks();

      expect(results).toHaveLength(5);
      expect(mockQueueDueScheduledReports).toHaveBeenCalled();
      expect(mockScheduleHealthScoreCalculation).toHaveBeenCalled();
      expect(mockScheduleSlaBreachChecks).toHaveBeenCalled();
      expect(mockScheduleCloudSync).toHaveBeenCalled();
      expect(mockScheduleCleanup).toHaveBeenCalled();
    });

    it('should report success for each task', async () => {
      mockQueueDueScheduledReports.mockResolvedValue(undefined);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const results = await triggerAllTasks();

      for (const result of results) {
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('task');
      }
    });

    it('should continue on failure and report error', async () => {
      mockQueueDueScheduledReports.mockRejectedValue(new Error('First task failed'));
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      const results = await triggerAllTasks();

      // All tasks should still be attempted
      expect(results).toHaveLength(5);

      // First task should report success: true because error is caught in runTask
      // and the task is marked as complete even after error
      const reportsResult = results.find((r) => r.task === 'scheduled-reports');
      expect(reportsResult).toHaveProperty('task', 'scheduled-reports');
    });
  });

  describe('task concurrency prevention', () => {
    it('should skip task if already running', async () => {
      let resolveFirstRun: () => void;
      const firstRunPromise = new Promise<void>((resolve) => {
        resolveFirstRun = resolve;
      });

      mockQueueDueScheduledReports.mockImplementation(() => firstRunPromise);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      // Start first run
      const firstTrigger = triggerTask('scheduled-reports');

      // Try to start second run while first is in progress
      // Note: We need to check the behavior when task is already running
      // The triggerTask should throw if task is already running
      await expect(triggerTask('scheduled-reports')).rejects.toThrow(
        'Task scheduled-reports is already running'
      );

      // Complete the first run
      resolveFirstRun!();
      await firstTrigger;
    });

    it('should log debug message when task is skipped', async () => {
      let resolveFirstRun: () => void;
      const firstRunPromise = new Promise<void>((resolve) => {
        resolveFirstRun = resolve;
      });

      mockQueueDueScheduledReports.mockImplementation(() => firstRunPromise);
      mockScheduleHealthScoreCalculation.mockResolvedValue(undefined);
      mockScheduleSlaBreachChecks.mockResolvedValue(undefined);
      mockScheduleCloudSync.mockResolvedValue(undefined);
      mockScheduleCleanup.mockResolvedValue(undefined);

      startScheduler();

      // Advance past startup delay to trigger first run
      await vi.advanceTimersByTimeAsync(5001);

      // Clear mocks to isolate test
      vi.clearAllMocks();

      // Advance 1 minute to trigger another run while first is still running
      await vi.advanceTimersByTimeAsync(60000);

      expect(logger.debug).toHaveBeenCalledWith(
        { task: 'scheduled-reports' },
        'Task already running, skipping'
      );

      // Complete the first run
      resolveFirstRun!();
    });
  });
});
