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

export interface CalculateHealthScoreJobData {
  applicationId: string;
  tenantSlug: string;
}

export interface CalculateAllHealthScoresJobData {
  tenantSlug: string;
}

export interface HealthScoreResult {
  applicationId: string;
  overallScore: number;
  issueScore: number;
  changeScore: number;
  slaScore: number;
  uptimeScore: number;
  trend: 'improving' | 'stable' | 'declining';
}

// ============================================
// HEALTH SCORE CALCULATION LOGIC
// ============================================

interface HealthConfig {
  issue_weight: number;
  change_weight: number;
  sla_weight: number;
  uptime_weight: number;
  critical_issue_penalty: number;
  failed_change_penalty: number;
  sla_breach_penalty: number;
}

async function getHealthConfig(tenantSlug: string): Promise<HealthConfig> {
  const schema = tenantService.getSchemaName(tenantSlug);

  const result = await pool.query(`
    SELECT * FROM ${schema}.health_score_config WHERE is_default = true LIMIT 1
  `);

  if (result.rows.length === 0) {
    // Return default config
    return {
      issue_weight: 40,
      change_weight: 25,
      sla_weight: 25,
      uptime_weight: 10,
      critical_issue_penalty: 20,
      failed_change_penalty: 15,
      sla_breach_penalty: 10,
    };
  }

  return result.rows[0];
}

async function calculateIssueScore(
  schema: string,
  applicationId: string,
  config: HealthConfig
): Promise<number> {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as open_issues,
      COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed')) as critical_issues,
      COUNT(*) FILTER (WHERE priority = 'high' AND status NOT IN ('resolved', 'closed')) as high_issues,
      COUNT(*) as total_recent
    FROM ${schema}.issues
    WHERE application_id = $1
    AND created_at >= NOW() - INTERVAL '30 days'
  `, [applicationId]);

  const { open_issues, critical_issues, high_issues } = result.rows[0];

  // Base score starts at 100
  let score = 100;

  // Deduct for open issues
  score -= parseInt(open_issues, 10) * 5;

  // Extra penalty for critical issues
  score -= parseInt(critical_issues, 10) * config.critical_issue_penalty;

  // Moderate penalty for high priority
  score -= parseInt(high_issues, 10) * 10;

  return Math.max(0, Math.min(100, score));
}

async function calculateChangeScore(
  schema: string,
  applicationId: string,
  config: HealthConfig
): Promise<number> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_changes,
      COUNT(*) FILTER (WHERE outcome = 'success') as successful,
      COUNT(*) FILTER (WHERE outcome IN ('failed', 'rolled_back')) as failed
    FROM ${schema}.change_requests
    WHERE application_id = $1
    AND created_at >= NOW() - INTERVAL '30 days'
    AND status IN ('completed', 'failed')
  `, [applicationId]);

  const { total_changes, successful, failed } = result.rows[0];
  const total = parseInt(total_changes, 10);

  if (total === 0) {
    return 100; // No changes = neutral score
  }

  // Calculate success rate
  const successRate = parseInt(successful, 10) / total;
  let score = successRate * 100;

  // Additional penalty for failed changes
  score -= parseInt(failed, 10) * config.failed_change_penalty;

  return Math.max(0, Math.min(100, score));
}

