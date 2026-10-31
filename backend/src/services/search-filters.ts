import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import type { FilterGroup, SearchEntity } from './search.js';

/**
 * Saved filter templates and search history. Every row carries tenant_id and
 * user_id, and every query is scoped by both, inside the tenant schema.
 */

export interface FilterTemplate {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  entity: SearchEntity;
  query_text: string | null;
  filters: FilterGroup | Record<string, never>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveFilterTemplateInput {
  name: string;
  entity: SearchEntity;
  queryText?: string;
  filters?: FilterGroup;
  isShared?: boolean;
}

export class FilterTemplateRepository {
  async saveFilterTemplate(tenantSlug: string, userId: string, input: SaveFilterTemplateInput): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `INSERT INTO ${schema}.filter_templates (tenant_id, user_id, name, entity, query_text, filters, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, user_id, name)
       DO UPDATE SET entity = EXCLUDED.entity, query_text = EXCLUDED.query_text,
                     filters = EXCLUDED.filters, is_shared = EXCLUDED.is_shared, updated_at = NOW()
       RETURNING *`,
      [tenantSlug, userId, input.name, input.entity, input.queryText ?? null, JSON.stringify(input.filters ?? {}), input.isShared ?? false]
    );
    return res.rows[0];
  }

  async listFilterTemplates(tenantSlug: string, userId: string): Promise<FilterTemplate[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT * FROM ${schema}.filter_templates
       WHERE tenant_id = $1 AND (user_id = $2 OR is_shared = true)
       ORDER BY name ASC
       LIMIT 200`,
      [tenantSlug, userId]
    );
    return res.rows;
  }

  async loadFilterTemplate(tenantSlug: string, userId: string, id: string): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT * FROM ${schema}.filter_templates
       WHERE id = $1 AND tenant_id = $2 AND (user_id = $3 OR is_shared = true)`,
      [id, tenantSlug, userId]
    );
    if (res.rows.length === 0) throw new NotFoundError('Filter template', id);
    return res.rows[0];
  }

  async deleteFilterTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `DELETE FROM ${schema}.filter_templates WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, tenantSlug, userId]
    );
    if (res.rowCount === 0) throw new NotFoundError('Filter template', id);
  }
}

export const filterTemplateRepository = new FilterTemplateRepository();

export interface RecordSearchInput {
  queryText: string;
  entity?: string;
  resultCount: number;
  durationMs?: number;
}

export const searchHistoryService = {
  async recordSearch(tenantSlug: string, userId: string, input: RecordSearchInput): Promise<void> {
    const trimmed = input.queryText.trim();
    if (!trimmed) return;
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.search_history (tenant_id, user_id, query_text, entity, result_count, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantSlug, userId, trimmed.slice(0, 500), input.entity ?? null, input.resultCount, input.durationMs ?? null]
    );
  },

  async getRecent(tenantSlug: string, userId: string, limit = 10): Promise<Array<{ query_text: string; last_used: string }>> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT query_text, MAX(created_at) AS last_used
       FROM ${schema}.search_history
       WHERE tenant_id = $1 AND user_id = $2
       GROUP BY query_text
       ORDER BY last_used DESC
       LIMIT $3`,
      [tenantSlug, userId, Math.min(limit, 50)]
    );
    return res.rows;
  },

  /** Autocomplete: the user's own prefix matches first, then popular tenant-wide queries. */
  async suggest(tenantSlug: string, userId: string, prefix: string, limit = 8): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const escaped = prefix.trim().replace(/[\\%_]/g, (c) => '\\' + c);
    const res = await pool.query(
      `SELECT query_text, SUM(CASE WHEN user_id = $2 THEN 10 ELSE 1 END) AS score
       FROM ${schema}.search_history
       WHERE tenant_id = $1 AND query_text ILIKE $3 AND result_count > 0
       GROUP BY query_text
       ORDER BY score DESC, query_text ASC
       LIMIT $4`,
      [tenantSlug, userId, escaped + '%', Math.min(limit, 20)]
    );
    return res.rows.map((r) => r.query_text);
  },

  /** search-analytics: popular queries, zero-result queries and daily volume. */
  async getAnalytics(tenantSlug: string, days = 30): Promise<{
    popular: Array<{ query_text: string; count: number }>;
    zeroResults: Array<{ query_text: string; count: number }>;
    daily: Array<{ day: string; count: number }>;
    totals: { searches: number; users: number; avgDurationMs: number | null };
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const window = Math.min(Math.max(days, 1), 365);
    const [popular, zero, daily, totals] = await Promise.all([
      pool.query(
        `SELECT lower(query_text) AS query_text, count(*)::int AS count
         FROM ${schema}.search_history
         WHERE tenant_id = $1 AND created_at >= NOW() - make_interval(days => $2)
         GROUP BY lower(query_text) ORDER BY count DESC LIMIT 20`,
        [tenantSlug, window]
      ),
      pool.query(
        `SELECT lower(query_text) AS query_text, count(*)::int AS count
         FROM ${schema}.search_history
         WHERE tenant_id = $1 AND result_count = 0 AND created_at >= NOW() - make_interval(days => $2)
         GROUP BY lower(query_text) ORDER BY count DESC LIMIT 20`,
        [tenantSlug, window]
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM ${schema}.search_history
         WHERE tenant_id = $1 AND created_at >= NOW() - make_interval(days => $2)
         GROUP BY 1 ORDER BY 1 ASC LIMIT 366`,
        [tenantSlug, window]
      ),
      pool.query(
        `SELECT count(*)::int AS searches, count(DISTINCT user_id)::int AS users, avg(duration_ms)::float AS avg_duration
         FROM ${schema}.search_history
         WHERE tenant_id = $1 AND created_at >= NOW() - make_interval(days => $2)`,
        [tenantSlug, window]
      ),
    ]);
    const t = totals.rows[0] ?? {};
    return {
      popular: popular.rows,
      zeroResults: zero.rows,
      daily: daily.rows,
      totals: { searches: t.searches ?? 0, users: t.users ?? 0, avgDurationMs: t.avg_duration ?? null },
    };
  },
};
