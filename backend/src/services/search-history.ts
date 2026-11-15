import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';

export interface RecordInput {
  query: string;
  entityTypes?: string[];
  resultCount: number;
  tookMs?: number;
}

export interface RecentSearch {
  query: string;
  last_searched_at: string;
  search_count: number;
}

export interface Suggestion {
  query: string;
  source: 'history' | 'popular';
}

export const DEDUPE_WINDOW_SECONDS = 60;
export const RETENTION_DAYS = 90;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function schemaFor(tenantSlug: string): string {
  return tenantService.getSchemaName(tenantSlug);
}

export const searchHistoryService = {
  /** Returns true if a row was inserted, false if skipped as a duplicate. */
  async record(tenantSlug: string, userId: string, input: RecordInput): Promise<boolean> {
    const schema = schemaFor(tenantSlug);
    const query = input.query.trim();

    // Keep the table bounded
    await pool.query(
      `DELETE FROM ${schema}.search_history
       WHERE user_id = $1 AND created_at < NOW() - ($2 || ' days')::interval`,
      [userId, String(RETENTION_DAYS)]
    );

    const dup = await pool.query(
      `SELECT 1 FROM ${schema}.search_history
       WHERE user_id = $1 AND lower(query) = lower($2)
         AND created_at > NOW() - ($3 || ' seconds')::interval
       LIMIT 1`,
      [userId, query, String(DEDUPE_WINDOW_SECONDS)]
    );
    if (dup.rows.length > 0) return false;

    await pool.query(
      `INSERT INTO ${schema}.search_history (user_id, query, entity_types, result_count, took_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, query, input.entityTypes ?? null, input.resultCount, input.tookMs ?? null]
    );
    return true;
  },

  async listRecent(tenantSlug: string, userId: string, limit = 10): Promise<RecentSearch[]> {
    const schema = schemaFor(tenantSlug);
    const capped = Math.min(Math.max(1, limit), 50);
    const result = await pool.query(
      `SELECT MIN(query) AS query, MAX(created_at) AS last_searched_at, COUNT(*)::int AS search_count
       FROM ${schema}.search_history
       WHERE user_id = $1
       GROUP BY lower(query)
       ORDER BY MAX(created_at) DESC
       LIMIT $2`,
      [userId, capped]
    );
    return result.rows;
  },

  async clear(tenantSlug: string, userId: string): Promise<void> {
    const schema = schemaFor(tenantSlug);
    await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
  },

  async suggest(tenantSlug: string, userId: string, prefix: string, limit = 8): Promise<Suggestion[]> {
    const schema = schemaFor(tenantSlug);
    const capped = Math.min(Math.max(1, limit), 10);
    const pattern = `${escapeLike(prefix.trim().toLowerCase())}%`;

    const own = await pool.query(
      `SELECT MIN(query) AS query FROM ${schema}.search_history
       WHERE user_id = $1 AND lower(query) LIKE $2 ESCAPE '\\'
       GROUP BY lower(query)
       ORDER BY MAX(created_at) DESC
       LIMIT $3`,
      [userId, pattern, capped]
    );
    const items: Suggestion[] = [];
    const seen = new Set<string>();
    for (const row of own.rows) {
      const key = String(row.query).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ query: row.query, source: 'history' });
    }
    if (items.length >= capped) return items.slice(0, capped);

    const popular = await pool.query(
      `SELECT MIN(query) AS query FROM ${schema}.search_history
       WHERE lower(query) LIKE $1 ESCAPE '\\'
       GROUP BY lower(query)
       ORDER BY COUNT(*) DESC, MAX(created_at) DESC
       LIMIT $2`,
      [pattern, capped]
    );
    for (const row of popular.rows) {
      if (items.length >= capped) break;
      const key = String(row.query).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ query: row.query, source: 'popular' });
    }
    return items;
  },

  async analytics(tenantSlug: string, days = 30) {
    const schema = schemaFor(tenantSlug);
    const d = Math.min(Math.max(1, days), 90);
    const since = `NOW() - ($1 || ' days')::interval`;
    const p = [String(d)];

    const [summary, popular, zero, daily] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_searches,
                COUNT(DISTINCT lower(query))::int AS unique_queries,
                COALESCE(AVG(CASE WHEN result_count = 0 THEN 1.0 ELSE 0.0 END), 0)::float AS zero_result_rate,
                COALESCE(AVG(took_ms), 0)::float AS avg_took_ms
         FROM ${schema}.search_history WHERE created_at > ${since}`,
        p
      ),
      pool.query(
        `SELECT MIN(query) AS query, COUNT(*)::int AS count,
                COALESCE(AVG(result_count), 0)::float AS avg_result_count
         FROM ${schema}.search_history WHERE created_at > ${since}
         GROUP BY lower(query) ORDER BY COUNT(*) DESC, MIN(query) LIMIT 20`,
        p
      ),
      pool.query(
        `SELECT MIN(query) AS query, COUNT(*)::int AS count
         FROM ${schema}.search_history WHERE created_at > ${since} AND result_count = 0
         GROUP BY lower(query) ORDER BY COUNT(*) DESC, MIN(query) LIMIT 20`,
        p
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM ${schema}.search_history WHERE created_at > ${since}
         GROUP BY 1 ORDER BY 1`,
        p
      ),
    ]);

    const s = summary.rows[0] ?? {};
    return {
      total_searches: Number(s.total_searches ?? 0),
      unique_queries: Number(s.unique_queries ?? 0),
      zero_result_rate: Number(s.zero_result_rate ?? 0),
      avg_took_ms: Number(s.avg_took_ms ?? 0),
      popular: popular.rows,
      zero_results: zero.rows,
      daily: daily.rows,
    };
  },
};
