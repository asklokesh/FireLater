import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { complianceReportsService, type ReportType } from '../services/compliance-reports.js';

// ============================================
// COMPLIANCE REPORT SCHEDULER
// Runs daily to find and execute due schedules
// ============================================

interface DueSchedule {
  id: string;
  tenant_slug: string;
  report_type: string;
  name: string;
  cadence: string;
  recipients: string[];
}

/**
 * Query all active compliance report schedules that are due to run.
 * Joins with the public.tenants table to get tenant slugs.
 */
async function getDueSchedules(): Promise<DueSchedule[]> {
  // Compliance schedules are per-tenant-schema, so we iterate tenants
  const tenantsResult = await pool.query<{ slug: string }>(
    `SELECT slug FROM public.tenants WHERE status = 'active'`
  );

  const due: DueSchedule[] = [];

  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      // Check if the table exists in this schema (may not if migration hasn't run)
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'compliance_report_schedules'
         ) AS exists`,
        [schema]
      );

      if (!tableCheck.rows[0]?.exists) continue;

      const schedulesResult = await pool.query<{
        id: string;
        report_type: string;
        name: string;
        cadence: string;
        recipients: string[];
      }>(
        `SELECT id, report_type, name, cadence, recipients
         FROM ${schema}.compliance_report_schedules
         WHERE is_active = true
           AND (next_run_at IS NULL OR next_run_at <= NOW())`,
      );

      for (const row of schedulesResult.rows) {
        due.push({ ...row, tenant_slug: tenant.slug });
      }
    } catch (err) {
      logger.warn({ tenantSlug: tenant.slug, err }, 'Failed to query compliance schedules for tenant');
    }
  }

  return due;
}

/**
 * Execute a single due schedule and record the run result.
 */
async function executeSchedule(schedule: DueSchedule): Promise<void> {
  const { id, tenant_slug: tenantSlug, report_type: reportType, name, cadence } = schedule;

  logger.info({ scheduleId: id, tenantSlug, reportType, name }, 'Running due compliance report schedule');

  // Default window: last calendar month
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);

  switch (cadence) {
    case 'daily':
      from.setDate(from.getDate() - 1);
      break;
    case 'weekly':
      from.setDate(from.getDate() - 7);
      break;
    case 'quarterly':
      from.setDate(from.getDate() - 91);
      break;
    case 'monthly':
    default:
      from.setDate(from.getDate() - 30);
  }

  try {
    const result = await complianceReportsService.generateReport(tenantSlug, reportType as ReportType, {
      from,
      to,
    });

    await complianceReportsService.recordRun(tenantSlug, id, reportType as ReportType, result);

    logger.info(
      { scheduleId: id, tenantSlug, reportType, rowCount: result.data.length },
      'Compliance report schedule executed successfully'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ scheduleId: id, tenantSlug, reportType, err: error }, 'Compliance report schedule failed');

    try {
      await complianceReportsService.recordRun(tenantSlug, id, reportType as ReportType, null, errorMsg);
    } catch (recordErr) {
      logger.error({ scheduleId: id, err: recordErr }, 'Failed to record compliance run error');
    }
  }
}

// ============================================
// EXPORTED SCHEDULER FUNCTION
// Called from jobs/scheduler.ts on a daily interval
// ============================================

export async function scheduleComplianceReports(): Promise<number> {
  logger.debug('Checking for due compliance report schedules');

  let executedCount = 0;

  try {
    const due = await getDueSchedules();

    if (due.length === 0) {
      logger.debug('No compliance report schedules are due');
      return 0;
    }

    logger.info({ count: due.length }, 'Found due compliance report schedules');

    // Run them sequentially to avoid DB overload
    for (const schedule of due) {
      await executeSchedule(schedule);
      executedCount++;
    }
  } catch (error) {
    logger.error({ err: error }, 'Compliance report scheduler encountered an error');
  }

  return executedCount;
}
