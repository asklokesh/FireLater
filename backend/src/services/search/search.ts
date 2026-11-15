import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';
import { cacheService } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { NotFoundError, BadRequestError, AppError } from '../../utils/errors.js';
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
  pagination: { page: number; perPage: number; total: number; totalPages: number; totalCapped: boolean };
  facets: SearchFacets;
  facetsApproximate: boolean;
  tookMs: number;
}

export const MAX_RESULT_WINDOW = 10000;
export const FACET_ROW_CAP = 10000;
export const FACET_VALUE_LIMIT = 20;
export const SEARCH_CACHE_TTL_SECONDS = 60;

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

  const facetSql = `
    WITH m AS (
      SELECT i.status::text AS s, i.priority::text AS p, i.severity::text AS sv,
             i.application_id AS a, i.assigned_to AS u
      FROM ${schema}.issues i
      ${whereClause}
      LIMIT ${FACET_ROW_CAP + 1}
    ), c AS (SELECT * FROM m LIMIT ${FACET_ROW_CAP})
    SELECT '_meta' AS facet, NULL::text AS value, NULL::text AS label, COUNT(*) AS count FROM m
    UNION ALL
    (SELECT 'status', s, s, COUNT(*) AS count FROM c GROUP BY s ORDER BY count DESC LIMIT ${FACET_VALUE_LIMIT})
    UNION ALL
    (SELECT 'priority', p, p, COUNT(*) AS count FROM c GROUP BY p ORDER BY count DESC LIMIT ${FACET_VALUE_LIMIT})
    UNION ALL
    (SELECT 'severity', sv, sv, COUNT(*) AS count FROM c GROUP BY sv ORDER BY count DESC LIMIT ${FACET_VALUE_LIMIT})
    UNION ALL
    (SELECT 'application_id', c.a::text, MAX(fa.name), COUNT(*) AS count FROM c
       LEFT JOIN ${schema}.applications fa ON c.a = fa.id GROUP BY c.a ORDER BY count DESC LIMIT ${FACET_VALUE_LIMIT})
    UNION ALL
    (SELECT 'assigned_to', c.u::text, MAX(fu.name), COUNT(*) AS count FROM c
       LEFT JOIN ${schema}.users fu ON c.u = fu.id GROUP BY c.u ORDER BY count DESC LIMIT ${FACET_VALUE_LIMIT})`;

  const timeoutMs = Math.trunc(Number(config.search.statementTimeoutMs)) || 5000;
  const client = await pool.connect();
  let countRes, rowsRes, facetRes;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    countRes = await client.query(
      `SELECT COUNT(*) FROM (SELECT 1 FROM ${schema}.issues i ${whereClause} LIMIT ${MAX_RESULT_WINDOW + 1}) capped`,
      values
    );
    rowsRes = await client.query(
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
    );
    facetRes = await client.query(facetSql, values);
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    if ((err as { code?: string })?.code === '57014') {
      throw new AppError(
        503,
        'Service Unavailable',
        'Search timed out. Please retry shortly or narrow your query or filters.'
      );
    }
    throw err;
  } finally {
    client.release();
  }

  const rawCount = parseInt(countRes.rows[0].count, 10);
  const totalCapped = rawCount > MAX_RESULT_WINDOW;
  const total = Math.min(rawCount, MAX_RESULT_WINDOW);
  const facetRows: Array<{ facet: string; value: unknown; label?: unknown; count: unknown }> = facetRes.rows;
  const metaRow = facetRows.find((r) => r.facet === '_meta');
  const facetsApproximate = metaRow ? Number(metaRow.count) > FACET_ROW_CAP : false;
  const facetBuckets = (name: string) =>
    toBuckets(facetRows.filter((r) => r.facet === name)).slice(0, FACET_VALUE_LIMIT);

  return {
    data: rowsRes.rows.map((row: Record<string, unknown>) => ({ ...row, rank: Number(row.rank) || 0 })),
    pagination: {
      page: input.page,
      perPage: input.perPage,
      total,
      totalPages: Math.ceil(total / input.perPage),
      totalCapped,
    },
    facets: {
      status: facetBuckets('status'),
      priority: facetBuckets('priority'),
      severity: facetBuckets('severity'),
      application_id: facetBuckets('application_id'),
      assigned_to: facetBuckets('assigned_to'),
    },
    facetsApproximate,
  };
}

export function buildSearchCacheKey(tenantSlug: string, input: SearchIssuesInput): string {
  const normalized = {
    q: (input.q ?? '').trim(),
    filter: input.filter ?? null,
    sort: input.sort ?? null,
    order: input.order ?? null,
    page: input.page,
    perPage: input.perPage,
  };
  return `${tenantSlug}:issues:search:${JSON.stringify(normalized)}`;
}

export async function searchIssues(
  tenantSlug: string,
  userId: string,
  input: SearchIssuesInput
): Promise<SearchIssuesResult> {
  const started = Date.now();
  if ((input.page - 1) * input.perPage >= MAX_RESULT_WINDOW) {
    throw new BadRequestError(
      `Search results are limited to the first ${MAX_RESULT_WINDOW} matches. Narrow the query or filters to see more.`
    );
  }
  const cacheKey = buildSearchCacheKey(tenantSlug, input);
  const result = await cacheService.getOrSet(cacheKey, () => runSearch(tenantSlug, input), {
    ttl: SEARCH_CACHE_TTL_SECONDS,
  });
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
