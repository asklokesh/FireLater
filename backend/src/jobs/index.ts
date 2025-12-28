// ============================================
// BACKGROUND JOBS - MAIN ENTRY POINT
// ============================================

// Queue exports
export {
  scheduledReportsQueue,
  healthScoreQueue,
  slaBreachQueue,
  notificationQueue,
  cloudSyncQueue,
  cleanupQueue,
  getAllQueuesStatus,
  closeAllQueues,
  type QueueStatus,
} from './queues.js';

// Worker exports
export { scheduledReportsWorker } from './processors/scheduledReports.js';
export { healthScoreWorker } from './processors/healthScores.js';
export { slaBreachWorker } from './processors/slaBreaches.js';
export { notificationWorker, queueNotification } from './processors/notifications.js';
export { cloudSyncWorker } from './processors/cloudSync.js';
export { cleanupWorker } from './processors/cleanup.js';

// Scheduler exports
export {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerTask,
  triggerAllTasks,
} from './scheduler.js';

// ============================================
// INITIALIZATION
// ============================================

import { logger } from '../utils/logger.js';
import { scheduledReportsWorker } from './processors/scheduledReports.js';
import { healthScoreWorker } from './processors/healthScores.js';
import { slaBreachWorker } from './processors/slaBreaches.js';
import { notificationWorker } from './processors/notifications.js';
import { cloudSyncWorker } from './processors/cloudSync.js';
import { cleanupWorker } from './processors/cleanup.js';
import { closeAllQueues } from './queues.js';
import { startScheduler, stopScheduler } from './scheduler.js';

const workers = [
  scheduledReportsWorker,
  healthScoreWorker,
  slaBreachWorker,
  notificationWorker,
  cloudSyncWorker,
  cleanupWorker,
];

export async function initializeJobs(): Promise<void> {
  logger.info('Initializing background jobs');

  // Workers are automatically started when imported
  // Just log their status
  for (const worker of workers) {
    logger.info({ worker: worker.name, running: worker.isRunning() }, 'Worker status');
  }

  // Start the scheduler
  startScheduler();

  logger.info('Background jobs initialized');
}

export async function shutdownJobs(): Promise<void> {
  logger.info('Shutting down background jobs');

  // Stop the scheduler
  stopScheduler();

  // Close all workers
  await Promise.all(workers.map((w) => w.close()));

  // Close all queues
  await closeAllQueues();

  logger.info('Background jobs shutdown complete');
}
