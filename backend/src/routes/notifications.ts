import { Worker, Queue, Job, QueueEvents } from 'bullmq';
import { redis } from '../config/redis.js';

// Add queue configuration with retry and dead-letter queue settings
const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false,
    delay: 0
  }
});

// Add dead-letter queue for failed jobs
const deadLetterQueue = new Queue('notifications-dlq', {
  connection: redis
});

// Configure worker with proper error handling and retry logic
const notificationWorker = new Worker(
  'notifications',
  async (job: Job) => {
    try {
      // Process notification job
      // Job processing logic would go here
      console.log('Processing notification job:', job.id);
    } catch (error) {
      // Log error for monitoring
      console.error('Notification job failed:', job.id, error);
      
      // Move to dead-letter queue after max retries
      if (job.attemptsMade >= job.opts.attempts!) {
        await deadLetterQueue.add('failed-notification', {
          jobId: job.id,
          data: job.data,
          failedReason: error.message,
          attemptsMade: job.attemptsMade
        });
      }
      
      throw error; // Re-throw to let BullMQ handle retries
    }
  },
  {
    connection: redis,
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
);

// Add error handling for worker
notificationWorker.on('failed', async (job: Job | undefined, error: Error) => {
  if (job) {
    console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message);
  }
});

// Add queue events for monitoring
const queueEvents = new QueueEvents('notifications', { connection: redis });
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed: ${failedReason}`);
});