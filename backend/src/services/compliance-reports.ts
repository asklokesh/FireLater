import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export type ReportType =
  | 'change_success_rate'
  | 'unauthorized_changes'
  | 'sla_breach_evidence'
  | 'emergency_change_usage'
  | 'access_recertification_status'
  | 'sod_violation_attempts';

export interface ReportParams {
  from: Date;
  to: Date;
  format?: 'json' | 'csv';
}

export interface ReportResult {
  reportType: ReportType;
  generatedAt: Date;
  params: ReportParams;
  summary: Record<string, unknown>;
  data: Record<string, unknown>[];
}

export const REPORT_TYPE_META: Record<
  ReportType,
  { label: string; description: string; frameworks: string[] }
> = {
  change_success_rate: {
    label: 'Change Success Rate',
    description: 'Percentage of changes completed without rollback or failure (SOX CC7.2 / PCI 6.4)',
    frameworks: ['SOX', 'PCI-DSS'],
  },
  unauthorized_changes: {
    label: 'Unauthorized Changes',
    description: 'Changes implemented without formal approval (SOX CC6.1 / PCI 6.4.5)',
    frameworks: ['SOX', 'PCI-DSS', 'FFIEC'],
  },
  sla_breach_evidence: {
    label: 'SLA Breach Evidence',
    description: 'Issues and requests that exceeded agreed service levels (FFIEC Operations)',
    frameworks: ['FFIEC'],
  },
  emergency_change_usage: {
    label: 'Emergency Change Usage',
    description: 'Emergency change frequency, post-implementation review status (SOX CC7.5 / FFIEC)',
    frameworks: ['SOX', 'FFIEC'],
  },
  access_recertification_status: {
    label: 'Access Recertification Status',
    description: 'Status of periodic user access reviews (SOX CC6.2 / PCI 7.1)',
    frameworks: ['SOX', 'PCI-DSS'],
  },
  sod_violation_attempts: {
    label: 'Segregation of Duties Violation Attempts',
    description: 'Denied actions due to SoD policy conflicts (SOX CC6.3 / PCI 6.4)',
    frameworks: ['SOX', 'PCI-DSS'],
  },
};

// ============================================
// SERVICE
// ============================================

export class ComplianceReportsService {
  // ------------------------------------------------
  // PUBLIC: Generate a specific report
  // ------------------------------------------------

  async generateReport(
    tenantSlug: string,
    reportType: ReportType,
    params: ReportParams
  ): Promise<ReportResult> {
    const schema = tenantService.getSchemaName(tenantSlug);

    logger.info({ tenantSlug, reportType, from: params.from, to: params.to }, 'Generating compliance report');

    switch (reportType) {
      case 'change_success_rate':
        return this.changeSuccessRate(tenantSlug, schema, params.from, params.to);
      case 'unauthorized_changes':
        return this.unauthorizedChanges(tenantSlug, schema, params.from, params.to);
      case 'sla_breach_evidence':
        return this.slaBreachEvidence(tenantSlug, schema, params.from, params.to);
      case 'emergency_change_usage':
        return this.emergencyChangeUsage(tenantSlug, schema, params.from, params.to);
      case 'access_recertification_status':
        return this.accessRecertificationStatus(tenantSlug, schema, params.from, params.to);
      case 'sod_violation_attempts':
        return this.sodViolationAttempts(tenantSlug, schema, params.from, params.to);
      default: {
        const _exhaustive: never = reportType;
        throw new Error(`Unknown report type: ${String(_exhaustive)}`);
      }
    }
  }

  // ------------------------------------------------
  // PRIVATE: Individual report generators
  // ------------------------------------------------

