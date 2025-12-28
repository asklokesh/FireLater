import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import { getOffset } from '../utils/pagination.js';
import type { PaginationParams } from '../types/index.js';

// ============================================
// REPORT TEMPLATE SERVICE
// ============================================

interface ReportTemplateData {
  name: string;
  description?: string;
  reportType: string;
  queryConfig?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  groupings?: string[];
  metrics?: string[];
  chartConfig?: Record<string, unknown>;
  outputFormat?: string;
  includeCharts?: boolean;
  isPublic?: boolean;
}

class ReportTemplateService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { reportType?: string; isPublic?: boolean }
  ): Promise<{ templates: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE is_active = true';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.reportType) {
      whereClause += ` AND report_type = $${paramIndex++}`;
      values.push(filters.reportType);
    }
    if (filters?.isPublic !== undefined) {
      whereClause += ` AND is_public = $${paramIndex++}`;
      values.push(filters.isPublic);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.report_templates ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(pagination.perPage, offset);
    const result = await pool.query(
      `SELECT rt.*, u.name as created_by_name
       FROM ${schema}.report_templates rt
       LEFT JOIN ${schema}.users u ON rt.created_by = u.id
       ${whereClause}
       ORDER BY rt.name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return { templates: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT rt.*, u.name as created_by_name
       FROM ${schema}.report_templates rt
       LEFT JOIN ${schema}.users u ON rt.created_by = u.id
       WHERE rt.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(tenantSlug: string, userId: string, data: ReportTemplateData): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.report_templates (
        name, description, report_type,
        query_config, filters, groupings, metrics, chart_config,
        output_format, include_charts, is_public, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.reportType,
        JSON.stringify(data.queryConfig || {}),
        JSON.stringify(data.filters || {}),
        JSON.stringify(data.groupings || []),
        JSON.stringify(data.metrics || []),
        JSON.stringify(data.chartConfig || {}),
        data.outputFormat || 'json',
        data.includeCharts ?? true,
        data.isPublic ?? false,
        userId,
      ]
    );

    return result.rows[0];
  }

  async update(tenantSlug: string, id: string, data: Partial<ReportTemplateData>): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Report template', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      reportType: 'report_type',
      queryConfig: 'query_config',
      filters: 'filters',
      groupings: 'groupings',
      metrics: 'metrics',
      chartConfig: 'chart_config',
      outputFormat: 'output_format',
      includeCharts: 'include_charts',
      isPublic: 'is_public',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        const value = data[key as keyof typeof data];
        values.push(['queryConfig', 'filters', 'groupings', 'metrics', 'chartConfig'].includes(key)
          ? JSON.stringify(value)
          : value
        );
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.report_templates SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Report template', id);
    }

    await pool.query(
      `UPDATE ${schema}.report_templates SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }
}

// ============================================
// SCHEDULED REPORT SERVICE
// ============================================

interface ScheduledReportData {
  templateId: string;
  name: string;
  description?: string;
  scheduleType: string;
  cronExpression?: string;
  timezone?: string;
  deliveryMethod: string;
  recipients: string[];
  emailSubject?: string;
  emailBody?: string;
  webhookUrl?: string;
  slackChannel?: string;
  outputFormat?: string;
  customFilters?: Record<string, unknown>;
  dateRangeType?: string;
}

