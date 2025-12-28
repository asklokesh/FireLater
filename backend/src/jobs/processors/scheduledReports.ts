import { Job, Worker } from 'bullmq';
import { config } from '../../config/index.js';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { reportExecutionService, scheduledReportService } from '../../services/reporting.js';

// Redis connection for worker
const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// ============================================
// JOB DATA TYPES
// ============================================

export interface ScheduledReportJobData {
  scheduledReportId: string;
  tenantSlug: string;
}

export interface ExecuteReportJobData {
  templateId: string;
  tenantSlug: string;
  userId: string;
  parameters?: Record<string, unknown>;
  format?: 'json' | 'csv' | 'pdf';
}

// ============================================
// SCHEDULED REPORT PROCESSOR
// ============================================

async function processScheduledReport(job: Job<ScheduledReportJobData>): Promise<unknown> {
  const { scheduledReportId, tenantSlug } = job.data;

  logger.info({ jobId: job.id, scheduledReportId, tenantSlug }, 'Processing scheduled report');

  try {
    // Get scheduled report details
    const scheduledReport = await scheduledReportService.getById(tenantSlug, scheduledReportId);
    if (!scheduledReport) {
      throw new Error(`Scheduled report not found: ${scheduledReportId}`);
    }

    if (!scheduledReport.is_active) {
      logger.info({ scheduledReportId }, 'Scheduled report is inactive, skipping');
      return { skipped: true, reason: 'inactive' };
    }

    // Execute the report
    const result = await reportExecutionService.execute(
      tenantSlug,
      scheduledReport.created_by as string,
      scheduledReport.template_id as string,
      {
        filters: scheduledReport.parameters as Record<string, unknown> | undefined,
        outputFormat: (scheduledReport.output_format as string) || 'json',
      }
    );

    // Update last run time
    await scheduledReportService.updateLastRun(tenantSlug, scheduledReportId);

    logger.info(
      { jobId: job.id, scheduledReportId, executionId: (result as { execution: { id: string } }).execution.id },
      'Scheduled report executed successfully'
    );

    return {
      success: true,
      executionId: (result as { execution: { id: string } }).execution.id,
    };
  } catch (error) {
    logger.error({ err: error, jobId: job.id, scheduledReportId }, 'Failed to process scheduled report');
    throw error;
  }
}

// ============================================
// REPORT EXECUTION PROCESSOR
// ============================================

async function processReportExecution(job: Job<ExecuteReportJobData>): Promise<unknown> {
  const { templateId, tenantSlug, userId, parameters, format } = job.data;

  logger.info({ jobId: job.id, templateId, tenantSlug }, 'Processing report execution');

  try {
    const result = await reportExecutionService.execute(tenantSlug, userId, templateId, {
      filters: parameters,
      outputFormat: format,
    });

    logger.info(
      { jobId: job.id, executionId: (result as { execution: { id: string } }).execution.id },
      'Report execution completed'
    );

    return result;
  } catch (error) {
    logger.error({ err: error, jobId: job.id, templateId }, 'Failed to execute report');
    throw error;
  }
}

// ============================================
// WORKER
// ============================================

export const scheduledReportsWorker = new Worker<ScheduledReportJobData | ExecuteReportJobData>(
  'scheduled-reports',
  async (job) => {
    if (job.name === 'execute-scheduled') {
      return processScheduledReport(job as Job<ScheduledReportJobData>);
    } else if (job.name === 'execute-report') {
      return processReportExecution(job as Job<ExecuteReportJobData>);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
);

scheduledReportsWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id, jobName: job.name }, 'Report job completed');
});

scheduledReportsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Report job failed');
});

// ============================================
// SCHEDULER: Queue scheduled reports
// ============================================

export async function queueDueScheduledReports(): Promise<number> {
  const { scheduledReportsQueue } = await import('../queues.js');

  // Get all tenants
  const tenantsResult = await pool.query(`
    SELECT slug FROM tenants WHERE status = 'active'
  `);

  let queuedCount = 0;

  for (const tenant of tenantsResult.rows) {
    const tenantSlug = tenant.slug;

    // Get due scheduled reports
    const dueReports = await scheduledReportService.getDueReports(tenantSlug);

    for (const report of dueReports) {
      await scheduledReportsQueue.add(
        'execute-scheduled',
        {
          scheduledReportId: report.id,
          tenantSlug,
        },
        {
          jobId: `scheduled-${report.id}-${Date.now()}`,
        }
      );
      queuedCount++;
    }
  }

  if (queuedCount > 0) {
    logger.info({ count: queuedCount }, 'Queued scheduled reports');
  }

  return queuedCount;
}
