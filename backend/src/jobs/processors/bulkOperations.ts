import { Job, Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';
import { validateBulkWebhookUrl } from '../../utils/bulkWebhook.js';
import { executeBulk } from '../../services/bulk.js';
import { BULK_QUEUE_NAME, type BulkJobData, type BulkJobProgress } from '../bulkQueue.js';

const connection = redisConnection;

const WEBHOOK_MIN_INTERVAL_MS = 5000;
const WEBHOOK_TIMEOUT_MS = 5000;

export interface BulkWebhookEvent {
  event: 'bulk.started' | 'bulk.progress' | 'bulk.completed' | 'bulk.failed';
  jobId: string;
  tenantSlug: string;
  entity: string;
  operation: string;
  processed: number;
  total: number;
  affected?: number;
  error?: string;
}

/** Best-effort webhook delivery; failures never affect the bulk operation. */
export async function sendBulkWebhook(url: string | undefined, event: BulkWebhookEvent): Promise<void> {
  if (!url) return;
  try {
    await validateBulkWebhookUrl(url);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'FireLater-Bulk/1.0' },
      body: JSON.stringify(event),
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn({ url, status: response.status, event: event.event }, 'Bulk webhook returned non-2xx');
    }
  } catch (error) {
    logger.warn({ err: error, event: event.event }, 'Bulk webhook delivery failed');
  }
}

export async function processBulkJob(job: Job<BulkJobData>) {
  const { tenantSlug, userId, entity, operation, payload, webhookUrl } = job.data;
  const jobId = String(job.id);
  const base = { jobId, tenantSlug, entity, operation };
  let lastSent = 0;

  await sendBulkWebhook(webhookUrl, { ...base, event: 'bulk.started', processed: 0, total: 0 });

  try {
    const result = await executeBulk(
      { tenantSlug, userId },
      entity,
      operation,
      payload,
      async (processed, total) => {
        const progress: BulkJobProgress = { processed, total };
        await job.updateProgress(progress);
        const now = Date.now();
        if (webhookUrl && now - lastSent >= WEBHOOK_MIN_INTERVAL_MS) {
          lastSent = now;
          await sendBulkWebhook(webhookUrl, { ...base, event: 'bulk.progress', processed, total });
        }
      },
      jobId
    );
    await sendBulkWebhook(webhookUrl, {
      ...base,
      event: 'bulk.completed',
      processed: result.requested,
      total: result.requested,
      affected: result.affected,
    });
    return result;
  } catch (error) {
    const p = typeof job.progress === 'object' ? (job.progress as BulkJobProgress) : { processed: 0, total: 0 };
    await sendBulkWebhook(webhookUrl, {
      ...base,
      event: 'bulk.failed',
      processed: 0,
      total: p.total,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

let worker: Worker<BulkJobData> | null = null;

/** Start the bulk worker once; safe to call repeatedly. */
export function startBulkWorker(): Worker<BulkJobData> {
  if (worker) return worker;
  worker = new Worker<BulkJobData>(BULK_QUEUE_NAME, processBulkJob, { connection, concurrency: 2 });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Bulk job failed (rolled back)');
  });
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Bulk job completed');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'Bulk worker error');
  });
  return worker;
}

export async function stopBulkWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
