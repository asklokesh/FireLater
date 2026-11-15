import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import type { FilterGroup } from './search.js';

export const DEFAULT_HISTORY_LIMIT = 10;
export const MAX_HISTORY_LIMIT = 50;

export interface HistoryEntry {
  query: string | null;
  filters: FilterGroup | null;
  result_count: number;
  created_at: string;
}

class SearchHistoryService {
  /** Record a search. Never throws: failures are logged. */
  async record(
    tenantSlug: string,
    userId: string,
    entry: { query?: string; filters?: FilterGroup; resultCount: number }
  ): Promise<void> {
    try {
      const q = entry.query?.trim() || null;
      const hasFilters = !!entry.filters && (entry.filters.conditions?.length ?? 0) > 0;
      if (!q && !hasFilters) return;
      const schema = tenantService.getSchemaName(tenantSlug);
      await pool.query(
        `INSERT INTO ${schema}.search_history (user_id, query, filters, result_count) VALUES ($1, $2, $3, $4)`,
        [userId, q, hasFilters ? JSON.stringify(entry.filters) : null, entry.resultCount]
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to record search history');
    }
  }

  async recent(tenantSlug: string, userId: string, limit?: number): Promise<HistoryEntry[]> {
    const requested = Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT) || DEFAULT_HISTORY_LIMIT;
    const n = Math.min(Math.max(requested, 1), MAX_HISTORY_LIMIT);
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT query, filters, result_count, created_at FROM (
         SELECT DISTINCT ON (COALESCE(query, ''), COALESCE(filters::text, ''))
                query, filters, result_count, created_at
         FROM ${schema}.search_history
         WHERE user_id = $1
         ORDER BY COALESCE(query, ''), COALESCE(filters::text, ''), created_at DESC
       ) s ORDER BY created_at DESC LIMIT $2`,
      [userId, n]
    );
    return r.rows;
  }

  async clear(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
    return r.rowCount ?? 0;
  }
}

export const searchHistoryService = new SearchHistoryService();