class ScheduledReportService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams
  ): Promise<{ schedules: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.scheduled_reports WHERE is_active = true`
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT sr.*, rt.name as template_name, rt.report_type, u.name as created_by_name
       FROM ${schema}.scheduled_reports sr
       LEFT JOIN ${schema}.report_templates rt ON sr.template_id = rt.id
       LEFT JOIN ${schema}.users u ON sr.created_by = u.id
       WHERE sr.is_active = true
       ORDER BY sr.name
       LIMIT $1 OFFSET $2`,
      [pagination.perPage, offset]
    );

    return { schedules: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT sr.*, rt.name as template_name, rt.report_type
       FROM ${schema}.scheduled_reports sr
       LEFT JOIN ${schema}.report_templates rt ON sr.template_id = rt.id
       WHERE sr.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(tenantSlug: string, userId: string, data: ScheduledReportData): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.scheduled_reports (
        template_id, name, description,
        schedule_type, cron_expression, timezone,
        delivery_method, recipients, email_subject, email_body,
        webhook_url, slack_channel, output_format,
        custom_filters, date_range_type, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        data.templateId,
        data.name,
        data.description || null,
        data.scheduleType,
        data.cronExpression || null,
        data.timezone || 'UTC',
        data.deliveryMethod,
        JSON.stringify(data.recipients),
        data.emailSubject || null,
        data.emailBody || null,
        data.webhookUrl || null,
        data.slackChannel || null,
        data.outputFormat || 'pdf',
        JSON.stringify(data.customFilters || {}),
        data.dateRangeType || 'last_30_days',
        userId,
      ]
    );

    return result.rows[0];
  }

  async update(tenantSlug: string, id: string, data: Partial<ScheduledReportData>): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Scheduled report', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      scheduleType: 'schedule_type',
      cronExpression: 'cron_expression',
      timezone: 'timezone',
      deliveryMethod: 'delivery_method',
      recipients: 'recipients',
      emailSubject: 'email_subject',
      emailBody: 'email_body',
      webhookUrl: 'webhook_url',
      slackChannel: 'slack_channel',
      outputFormat: 'output_format',
      customFilters: 'custom_filters',
      dateRangeType: 'date_range_type',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        const value = data[key as keyof typeof data];
        values.push(['recipients', 'customFilters'].includes(key) ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.scheduled_reports SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Scheduled report', id);
    }

    await pool.query(
      `UPDATE ${schema}.scheduled_reports SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async getById(tenantSlug: string, id: string): Promise<Record<string, unknown> | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT sr.*, rt.name as template_name, rt.report_type, rt.filters as template_filters
       FROM ${schema}.scheduled_reports sr
       LEFT JOIN ${schema}.report_templates rt ON sr.template_id = rt.id
       WHERE sr.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateLastRun(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `UPDATE ${schema}.scheduled_reports
       SET last_run_at = NOW(), run_count = run_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async getDueReports(tenantSlug: string): Promise<Array<{ id: string; template_id: string }>> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get reports that are due based on their schedule
    const result = await pool.query(`
      SELECT id, template_id, schedule_type, cron_expression, last_run_at
      FROM ${schema}.scheduled_reports
      WHERE is_active = true
      AND (
        -- Daily: run if last run was more than 24 hours ago or never run
        (schedule_type = 'daily' AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '24 hours'))
        OR
        -- Weekly: run if last run was more than 7 days ago or never run
        (schedule_type = 'weekly' AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '7 days'))
        OR
        -- Monthly: run if last run was more than 30 days ago or never run
        (schedule_type = 'monthly' AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '30 days'))
        OR
        -- Hourly: run if last run was more than 1 hour ago or never run
        (schedule_type = 'hourly' AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '1 hour'))
      )
    `);

    return result.rows;
  }
}

// ============================================
// REPORT EXECUTION SERVICE
// ============================================

