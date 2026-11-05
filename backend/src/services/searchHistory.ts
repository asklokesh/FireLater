import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import type { FilterGroup } from '../utils/searchFilterBuilder.js';

export interface RecordSearchInput {
  entityType?: string;
  query?: string | null;
  filter?: FilterGroup | null;
  resultCount: number;
}

export const searchHistoryService = {
  async record(tenantSlug: string, userId: string, input: RecordSearchInput): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.search_history (user_id, entity_type, query, filter, result_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        input.entityType ?? 'issue',
        input.query ?? null,
        input.filter ? JSON.stringify(input.filter) : null,
        input.resultCount,
      ]
    );
  },

  async listRecent(tenantSlug: string, userId: string, limit = 10): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT query FROM (
         SELECT query, MAX(created_at) AS last_at
         FROM ${schema}.search_history
         WHERE user_id = $1 AND query IS NOT NULL AND query <> ''
         GROUP BY query
       ) t ORDER BY last_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map((r: { query: string }) => r.query);
  },

  async suggest(tenantSlug: string, userId: string, prefix: string, limit = 10): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const pattern = `${prefix.replace(/[\\%_]/g, '\\$&')}%`;
    const own = await pool.query(
      `SELECT query FROM (
         SELECT query, MAX(created_at) AS last_at
         FROM ${schema}.search_history
         WHERE user_id = $1 AND query ILIKE $2
         GROUP BY query
       ) t ORDER BY last_at DESC LIMIT $3`,
      [userId, pattern, limit]
    );
    const popular = await pool.query(
      `SELECT lower(query) AS query, COUNT(*) AS cnt
       FROM ${schema}.search_history
       WHERE query ILIKE $1
       GROUP BY lower(query) ORDER BY cnt DESC LIMIT $2`,
      [pattern, limit]
    );
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of [...own.rows, ...popular.rows] as { query: string }[]) {
      const k = row.query.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(row.query);
      if (out.length >= limit) break;
    }
    return out;
  },

  async clear(tenantSlug: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
  },
};
