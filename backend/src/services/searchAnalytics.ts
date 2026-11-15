import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { BadRequestError } from '../utils/errors.js';

/** Permissions allowed to view analytics (admin role is always allowed by requirePermission). */
export const ANALYTICS_PERMISSIONS = ['admin:read', 'reports:read'] as const;
const TOP_LIMIT = 10;

export interface SearchAnalytics {
  from: string;
  to: string;
  topSearches: Array<{ query: string; count: number }>;
  zeroResultSearches: Array<{ query: string; count: number }>;
  averageResultCount: number;
  searchesPerDay: Array<{ date: string; count: number }>;
}

class SearchAnalyticsService {
  async getAnalytics(tenantSlug: string, range: { from: Date; to: Date }): Promise<SearchAnalytics> {
    if (!(range.from <= range.to)) throw new BadRequestError('from must be before to');
    const schema = tenantService.getSchemaName(tenantSlug);
    const p = [range.from.toISOString(), range.to.toISOString()];
    const where = `created_at >= $1 AND created_at <= $2 AND query IS NOT NULL AND query <> ''`;

    const [top, zero, avg, perDay] = await Promise.all([
      pool.query(
        `SELECT query, COUNT(*)::int AS count FROM ${schema}.search_history WHERE ${where}
         GROUP BY query ORDER BY count DESC, query ASC LIMIT ${TOP_LIMIT}`,
        p
      ),
      pool.query(
        `SELECT query, COUNT(*)::int AS count FROM ${schema}.search_history WHERE ${where} AND result_count = 0
         GROUP BY query ORDER BY count DESC, query ASC LIMIT ${TOP_LIMIT}`,
        p
      ),
      pool.query(
        `SELECT COALESCE(AVG(result_count), 0)::float AS avg FROM ${schema}.search_history
         WHERE created_at >= $1 AND created_at <= $2`,
        p
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
         FROM ${schema}.search_history WHERE created_at >= $1 AND created_at <= $2
         GROUP BY 1 ORDER BY 1`,
        p
      ),
    ]);

    return {
      from: p[0],
      to: p[1],
      topSearches: top.rows.map((r) => ({ query: r.query, count: Number(r.count) })),
      zeroResultSearches: zero.rows.map((r) => ({ query: r.query, count: Number(r.count) })),
      averageResultCount: Number(avg.rows[0]?.avg ?? 0),
      searchesPerDay: perDay.rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    };
  }
}

export const searchAnalyticsService = new SearchAnalyticsService();
