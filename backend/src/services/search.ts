import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';
import { filterGroupSchema, type FilterGroup } from '../utils/search-query.js';

export interface SearchFilterTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  entity_type: string;
  query: string | null;
  filter: FilterGroup | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput {
  name?: string;
  description?: string | null;
  entityType?: string;
  query?: string | null;
  filter?: unknown;
  isShared?: boolean;
}

export interface SearchHistoryEntry {
  id: string;
  user_id: string;
  entity_type: string;
  query: string | null;
  filter: FilterGroup | null;
  result_count: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface RecordSearchInput {
  userId: string;
  entityType?: string;
  query?: string | null;
  filter?: FilterGroup | null;
  resultCount: number;
  durationMs: number;
}

export interface SearchAnalytics {
  totalSearches: number;
  uniqueUsers: number;
  zeroResultSearches: number;
  avgDurationMs: number;
  topQueries: Array<{ query: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
  searchesPerDay: Array<{ date: string; count: number }>;
}

const UNIQUE_VIOLATION = '23505';

function validateFilter(filter: unknown): FilterGroup | null {
  if (filter === undefined || filter === null) return null;
  const parsed = filterGroupSchema.safeParse(filter);
  if (!parsed.success) {
    throw new BadRequestError(`Invalid filter: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  return parsed.data as FilterGroup;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export const searchService = {
  // ============================================
  // FILTER TEMPLATES
  // ============================================

  async listTemplates(tenantSlug: string, userId: string, entityType?: string): Promise<SearchFilterTemplate[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const values: unknown[] = [userId];
    let entityClause = '';
    if (entityType) {
      values.push(entityType);
      entityClause = ` AND entity_type = $2`;
    }
    const result = await pool.query(
      `SELECT * FROM ${schema}.search_filter_templates
       WHERE (user_id = $1 OR is_shared = true)${entityClause}
       ORDER BY name ASC`,
      values
    );
    return result.rows;
  },

  async createTemplate(tenantSlug: string, userId: string, input: TemplateInput): Promise<SearchFilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('Template name is required');
    }
    const filter = validateFilter(input.filter);
    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.search_filter_templates
           (user_id, name, description, entity_type, query, filter, is_shared)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userId,
          input.name.trim(),
          input.description ?? null,
          input.entityType ?? 'issue',
          input.query ?? null,
          filter ? JSON.stringify(filter) : null,
          input.isShared ?? false,
        ]
      );
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A template named '${input.name.trim()}' already exists`);
      }
      throw error;
    }
  },