class ReportExecutionService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { templateId?: string; status?: string }
  ): Promise<{ executions: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.templateId) {
      whereClause += ` AND re.template_id = $${paramIndex++}`;
      values.push(filters.templateId);
    }
    if (filters?.status) {
      whereClause += ` AND re.status = $${paramIndex++}`;
      values.push(filters.status);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.report_executions re ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(pagination.perPage, offset);
    const result = await pool.query(
      `SELECT re.*, rt.name as template_name, u.name as executed_by_name
       FROM ${schema}.report_executions re
       LEFT JOIN ${schema}.report_templates rt ON re.template_id = rt.id
       LEFT JOIN ${schema}.users u ON re.executed_by = u.id
       ${whereClause}
       ORDER BY re.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return { executions: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT re.*, rt.name as template_name
       FROM ${schema}.report_executions re
       LEFT JOIN ${schema}.report_templates rt ON re.template_id = rt.id
       WHERE re.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async execute(
    tenantSlug: string,
    userId: string,
    templateId: string,
    options?: {
      outputFormat?: string;
      dateRangeStart?: Date;
      dateRangeEnd?: Date;
      filters?: Record<string, unknown>;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get template
    const template = await reportTemplateService.findById(tenantSlug, templateId) as Record<string, unknown> | null;
    if (!template) {
      throw new NotFoundError('Report template', templateId);
    }

    // Create execution record
    const execResult = await pool.query(
      `INSERT INTO ${schema}.report_executions (
        template_id, report_type, filters_used,
        date_range_start, date_range_end,
        output_format, status, started_at, executed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'running', NOW(), $7)
      RETURNING *`,
      [
        templateId,
        template.report_type,
        JSON.stringify(options?.filters || template.filters || {}),
        options?.dateRangeStart || null,
        options?.dateRangeEnd || null,
        options?.outputFormat || template.output_format || 'json',
        userId,
      ]
    );

    const execution = execResult.rows[0];

    try {
      // Generate report data based on report type
      const reportData = await this.generateReportData(
        tenantSlug,
        template.report_type as string,
        options?.filters || template.filters as Record<string, unknown>,
        options?.dateRangeStart,
        options?.dateRangeEnd
      );

      // Update execution with results
      const updateResult = await pool.query(
        `UPDATE ${schema}.report_executions
         SET status = 'completed',
             completed_at = NOW(),
             row_count = $2
         WHERE id = $1
         RETURNING *`,
        [execution.id, reportData.rowCount || 0]
      );

      return { execution: updateResult.rows[0], data: reportData };
    } catch (error) {
      // Update execution with error
      await pool.query(
        `UPDATE ${schema}.report_executions
         SET status = 'failed',
             completed_at = NOW(),
             error_message = $2
         WHERE id = $1`,
        [execution.id, (error as Error).message]
      );
      throw error;
    }
  }

  private async generateReportData(
    tenantSlug: string,
    reportType: string,
    filters: Record<string, unknown>,
    dateStart?: Date,
    dateEnd?: Date
  ): Promise<{ data: unknown; rowCount: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const dateFilter = dateStart && dateEnd
      ? `AND created_at BETWEEN '${dateStart.toISOString()}' AND '${dateEnd.toISOString()}'`
      : 'AND created_at >= NOW() - INTERVAL \'30 days\'';

    switch (reportType) {
      case 'issues': {
        const result = await pool.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'open') as open,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
            COUNT(*) FILTER (WHERE status = 'closed') as closed,
            COUNT(*) FILTER (WHERE priority = 'critical') as critical,
            COUNT(*) FILTER (WHERE priority = 'high') as high,
            COUNT(*) FILTER (WHERE priority = 'medium') as medium,
            COUNT(*) FILTER (WHERE priority = 'low') as low,
            AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
          FROM ${schema}.issues
          WHERE 1=1 ${dateFilter}
        `);
        return { data: result.rows[0], rowCount: parseInt(result.rows[0].total, 10) };
      }

      case 'changes': {
        const result = await pool.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status = 'failed') as failed,
            COUNT(*) FILTER (WHERE outcome = 'success') as success,
            COUNT(*) FILTER (WHERE outcome = 'rolled_back') as rolled_back,
            COUNT(*) FILTER (WHERE risk_level = 'critical') as risk_critical,
            COUNT(*) FILTER (WHERE risk_level = 'high') as risk_high,
            COUNT(*) FILTER (WHERE risk_level = 'medium') as risk_medium,
            COUNT(*) FILTER (WHERE risk_level = 'low') as risk_low,
            ROUND(COUNT(*) FILTER (WHERE outcome = 'success')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed'))::numeric, 0) * 100, 2) as success_rate
          FROM ${schema}.change_requests
          WHERE 1=1 ${dateFilter}
        `);
        return { data: result.rows[0], rowCount: parseInt(result.rows[0].total, 10) };
      }

      case 'requests': {
        const result = await pool.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
            COUNT(*) FILTER (WHERE status = 'pending_approval') as pending_approval,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
            ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) as completion_rate,
            AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_hours
          FROM ${schema}.service_requests
          WHERE 1=1 ${dateFilter}
        `);
        return { data: result.rows[0], rowCount: parseInt(result.rows[0].total, 10) };
      }

      case 'health': {
        const result = await pool.query(`
          WITH latest_scores AS (
            SELECT DISTINCT ON (application_id) *
            FROM ${schema}.app_health_scores
            ORDER BY application_id, calculated_at DESC
          )
          SELECT
            COUNT(*) as total_apps,
            ROUND(AVG(overall_score), 2) as avg_score,
            COUNT(*) FILTER (WHERE overall_score >= 90) as excellent,
            COUNT(*) FILTER (WHERE overall_score >= 75 AND overall_score < 90) as good,
            COUNT(*) FILTER (WHERE overall_score >= 50 AND overall_score < 75) as warning,
            COUNT(*) FILTER (WHERE overall_score < 50) as critical,
            COUNT(*) FILTER (WHERE trend = 'improving') as improving,
            COUNT(*) FILTER (WHERE trend = 'stable') as stable,
            COUNT(*) FILTER (WHERE trend = 'declining') as declining
          FROM latest_scores
        `);
        return { data: result.rows[0], rowCount: parseInt(result.rows[0].total_apps, 10) };
      }

      case 'applications': {
        const result = await pool.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE tier = 'P1') as tier_p1,
            COUNT(*) FILTER (WHERE tier = 'P2') as tier_p2,
            COUNT(*) FILTER (WHERE tier = 'P3') as tier_p3,
            COUNT(*) FILTER (WHERE tier = 'P4') as tier_p4,
            COUNT(*) FILTER (WHERE status = 'active') as active,
            COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'production') as production,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'development') as development
          FROM ${schema}.applications
        `);
        return { data: result.rows[0], rowCount: parseInt(result.rows[0].total, 10) };
      }

      case 'cloud_costs': {
        const result = await pool.query(`
          SELECT
            SUM(total_cost) as total_cost,
            COUNT(DISTINCT cloud_account_id) as accounts,
            COUNT(DISTINCT application_id) as applications,
            AVG(cost_change_percent) as avg_change_percent
          FROM ${schema}.cloud_cost_reports
          WHERE period_type = 'monthly'
          AND period_start >= NOW() - INTERVAL '90 days'
        `);
        return { data: result.rows[0], rowCount: 1 };
      }

      default:
        return { data: {}, rowCount: 0 };
    }
  }
}

// ============================================
// SAVED REPORT SERVICE
// ============================================

class SavedReportService {
  async list(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.saved_reports
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async create(
    tenantSlug: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      reportType: string;
      filters?: Record<string, unknown>;
      groupings?: string[];
      dateRangeType?: string;
      chartType?: string;
      sortBy?: string;
      sortOrder?: string;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.saved_reports (
        user_id, name, description, report_type,
        filters, groupings, date_range_type,
        chart_type, sort_by, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        data.name,
        data.description || null,
        data.reportType,
        JSON.stringify(data.filters || {}),
        JSON.stringify(data.groupings || []),
        data.dateRangeType || 'last_30_days',
        data.chartType || null,
        data.sortBy || null,
        data.sortOrder || 'desc',
      ]
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `DELETE FROM ${schema}.saved_reports WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  }
}

