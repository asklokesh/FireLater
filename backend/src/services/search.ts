import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';
import { buildFilterClause, FilterGroup } from './search-filters.js';

// ============================================
// TYPES
// ============================================

export type SearchEntityType = 'issue' | 'problem';

export const SEARCH_ENTITIES: Record<SearchEntityType, { table: string; numberColumn: string }> = {
  issue: { table: 'issues', numberColumn: 'issue_number' },
  problem: { table: 'problems', numberColumn: 'problem_number' },
};

export const FACET_FIELDS = ['status', 'priority', 'urgency', 'impact'] as const;
export type FacetField = (typeof FACET_FIELDS)[number];

/** Upper bound on search query time to protect large tenants. */
export const SEARCH_STATEMENT_TIMEOUT_MS = 5000;

export interface SearchParams {
  q?: string;
  entityType: SearchEntityType;
  filter?: FilterGroup;
  page: number;
  perPage: number;
}

export interface SearchResultItem {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  rank: number;
  headline: string | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  page: number;
  perPage: number;
  durationMs: number;
}

export type FacetCounts = Record<FacetField, Array<{ value: string; count: number }>>;

export interface FilterTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  entity_type: SearchEntityType;
  query: string | null;
  filter: FilterGroup | Record<string, never>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveTemplateData {
  name: string;
  description?: string;
  entityType: SearchEntityType;
  query?: string;
  filter?: FilterGroup;
  isShared?: boolean;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  entity_type: SearchEntityType;
  result_count: number;
  created_at: string;
}

export interface SearchAnalytics {
  popularSearches: Array<{ query: string; count: number; avg_results: number }>;
  zeroResultSearches: Array<{ query: string; count: number }>;
  searchesPerDay: Array<{ day: string; count: number }>;
  totalSearches: number;
  avgDurationMs: number | null;
}

/**
 * Optional external search backend (e.g. Elasticsearch) for very large
 * deployments. No adapter is bundled; PostgreSQL full-text search is used
 * unless an adapter is registered via setSearchAdapter().
 */
export interface ExternalSearchAdapter {
  name: string;
  search(tenantSlug: string, params: SearchParams): Promise<SearchResult>;
}

let externalAdapter: ExternalSearchAdapter | null = null;

export function setSearchAdapter(adapter: ExternalSearchAdapter | null): void {
  externalAdapter = adapter;
}

// ============================================
// QUERY BUILDING (pure, exported for tests)
// ============================================

