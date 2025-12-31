import { Job, Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { integrationsService } from '../services/integrations.js';
import { logger } from '../utils/logger.js';

// Create queue with proper retry configuration
export const integrationSyncQueue = new Queue('integration-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Worker with comprehensive error handling
export const integrationSyncWorker = new Worker(
  'integration-sync',
  async (job: Job) => {
    const { integrationId, tenantSlug } = job.data;
    
    if (!integrationId || !tenantSlug) {
      throw new Error('Missing required job data: integrationId or tenantSlug');
    }

    try {
      logger.info(`Starting integration sync for ${integrationId} in tenant ${tenantSlug}`);
      await integrationsService.syncIntegration(tenantSlug, integrationId);
      logger.info(`Completed integration sync for ${integrationId} in tenant ${tenantSlug}`);
    } catch (error) {
      logger.error(`Integration sync failed for ${integrationId} in tenant ${tenantSlug}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw to trigger retry mechanism
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 }
  }
);

// Handle worker errors
integrationSyncWorker.on('failed', (job: Job | undefined, error: Error) => {
  if (job) {
    logger.error(`Job ${job.id} failed after all retries`, {
      integrationId: job.data.integrationId,
      tenantSlug: job.data.tenantSlug,
      error: error.message,
      stack: error.stack
    });
    
    // Send notification about persistent failure
    integrationsService.handleSyncFailure(
      job.data.tenantSlug, 
      job.data.integrationId, 
      error
    ).catch(err => {
      logger.error('Failed to handle sync failure notification', err);
    });
  }
});

integrationSyncWorker.on('error', (error) => {
  logger.error('Integration sync worker error', error);
});