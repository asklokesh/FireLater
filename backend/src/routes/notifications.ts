import { FastifyInstance } from 'fastify';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../config/redis.js';
import { notificationService } from '../services/notifications.js';

// Create queues with retry and DLQ configuration
const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

const dlqQueue = new Queue('notifications-dlq', {
  connection: redis
});

// Worker with proper error handling and DLQ integration
const notificationWorker = new Worker('notifications', 
  async (job) => {
    try {
      await notificationService.send(job.data);
    } catch (error) {
      // Re-throw to trigger retry mechanism
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 1000
    }
  }
);

// Handle failed jobs and move to DLQ after max retries
notificationWorker.on('failed', async (job, err) => {
  if (job.attemptsMade >= (job.opts.attempts || 5)) {
    // Move to dead-letter queue
    await dlqQueue.add('failed-notification', job.data, {
      jobId: job.id,
      attempts: 3
    });
    
    // Log for monitoring
    console.error(`Notification job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`, {
      error: err.message,
      data: job.data
    });
  }
});