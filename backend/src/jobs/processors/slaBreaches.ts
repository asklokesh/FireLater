import { Job, Worker } from 'bullmq';
import { config } from '../../config/index.js';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { tenantService } from '../../services/tenant.js';
import { notificationQueue } from '../queues.js';
import { slaService, SlaConfigForBreachCheck } from '../../services/sla.js';
import format from 'pg-format';

// Redis connection for worker
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface CheckSlaBreachesJobData {
  tenantSlug: string;
}

export interface SlaBreachResult {
  issueId: string;
  issueNumber: string;
  priority: string;
  breachType: 'response' | 'resolution';
  breachedAt: Date;
}

// ============================================
// SLA CONFIGURATION
// ============================================

interface SlaConfig {
  priority: string;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  warningThresholdPercent: number;
}

const DEFAULT_SLA_CONFIG: SlaConfig[] = [
  { priority: 'critical', responseTimeMinutes: 15, resolutionTimeMinutes: 240, warningThresholdPercent: 80 },      // 15min / 4h
  { priority: 'high', responseTimeMinutes: 60, resolutionTimeMinutes: 480, warningThresholdPercent: 80 },          // 1h / 8h
  { priority: 'medium', responseTimeMinutes: 240, resolutionTimeMinutes: 1440, warningThresholdPercent: 80 },      // 4h / 24h
  { priority: 'low', responseTimeMinutes: 480, resolutionTimeMinutes: 2880, warningThresholdPercent: 80 },         // 8h / 48h
];

async function getSlaConfig(tenantSlug: string): Promise<SlaConfig[]> {
  try {
    // Try to get config from database
    const dbConfig = await slaService.getSlaConfigFromDb(tenantSlug, 'issue');

    if (dbConfig && dbConfig.length > 0) {
      return dbConfig.map((cfg: SlaConfigForBreachCheck) => ({
        priority: cfg.priority,
        responseTimeMinutes: cfg.responseTimeMinutes || DEFAULT_SLA_CONFIG.find(d => d.priority === cfg.priority)?.responseTimeMinutes || 60,
        resolutionTimeMinutes: cfg.resolutionTimeMinutes || DEFAULT_SLA_CONFIG.find(d => d.priority === cfg.priority)?.resolutionTimeMinutes || 480,
        warningThresholdPercent: cfg.warningThresholdPercent || 80,
      }));
    }

    // Fall back to defaults if no database config
    return DEFAULT_SLA_CONFIG;
  } catch (err) {
    logger.warn({ tenantSlug, err }, 'Failed to get SLA config from database, using defaults');
    return DEFAULT_SLA_CONFIG;
  }
}

// ============================================
// SLA BREACH DETECTION
// ============================================

async function checkResponseTimeBreaches(
  schema: string,
  tenantSlug: string,
  slaConfig: SlaConfig[]
): Promise<SlaBreachResult[]> {
  const breaches: SlaBreachResult[] = [];

  // Batch query optimization - single query instead of N queries
  if (slaConfig.length === 0) return breaches;

  // Build UNION ALL query for all priorities
  const queries = slaConfig.map((config, idx) => {
    const priorityParam = idx * 2 + 1;
    const minutesParam = idx * 2 + 2;
    return format(
      `SELECT id, issue_number, priority, created_at
      FROM %I.issues
      WHERE priority = $${priorityParam}
      AND status NOT IN ('resolved', 'closed')
      AND first_response_at IS NULL
      AND sla_breached = false
      AND created_at < NOW() - INTERVAL '1 minute' * $${minutesParam}`,
      schema
    );
  });

  const values = slaConfig.flatMap(c => [c.priority, c.responseTimeMinutes]);
  const result = await pool.query(queries.join(' UNION ALL '), values);

  for (const issue of result.rows) {
    breaches.push({
      issueId: issue.id,
      issueNumber: issue.issue_number,
      priority: issue.priority,
      breachType: 'response',
      breachedAt: new Date(),
    });
  }

  return breaches;
}

