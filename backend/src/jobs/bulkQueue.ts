import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import type { BulkEntity, BulkOperation, BulkPayload } from '../services/bulk.js';

const connection = redisConnection;

export const BULK_QUEUE_NAME = 'bulk-operations';

export interface BulkJobData {
  tenantSlug: string;
  userId: string;
  entity: BulkEntity;
  operation: BulkOperation;
  payload: BulkPayload;
  webhookUrl?: string;
}

export interface BulkJobProgress {
  processed: number;
  total: number;
}

// Bulk operations are all-or-nothing and never retried automatically:
// a failed job was rolled back and the caller decides whether to resubmit.
export const bulkQueue = new Queue<BulkJobData>(BULK_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
  },
});

const events = new QueueEvents(BULK_QUEUE_NAME, { connection });
events.on('error', () => {
  // connection errors are logged by the worker; avoid unhandled error events
});

export async function closeBulkQueue(): Promise<void> {
  await Promise.allSettled([bulkQueue.close(), events.close()]);
}
