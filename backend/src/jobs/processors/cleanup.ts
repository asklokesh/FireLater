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

  for (const table of tables) {
    try {
      await pool.query(`VACUUM ANALYZE ${schema}.${table}`);
    } catch (error) {
      // Table might not exist, ignore
      logger.debug({ table, error }, 'Vacuum skipped');
    }
  }
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
    if (cleanupType === 'notifications' || cleanupType === 'all') {
      const count = await cleanupOldNotifications(schema, retentionDays);
      results.push({ type: 'notifications', deletedCount: count });
    }

    if (cleanupType === 'sessions' || cleanupType === 'all') {
      const count = await cleanupExpiredSessions(retentionDays);
      results.push({ type: 'sessions', deletedCount: count });
    }

    if (cleanupType === 'analytics_cache' || cleanupType === 'all') {
      const count = await cleanupAnalyticsCache(schema, 7); // Cache only 7 days
      results.push({ type: 'analytics_cache', deletedCount: count });
    }

    if (cleanupType === 'report_executions' || cleanupType === 'all') {
      const count = await cleanupOldReportExecutions(schema, retentionDays);
      results.push({ type: 'report_executions', deletedCount: count });
    }

    // Run vacuum after cleanup
    if (cleanupType === 'all') {
      await vacuumTables(schema);
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
  }

  logger.info({ count: queuedCount }, 'Scheduled cleanup jobs');

  return queuedCount;
}
