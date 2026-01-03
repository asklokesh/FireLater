import { Job, Worker } from 'bullmq';
import { config } from '../../config/index.js';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { tenantService } from '../../services/tenant.js';

// Redis connection for worker
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface CleanupJobData {
  tenantSlug: string;
  cleanupType: 'notifications' | 'sessions' | 'analytics_cache' | 'report_executions' | 'all';
  retentionDays?: number;
}

export interface CleanupResult {
  type: string;
  deletedCount: number;
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

async function cleanupOldNotifications(schema: string, retentionDays: number): Promise<number> {
  const result = await pool.query(`
    DELETE FROM ${schema}.notifications
    WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
    AND read_at IS NOT NULL
    RETURNING id
  `, [retentionDays]);

  return result.rowCount || 0;
}

async function cleanupExpiredSessions(retentionDays: number): Promise<number> {
  const result = await pool.query(`
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW() - ($1 || ' days')::INTERVAL
    RETURNING id
  `, [retentionDays]);

  return result.rowCount || 0;
}

async function cleanupAnalyticsCache(schema: string, retentionDays: number): Promise<number> {
  const result = await pool.query(`
    DELETE FROM ${schema}.analytics_cache
    WHERE expires_at < NOW()
    OR created_at < NOW() - ($1 || ' days')::INTERVAL
    RETURNING id
  `, [retentionDays]);

  return result.rowCount || 0;
}

async function cleanupOldReportExecutions(schema: string, retentionDays: number): Promise<number> {
  const result = await pool.query(`
    DELETE FROM ${schema}.report_executions
    WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
    AND status IN ('completed', 'failed')
    RETURNING id
  `, [retentionDays]);

  return result.rowCount || 0;
}

async function _cleanupOrphanedAttachments(_schema: string): Promise<number> {
  // Delete attachments that are no longer referenced
  // This will be more relevant when file attachments are implemented
  logger.debug('Orphaned attachment cleanup not yet implemented');
  return 0;
}

async function vacuumTables(schema: string): Promise<void> {
  // Run VACUUM ANALYZE on key tables to reclaim space and update statistics
  const tables = [
    'notifications',
    'issues',
    'change_requests',
    'service_requests',
    'report_executions',
    'analytics_cache',
  ];

  // Run vacuum operations in parallel for better performance
  const vacuumPromises = tables.map(async (table) => {
    try {
      await pool.query(`VACUUM ANALYZE ${schema}.${table}`);
      logger.debug({ table, schema }, 'Vacuum completed');
    } catch (error) {
      // Table might not exist, ignore
      logger.debug({ table, error }, 'Vacuum skipped');
    }
  });

  await Promise.allSettled(vacuumPromises);
}

// ============================================
// JOB PROCESSOR
// ============================================

async function processCleanup(job: Job<CleanupJobData>): Promise<CleanupResult[]> {
  const { tenantSlug, cleanupType, retentionDays = 90 } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, tenantSlug, cleanupType, retentionDays }, 'Running cleanup');

  const results: CleanupResult[] = [];

  try {
    // For 'all' cleanup type, run all operations in parallel for better performance
    if (cleanupType === 'all') {
      const cleanupPromises = await Promise.allSettled([
        cleanupOldNotifications(schema, retentionDays).then(count => ({ type: 'notifications', deletedCount: count })),
        cleanupExpiredSessions(retentionDays).then(count => ({ type: 'sessions', deletedCount: count })),
        cleanupAnalyticsCache(schema, 7).then(count => ({ type: 'analytics_cache', deletedCount: count })), // Cache only 7 days
        cleanupOldReportExecutions(schema, retentionDays).then(count => ({ type: 'report_executions', deletedCount: count })),
      ]);

      // Collect successful results
      for (const result of cleanupPromises) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error({ err: result.reason }, 'Cleanup operation failed');
        }
      }

      // Run vacuum after cleanup
      await vacuumTables(schema);
    } else {
      // Single cleanup type - run individually
      if (cleanupType === 'notifications') {
        const count = await cleanupOldNotifications(schema, retentionDays);
        results.push({ type: 'notifications', deletedCount: count });
      }

      if (cleanupType === 'sessions') {
        const count = await cleanupExpiredSessions(retentionDays);
        results.push({ type: 'sessions', deletedCount: count });
      }

      if (cleanupType === 'analytics_cache') {
        const count = await cleanupAnalyticsCache(schema, 7); // Cache only 7 days
        results.push({ type: 'analytics_cache', deletedCount: count });
      }

      if (cleanupType === 'report_executions') {
        const count = await cleanupOldReportExecutions(schema, retentionDays);
        results.push({ type: 'report_executions', deletedCount: count });
      }
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
    logger.info(
      { jobId: job.id, tenantSlug, totalDeleted, results },
      'Cleanup completed'
    );
  } catch (error) {
    logger.error({ err: error, jobId: job.id }, 'Cleanup failed');
    throw error;
  }

  return results;
}

// ============================================
// WORKER
// ============================================

export const cleanupWorker = new Worker<CleanupJobData>(
  'cleanup',
  async (job) => {
    if (job.name === 'run-cleanup') {
      return processCleanup(job);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 1, // Run one cleanup at a time
    limiter: {
      max: 2,
      duration: 60000,
    },
  }
);

cleanupWorker.on('completed', (job, result) => {
  const totalDeleted = Array.isArray(result)
    ? (result as CleanupResult[]).reduce((sum, r) => sum + r.deletedCount, 0)
    : 0;
  logger.debug({ jobId: job.id, totalDeleted }, 'Cleanup job completed');
});

cleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Cleanup job failed');
});

// ============================================
// SCHEDULER
// ============================================

export async function scheduleCleanup(): Promise<number> {
  const { cleanupQueue } = await import('../queues.js');

  // Get all active tenants
  const tenantsResult = await pool.query(`
    SELECT slug FROM tenants WHERE status = 'active'
  `);

  let queuedCount = 0;

  for (const tenant of tenantsResult.rows) {
    try {
      await cleanupQueue.add(
        'run-cleanup',
        {
          tenantSlug: tenant.slug,
          cleanupType: 'all',
          retentionDays: 90,
        },
        {
          jobId: `cleanup-${tenant.slug}-${Date.now()}`,
        }
      );
      queuedCount++;
    } catch (queueError) {
      logger.error(
        { err: queueError, tenantSlug: tenant.slug },
        'Failed to schedule cleanup job due to Redis error'
      );
      // Continue with other tenants even if one fails
    }
  }

  logger.info({ count: queuedCount }, 'Scheduled cleanup jobs');

  return queuedCount;
}