// ============================================
// DASHBOARD WIDGET SERVICE
// ============================================

class DashboardWidgetService {
  async list(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.dashboard_widgets
       WHERE user_id = $1 AND is_visible = true
       ORDER BY position_y, position_x`,
      [userId]
    );
    return result.rows;
  }

  async create(
    tenantSlug: string,
    userId: string,
    data: {
      widgetType: string;
      title?: string;
      positionX?: number;
      positionY?: number;
      width?: number;
      height?: number;
      dataSource: string;
      filters?: Record<string, unknown>;
      refreshInterval?: number;
      chartType?: string;
      chartConfig?: Record<string, unknown>;
      colorScheme?: string;
      showLegend?: boolean;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.dashboard_widgets (
        user_id, widget_type, title,
        position_x, position_y, width, height,
        data_source, filters, refresh_interval,
        chart_type, chart_config, color_scheme, show_legend
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        userId,
        data.widgetType,
        data.title || null,
        data.positionX || 0,
        data.positionY || 0,
        data.width || 4,
        data.height || 3,
        data.dataSource,
        JSON.stringify(data.filters || {}),
        data.refreshInterval || 300,
        data.chartType || null,
        JSON.stringify(data.chartConfig || {}),
        data.colorScheme || null,
        data.showLegend ?? true,
      ]
    );

    return result.rows[0];
  }

  async update(
    tenantSlug: string,
    userId: string,
    id: string,
    data: Partial<{
      title: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      filters: Record<string, unknown>;
      refreshInterval: number;
      chartType: string;
      chartConfig: Record<string, unknown>;
      colorScheme: string;
      showLegend: boolean;
      isVisible: boolean;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      positionX: 'position_x',
      positionY: 'position_y',
      width: 'width',
      height: 'height',
      filters: 'filters',
      refreshInterval: 'refresh_interval',
      chartType: 'chart_type',
      chartConfig: 'chart_config',
      colorScheme: 'color_scheme',
      showLegend: 'show_legend',
      isVisible: 'is_visible',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        const value = data[key as keyof typeof data];
        values.push(['filters', 'chartConfig'].includes(key) ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) {
      const existing = await pool.query(
        `SELECT * FROM ${schema}.dashboard_widgets WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return existing.rows[0];
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE ${schema}.dashboard_widgets SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `DELETE FROM ${schema}.dashboard_widgets WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  }
}

export const reportTemplateService = new ReportTemplateService();
export const scheduledReportService = new ScheduledReportService();
export const reportExecutionService = new ReportExecutionService();
export const savedReportService = new SavedReportService();
export const dashboardWidgetService = new DashboardWidgetService();
