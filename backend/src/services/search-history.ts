import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';

export interface RecordSearchParams {
  tenantSlug: string;
  userId: string;
  query: string;
  entity: string;
  filter?: unknown;
  resultCount: number;
  durationMs: number;
}

export const searchHistoryService = {
  /** Records a search. Never throws: failures are logged only. */
  async record(p: RecordSearchParams): Promise<void> {
    const q = (p.query ?? '').trim();
    if (!q) return;
    try {
      const schema = tenantService.getSchemaName(p.tenantSlug);
      await pool.query(
        `INSERT INTO ${schema}.search_history (user_id, query, entity, filter, result_count, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.userId, q, p.entity, p.filter ? JSON.stringify(p.filter) : null, p.resultCount, Math.round(p.durationMs)]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to record search history');
    }
  },

  async recent(tenantSlug: string, userId: string, limit = 10): Promise<Array<{ query: string; lastSearchedAt: string }>> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const lim = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 20);
    const result = await pool.query(
      `SELECT query, MAX(created_at) AS last_searched_at
       FROM ${schema}.search_history WHERE user_id = $1
       GROUP BY query ORDER BY MAX(created_at) DESC LIMIT $2`,
      [userId, lim]
    );
    return result.rows.map((r: { query: string; last_searched_at: string }) => ({
      query: r.query,
      lastSearchedAt: r.last_searched_at,
    }));
  },

  async clear(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
    return result.rowCount ?? 0;
  },

  async suggestions(tenantSlug: string, userId: string, prefix: string): Promise<string[]> {
    const p = (prefix ?? '').trim().slice(0, 200);
    if (!p) return [];
    const schema = tenantService.getSchemaName(tenantSlug);
    const escaped = p.replace(/[\\%_]/g, (c) => `\\${c}`);
    const result = await pool.query(
      `SELECT query FROM ${schema}.search_history
       WHERE user_id = $1 AND query ILIKE $2
       GROUP BY query ORDER BY MAX(created_at) DESC, COUNT(*) DESC LIMIT 8`,
      [userId, `${escaped}%`]
    );
    return result.rows.map((r: { query: string }) => r.query);
  },
};