  async updateTemplate(tenantSlug: string, userId: string, id: string, input: TemplateInput): Promise<SearchFilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await pool.query(
      `SELECT * FROM ${schema}.search_filter_templates WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Search template', id);
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new BadRequestError('Template name is required');
      sets.push(`name = $${idx++}`);
      values.push(input.name.trim());
    }
    if (input.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.entityType !== undefined) {
      sets.push(`entity_type = $${idx++}`);
      values.push(input.entityType);
    }
    if (input.query !== undefined) {
      sets.push(`query = $${idx++}`);
      values.push(input.query);
    }
    if (input.filter !== undefined) {
      const filter = validateFilter(input.filter);
      sets.push(`filter = $${idx++}`);
      values.push(filter ? JSON.stringify(filter) : null);
    }
    if (input.isShared !== undefined) {
      sets.push(`is_shared = $${idx++}`);
      values.push(input.isShared);
    }
    if (sets.length === 0) {
      return existing.rows[0];
    }
    sets.push('updated_at = NOW()');
    values.push(id, userId);

    try {
      const result = await pool.query(
        `UPDATE ${schema}.search_filter_templates SET ${sets.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Search template', id);
      }
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A template named '${String(input.name).trim()}' already exists`);
      }
      throw error;
    }
  },

  async deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.search_filter_templates WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!result.rowCount) {
      throw new NotFoundError('Search template', id);
    }
    await cacheService.invalidateTenant(tenantSlug, 'search');
  },

  // ============================================
  // HISTORY
  // ============================================

  /**
   * Records a search execution. Never throws: failures are logged.
   * Returns true when a row was written.
   */
  async recordSearch(tenantSlug: string, input: RecordSearchInput): Promise<boolean> {
    const query = input.query?.trim() ?? '';
    const hasFilter = !!input.filter && Array.isArray(input.filter.conditions) && input.filter.conditions.length > 0;
    if (!query && !hasFilter) {
      return false;
    }
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      await pool.query(
        `INSERT INTO ${schema}.search_history
           (user_id, entity_type, query, filter, result_count, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.userId,
          input.entityType ?? 'issue',
          query || null,
          hasFilter ? JSON.stringify(input.filter) : null,
          input.resultCount,
          Math.max(0, Math.round(input.durationMs)),
        ]
      );
      return true;
    } catch (error) {
      logger.warn({ err: error, tenantSlug }, 'Failed to record search history');
      return false;
    }
  },

  async getHistory(tenantSlug: string, userId: string, limit = 10): Promise<SearchHistoryEntry[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));
    const result = await pool.query(
      `SELECT * FROM ${schema}.search_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, safeLimit]
    );
    return result.rows;
  },

  async clearHistory(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.search_history WHERE user_id = $1`,
      [userId]
    );
    return result.rowCount ?? 0;
  },

  // ============================================
  // SUGGESTIONS
  // ============================================

  async getSuggestions(tenantSlug: string, userId: string, prefix: string, limit = 8): Promise<string[]> {
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 8));
    const normalized = (prefix ?? '').trim();
    const cacheKey = `${tenantSlug}:search:suggestions:${JSON.stringify({ userId, prefix: normalized.toLowerCase(), limit: safeLimit })}`;

    return cacheService.getOrSet(cacheKey, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const pattern = `${normalized.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      const recent = await pool.query(
        `SELECT query, MAX(created_at) AS last_used
         FROM ${schema}.search_history
         WHERE user_id = $1 AND query IS NOT NULL AND query ILIKE $2
         GROUP BY query
         ORDER BY last_used DESC
         LIMIT $3`,
        [userId, pattern, safeLimit]
      );
      const popular = await pool.query(
        `SELECT query, COUNT(*)::int AS count
         FROM ${schema}.search_history
         WHERE query IS NOT NULL AND query ILIKE $1
         GROUP BY query
         ORDER BY count DESC, query ASC
         LIMIT $2`,
        [pattern, safeLimit]
      );

      const seen = new Set<string>();
      const suggestions: string[] = [];
      for (const row of [...recent.rows, ...popular.rows] as Array<{ query: string }>) {
        const q = row.query?.trim();
        if (!q) continue;
        const key = q.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push(q);
        if (suggestions.length >= safeLimit) break;
      }
      return suggestions;
    }, { ttl: 60 });
  },

  // ============================================
  // ANALYTICS
  // ============================================

  async getAnalytics(
    tenantSlug: string,
    options: { from?: Date; to?: Date; limit?: number } = {}
  ): Promise<SearchAnalytics> {
    const to = options.to ?? new Date();
    const from = options.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 10) || 10));
    const cacheKey = `${tenantSlug}:search:analytics:${JSON.stringify({ from: from.toISOString(), to: to.toISOString(), limit })}`;

    return cacheService.getOrSet(cacheKey, async () => {
      const schema = tenantService.getSchemaName(tenantSlug);
      const range = [from.toISOString(), to.toISOString()];

      const totals = await pool.query(
        `SELECT COUNT(*)::int AS total_searches,
                COUNT(DISTINCT user_id)::int AS unique_users,
                COUNT(*) FILTER (WHERE result_count = 0)::int AS zero_result_searches,
                COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms
         FROM ${schema}.search_history
         WHERE created_at >= $1 AND created_at <= $2`,
        range
      );
      const top = await pool.query(
        `SELECT LOWER(query) AS query, COUNT(*)::int AS count
         FROM ${schema}.search_history
         WHERE created_at >= $1 AND created_at <= $2 AND query IS NOT NULL
         GROUP BY LOWER(query)
         ORDER BY count DESC, query ASC
         LIMIT $3`,
        [...range, limit]
      );
      const zero = await pool.query(
        `SELECT LOWER(query) AS query, COUNT(*)::int AS count
         FROM ${schema}.search_history
         WHERE created_at >= $1 AND created_at <= $2 AND query IS NOT NULL AND result_count = 0
         GROUP BY LOWER(query)
         ORDER BY count DESC, query ASC
         LIMIT $3`,
        [...range, limit]
      );
      const perDay = await pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM ${schema}.search_history
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY 1
         ORDER BY 1 ASC`,
        range
      );

      const t = totals.rows[0] ?? {};
      return {
        totalSearches: Number(t.total_searches ?? 0),
        uniqueUsers: Number(t.unique_users ?? 0),
        zeroResultSearches: Number(t.zero_result_searches ?? 0),
        avgDurationMs: Math.round(Number(t.avg_duration_ms ?? 0)),
        topQueries: top.rows.map((r: { query: string; count: number | string }) => ({ query: r.query, count: Number(r.count) })),
        zeroResultQueries: zero.rows.map((r: { query: string; count: number | string }) => ({ query: r.query, count: Number(r.count) })),
        searchesPerDay: perDay.rows.map((r: { date: unknown; count: number | string }) => ({ date: toDateString(r.date), count: Number(r.count) })),
      };
    }, { ttl: 300 });
  },
};