async function checkResolutionTimeBreaches(
  schema: string,
  tenantSlug: string,
  slaConfig: SlaConfig[]
): Promise<SlaBreachResult[]> {
  const breaches: SlaBreachResult[] = [];

  // Batch query optimization - single query instead of N queries
  if (slaConfig.length === 0) return breaches;

  // Build UNION ALL query for all priorities
  const queries = slaConfig.map((config, idx) => {
    const priorityParam = idx * 2 + 1;
    const minutesParam = idx * 2 + 2;
    return format(
      `SELECT id, issue_number, priority, created_at
      FROM %I.issues
      WHERE priority = $${priorityParam}
      AND status NOT IN ('resolved', 'closed')
      AND sla_breached = false
      AND created_at < NOW() - INTERVAL '1 minute' * $${minutesParam}`,
      schema
    );
  });

  const values = slaConfig.flatMap(c => [c.priority, c.resolutionTimeMinutes]);
  const result = await pool.query(queries.join(' UNION ALL '), values);

  for (const issue of result.rows) {
    breaches.push({
      issueId: issue.id,
      issueNumber: issue.issue_number,
      priority: issue.priority,
      breachType: 'resolution',
      breachedAt: new Date(),
    });
  }

  return breaches;
}

async function markIssuesAsBreached(schema: string, issueIds: string[]): Promise<void> {
  if (issueIds.length === 0) return;

  await pool.query(
    format(
      'UPDATE %I.issues SET sla_breached = true, updated_at = NOW() WHERE id = ANY($1)',
      schema
    ),
    [issueIds]
  );
}

async function _getIssueAssigneeAndManager(
  schema: string,
  issueId: string
): Promise<{ assigneeId?: string; managerId?: string; assigneeEmail?: string; managerEmail?: string }> {
  const result = await pool.query(
    format(
      `SELECT
        i.assigned_to as assignee_id,
        au.email as assignee_email,
        g.manager_id,
        mu.email as manager_email
      FROM %I.issues i
      LEFT JOIN %I.users au ON i.assigned_to = au.id
      LEFT JOIN %I.groups g ON i.assigned_group = g.id
      LEFT JOIN %I.users mu ON g.manager_id = mu.id
      WHERE i.id = $1`,
      schema,
      schema,
      schema,
      schema
    ),
    [issueId]
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      assigneeId: row.assignee_id,
      assigneeEmail: row.assignee_email,
      managerId: row.manager_id,
      managerEmail: row.manager_email,
    };
  }
  return {};
}

async function queueBreachNotifications(
  tenantSlug: string,
  schema: string,
  breaches: SlaBreachResult[]
): Promise<void> {
  // Batch fetch all assignee/manager info in one query (N+1 fix)
  const issueIds = breaches.map(b => b.issueId);
  const notifyInfoMap = new Map<string, { assigneeId?: string; managerId?: string }>();

  if (issueIds.length > 0) {
    const result = await pool.query(
      format(
        `SELECT
          i.id as issue_id,
          i.assigned_to as assignee_id,
          g.manager_id
        FROM %I.issues i
        LEFT JOIN %I.groups g ON i.assigned_group = g.id
        WHERE i.id = ANY($1)`,
        schema,
        schema
      ),
      [issueIds]
    );

    for (const row of result.rows) {
      notifyInfoMap.set(row.issue_id, {
        assigneeId: row.assignee_id,
        managerId: row.manager_id,
      });
    }
  }

  for (const breach of breaches) {
    // Get assignee and manager info from batch-fetched map
    const notifyInfo = notifyInfoMap.get(breach.issueId) || {};
    const recipientIds: string[] = [];

    if (notifyInfo.assigneeId) {
      recipientIds.push(notifyInfo.assigneeId);
    }
    if (notifyInfo.managerId && notifyInfo.managerId !== notifyInfo.assigneeId) {
      recipientIds.push(notifyInfo.managerId);
    }

    try {
      await notificationQueue.add(
        'sla-breach',
        {
          tenantSlug,
          type: 'sla_breach',
          recipientIds: recipientIds.length > 0 ? recipientIds : undefined,
          issueId: breach.issueId,
          issueNumber: breach.issueNumber,
          priority: breach.priority,
          breachType: breach.breachType,
          breachedAt: breach.breachedAt.toISOString(),
          data: {
            issueId: breach.issueId,
            issueNumber: breach.issueNumber,
            priority: breach.priority,
            breachType: breach.breachType,
            breachedAt: breach.breachedAt.toISOString(),
          },
        },
        {
          jobId: `sla-breach-${breach.issueId}-${breach.breachType}`,
          priority: breach.priority === 'critical' ? 1 : 2,
        }
      );
    } catch (queueError) {
      logger.error(
        { err: queueError, tenantSlug, issueId: breach.issueId, breachType: breach.breachType },
        'Failed to queue SLA breach notification due to Redis error'
      );
      // Continue with other breaches even if one fails
    }
  }
}

// ============================================
// JOB PROCESSOR
// ============================================