export function normalizeQuery(q: string | undefined): string {
  return (q ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

/**
 * Build the SQL used for a full-text search. Free text is parsed with
 * websearch_to_tsquery (supports "quoted phrases", OR, and -exclusion) and
 * results are ordered by ts_rank relevance.
 */
export function buildSearchSql(
  schema: string,
  params: SearchParams
): { dataSql: string; countSql: string; values: unknown[]; countValues: unknown[] } {
  const entity = SEARCH_ENTITIES[params.entityType];
  const q = normalizeQuery(params.q);
  const values: unknown[] = [];
  const where: string[] = [];

  let rankExpr = '0::real';
  let headlineExpr = 'NULL::text';
  if (q) {
    values.push(q);
    const tsq = `websearch_to_tsquery('english', $${values.length})`;
    where.push(
      `(t.search_tsvector @@ ${tsq} OR t.${entity.numberColumn} ILIKE $${values.length + 1})`
    );
    values.push(`${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    rankExpr = `ts_rank(t.search_tsvector, ${tsq})`;
    headlineExpr = `ts_headline('english', coalesce(t.description, ''), ${tsq}, 'MaxWords=30, MinWords=10')`;
  }

  if (params.filter) {
    const built = buildFilterClause(params.filter, values.length + 1, 't');
    where.push(built.sql);
    values.push(...built.params);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countValues = [...values];
  const offset = (params.page - 1) * params.perPage;
  values.push(params.perPage, offset);

  const dataSql = `
    SELECT t.id, t.${entity.numberColumn} AS number, t.title, t.description, t.status, t.priority,
           t.created_at, t.updated_at,
           ${rankExpr} AS rank,
           ${headlineExpr} AS headline
    FROM ${schema}.${entity.table} t
    ${whereSql}
    ORDER BY rank DESC, t.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM ${schema}.${entity.table} t ${whereSql}`;
  return { dataSql, countSql, values, countValues };
}

// ============================================
// FILTER TEMPLATE REPOSITORY
// ============================================

export class FilterTemplateRepository {
  async list(tenantSlug: string, userId: string, entityType?: SearchEntityType): Promise<FilterTemplate[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const values: unknown[] = [userId];
    let sql = `SELECT * FROM ${schema}.filter_templates WHERE (user_id = $1 OR is_shared = true)`;
    if (entityType) {
      values.push(entityType);
      sql += ` AND entity_type = $2`;
    }
    sql += ' ORDER BY name ASC';
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async loadTemplate(tenantSlug: string, userId: string, id: string): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.filter_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Filter template', id);
    }
    return result.rows[0];
  }

  async saveTemplate(tenantSlug: string, userId: string, data: SaveTemplateData): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `INSERT INTO ${schema}.filter_templates (user_id, name, description, entity_type, query, filter, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, name) DO UPDATE SET
         description = EXCLUDED.description,
         entity_type = EXCLUDED.entity_type,
         query = EXCLUDED.query,
         filter = EXCLUDED.filter,
         is_shared = EXCLUDED.is_shared,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        data.name,
        data.description ?? null,
        data.entityType,
        data.query ?? null,
        JSON.stringify(data.filter ?? {}),
        data.isShared ?? false,
      ]
    );
    return result.rows[0];
  }

  async updateTemplate(
    tenantSlug: string,
    userId: string,
    id: string,
    data: Partial<SaveTemplateData>
  ): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `UPDATE ${schema}.filter_templates SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         entity_type = COALESCE($5, entity_type),
         query = COALESCE($6, query),
         filter = COALESCE($7::jsonb, filter),
         is_shared = COALESCE($8, is_shared),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        data.name ?? null,
        data.description ?? null,
        data.entityType ?? null,
        data.query ?? null,
        data.filter ? JSON.stringify(data.filter) : null,
        data.isShared ?? null,
      ]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Filter template', id);
    }
    return result.rows[0];
  }

  async deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.filter_templates WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Filter template', id);
    }
  }
}

export const filterTemplateRepository = new FilterTemplateRepository();

// ============================================
// SEARCH SERVICE
// ============================================

class SearchService {
  async search(tenantSlug: string, userId: string, params: SearchParams): Promise<SearchResult> {
    const started = Date.now();
    let result: SearchResult;

    if (externalAdapter) {
      result = await externalAdapter.search(tenantSlug, params);
    } else {
      const schema = tenantService.getSchemaName(tenantSlug);
      const { dataSql, countSql, values, countValues } = buildSearchSql(schema, params);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL statement_timeout = ${SEARCH_STATEMENT_TIMEOUT_MS}`);
        const [data, count] = await Promise.all([
          client.query(dataSql, values),
          client.query(countSql, countValues),
        ]);
        await client.query('COMMIT');
        result = {
          items: data.rows.map((r) => ({ ...r, rank: Number(r.rank) })),
          total: count.rows[0]?.total ?? 0,
          page: params.page,
          perPage: params.perPage,
          durationMs: Date.now() - started,
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }

    const q = normalizeQuery(params.q);
    if (q) {
      await this.recordSearch(tenantSlug, userId, q, params, result.total, result.durationMs);
    }
    return result;
  }

  async getFacets(tenantSlug: string, entityType: SearchEntityType, q?: string): Promise<FacetCounts> {
    const query = normalizeQuery(q);
    // Keyed under the entity namespace so existing issue/problem mutations
    // (which call invalidateTenant(tenantSlug, 'issues' | 'problems')) clear it.
    const cacheKey = `${tenantSlug}:${SEARCH_ENTITIES[entityType].table}:search-facets:${JSON.stringify({ query })}`;
    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const { table } = SEARCH_ENTITIES[entityType];
        const values: unknown[] = [];
        let where = '';
        if (query) {
          values.push(query);
          where = `WHERE search_tsvector @@ websearch_to_tsquery('english', $1)`;
        }
        const unions = FACET_FIELDS.map(
          (f) => `SELECT '${f}' AS facet, ${f}::text AS value, COUNT(*)::int AS count
                  FROM ${schema}.${table} ${where} GROUP BY ${f}`
        ).join(' UNION ALL ');
        const result = await pool.query(unions, values);
        const facets = Object.fromEntries(FACET_FIELDS.map((f) => [f, []])) as unknown as FacetCounts;
        for (const row of result.rows as Array<{ facet: FacetField; value: string | null; count: number }>) {
          if (row.value === null) continue;
          facets[row.facet].push({ value: row.value, count: row.count });
        }
        for (const f of FACET_FIELDS) {
          facets[f].sort((a, b) => b.count - a.count);
        }
        return facets;
      },
      { ttl: 300 }
    );
  }

  async invalidateFacets(tenantSlug: string, entityType: SearchEntityType): Promise<void> {
    await cacheService.invalidateTenant(tenantSlug, SEARCH_ENTITIES[entityType].table);
  }

  async suggest(tenantSlug: string, userId: string, prefix: string, limit = 8): Promise<string[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const p = normalizeQuery(prefix);
    if (!p) return [];
    const like = `${p.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const result = await pool.query(
      `SELECT query FROM (
         SELECT query, MAX(created_at) AS last_used, 0 AS source
         FROM ${schema}.search_history WHERE user_id = $1 AND query ILIKE $2 GROUP BY query
         UNION ALL
         SELECT title AS query, MAX(created_at) AS last_used, 1 AS source
         FROM ${schema}.issues WHERE title ILIKE $3 GROUP BY title
       ) s
       ORDER BY source ASC, last_used DESC
       LIMIT $4`,
      [userId, like, `%${like}`, limit]
    );
    return Array.from(new Set(result.rows.map((r: { query: string }) => r.query)));
  }

  async recordSearch(
    tenantSlug: string,
    userId: string,
    query: string,
    params: SearchParams,
    resultCount: number,
    durationMs: number
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    try {
      await pool.query(
        `INSERT INTO ${schema}.search_history (user_id, query, entity_type, filter, result_count, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, query, params.entityType, params.filter ? JSON.stringify(params.filter) : null, resultCount, durationMs]
      );
    } catch (err) {
      // History is best-effort and must not fail the search itself
      logger.warn({ err, tenantSlug }, 'Failed to record search history');
    }
  }

  async getHistory(tenantSlug: string, userId: string, limit = 20): Promise<SearchHistoryEntry[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT DISTINCT ON (query) id, query, entity_type, result_count, created_at
       FROM ${schema}.search_history WHERE user_id = $1
       ORDER BY query, created_at DESC`,
      [userId]
    );
    return (result.rows as SearchHistoryEntry[])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  async clearHistory(tenantSlug: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
  }

  async getSearchAnalytics(tenantSlug: string, days = 30): Promise<SearchAnalytics> {
    const cacheKey = `${tenantSlug}:search:analytics:${days}`;
    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const since = `NOW() - ($1::int * INTERVAL '1 day')`;
        const [popular, zero, perDay, totals] = await Promise.all([
          pool.query(
            `SELECT lower(query) AS query, COUNT(*)::int AS count, ROUND(AVG(result_count))::int AS avg_results
             FROM ${schema}.search_history WHERE created_at >= ${since}
             GROUP BY lower(query) ORDER BY count DESC LIMIT 20`,
            [days]
          ),
          pool.query(
            `SELECT lower(query) AS query, COUNT(*)::int AS count
             FROM ${schema}.search_history WHERE created_at >= ${since} AND result_count = 0
             GROUP BY lower(query) ORDER BY count DESC LIMIT 20`,
            [days]
          ),
          pool.query(
            `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
             FROM ${schema}.search_history WHERE created_at >= ${since}
             GROUP BY 1 ORDER BY 1 ASC`,
            [days]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS total, AVG(duration_ms)::float AS avg_duration
             FROM ${schema}.search_history WHERE created_at >= ${since}`,
            [days]
          ),
        ]);
        return {
          popularSearches: popular.rows,
          zeroResultSearches: zero.rows,
          searchesPerDay: perDay.rows,
          totalSearches: totals.rows[0]?.total ?? 0,
          avgDurationMs: totals.rows[0]?.avg_duration ?? null,
        };
      },
      { ttl: 300 }
    );
  }
}

export const searchService = new SearchService();
