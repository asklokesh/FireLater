import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Redis connection options for BullMQ
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// QUEUE DEFINITIONS
// ============================================

// Scheduled Reports Queue
export const scheduledReportsQueue = new Queue('scheduled-reports', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Health Score Calculator Queue
export const healthScoreQueue = new Queue('health-scores', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
});

// SLA Breach Checker Queue
export const slaBreachQueue = new Queue('sla-breaches', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Notification Dispatcher Queue
export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
});

// Cloud Sync Queue
export const cloudSyncQueue = new Queue('cloud-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// Cleanup Queue (for maintenance tasks)
export const cleanupQueue = new Queue('cleanup', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

// ============================================
// QUEUE EVENTS
// ============================================

const createQueueEvents = (queueName: string): QueueEvents => {
  const events = new QueueEvents(queueName, { connection });

  events.on('completed', ({ jobId }) => {
    logger.debug({ jobId, queue: queueName }, 'Job completed');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, queue: queueName, reason: failedReason }, 'Job failed');
  });

  events.on('stalled', ({ jobId }) => {
    logger.warn({ jobId, queue: queueName }, 'Job stalled');
  });

  return events;
};

export const scheduledReportsEvents = createQueueEvents('scheduled-reports');
export const healthScoreEvents = createQueueEvents('health-scores');
export const slaBreachEvents = createQueueEvents('sla-breaches');
export const notificationEvents = createQueueEvents('notifications');
export const cloudSyncEvents = createQueueEvents('cloud-sync');
export const cleanupEvents = createQueueEvents('cleanup');

// ============================================
// QUEUE UTILITIES
// ============================================

export interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export async function getQueueStatus(queue: Queue): Promise<QueueStatus> {
  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    name: queue.name,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: isPaused,
  };
}

export async function getAllQueuesStatus(): Promise<QueueStatus[]> {
  const queues = [
    scheduledReportsQueue,
    healthScoreQueue,
    slaBreachQueue,
    notificationQueue,
    cloudSyncQueue,
    cleanupQueue,
  ];

  return Promise.all(queues.map(getQueueStatus));
}

export async function closeAllQueues(): Promise<void> {
  const queues = [
    scheduledReportsQueue,
    healthScoreQueue,
    slaBreachQueue,
    notificationQueue,
    cloudSyncQueue,
    cleanupQueue,
  ];

  const events = [
    scheduledReportsEvents,
    healthScoreEvents,
    slaBreachEvents,
    notificationEvents,
    cloudSyncEvents,
    cleanupEvents,
  ];

  await Promise.all([
    ...queues.map((q) => q.close()),
    ...events.map((e) => e.close()),
  ]);

  logger.info('All queues closed');
}
