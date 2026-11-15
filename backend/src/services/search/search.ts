import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';
import { cacheService } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';
import { buildFilterClause, type FilterGroup } from './filter-builder.js';
import { parseSearchQuery } from './query-parser.js';
import { buildTextSearchClause, buildRankExpression } from './fts.js';

export type SearchSort = 'relevance' | 'created_at' | 'updated_at' | 'priority' | 'status';

export interface SearchIssuesInput {
  q?: string;
  filter?: FilterGroup;
  sort?: SearchSort;
  order?: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface SearchFacets {
  status: FacetBucket[];
  priority: FacetBucket[];
  severity: FacetBucket[];
  application_id: FacetBucket[];
  assigned_to: FacetBucket[];
}

export interface SearchIssuesResult {
  data: Array<Record<string, unknown> & { rank: number }>;
  pagination: { page: number; perPage: number; total: number; totalPages: number };
  facets: SearchFacets;
  tookMs: number;
}

const SORT_COLUMNS: Record<string, string> = {
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
  priority: 'i.priority',
  status: 'i.status',
};

function toBuckets(rows: Array<{ value: unknown; label?: unknown; count: unknown }>): FacetBucket[] {
  return rows
    .filter((r) => r.value !== null && r.value !== undefined)
    .map((r) => ({
      value: String(r.value),
      label: r.label === null || r.label === undefined ? String(r.value) : String(r.label),
      count: Number(r.count),
    }))
    .sort((a, b) => b.count - a.count);
}

async function runSearch(
  tenantSlug: string,
  input: SearchIssuesInput
): Promise<Omit<SearchIssuesResult, 'tookMs'>> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const parsed = parseSearchQuery(input.q ?? '');
  const text = parsed.text.trim();

  const values: unknown[] = [];
  const where: string[] = [];
  let idx = 1;
  let textIndex: number | null = null;

  if (text) {
    textIndex = idx;
    values.push(text);
    where.push(buildTextSearchClause('i', idx));
    idx += 1;
  }
  const groups: FilterGroup[] = [];
  if (parsed.filter) groups.push(parsed.filter);
  if (input.filter) groups.push(input.filter);
  for (const g of groups) {
    const c = buildFilterClause(g, { alias: 'i', startIndex: idx });
    where.push(c.sql);
    values.push(...c.values);
    idx = c.nextIndex;
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sort: SearchSort = input.sort ?? (textIndex !== null ? 'relevance' : 'created_at');
  const dir = input.order === 'asc' ? 'ASC' : 'DESC';
  const rankExpr = textIndex !== null ? buildRankExpression('i', textIndex) : '0::float4';
  const orderBy =
    sort === 'relevance'
      ? 'rank DESC, i.created_at DESC'
      : `${SORT_COLUMNS[sort]} ${dir}, i.created_at DESC`;

  const offset = (input.page - 1) * input.perPage;

  const facetQuery = (col: string, join: string, label: string) =>
    pool.query(
      `SELECT i.${col}::text AS value, ${label} AS label, COUNT(*) AS count
       FROM ${schema}.issues i ${join}
       ${whereClause}
       GROUP BY i.${col}, ${label}
       ORDER BY count DESC`,
      values
    );

  const [countRes, rowsRes, status, priority, severity, app, assignee] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM ${schema}.issues i ${whereClause}`, values),
    pool.query(
      `SELECT i.*, ${rankExpr} AS rank,
              r.name as reporter_name, r.email as reporter_email,
              a.name as assignee_name, a.email as assignee_email,
              g.name as assigned_group_name,
              app.name as application_name, app.app_id as application_app_id
       FROM ${schema}.issues i
       LEFT JOIN ${schema}.users r ON i.reporter_id = r.id
       LEFT JOIN ${schema}.users a ON i.assigned_to = a.id
       LEFT JOIN ${schema}.groups g ON i.assigned_group = g.id
       LEFT JOIN ${schema}.applications app ON i.application_id = app.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, input.perPage, offset]
    ),
    facetQuery('status', '', 'i.status::text'),
    facetQuery('priority', '', 'i.priority::text'),
    facetQuery('severity', '', 'i.severity::text'),
    facetQuery('application_id', `LEFT JOIN ${schema}.applications fa ON i.application_id = fa.id`, 'fa.name'),
    facetQuery('assigned_to', `LEFT JOIN ${schema}.users fu ON i.assigned_to = fu.id`, 'fu.name'),
  ]);

  const total = parseInt(countRes.rows[0].count, 10);
  return {
    data: rowsRes.rows.map((row: Record<string, unknown>) => ({ ...row, rank: Number(row.rank) || 0 })),
    pagination: {
      page: input.page,
      perPage: input.perPage,
      total,
      totalPages: Math.ceil(total / input.perPage),
    },
    facets: {
      status: toBuckets(status.rows),
      priority: toBuckets(priority.rows),
      severity: toBuckets(severity.rows),
      application_id: toBuckets(app.rows),
      assigned_to: toBuckets(assignee.rows),
    },
  };
}

