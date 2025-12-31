import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';

// Add error handling for Redis connection
let notificationQueue: Queue | null = null;
let notificationWorker: Worker | null = null;

try {
  notificationQueue = new Queue('notifications', { connection: redisConnection });
  notificationWorker = new Worker('notifications', async (job) => {
    // Worker implementation
  }, { connection: redisConnection });
  
  // Handle Redis connection errors
  redisConnection.on('error', (err) => {
    console.error('Redis connection error in notifications:', err);
  });
} catch (error) {
  console.error('Failed to initialize BullMQ for notifications:', error);
}