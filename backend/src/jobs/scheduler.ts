import { logger } from '../utils/logger.js';
import { queueDueScheduledReports } from './processors/scheduledReports.js';
import { scheduleHealthScoreCalculation } from './processors/healthScores.js';
import { scheduleSlaBreachChecks } from './processors/slaBreaches.js';
import { scheduleCloudSync } from './processors/cloudSync.js';
import { scheduleCleanup } from './processors/cleanup.js';

// ============================================
// CRON-LIKE SCHEDULER
// ============================================

interface ScheduledTask {
  name: string;
  intervalMs: number;
  handler: () => Promise<unknown>;
  lastRun?: Date;
  isRunning: boolean;
}

const scheduledTasks: ScheduledTask[] = [
  {
    name: 'scheduled-reports',
    intervalMs: 60 * 1000, // Every minute
    handler: queueDueScheduledReports,
    isRunning: false,
  },
  {
    name: 'health-scores',
    intervalMs: 60 * 60 * 1000, // Every hour
    handler: scheduleHealthScoreCalculation,
    isRunning: false,
  },
  {
    name: 'sla-breaches',
    intervalMs: 5 * 60 * 1000, // Every 5 minutes
    handler: scheduleSlaBreachChecks,
    isRunning: false,
  },
  {
    name: 'cloud-sync',
    intervalMs: 6 * 60 * 60 * 1000, // Every 6 hours
    handler: scheduleCloudSync,
    isRunning: false,
  },
  {
    name: 'cleanup',
    intervalMs: 24 * 60 * 60 * 1000, // Daily
    handler: scheduleCleanup,
    isRunning: false,
  },
];

const taskIntervals: Map<string, NodeJS.Timeout> = new Map();

async function runTask(task: ScheduledTask): Promise<void> {
  if (task.isRunning) {
    logger.debug({ task: task.name }, 'Task already running, skipping');
    return;
  }

  task.isRunning = true;

  try {
    logger.debug({ task: task.name }, 'Running scheduled task');
    await task.handler();
    task.lastRun = new Date();
    logger.debug({ task: task.name }, 'Scheduled task completed');
  } catch (error) {
    logger.error({ err: error, task: task.name }, 'Scheduled task failed');
  } finally {
    task.isRunning = false;
  }
}

export function startScheduler(): void {
  logger.info('Starting job scheduler');

  for (const task of scheduledTasks) {
    // Run immediately on startup (except cleanup)
    if (task.name !== 'cleanup') {
      setTimeout(() => runTask(task), 5000); // 5 second delay for startup
    }

    // Set up interval
    const interval = setInterval(() => runTask(task), task.intervalMs);
    taskIntervals.set(task.name, interval);

    logger.info(
      { task: task.name, intervalMs: task.intervalMs },
      'Scheduled task registered'
    );
  }
}

export function stopScheduler(): void {
  logger.info('Stopping job scheduler');

  for (const [name, interval] of taskIntervals) {
    clearInterval(interval);
    logger.debug({ task: name }, 'Scheduled task stopped');
  }

  taskIntervals.clear();
}

export function getSchedulerStatus(): Array<{
  name: string;
  intervalMs: number;
  lastRun: Date | undefined;
  isRunning: boolean;
}> {
  return scheduledTasks.map((task) => ({
    name: task.name,
    intervalMs: task.intervalMs,
    lastRun: task.lastRun,
    isRunning: task.isRunning,
  }));
}

// ============================================
// MANUAL TRIGGER FUNCTIONS
// ============================================

export async function triggerTask(taskName: string): Promise<unknown> {
  const task = scheduledTasks.find((t) => t.name === taskName);

  if (!task) {
    throw new Error(`Unknown task: ${taskName}`);
  }

  if (task.isRunning) {
    throw new Error(`Task ${taskName} is already running`);
  }

  logger.info({ task: taskName }, 'Manually triggering task');
  await runTask(task);

  return { success: true, task: taskName, lastRun: task.lastRun };
}

export async function triggerAllTasks(): Promise<unknown[]> {
  const results = [];

  for (const task of scheduledTasks) {
    try {
      await runTask(task);
      results.push({ task: task.name, success: true });
    } catch (error) {
      results.push({ task: task.name, success: false, error: String(error) });
    }
  }

  return results;
}
