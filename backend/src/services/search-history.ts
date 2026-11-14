import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import type { FilterNode } from './search-filters.js';

export const HISTORY_RETENTION_DAYS = 90;
export const HISTORY_LIMIT = 20;
export const SUGGEST_LIMIT = 8;

export class SearchHistoryService {
  async record(
    tenantSlug: string,
    userId: string,
    entry: { query: string; filter?: FilterNode; resultCount: number }
  ): Promise<void> {
    const query = entry.query.trim();
    if (!query) return;
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.search_history (user_id, query, filter, result_count) VALUES ($1, $2, $3, $4)`,
      [userId, query, entry.filter ? JSON.stringify(entry.filter) : null, entry.resultCount]
    );
  }

  async list(tenantSlug: string, userId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const res = await pool.query(
      `SELECT id, query, result_count, created_at FROM (
         SELECT DISTINCT ON (query) id, query, result_count, created_at
         FROM ${schema}.search_history
         WHERE user_id = $1 AND created_at > NOW() - make_interval(days => $2)
         ORDER BY query, created_at DESC
       ) h ORDER BY created_at DESC LIMIT $3`,
      [userId, HISTORY_RETENTION_DAYS, HISTORY_LIMIT]
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      query: r.query as string,
      resultCount: Number(r.result_count),
      createdAt: r.created_at as string,
    }));
  }

  async clear(tenantSlug: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
  }

  async suggest(tenantSlug: string, userId: string, prefix: string): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const escaped = prefix.trim().replace(/[\\%_]/g, '\\$&');
    const res = await pool.query(
      `SELECT query FROM (
         SELECT query, MAX(created_at) AS last_at
         FROM ${schema}.search_history
         WHERE user_id = $1 AND created_at > NOW() - make_interval(days => $2)
           AND query ILIKE $3
         GROUP BY query
       ) s ORDER BY last_at DESC LIMIT $4`,
      [userId, HISTORY_RETENTION_DAYS, `${escaped}%`, SUGGEST_LIMIT]
    );
    return res.rows.map((r: { query: string }) => r.query);
  }
}

export const searchHistoryService = new SearchHistoryService();
