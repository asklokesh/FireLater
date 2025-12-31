import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { 
  notificationService, 
  notificationSettingsService,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_RETRY_DELAY_BASE
} from '../services/notifications.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { Job } from 'bullmq';
import { redis } from '../config/redis.js';

// Add dead-letter queue name
const WEBHOOK_DLQ_NAME = 'webhook-deliveries-dlq';

// Add helper function for exponential backoff
const calculateRetryDelay = (attempt: number): number => {
  return Math.min(
    WEBHOOK_RETRY_DELAY_BASE * Math.pow(2, attempt - 1),
    3600000 // Max 1 hour
  );
};

// Add helper function to move job to DLQ
const moveToDeadLetterQueue = async (job: Job, error: Error): Promise<void> => {
  const dlq = redis.queue(WEBHOOK_DLQ_NAME);
  await dlq.add(
    'failed-webhook',
    {
      ...job.data,
      failedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorStack: error.stack,
      attempts: job.attemptsMade
    },
    {
      jobId: `${job.id}-dlq`,
      removeOnComplete: true,
      removeOnFail: true
    }
  );
};