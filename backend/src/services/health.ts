import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import { getOffset } from '../utils/pagination.js';
import { cacheService } from '../utils/cache.js';
import type { PaginationParams } from '../types/index.js';

// Cache TTLs (in seconds)
const CACHE_TTL = {
  config: 900, // 15 minutes - admin-configured, rarely changes
  scores: 300, // 5 minutes - health scores update moderately
  summary: 180, // 3 minutes - summary can be fresher for dashboards
};

interface HealthScoreConfig {
  tier: string;
  tierWeight: number;
  criticalThreshold: number;
  warningThreshold: number;
  goodThreshold: number;
  criticalIssuePenalty: number;
  highIssuePenalty: number;
  mediumIssuePenalty: number;
  lowIssuePenalty: number;
  issueWeight: number;
  changeWeight: number;
  slaWeight: number;
  uptimeWeight: number;
}

// ============================================
// HEALTH SCORE CONFIG SERVICE
// ============================================

class HealthScoreConfigService {
  async list(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:health:config:list`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const result = await pool.query(
          `SELECT * FROM ${schema}.health_score_config ORDER BY tier_weight DESC`
        );
        return result.rows;
      },
      { ttl: CACHE_TTL.config }
    );
  }

  async findByTier(tenantSlug: string, tier: string): Promise<HealthScoreConfig | null> {
    const cacheKey = `${tenantSlug}:health:config:tier:${tier}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const result = await pool.query(
          `SELECT * FROM ${schema}.health_score_config WHERE tier = $1`,
          [tier]
        );
        return result.rows[0] as HealthScoreConfig || null;
      },
      { ttl: CACHE_TTL.config }
    );
  }

  async update(
    tenantSlug: string,
    tier: string,
    data: Partial<{
      criticalThreshold: number;
      warningThreshold: number;
      goodThreshold: number;
      criticalIssuePenalty: number;
      highIssuePenalty: number;
      mediumIssuePenalty: number;
      lowIssuePenalty: number;
      issueWeight: number;
      changeWeight: number;
      slaWeight: number;
      uptimeWeight: number;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Bypass cache for existence check during update
    const existResult = await pool.query(
      `SELECT * FROM ${schema}.health_score_config WHERE tier = $1`,
      [tier]
    );
    const existing = existResult.rows[0] as HealthScoreConfig || null;

    if (!existing) {
      throw new NotFoundError('Health score config', tier);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      criticalThreshold: 'critical_threshold',
      warningThreshold: 'warning_threshold',
      goodThreshold: 'good_threshold',
      criticalIssuePenalty: 'critical_issue_penalty',
      highIssuePenalty: 'high_issue_penalty',
      mediumIssuePenalty: 'medium_issue_penalty',
      lowIssuePenalty: 'low_issue_penalty',
      issueWeight: 'issue_weight',
      changeWeight: 'change_weight',
      slaWeight: 'sla_weight',
      uptimeWeight: 'uptime_weight',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(tier);

    const result = await pool.query(
      `UPDATE ${schema}.health_score_config SET ${fields.join(', ')} WHERE tier = $${paramIndex} RETURNING *`,
      values
    );

    // Invalidate health config cache
    await cacheService.invalidateTenant(tenantSlug, 'health');

    return result.rows[0];
  }
}

// ============================================
// HEALTH SCORE SERVICE
// ============================================

class HealthScoreService {
  async getLatestForApplication(tenantSlug: string, applicationId: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.app_health_scores
       WHERE application_id = $1
       ORDER BY calculated_at DESC
       LIMIT 1`,
      [applicationId]
    );
    return result.rows[0] || null;
  }

  async getHistoryForApplication(
    tenantSlug: string,
    applicationId: string,
    days: number = 30
  ): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.app_health_scores
       WHERE application_id = $1
       AND calculated_at >= NOW() - $2 * INTERVAL '1 day'
       ORDER BY calculated_at DESC`,
      [applicationId, days]
    );
    return result.rows;
  }

  async calculateForApplication(tenantSlug: string, applicationId: string, _userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get application with tier
    const appResult = await pool.query(
      `SELECT a.*, COALESCE(a.tier, 'P3') as tier FROM ${schema}.applications a WHERE id = $1`,
      [applicationId]
    );

    if (appResult.rows.length === 0) {
      throw new NotFoundError('Application', applicationId);
    }

    const app = appResult.rows[0];
    const tier = app.tier;

    // Get tier config
    const config = await healthScoreConfigService.findByTier(tenantSlug, tier);
    const tierWeight = config?.tierWeight || 1.0;
    const issueWeight = config?.issueWeight || 0.40;
    const changeWeight = config?.changeWeight || 0.25;
    const slaWeight = config?.slaWeight || 0.25;
    const uptimeWeight = config?.uptimeWeight || 0.10;

    // Calculate issue score (0-100)
    const issueStats = await this.getIssueStats(schema, applicationId);
    let issueScore = 100;
    issueScore -= (issueStats.critical * (config?.criticalIssuePenalty || 15));
    issueScore -= (issueStats.high * (config?.highIssuePenalty || 8));
    issueScore -= (issueStats.medium * (config?.mediumIssuePenalty || 3));
    issueScore -= (issueStats.low * (config?.lowIssuePenalty || 1));
    issueScore = Math.max(0, Math.min(100, issueScore));

    // Calculate change score (0-100)
    const changeStats = await this.getChangeStats(schema, applicationId);
    let changeScore = 100;
    if (changeStats.total > 0) {
      const failureRate = (changeStats.failed + changeStats.rolledBack) / changeStats.total;
      changeScore = (1 - failureRate) * 100;
    }
    changeScore = Math.max(0, Math.min(100, changeScore));

    // Calculate SLA score (0-100) from actual breach data
    const slaStats = await this.getSlaStats(schema, applicationId);
    let slaScore = 100;
    if (slaStats.total > 0) {
      // SLA score is the percentage of issues that met SLA
      slaScore = ((slaStats.total - slaStats.breached) / slaStats.total) * 100;
    }
    slaScore = Math.max(0, Math.min(100, slaScore));

    // Calculate uptime score from cloud resources and health checks
    const uptimeScore = await this.getUptimeScore(schema, applicationId);

    // Calculate overall score with tier adjustment
    const rawScore = (
      (issueScore * issueWeight) +
      (changeScore * changeWeight) +
      (slaScore * slaWeight) +
      (uptimeScore * uptimeWeight)
    );

    // Apply tier weight (higher tier = more penalty for low scores)
    const overallScore = Math.max(0, Math.min(100, rawScore / tierWeight));

    // Get previous score for trend
    const previousScore = await this.getLatestForApplication(tenantSlug, applicationId) as Record<string, unknown> | null;
    const scoreChange = previousScore ? overallScore - (previousScore.overall_score as number) : 0;
    let trend = 'stable';
    if (scoreChange > 5) trend = 'improving';
    else if (scoreChange < -5) trend = 'declining';

    // Insert new score
    const result = await pool.query(
      `INSERT INTO ${schema}.app_health_scores (
        application_id, overall_score,
        issue_score, change_score, sla_score, uptime_score,
        issue_weight, change_weight, sla_weight, uptime_weight,
        issues_30d, critical_issues_30d, high_issues_30d,
        total_changes_30d, failed_changes_30d, rolled_back_changes_30d,
        sla_breaches_30d, total_sla_tracked_30d, uptime_percent_30d,
        tier, tier_weight, score_change, trend
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        applicationId, overallScore,
        issueScore, changeScore, slaScore, uptimeScore,
        issueWeight, changeWeight, slaWeight, uptimeWeight,
        issueStats.total, issueStats.critical, issueStats.high,
        changeStats.total, changeStats.failed, changeStats.rolledBack,
        0, 0, uptimeScore,
        tier, tierWeight, scoreChange, trend,
      ]
    );

    // Invalidate health scores cache after new score is calculated
    await cacheService.invalidateTenant(tenantSlug, 'health');

    return result.rows[0];
  }

  private async getIssueStats(schema: string, applicationId: string): Promise<{
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }> {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE priority = 'critical') as critical,
         COUNT(*) FILTER (WHERE priority = 'high') as high,
         COUNT(*) FILTER (WHERE priority = 'medium') as medium,
         COUNT(*) FILTER (WHERE priority = 'low') as low,
         COUNT(*) as total
       FROM ${schema}.issues
       WHERE application_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [applicationId]
    );

    return {
      total: parseInt(result.rows[0].total, 10),
      critical: parseInt(result.rows[0].critical, 10),
      high: parseInt(result.rows[0].high, 10),
      medium: parseInt(result.rows[0].medium, 10),
      low: parseInt(result.rows[0].low, 10),
    };
  }

  private async getChangeStats(schema: string, applicationId: string): Promise<{
    total: number;
    failed: number;
    rolledBack: number;
  }> {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'failed') as failed,
         COUNT(*) FILTER (WHERE outcome = 'rolled_back') as rolled_back,
         COUNT(*) as total
       FROM ${schema}.change_requests
       WHERE application_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'
       AND status IN ('completed', 'failed', 'rolled_back')`,
      [applicationId]
    );

    return {
      total: parseInt(result.rows[0].total, 10),
      failed: parseInt(result.rows[0].failed, 10),
      rolledBack: parseInt(result.rows[0].rolled_back, 10),
    };
  }

  private async getSlaStats(schema: string, applicationId: string): Promise<{
    total: number;
    breached: number;
  }> {
    // Get SLA breach stats for issues related to this application
    const result = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE sla_breached = true) as breached
       FROM ${schema}.issues
       WHERE application_id = $1
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [applicationId]
    );

    return {
      total: parseInt(result.rows[0].total, 10) || 0,
      breached: parseInt(result.rows[0].breached, 10) || 0,
    };
  }

  private async getUptimeScore(schema: string, applicationId: string): Promise<number> {
    // Try to get uptime from cloud resources associated with this application
    // First check if there are health check results
    try {
      const healthResult = await pool.query(
        `SELECT
           COUNT(*) as total_checks,
           COUNT(*) FILTER (WHERE status = 'healthy') as healthy_checks
         FROM ${schema}.cloud_resources cr
         WHERE cr.application_id = $1
         AND cr.is_deleted = false
         AND cr.last_seen >= NOW() - INTERVAL '30 days'`,
        [applicationId]
      );

      const totalChecks = parseInt(healthResult.rows[0].total_checks, 10) || 0;
      const healthyChecks = parseInt(healthResult.rows[0].healthy_checks, 10) || 0;

      if (totalChecks > 0) {
        return (healthyChecks / totalChecks) * 100;
      }

      // If no cloud resources, try to calculate from issue downtime
      const downtimeResult = await pool.query(
        `SELECT
           COALESCE(SUM(
             CASE WHEN status IN ('resolved', 'closed')
             THEN EXTRACT(EPOCH FROM (resolved_at - created_at))
             ELSE EXTRACT(EPOCH FROM (NOW() - created_at))
             END
           ), 0) as total_downtime_seconds
         FROM ${schema}.issues
         WHERE application_id = $1
         AND priority IN ('critical', 'high')
         AND created_at >= NOW() - INTERVAL '30 days'
         AND (title ILIKE '%outage%' OR title ILIKE '%down%' OR title ILIKE '%unavailable%')`,
        [applicationId]
      );

      const downtimeSeconds = parseFloat(downtimeResult.rows[0].total_downtime_seconds) || 0;
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

      if (downtimeSeconds > 0) {
        const uptimePercent = ((thirtyDaysInSeconds - downtimeSeconds) / thirtyDaysInSeconds) * 100;
        return Math.max(0, Math.min(100, uptimePercent));
      }
    } catch (_error) {
      // If tables don't exist or query fails, return default
    }

    // Default to 99.9% if no data available (assume application is up)
    return 99.9;
  }

  async listAllScores(
    tenantSlug: string,
    pagination: PaginationParams
  ): Promise<{ scores: unknown[]; total: number }> {
    const cacheKey = `${tenantSlug}:health:scores:list:${JSON.stringify(pagination)}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(pagination);

        // Get latest score per application
        const countResult = await pool.query(
          `SELECT COUNT(DISTINCT application_id) FROM ${schema}.app_health_scores`
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT DISTINCT ON (h.application_id) h.*, a.name as application_name, a.tier
           FROM ${schema}.app_health_scores h
           JOIN ${schema}.applications a ON h.application_id = a.id
           ORDER BY h.application_id, h.calculated_at DESC
           LIMIT $1 OFFSET $2`,
          [pagination.perPage, offset]
        );

        return { scores: result.rows, total };
      },
      { ttl: CACHE_TTL.scores }
    );
  }

  async getSummary(tenantSlug: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:health:summary`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `WITH latest_scores AS (
             SELECT DISTINCT ON (application_id) *
             FROM ${schema}.app_health_scores
             ORDER BY application_id, calculated_at DESC
           )
           SELECT
             COUNT(*) as total_apps,
             COUNT(*) FILTER (WHERE overall_score >= 90) as excellent,
             COUNT(*) FILTER (WHERE overall_score >= 75 AND overall_score < 90) as good,
             COUNT(*) FILTER (WHERE overall_score >= 50 AND overall_score < 75) as warning,
             COUNT(*) FILTER (WHERE overall_score < 50) as critical,
             AVG(overall_score) as average_score
           FROM latest_scores`
        );

        return result.rows[0];
      },
      { ttl: CACHE_TTL.summary }
    );
  }
}

export const healthScoreConfigService = new HealthScoreConfigService();
export const healthScoreService = new HealthScoreService();
