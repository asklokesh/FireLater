import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { cacheService } from '../utils/cache.js';

export const ANALYTICS_CACHE_TTL = 60;

export interface SearchAnalytics {
  days: number;
  limit: number;
  totals: {
    searches: number;
    uniqueUsers: number;
    zeroResultRate: number;
    p50DurationMs: number;
    p95DurationMs: number;
  };
  topQueries: Array<{ query: string; count: number; avgResultCount: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
  volumeByDay: Array<{ date: string; count: number }>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const searchAnalyticsService = {
  async get(tenantSlug: string, days = 30, limit = 10): Promise<SearchAnalytics> {
    const key = `${tenantSlug}:search-analytics:${days}:${limit}`;
    return cacheService.getOrSet(key, () => this.compute(tenantSlug, days, limit), { ttl: ANALYTICS_CACHE_TTL });
  },

  async compute(tenantSlug: string, days: number, limit: number): Promise<SearchAnalytics> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const win = `created_at >= NOW() - ($1::int * INTERVAL '1 day')`;
    const [totals, top, zero, volume] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS searches,
                COUNT(DISTINCT user_id) AS unique_users,
                COALESCE(AVG(CASE WHEN COALESCE(result_count, 0) = 0 THEN 1.0 ELSE 0.0 END), 0) AS zero_rate,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms), 0) AS p50,
                COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95
         FROM ${schema}.search_history WHERE ${win}`,
        [days]
      ),
      pool.query(
        `SELECT LOWER(TRIM(query)) AS query, COUNT(*) AS count, COALESCE(AVG(result_count), 0) AS avg_result_count
         FROM ${schema}.search_history WHERE ${win}
         GROUP BY LOWER(TRIM(query)) ORDER BY COUNT(*) DESC, LOWER(TRIM(query)) ASC LIMIT $2`,
        [days, limit]
      ),
      pool.query(
        `SELECT LOWER(TRIM(query)) AS query, COUNT(*) AS count
         FROM ${schema}.search_history WHERE ${win} AND COALESCE(result_count, 0) = 0
         GROUP BY LOWER(TRIM(query)) ORDER BY COUNT(*) DESC, LOWER(TRIM(query)) ASC LIMIT $2`,
        [days, limit]
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*) AS count
         FROM ${schema}.search_history WHERE ${win}
         GROUP BY 1 ORDER BY 1 ASC`,
        [days]
      ),
    ]);
    const t = totals.rows[0] ?? {};
    return {
      days,
      limit,
      totals: {
        searches: num(t.searches),
        uniqueUsers: num(t.unique_users),
        zeroResultRate: num(t.zero_rate),
        p50DurationMs: num(t.p50),
        p95DurationMs: num(t.p95),
      },
      topQueries: top.rows.map((r: Record<string, unknown>) => ({
        query: String(r.query),
        count: num(r.count),
        avgResultCount: num(r.avg_result_count),
      })),
      zeroResultQueries: zero.rows.map((r: Record<string, unknown>) => ({ query: String(r.query), count: num(r.count) })),
      volumeByDay: volume.rows.map((r: Record<string, unknown>) => ({ date: String(r.date), count: num(r.count) })),
    };
  },
};