  private async changeSuccessRate(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      const result = await pool.query<{
        status: string;
        count: string;
      }>(
        `SELECT status, COUNT(*) AS count
         FROM ${schema}.change_requests
         WHERE created_at >= $1 AND created_at < $2
         GROUP BY status`,
        [from, to]
      );

      const rows = result.rows;
      const statusCounts: Record<string, number> = {};
      let total = 0;

      for (const row of rows) {
        statusCounts[row.status] = parseInt(row.count, 10);
        total += parseInt(row.count, 10);
      }

      const successful = (statusCounts['completed'] ?? 0) + (statusCounts['closed'] ?? 0);
      const failed = (statusCounts['failed'] ?? 0) + (statusCounts['cancelled'] ?? 0);
      const successRate = total > 0 ? Math.round((successful / total) * 10000) / 100 : 0;

      return {
        reportType: 'change_success_rate',
        generatedAt: new Date(),
        params,
        summary: {
          total,
          successful,
          failed,
          successRate,
          successRateLabel: `${successRate}%`,
        },
        data: rows.map((r) => ({
          status: r.status,
          count: parseInt(r.count, 10),
        })),
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'changeSuccessRate: query failed, returning empty');
      return this.emptyResult('change_success_rate', params);
    }
  }

  private async unauthorizedChanges(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      // Changes that went directly to 'implementing' without passing through 'approved'
      // Detect by checking if audit_logs show the transition skipped approval
      // Fallback: changes that are implementing/completed/failed but were never in 'approved' status
      // We detect these by looking at change_requests where approved_at is NULL but status is post-approval
      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           cr.id,
           cr.title,
           cr.type,
           cr.status,
           cr.created_at,
           cr.updated_at,
           cr.approved_at,
           cr.implemented_at
         FROM ${schema}.change_requests cr
         WHERE cr.created_at >= $1
           AND cr.created_at < $2
           AND cr.status IN ('implementing', 'completed', 'closed', 'failed')
           AND (cr.approved_at IS NULL OR cr.approved_by IS NULL)
         ORDER BY cr.created_at DESC`,
        [from, to]
      );

      const rows = result.rows;

      return {
        reportType: 'unauthorized_changes',
        generatedAt: new Date(),
        params,
        summary: {
          total: rows.length,
          riskLevel: rows.length === 0 ? 'low' : rows.length < 5 ? 'medium' : 'high',
        },
        data: rows,
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'unauthorizedChanges: query failed, returning empty');
      return this.emptyResult('unauthorized_changes', params);
    }
  }

  private async slaBreachEvidence(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      // Attempt to query sla_events or sla_breaches table if it exists; else fall back to issues
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'sla_breaches'
         ) AS exists`,
        [schema]
      );

      if (tableCheck.rows[0]?.exists) {
        const result = await pool.query<Record<string, unknown>>(
          `SELECT
             sb.id,
             sb.entity_type,
             sb.entity_id,
             sb.sla_policy_id,
             sb.breach_type,
             sb.breached_at,
             sb.severity
           FROM ${schema}.sla_breaches sb
           WHERE sb.breached_at >= $1 AND sb.breached_at < $2
           ORDER BY sb.breached_at DESC`,
          [from, to]
        );

        const rows = result.rows;
        return {
          reportType: 'sla_breach_evidence',
          generatedAt: new Date(),
          params,
          summary: {
            totalBreaches: rows.length,
          },
          data: rows,
        };
      }

      // Fallback: issues that are overdue (resolved_at > sla_due_at or unresolved past due date)
      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           i.id,
           i.title,
           i.priority,
           i.status,
           i.created_at,
           i.resolved_at,
           i.sla_breach_at
         FROM ${schema}.issues i
         WHERE i.created_at >= $1
           AND i.created_at < $2
           AND i.sla_breach_at IS NOT NULL
           AND (
             (i.resolved_at IS NOT NULL AND i.resolved_at > i.sla_breach_at)
             OR (i.resolved_at IS NULL AND i.sla_breach_at < NOW())
           )
         ORDER BY i.created_at DESC`,
        [from, to]
      );

      const rows = result.rows;
      return {
        reportType: 'sla_breach_evidence',
        generatedAt: new Date(),
        params,
        summary: {
          totalBreaches: rows.length,
          source: 'issues',
        },
        data: rows,
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'slaBreachEvidence: query failed, returning empty');
      return this.emptyResult('sla_breach_evidence', params);
    }
  }

  private async emergencyChangeUsage(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           cr.id,
           cr.title,
           cr.status,
           cr.risk_level,
           cr.created_at,
           cr.approved_at,
           cr.implemented_at,
           cr.completed_at,
           cr.post_review_completed_at
         FROM ${schema}.change_requests cr
         WHERE cr.type = 'emergency'
           AND cr.created_at >= $1
           AND cr.created_at < $2
         ORDER BY cr.created_at DESC`,
        [from, to]
      );

      const rows = result.rows;
      const overdueReview = rows.filter(
        (r) =>
          r['status'] === 'completed' &&
          r['post_review_completed_at'] == null
      );

      return {
        reportType: 'emergency_change_usage',
        generatedAt: new Date(),
        params,
        summary: {
          totalEmergencyChanges: rows.length,
          overduePostReview: overdueReview.length,
        },
        data: rows,
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'emergencyChangeUsage: query failed, returning empty');
      return this.emptyResult('emergency_change_usage', params);
    }
  }

  private async accessRecertificationStatus(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'recertification_campaigns'
         ) AS exists`,
        [schema]
      );

      if (!tableCheck.rows[0]?.exists) {
        logger.debug({ schema }, 'recertification_campaigns table does not exist yet, returning empty');
        return this.emptyResult('access_recertification_status', params);
      }

      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           rc.id,
           rc.name,
           rc.status,
           rc.due_date,
           rc.completed_at,
           rc.total_items,
           rc.reviewed_items,
           rc.certified_items,
           rc.revoked_items
         FROM ${schema}.recertification_campaigns rc
         WHERE rc.created_at >= $1 AND rc.created_at < $2
         ORDER BY rc.due_date ASC`,
        [from, to]
      );

      const rows = result.rows;
      const completed = rows.filter((r) => r['status'] === 'completed').length;
      const overdue = rows.filter(
        (r) => r['status'] !== 'completed' && r['due_date'] != null && new Date(r['due_date'] as string) < new Date()
      ).length;

      return {
        reportType: 'access_recertification_status',
        generatedAt: new Date(),
        params,
        summary: {
          totalCampaigns: rows.length,
          completed,
          overdue,
        },
        data: rows,
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'accessRecertificationStatus: query failed, returning empty');
      return this.emptyResult('access_recertification_status', params);
    }
  }

  private async sodViolationAttempts(
    tenantSlug: string,
    schema: string,
    from: Date,
    to: Date
  ): Promise<ReportResult> {
    const params: ReportParams = { from, to };

    try {
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'sod_evaluations'
         ) AS exists`,
        [schema]
      );

      if (!tableCheck.rows[0]?.exists) {
        logger.debug({ schema }, 'sod_evaluations table does not exist yet, returning empty');
        return this.emptyResult('sod_violation_attempts', params);
      }

      const result = await pool.query<Record<string, unknown>>(
        `SELECT
           se.id,
           se.user_id,
           se.action,
           se.decision,
           se.rule_id,
           se.evaluated_at
         FROM ${schema}.sod_evaluations se
         WHERE se.decision = 'deny'
           AND se.evaluated_at >= $1
           AND se.evaluated_at < $2
         ORDER BY se.evaluated_at DESC`,
        [from, to]
      );

      const rows = result.rows;

      return {
        reportType: 'sod_violation_attempts',
        generatedAt: new Date(),
        params,
        summary: {
          totalDenials: rows.length,
        },
        data: rows,
      };
    } catch (error) {
      logger.warn({ tenantSlug, error }, 'sodViolationAttempts: query failed, returning empty');
      return this.emptyResult('sod_violation_attempts', params);
    }
  }

  // ------------------------------------------------
  // PRIVATE: Helpers
  // ------------------------------------------------

  private emptyResult(reportType: ReportType, params: ReportParams): ReportResult {
    return {
      reportType,
      generatedAt: new Date(),
      params,
      summary: { total: 0, note: 'No data available or table not yet provisioned' },
      data: [],
    };
  }

  // ------------------------------------------------
  // PUBLIC: CSV Export
  // ------------------------------------------------

  exportToCsv(result: ReportResult): string {
    if (result.data.length === 0) {
      // Return minimal CSV with only meta headers
      const metaHeaders = ['reportType', 'generatedAt', 'from', 'to'];
      const metaValues = [
        result.reportType,
        result.generatedAt.toISOString(),
        result.params.from.toISOString(),
        result.params.to.toISOString(),
      ];
      return `${metaHeaders.join(',')}\n${metaValues.map((v) => this.csvEscape(String(v))).join(',')}`;
    }

    const headers = Object.keys(result.data[0]);
    const lines: string[] = [headers.join(',')];

    for (const row of result.data) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return this.csvEscape(JSON.stringify(val));
        return this.csvEscape(String(val));
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // ------------------------------------------------
  // PUBLIC: Schedule management
  // ------------------------------------------------

  async listSchedules(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.compliance_report_schedules ORDER BY created_at DESC`
    );

    return result.rows;
  }

  async createSchedule(
    tenantSlug: string,
    data: {
      reportType: ReportType;
      name: string;
      description?: string;
      cadence: string;
      recipients: string[];
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const nextRunAt = this.computeNextRunAt(data.cadence);

    const result = await pool.query(
      `INSERT INTO ${schema}.compliance_report_schedules
         (report_type, name, description, cadence, recipients, next_run_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        data.reportType,
        data.name,
        data.description ?? null,
        data.cadence,
        JSON.stringify(data.recipients),
        nextRunAt,
      ]
    );

    logger.info({ tenantSlug, scheduleId: result.rows[0]?.id }, 'Compliance report schedule created');
    return result.rows[0];
  }

  async updateSchedule(
    tenantSlug: string,
    id: string,
    data: Partial<{ cadence: string; recipients: string[]; isActive: boolean; description: string }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (data.cadence !== undefined) {
      setClauses.push(`cadence = $${paramIndex++}`);
      params.push(data.cadence);
      // Recompute next_run_at when cadence changes
      setClauses.push(`next_run_at = $${paramIndex++}`);
      params.push(this.computeNextRunAt(data.cadence));
    }

    if (data.recipients !== undefined) {
      setClauses.push(`recipients = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(data.recipients));
    }

    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }

    const result = await pool.query(
      `UPDATE ${schema}.compliance_report_schedules
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );

    return result.rows[0] ?? null;
  }

  async recordRun(
    tenantSlug: string,
    scheduleId: string | null,
    reportType: ReportType,
    result: ReportResult | null,
    error?: string
  ): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const status = error ? 'failed' : 'completed';
    const resultSummary = result ? JSON.stringify(result.summary) : null;

    const insertResult = await pool.query(
      `INSERT INTO ${schema}.compliance_report_runs
         (schedule_id, report_type, status, parameters, result_summary, completed_at, error_message)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW(), $6)
       RETURNING id`,
      [
        scheduleId,
        reportType,
        status,
        result ? JSON.stringify({ from: result.params.from, to: result.params.to }) : '{}',
        resultSummary,
        error ?? null,
      ]
    );

    // Update last_run_at on the schedule
    if (scheduleId) {
      await pool.query(
        `UPDATE ${schema}.compliance_report_schedules
         SET last_run_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [scheduleId]
      );
    }

    return insertResult.rows[0].id as string;
  }

  async listRuns(tenantSlug: string, limit = 50): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT r.*, s.name AS schedule_name
       FROM ${schema}.compliance_report_runs r
       LEFT JOIN ${schema}.compliance_report_schedules s ON s.id = r.schedule_id
       ORDER BY r.started_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  // ------------------------------------------------
  // PRIVATE: Next run computation
  // ------------------------------------------------

  private computeNextRunAt(cadence: string): Date {
    const now = new Date();

    switch (cadence) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'quarterly':
        return new Date(now.getTime() + 91 * 24 * 60 * 60 * 1000);
      case 'monthly':
      default:
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  }
}

export const complianceReportsService = new ComplianceReportsService();
