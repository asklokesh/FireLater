import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';

export interface SearchAnalytics {
  period_days: number;
  total_searches: number;
  unique_queries: number;
  zero_result_rate: number;
  avg_took_ms: number;
  top_queries: Array<{ query: string; count: number; avg_results: number }>;
  zero_result_queries: Array<{ query: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
}

export async function getSearchAnalytics(tenantSlug: string, days: number): Promise<SearchAnalytics> {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new RangeError('days must be an integer between 1 and 365');
  }
  const schema = tenantService.getSchemaName(tenantSlug);
  const where = `WHERE created_at >= (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')`;

  const [totals, top, zero, daily] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT lower(trim(query))) AS unique_queries,
              COUNT(*) FILTER (WHERE result_count = 0) AS zero_count,
              COALESCE(AVG(took_ms), 0) AS avg_took_ms
       FROM ${schema}.search_history ${where}`,
      [days]
    ),
    pool.query(
      `SELECT lower(trim(query)) AS query, COUNT(*) AS count, COALESCE(AVG(result_count), 0) AS avg_results
       FROM ${schema}.search_history ${where} AND trim(query) <> ''
       GROUP BY lower(trim(query)) ORDER BY count DESC, query ASC LIMIT 10`,
      [days]
    ),
    pool.query(
      `SELECT lower(trim(query)) AS query, COUNT(*) AS count
       FROM ${schema}.search_history ${where} AND result_count = 0 AND trim(query) <> ''
       GROUP BY lower(trim(query)) ORDER BY count DESC, query ASC LIMIT 10`,
      [days]
    ),
    pool.query(
      `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS date, COUNT(*) AS count
       FROM ${schema}.search_history ${where}
       GROUP BY created_at::date ORDER BY created_at::date ASC`,
      [days]
    ),
  ]);

  const t = totals.rows[0] ?? {};
  const total = Number(t.total ?? 0);
  const zeroCount = Number(t.zero_count ?? 0);

  const counts = new Map<string, number>();
  for (const r of daily.rows) counts.set(String(r.date).slice(0, 10), Number(r.count));
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1));
  const series: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    series.push({ date, count: counts.get(date) ?? 0 });
  }

  return {
    period_days: days,
    total_searches: total,
    unique_queries: Number(t.unique_queries ?? 0),
    zero_result_rate: total === 0 ? 0 : zeroCount / total,
    avg_took_ms: Math.round(Number(t.avg_took_ms ?? 0)),
    top_queries: top.rows.map((r: Record<string, unknown>) => ({
      query: String(r.query),
      count: Number(r.count),
      avg_results: Number(r.avg_results),
    })),
    zero_result_queries: zero.rows.map((r: Record<string, unknown>) => ({
      query: String(r.query),
      count: Number(r.count),
    })),
    daily: series,
  };
}