async function calculateSlaScore(
  schema: string,
  applicationId: string,
  config: HealthConfig
): Promise<number> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_issues,
      COUNT(*) FILTER (WHERE sla_breached = true) as breached
    FROM ${schema}.issues
    WHERE application_id = $1
    AND created_at >= NOW() - INTERVAL '30 days'
  `, [applicationId]);

  const { total_issues, breached } = result.rows[0];
  const total = parseInt(total_issues, 10);

  if (total === 0) {
    return 100; // No issues = perfect SLA
  }

  // Calculate compliance rate
  const breachedCount = parseInt(breached, 10);
  const complianceRate = (total - breachedCount) / total;
  let score = complianceRate * 100;

  // Additional penalty per breach
  score -= breachedCount * config.sla_breach_penalty;

  return Math.max(0, Math.min(100, score));
}

async function calculateUptimeScore(
  schema: string,
  applicationId: string
): Promise<number> {
  // Check for uptime data (could come from monitoring integration)
  // For now, use a simplified calculation based on critical incidents
  const result = await pool.query(`
    SELECT
      COUNT(*) as outage_incidents
    FROM ${schema}.issues
    WHERE application_id = $1
    AND priority = 'critical'
    AND category = 'outage'
    AND created_at >= NOW() - INTERVAL '30 days'
  `, [applicationId]);

  const outages = parseInt(result.rows[0].outage_incidents, 10);

  // Each outage reduces score significantly
  // Assume each outage = ~4 hours downtime = ~0.5% of month
  const score = 100 - (outages * 5);

  return Math.max(0, Math.min(100, score));
}

async function determineTrend(
  schema: string,
  applicationId: string,
  currentScore: number
): Promise<'improving' | 'stable' | 'declining'> {
  // Get last health score
  const result = await pool.query(`
    SELECT overall_score
    FROM ${schema}.app_health_scores
    WHERE application_id = $1
    ORDER BY calculated_at DESC
    LIMIT 1 OFFSET 1
  `, [applicationId]);

  if (result.rows.length === 0) {
    return 'stable';
  }

  const previousScore = parseFloat(result.rows[0].overall_score);
  const diff = currentScore - previousScore;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

async function calculateHealthScore(
  tenantSlug: string,
  applicationId: string
): Promise<HealthScoreResult> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const healthConfig = await getHealthConfig(tenantSlug);

  // Calculate individual scores
  const [issueScore, changeScore, slaScore, uptimeScore] = await Promise.all([
    calculateIssueScore(schema, applicationId, healthConfig),
    calculateChangeScore(schema, applicationId, healthConfig),
    calculateSlaScore(schema, applicationId, healthConfig),
    calculateUptimeScore(schema, applicationId),
  ]);

  // Calculate weighted overall score
  const overallScore =
    (issueScore * healthConfig.issue_weight +
      changeScore * healthConfig.change_weight +
      slaScore * healthConfig.sla_weight +
      uptimeScore * healthConfig.uptime_weight) /
    (healthConfig.issue_weight +
      healthConfig.change_weight +
      healthConfig.sla_weight +
      healthConfig.uptime_weight);

  // Determine trend
  const trend = await determineTrend(schema, applicationId, overallScore);

  // Store the result
  await pool.query(`
    INSERT INTO ${schema}.app_health_scores (
      application_id, overall_score, issue_score, change_score, sla_score, uptime_score, trend
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [applicationId, overallScore, issueScore, changeScore, slaScore, uptimeScore, trend]);

  return {
    applicationId,
    overallScore: Math.round(overallScore * 100) / 100,
    issueScore: Math.round(issueScore * 100) / 100,
    changeScore: Math.round(changeScore * 100) / 100,
    slaScore: Math.round(slaScore * 100) / 100,
    uptimeScore: Math.round(uptimeScore * 100) / 100,
    trend,
  };
}

// ============================================
// JOB PROCESSORS
// ============================================

async function processCalculateHealthScore(job: Job<CalculateHealthScoreJobData>): Promise<HealthScoreResult> {
  const { applicationId, tenantSlug } = job.data;

  logger.info({ jobId: job.id, applicationId, tenantSlug }, 'Calculating health score for application');

  const result = await calculateHealthScore(tenantSlug, applicationId);

  logger.info({ jobId: job.id, applicationId, score: result.overallScore }, 'Health score calculated');

  return result;
}

async function processCalculateAllHealthScores(
  job: Job<CalculateAllHealthScoresJobData>
): Promise<{ processed: number; results: HealthScoreResult[] }> {
  const { tenantSlug } = job.data;
  const schema = tenantService.getSchemaName(tenantSlug);

  logger.info({ jobId: job.id, tenantSlug }, 'Calculating health scores for all applications');

  // Get all active applications
  const appsResult = await pool.query(`
    SELECT id FROM ${schema}.applications WHERE status = 'active'
  `);

  const results: HealthScoreResult[] = [];

  for (const app of appsResult.rows) {
    try {
      const result = await calculateHealthScore(tenantSlug, app.id);
      results.push(result);
      await job.updateProgress((results.length / appsResult.rows.length) * 100);
    } catch (error) {
      logger.error({ err: error, applicationId: app.id }, 'Failed to calculate health score');
    }
  }

  logger.info({ jobId: job.id, processed: results.length }, 'Completed health score calculation for all apps');

  return { processed: results.length, results };
}

// ============================================
// WORKER
// ============================================

export const healthScoreWorker = new Worker<CalculateHealthScoreJobData | CalculateAllHealthScoresJobData>(
  'health-scores',
  async (job) => {
    if (job.name === 'calculate-single') {
      return processCalculateHealthScore(job as Job<CalculateHealthScoreJobData>);
    } else if (job.name === 'calculate-all') {
      return processCalculateAllHealthScores(job as Job<CalculateAllHealthScoresJobData>);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 20,
      duration: 60000,
    },
  }
);

healthScoreWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, 'Health score job completed');
});

healthScoreWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Health score job failed');
});

// ============================================
// SCHEDULER
// ============================================

export async function scheduleHealthScoreCalculation(): Promise<number> {
  const { healthScoreQueue } = await import('../queues.js');

  // Get all active tenants
  const tenantsResult = await pool.query(`
    SELECT slug FROM tenants WHERE status = 'active'
  `);

  let queuedCount = 0;

  for (const tenant of tenantsResult.rows) {
    await healthScoreQueue.add(
      'calculate-all',
      { tenantSlug: tenant.slug },
      {
        jobId: `health-all-${tenant.slug}-${Date.now()}`,
      }
    );
    queuedCount++;
  }

  logger.info({ count: queuedCount }, 'Scheduled health score calculations');

  return queuedCount;
}
