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
    await pool.query(
      `UPDATE ${schema}.report_templates SET is_active = false WHERE id = $1`,
      [id]
    );
  }

  // Batch fetch asset health scores to avoid N+1 queries
  async getAssetHealthScores(tenantSlug: string, assetIds: string[]): Promise<Record<string, number>> {
    if (assetIds.length === 0) return {};

    const schema = tenantService.getSchemaName(tenantSlug);
    const placeholders = assetIds.map((_, i) => `$${i + 1}`).join(',');
    
    const result = await pool.query(
      `SELECT id, health_score 
       FROM ${schema}.assets 
       WHERE id IN (${placeholders})`,
      assetIds
    );

    // Return as a map for O(1) lookup
    return result.rows.reduce((acc, row) => {
      acc[row.id] = row.health_score;
      return acc;
    }, {} as Record<string, number>);
  }

  // Batch fetch asset details with health scores
  async getAssetDetailsWithHealth(tenantSlug: string, assetIds: string[]): Promise<Record<string, any>> {
    if (assetIds.length === 0) return {};

    const schema = tenantService.getSchemaName(tenantSlug);
    const placeholders = assetIds.map((_, i) => `$${i + 1}`).join(',');
    
    const result = await pool.query(
      `SELECT a.id, a.name, a.type, a.status, a.health_score, a.last_checked_at,
              u.name as owner_name
       FROM ${schema}.assets a
       LEFT JOIN ${schema}.users u ON a.owner_id = u.id
       WHERE a.id IN (${placeholders})`,
      assetIds
    );

    return result.rows.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, any>);
  }
}

export const reportTemplateService = new ReportTemplateService();