import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { cacheService } from '../utils/cache.js';

// ============================================
// DASHBOARD AGGREGATION SERVICE
// ============================================

// Cache TTLs (in seconds)
const CACHE_TTL = {
  overview: 300, // 5 minutes - main dashboard data
  trends: 600, // 10 minutes - historical trends change slowly
  distribution: 300, // 5 minutes - aggregated stats
  activity: 60, // 1 minute - recent activity should be fresh
  mobile: 180, // 3 minutes - mobile summary
};

class DashboardService {
  /**
   * Get overview statistics for the main dashboard
   */
  async getOverview(tenantSlug: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:dashboard:overview`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchOverview(tenantSlug),
      { ttl: CACHE_TTL.overview }
    );
  }

  private async _fetchOverview(tenantSlug: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const [
      issuesResult,
      changesResult,
      requestsResult,
      healthResult,
      applicationsResult,
    ] = await Promise.all([
      // Open issues count
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed')) as critical_open
        FROM ${schema}.issues
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      // Changes this month
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
          COUNT(*) FILTER (WHERE status = 'implementing') as in_progress
        FROM ${schema}.change_requests
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      // Pending requests
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('submitted', 'pending_approval', 'in_progress')) as pending
        FROM ${schema}.service_requests
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      // Health score summary
      pool.query(`
        WITH latest_scores AS (
          SELECT DISTINCT ON (application_id) *
          FROM ${schema}.app_health_scores
          ORDER BY application_id, calculated_at DESC
        )
        SELECT
          ROUND(AVG(overall_score), 1) as avg_score,
          COUNT(*) FILTER (WHERE overall_score < 50) as critical
        FROM latest_scores
      `),
      // Application count
      pool.query(`
        SELECT COUNT(*) as total FROM ${schema}.applications WHERE status = 'active'
      `),
    ]);

    return {
      issues: issuesResult.rows[0],
      changes: changesResult.rows[0],
      requests: requestsResult.rows[0],
      health: healthResult.rows[0],
      applications: applicationsResult.rows[0],
    };
  }

  /**
   * Get issue trends for chart display
   */
  async getIssueTrends(tenantSlug: string, days: number = 30): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:trends:issues:${days}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchIssueTrends(tenantSlug, days),
      { ttl: CACHE_TTL.trends }
    );
  }

  private async _fetchIssueTrends(tenantSlug: string, days: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) as resolved
      FROM ${schema}.issues
      WHERE created_at >= NOW() - $1 * INTERVAL '1 day'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);

    return result.rows;
  }

  /**
   * Get issues by priority distribution
   */
  async getIssuesByPriority(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:issues:by-priority`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchIssuesByPriority(tenantSlug),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchIssuesByPriority(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        priority,
        COUNT(*) as count
      FROM ${schema}.issues
      WHERE status NOT IN ('resolved', 'closed')
      GROUP BY priority
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `);

    return result.rows;
  }

  /**
   * Get issues by status distribution
   */
  async getIssuesByStatus(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:issues:by-status`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchIssuesByStatus(tenantSlug),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchIssuesByStatus(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM ${schema}.issues
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC
    `);

    return result.rows;
  }

  /**
   * Get change success rate over time
   */
  async getChangeSuccessRate(tenantSlug: string, days: number = 30): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:trends:changes:${days}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchChangeSuccessRate(tenantSlug, days),
      { ttl: CACHE_TTL.trends }
    );
  }

  private async _fetchChangeSuccessRate(tenantSlug: string, days: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE outcome = 'success') as success,
        COUNT(*) FILTER (WHERE outcome IN ('failed', 'rolled_back')) as failed,
        ROUND(
          COUNT(*) FILTER (WHERE outcome = 'success')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed'))::numeric, 0) * 100,
          1
        ) as success_rate
      FROM ${schema}.change_requests
      WHERE created_at >= NOW() - $1 * INTERVAL '1 day'
      AND status IN ('completed', 'failed')
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);

    return result.rows;
  }

  /**
   * Get health score distribution across applications
   */
  async getHealthDistribution(tenantSlug: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:dashboard:health:distribution`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchHealthDistribution(tenantSlug),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchHealthDistribution(tenantSlug: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      WITH latest_scores AS (
        SELECT DISTINCT ON (h.application_id) h.*, a.name as app_name, a.tier
        FROM ${schema}.app_health_scores h
        JOIN ${schema}.applications a ON h.application_id = a.id
        ORDER BY h.application_id, h.calculated_at DESC
      )
      SELECT
        COUNT(*) FILTER (WHERE overall_score >= 90) as excellent,
        COUNT(*) FILTER (WHERE overall_score >= 75 AND overall_score < 90) as good,
        COUNT(*) FILTER (WHERE overall_score >= 50 AND overall_score < 75) as warning,
        COUNT(*) FILTER (WHERE overall_score < 50) as critical
      FROM latest_scores
    `);

    return result.rows[0];
  }

  /**
   * Get health scores by tier
   */
  async getHealthByTier(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:health:by-tier`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchHealthByTier(tenantSlug),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchHealthByTier(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      WITH latest_scores AS (
        SELECT DISTINCT ON (h.application_id) h.*, a.tier
        FROM ${schema}.app_health_scores h
        JOIN ${schema}.applications a ON h.application_id = a.id
        ORDER BY h.application_id, h.calculated_at DESC
      )
      SELECT
        tier,
        COUNT(*) as count,
        ROUND(AVG(overall_score), 1) as avg_score,
        MIN(overall_score) as min_score,
        MAX(overall_score) as max_score
      FROM latest_scores
      GROUP BY tier
      ORDER BY
        CASE tier
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          WHEN 'P4' THEN 4
        END
    `);

    return result.rows;
  }

  /**
   * Get top critical applications (lowest health scores)
   */
  async getCriticalApplications(tenantSlug: string, limit: number = 5): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:health:critical:${limit}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchCriticalApplications(tenantSlug, limit),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchCriticalApplications(tenantSlug: string, limit: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      WITH latest_scores AS (
        SELECT DISTINCT ON (h.application_id) h.*, a.name as app_name, a.tier
        FROM ${schema}.app_health_scores h
        JOIN ${schema}.applications a ON h.application_id = a.id
        ORDER BY h.application_id, h.calculated_at DESC
      )
      SELECT
        application_id,
        app_name,
        tier,
        overall_score,
        issue_score,
        change_score,
        trend
      FROM latest_scores
      WHERE overall_score < 75
      ORDER BY overall_score ASC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get request volume by catalog item
   */
  async getRequestsByItem(tenantSlug: string, limit: number = 10): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:requests:by-item:${limit}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchRequestsByItem(tenantSlug, limit),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchRequestsByItem(tenantSlug: string, limit: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        ci.name as item_name,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE sr.status = 'completed') as completed,
        ROUND(
          COUNT(*) FILTER (WHERE sr.status = 'completed')::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100,
          1
        ) as completion_rate
      FROM ${schema}.service_requests sr
      JOIN ${schema}.catalog_items ci ON sr.catalog_item_id = ci.id
      WHERE sr.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY ci.id, ci.name
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get upcoming scheduled changes
   */
  async getUpcomingChanges(tenantSlug: string, days: number = 7): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:changes:upcoming:${days}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchUpcomingChanges(tenantSlug, days),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchUpcomingChanges(tenantSlug: string, days: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        cr.id,
        cr.change_number as reference_id,
        cr.title,
        cr.risk_level,
        cr.planned_start as scheduled_start,
        cr.planned_end as scheduled_end,
        a.name as application_name
      FROM ${schema}.change_requests cr
      LEFT JOIN ${schema}.applications a ON cr.application_id = a.id
      WHERE cr.status = 'scheduled'
      AND cr.planned_start BETWEEN NOW() AND NOW() + $1 * INTERVAL '1 day'
      ORDER BY cr.planned_start
    `, [days]);

    return result.rows;
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(tenantSlug: string, limit: number = 20): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:activity:recent:${limit}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchRecentActivity(tenantSlug, limit),
      { ttl: CACHE_TTL.activity }
    );
  }

  private async _fetchRecentActivity(tenantSlug: string, limit: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Union of recent activities from different tables
    const result = await pool.query(`
      (
        SELECT
          'issue' as type,
          id,
          issue_number as reference_id,
          title,
          status,
          created_at,
          'created' as action
        FROM ${schema}.issues
        WHERE created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      )
      UNION ALL
      (
        SELECT
          'change' as type,
          id,
          change_number as reference_id,
          title,
          status,
          created_at,
          'created' as action
        FROM ${schema}.change_requests
        WHERE created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      )
      UNION ALL
      (
        SELECT
          'request' as type,
          id,
          request_number as reference_id,
          'Service Request' as title,
          status,
          created_at,
          'created' as action
        FROM ${schema}.service_requests
        WHERE created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      )
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get SLA compliance metrics
   */
  async getSlaCompliance(tenantSlug: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:dashboard:sla:compliance`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchSlaCompliance(tenantSlug),
      { ttl: CACHE_TTL.distribution }
    );
  }

  private async _fetchSlaCompliance(tenantSlug: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        priority,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sla_breached = false OR sla_breached IS NULL) as within_sla,
        COUNT(*) FILTER (WHERE sla_breached = true) as breached,
        ROUND(
          COUNT(*) FILTER (WHERE sla_breached = false OR sla_breached IS NULL)::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100,
          1
        ) as compliance_rate
      FROM ${schema}.issues
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY priority
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `);

    return result.rows;
  }

  /**
   * Get cloud cost trends
   */
  async getCloudCostTrends(tenantSlug: string, months: number = 6): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:dashboard:cloud:costs:${months}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchCloudCostTrends(tenantSlug, months),
      { ttl: CACHE_TTL.trends }
    );
  }

  private async _fetchCloudCostTrends(tenantSlug: string, months: number): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(`
      SELECT
        period_start as month,
        SUM(total_cost) as total_cost,
        AVG(cost_change_percent) as avg_change_percent
      FROM ${schema}.cloud_cost_reports
      WHERE period_type = 'monthly'
      AND period_start >= NOW() - $1 * INTERVAL '1 month'
      GROUP BY period_start
      ORDER BY period_start
    `, [months]);

    return result.rows;
  }

  /**
   * Get mobile-optimized summary data
   */
  async getMobileSummary(tenantSlug: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:dashboard:mobile:summary`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this._fetchMobileSummary(tenantSlug),
      { ttl: CACHE_TTL.mobile }
    );
  }