export async function searchIssues(
  tenantSlug: string,
  userId: string,
  input: SearchIssuesInput
): Promise<SearchIssuesResult> {
  const started = Date.now();
  const cacheKey = `${tenantSlug}:issues:search:${JSON.stringify(input)}`;
  const result = await cacheService.getOrSet(cacheKey, () => runSearch(tenantSlug, input), { ttl: 300 });
  const tookMs = Date.now() - started;

  const q = (input.q ?? '').trim();
  const hasFilter = !!input.filter && input.filter.conditions.length > 0;
  if (q || hasFilter) {
    const schema = tenantService.getSchemaName(tenantSlug);
    // Fire and forget: history failures must never affect the response.
    Promise.resolve()
      .then(() =>
        pool.query(
          `INSERT INTO ${schema}.search_history (user_id, query, filter, result_count, took_ms)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, q, input.filter ? JSON.stringify(input.filter) : null, result.pagination.total, tookMs]
        )
      )
      .catch((err: unknown) => {
        logger.warn({ err }, 'Failed to record search history');
      });
  }

  return { ...result, tookMs };
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  filter: unknown;
  result_count: number | null;
  created_at: string;
}

export async function listSearchHistory(
  tenantSlug: string,
  userId: string,
  limit = 10
): Promise<SearchHistoryEntry[]> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const lim = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50);
  const result = await pool.query(
    `SELECT id, query, filter, result_count, created_at FROM (
       SELECT DISTINCT ON (query) id, query, filter, result_count, created_at
       FROM ${schema}.search_history
       WHERE user_id = $1
       ORDER BY query, created_at DESC
     ) h
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, lim]
  );
  return result.rows;
}

export async function clearSearchHistory(tenantSlug: string, userId: string): Promise<void> {
  const schema = tenantService.getSchemaName(tenantSlug);
  await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
}

export async function deleteSearchHistoryEntry(
  tenantSlug: string,
  userId: string,
  id: string
): Promise<void> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const result = await pool.query(
    `DELETE FROM ${schema}.search_history WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!result.rowCount) throw new NotFoundError('Search history entry');
}

export interface Suggestion {
  text: string;
  source: 'history' | 'popular';
}

export async function getSuggestions(
  tenantSlug: string,
  userId: string,
  q: string,
  limit = 8
): Promise<Suggestion[]> {
  const prefix = (q ?? '').trim();
  if (prefix.length < 2) return [];
  const schema = tenantService.getSchemaName(tenantSlug);
  const lim = Math.min(Math.max(Math.trunc(limit) || 8, 1), 20);
  const like = `${prefix.replace(/[\\%_]/g, '\\$&')}%`;

  const history = await pool.query(
    `SELECT query FROM ${schema}.search_history
     WHERE user_id = $1 AND lower(query) LIKE lower($2)
     GROUP BY query
     ORDER BY MAX(created_at) DESC
     LIMIT $3`,
    [userId, like, lim]
  );
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const r of history.rows) {
    const key = String(r.query).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: r.query, source: 'history' });
  }
  if (out.length < lim) {
    const popular = await pool.query(
      `SELECT query FROM ${schema}.search_history
       WHERE result_count > 0 AND lower(query) LIKE lower($1)
       GROUP BY query
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      [like, lim]
    );
    for (const r of popular.rows) {
      if (out.length >= lim) break;
      const key = String(r.query).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: r.query, source: 'popular' });
    }
  }
  return out.slice(0, lim);
}