async function processSlaBreachCheck(
  job: Job<CheckSlaBreachesJobData>
): Promise<{ breachCount: number; breaches: SlaBreachResult[] }> {
  const { tenantSlug } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, tenantSlug }, 'Checking for SLA breaches');

  const slaConfig = await getSlaConfig(tenantSlug);

  // Check for breaches
  const [responseBreaches, resolutionBreaches] = await Promise.all([
    checkResponseTimeBreaches(schema, tenantSlug, slaConfig),
    checkResolutionTimeBreaches(schema, tenantSlug, slaConfig),
  ]);

  const allBreaches = [...responseBreaches, ...resolutionBreaches];

  if (allBreaches.length > 0) {
    // Mark issues as breached
    const issueIds = [...new Set(allBreaches.map((b) => b.issueId))];
    await markIssuesAsBreached(schema, issueIds);

    // Queue notifications
    await queueBreachNotifications(tenantSlug, schema, allBreaches);

    logger.warn(
      { jobId: job.id, tenantSlug, breachCount: allBreaches.length },
      'SLA breaches detected and notifications queued'
    );
  } else {
    logger.debug({ jobId: job.id, tenantSlug }, 'No SLA breaches detected');
  }

  return {
    breachCount: allBreaches.length,
    breaches: allBreaches,
  };
}

// ============================================
// WORKER
// ============================================

export const slaBreachWorker = new Worker<CheckSlaBreachesJobData>(
  'sla-breaches',
  async (job) => {
    if (job.name === 'check-breaches') {
      return processSlaBreachCheck(job);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 1, // Process one tenant at a time
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);

slaBreachWorker.on('completed', (job, result) => {
  if (result && (result as { breachCount: number }).breachCount > 0) {
    logger.info(
      { jobId: job.id, breachCount: (result as { breachCount: number }).breachCount },
      'SLA breach check completed with breaches'
    );
  }
});

slaBreachWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'SLA breach check job failed');
});

// ============================================
// SCHEDULER
// ============================================

export async function scheduleSlaBreachChecks(): Promise<number> {
  const { slaBreachQueue } = await import('../queues.js');

  // Get all active tenants
  const tenantsResult = await pool.query(`
    SELECT slug FROM tenants WHERE status = 'active'
  `);

  let queuedCount = 0;

  for (const tenant of tenantsResult.rows) {
    try {
      await slaBreachQueue.add(
        'check-breaches',
        { tenantSlug: tenant.slug },
        {
          jobId: `sla-check-${tenant.slug}-${Date.now()}`,
        }
      );
      queuedCount++;
    } catch (queueError) {
      logger.error(
        { err: queueError, tenantSlug: tenant.slug },
        'Failed to schedule SLA breach check due to Redis error'
      );
      // Continue with other tenants even if one fails
    }
  }

  logger.info({ count: queuedCount }, 'Scheduled SLA breach checks');

  return queuedCount;
}

// ============================================
// APPROACHING SLA WARNING
// ============================================

export interface ApproachingSlaResult {
  issueId: string;
  issueNumber: string;
  priority: string;
  warningType: 'response' | 'resolution';
  timeRemaining: number; // minutes
}

export async function checkApproachingSla(
  tenantSlug: string,
  warningThresholdPercent: number = 75
): Promise<ApproachingSlaResult[]> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const slaConfig = await getSlaConfig(tenantSlug);
  const warnings: ApproachingSlaResult[] = [];

  for (const config of slaConfig) {
    const warningThreshold = config.resolutionTimeMinutes * (warningThresholdPercent / 100);

    const result = await pool.query(
      format(
        `SELECT
          id,
          issue_number,
          priority,
          created_at,
          EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as elapsed_minutes
        FROM %I.issues
        WHERE priority = $1
        AND status NOT IN ('resolved', 'closed')
        AND sla_breached = false
        AND created_at > NOW() - INTERVAL '1 minute' * $2
        AND created_at < NOW() - INTERVAL '1 minute' * $3`,
        schema
      ),
      [config.priority, config.resolutionTimeMinutes, warningThreshold]
    );

    for (const issue of result.rows) {
      const timeRemaining = config.resolutionTimeMinutes - parseFloat(issue.elapsed_minutes);
      warnings.push({
        issueId: issue.id,
        issueNumber: issue.issue_number,
        priority: issue.priority,
        warningType: 'resolution',
        timeRemaining: Math.round(timeRemaining),
      });
    }
  }

  return warnings;
}