  private async _fetchMobileSummary(tenantSlug: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const [issues, changes, requests, health] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as open,
          COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed')) as critical
        FROM ${schema}.issues
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('scheduled', 'implementing')) as active
        FROM ${schema}.change_requests
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('submitted', 'pending_approval', 'in_progress')) as pending
        FROM ${schema}.service_requests
      `),
      pool.query(`
        WITH latest AS (
          SELECT DISTINCT ON (application_id) overall_score
          FROM ${schema}.app_health_scores
          ORDER BY application_id, calculated_at DESC
        )
        SELECT
          ROUND(AVG(overall_score), 0) as avg_score,
          COUNT(*) FILTER (WHERE overall_score < 50) as critical_apps
        FROM latest
      `),
    ]);

    return {
      openIssues: parseInt(issues.rows[0].open, 10) || 0,
      criticalIssues: parseInt(issues.rows[0].critical, 10) || 0,
      activeChanges: parseInt(changes.rows[0].active, 10) || 0,
      pendingRequests: parseInt(requests.rows[0].pending, 10) || 0,
      avgHealthScore: parseFloat(health.rows[0].avg_score) || 0,
      criticalApps: parseInt(health.rows[0].critical_apps, 10) || 0,
    };
  }

  /**
   * Invalidate dashboard cache for a specific tenant
   * Call this when data changes that affect dashboard metrics
   */
  async invalidateCache(tenantSlug: string, category?: 'issues' | 'changes' | 'requests' | 'health' | 'all'): Promise<void> {
    if (category && category !== 'all') {
      // Invalidate specific category
      await cacheService.invalidate(`cache:${tenantSlug}:dashboard:*${category}*`);
    } else {
      // Invalidate all dashboard data for tenant
      await cacheService.invalidate(`cache:${tenantSlug}:dashboard:*`);
    }
  }
}

export const dashboardService = new DashboardService();
