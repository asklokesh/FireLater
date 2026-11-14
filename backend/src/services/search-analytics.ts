import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { HISTORY_RETENTION_DAYS } from './search-history.js';

export interface SearchAnalytics {
  totalSearches: number;
  uniqueUsers: number;
  topQueries: { query: string; count: number }[];
  zeroResultQueries: { query: string; count: number }[];
  volumeByDay: { date: string; count: number }[];
}

export class SearchAnalyticsService {
  async getAnalytics(tenantSlug: string, days = 30): Promise<SearchAnalytics> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const window = Math.min(days, HISTORY_RETENTION_DAYS);
    const res = await pool.query(
      `WITH h AS (
         SELECT user_id, lower(query) AS query, result_count, created_at
         FROM ${schema}.search_history
         WHERE created_at > NOW() - make_interval(days => $1)
       )
       SELECT
         (SELECT COUNT(*) FROM h) AS total_searches,
         (SELECT COUNT(DISTINCT user_id) FROM h) AS unique_users,
         COALESCE((SELECT json_agg(t) FROM (
           SELECT query, COUNT(*)::int AS count FROM h GROUP BY query ORDER BY COUNT(*) DESC, query LIMIT 10) t), '[]'::json) AS top_queries,
         COALESCE((SELECT json_agg(t) FROM (
           SELECT query, COUNT(*)::int AS count FROM h WHERE result_count = 0 GROUP BY query ORDER BY COUNT(*) DESC, query LIMIT 10) t), '[]'::json) AS zero_result_queries,
         COALESCE((SELECT json_agg(t) FROM (
           SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count FROM h GROUP BY 1 ORDER BY 1) t), '[]'::json) AS volume_by_day`,
      [window]
    );
    const r = res.rows[0] ?? {};
    return {
      totalSearches: Number(r.total_searches ?? 0),
      uniqueUsers: Number(r.unique_users ?? 0),
      topQueries: r.top_queries ?? [],
      zeroResultQueries: r.zero_result_queries ?? [],
      volumeByDay: r.volume_by_day ?? [],
    };
  }
}

export const searchAnalyticsService = new SearchAnalyticsService();
