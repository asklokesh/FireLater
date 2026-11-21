import { createHash } from 'crypto';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { cacheService } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import {
  SEARCH_ENTITIES,
  SEARCH_LANGUAGE,
  type SearchEntityDef,
  type SearchEntityType,
} from '../lib/search/entities.js';
import {
  SqlParams,
  buildFilterSql,
  mergeFilters,
  validateFilterTree,
  type FilterGroup,
} from '../lib/search/filters.js';
import { buildPrefixTsQuery, normalizeQuery, parseSearchQuery } from '../lib/search/query-parser.js';

// ============================================
// LIMITS (performance guards for large datasets)
// ============================================

export const MAX_PER_PAGE = 100;
/** Deepest result reachable by paging (page * perPage). */
export const MAX_RESULT_WINDOW = 1000;
/** Per-statement timeout so a pathological query cannot hold a connection. */
export const SEARCH_STATEMENT_TIMEOUT_MS = 5000;
const RESULT_CACHE_TTL_SECONDS = 30;
const ANALYTICS_CACHE_TTL_SECONDS = 300;
/**
 * A query only appears in other users' autocomplete once this many distinct
 * users have searched it, so one person's searches are never exposed.
 */
export const POPULAR_MIN_DISTINCT_USERS = 3;

/**
 * ts_rank_cd weights for labels {D, C, B, A}. A title (A) match is weighted so
 * that repeating a word in lower weighted body text cannot outrank it.
 */
export const RANK_WEIGHTS = "'{0.02, 0.05, 0.15, 1.0}'::float4[]";

/** Private-use code points wrapping highlighted terms in snippets. */
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_END = '';
const HEADLINE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxWords=35, MinWords=12, MaxFragments=2, FragmentDelimiter=" ... "`;

// ============================================
// TYPES
// ============================================

export type SearchSort = 'relevance' | 'updated' | 'created';

export interface SearchInput {
  q?: string;
  filters?: FilterGroup | null;
  entityTypes?: SearchEntityType[];
  page?: number;
  perPage?: number;
  sort?: SearchSort;
}

export interface SearchCaller {
  userId: string;
  /** Entity types this caller is permitted to read */
  allowedTypes: SearchEntityType[];
}

export interface SearchResultItem {
  entityType: SearchEntityType;
  id: string;
  number: string;
  title: string;
  snippet: string;
  status: string | null;
  priority: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  rank: number;
  url: string;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SearchFacets {
  entityType: FacetBucket[];
  status: FacetBucket[];
  priority: FacetBucket[];
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: SearchFacets;
  query: {
    text: string;
    entityTypes: SearchEntityType[];
    sort: SearchSort;
    warnings: string[];
  };
  tookMs: number;
}

export interface SavedSearchInput {
  name: string;
  description?: string | null;
  queryText?: string;
  filters?: FilterGroup | null;
  entityTypes?: SearchEntityType[];
  isShared?: boolean;
}

export interface SavedSearch {
  id: string;
  name: string;
  description: string | null;
  queryText: string;
  filters: FilterGroup | Record<string, never>;
  entityTypes: SearchEntityType[];
  isShared: boolean;
  isOwner: boolean;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHistoryEntry {
  id: string;
  queryText: string;
  filters: FilterGroup | Record<string, never>;
  entityTypes: SearchEntityType[];
  resultCount: number;
  createdAt: string;
}

export interface SearchSuggestions {
  history: string[];
  popular: string[];
  records: Array<{ entityType: SearchEntityType; id: string; number: string; title: string; url: string }>;
}

export interface SearchAnalytics {
  days: number;
  totals: {
    searches: number;
    uniqueUsers: number;
    avgDurationMs: number;
    avgResults: number;
    zeroResultSearches: number;
    zeroResultRate: number;
  };
  topQueries: Array<{ query: string; count: number; avgResults: number; lastSearchedAt: string }>;
  zeroResultQueries: Array<{ query: string; count: number; lastSearchedAt: string }>;
  searchesPerDay: Array<{ day: string; count: number }>;
  entityTypeUsage: Array<{ entityType: string; count: number }>;
  topTemplates: Array<{ id: string; name: string; useCount: number }>;
}

// ============================================
// SQL BUILDING
// ============================================

interface BuiltBranch {
  sql: string;
}

function tsQueryExpr(param: string): string {
  return `websearch_to_tsquery('${SEARCH_LANGUAGE}', ${param})`;
}

function orderByClause(sort: SearchSort, hasText: boolean): string {
  if (sort === 'created') return 'created_at DESC NULLS LAST, id';
  if (sort === 'updated' || !hasText) return 'updated_at DESC NULLS LAST, id';
  return 'rank DESC, updated_at DESC NULLS LAST, id';
}

function buildBranch(
  schema: string,
  entity: SearchEntityDef,
  tree: FilterGroup,
  params: SqlParams,
  userId: string,
  textParam: string | null,
  numbersParam: string | null,
  limit: { orderBy: string; count: number } | null
): BuiltBranch {
  const alias = 't';
  const vector = entity.vector(alias);
  const numberCol = `${alias}.${entity.numberColumn}`;

  let textCond = 'TRUE';
  let rank = '0';
  if (textParam) {
    const tsq = tsQueryExpr(textParam);
    textCond = `(${vector}) @@ ${tsq}`;
    rank = `ts_rank_cd(${RANK_WEIGHTS}, ${vector}, ${tsq}, 32)`;
    if (numbersParam) {
      textCond = `(${textCond} OR ${numberCol} = ANY(${numbersParam}::text[]))`;
      rank = `(${rank} + CASE WHEN ${numberCol} = ANY(${numbersParam}::text[]) THEN 1 ELSE 0 END)`;
    }
  }

  const filterSql = buildFilterSql(tree, entity, alias, params, { userId });
  const col = (name: string | null, cast: string) => (name ? `${alias}.${name}::${cast}` : `NULL::${cast}`);

  let sql = `SELECT '${entity.type}'::text AS entity_type,
      ${alias}.id,
      ${numberCol}::text AS number,
      ${alias}.${entity.titleColumn}::text AS title,
      (${entity.bodyExpr})::text AS body,
      ${col(entity.statusColumn, 'text')} AS status,
      ${col(entity.priorityColumn, 'text')} AS priority,
      ${col(entity.assigneeColumn, 'uuid')} AS assigned_to,
      ${alias}.created_at,
      ${alias}.updated_at,
      (${rank})::float8 AS rank
    FROM ${schema}.${entity.table} ${alias}
    WHERE ${textCond} AND ${filterSql}`;

  if (limit) {
    sql = `(${sql} ORDER BY ${limit.orderBy} LIMIT ${limit.count})`;
  }
  return { sql };
}

function bucket(rows: Array<{ value: string | null; count: number }>): FacetBucket[] {
  return rows
    .filter((r): r is { value: string; count: number } => r.value !== null && r.value !== '')
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function cacheKeyFor(tenantSlug: string, payload: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
  return `${tenantSlug}:search:results:${digest}`;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}

// ============================================
// SERVICE
// ============================================

export class SearchService {
  /**
   * Unified, ranked full-text search with advanced filters and facets across
   * every entity type the caller may read.
   */
  async search(tenantSlug: string, caller: SearchCaller, input: SearchInput): Promise<SearchResponse> {
    const started = Date.now();
    const parsed = parseSearchQuery(input.q);
    const warnings = [...parsed.warnings];

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(input.perPage ?? 20)));
    if (page * perPage > MAX_RESULT_WINDOW) {
      throw new BadRequestError(
        `Results beyond the first ${MAX_RESULT_WINDOW} are not available. Refine the query instead of paging deeper.`
      );
    }

    const requested = input.entityTypes?.length ? input.entityTypes : parsed.entityTypes;
    let types = caller.allowedTypes;
    if (requested && requested.length > 0) {
      const denied = requested.filter((t) => !caller.allowedTypes.includes(t));
      if (denied.length > 0) warnings.push(`No permission to search: ${denied.join(', ')}`);
      types = requested.filter((t) => caller.allowedTypes.includes(t));
    }
    types = [...new Set(types)].sort();

    const tree = mergeFilters(parsed.conditions, input.filters ?? null);
    validateFilterTree(tree);

    const hasText = parsed.text.length > 0;
    const sort: SearchSort = input.sort ?? (hasText ? 'relevance' : 'updated');

    const emptyResponse = (): SearchResponse => ({
      results: [],
      total: 0,
      page,
      perPage,
      totalPages: 0,
      facets: { entityType: [], status: [], priority: [] },
      query: { text: parsed.text, entityTypes: types, sort, warnings },
      tookMs: Date.now() - started,
    });

    let response: SearchResponse;
    if (types.length === 0) {
      response = emptyResponse();
    } else {
      const cacheKey = cacheKeyFor(tenantSlug, {
        u: caller.userId,
        types,
        text: parsed.text,
        numbers: parsed.numbers,
        tree,
        page,
        perPage,
        sort,
      });
      const cached = await cacheService.getOrSet(
        cacheKey,
        () => this.executeSearch(tenantSlug, caller.userId, types, parsed.text, parsed.numbers, tree, page, perPage, sort),
        { ttl: RESULT_CACHE_TTL_SECONDS }
      );
      response = {
        ...cached,
        query: { text: parsed.text, entityTypes: types, sort, warnings },
        tookMs: Date.now() - started,
      };
    }

    // Recorded outside the cached fetcher so cache hits still count. Only the
    // first page is recorded so paging through results is one search.
    const hasCriteria = hasText || tree.conditions.length > 0;
    if (hasCriteria && page === 1) {
      await this.recordHistory(tenantSlug, caller.userId, input.q ?? '', input.filters ?? null, types, response.total, response.tookMs);
    }

    return response;
  }

  private async executeSearch(
    tenantSlug: string,
    userId: string,
    types: SearchEntityType[],
    text: string,
    numbers: string[],
    tree: FilterGroup,
    page: number,
    perPage: number,
    sort: SearchSort
  ): Promise<Omit<SearchResponse, 'query' | 'tookMs'>> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const hasText = text.length > 0;
    const offset = (page - 1) * perPage;
    const orderBy = orderByClause(sort, hasText);

    // Facets and total: every match, grouped in one pass.
    const facetParams = new SqlParams();
    const fText = hasText ? facetParams.add(text) : null;
    const fNumbers = hasText && numbers.length ? facetParams.add(numbers) : null;
    const facetBranches = types.map((t) =>
      buildBranch(schema, SEARCH_ENTITIES[t], tree, facetParams, userId, fText, fNumbers, null).sql
    );
    const facetSql = `WITH matched AS (${facetBranches.join(' UNION ALL ')})
      SELECT entity_type, status, priority, COUNT(*)::int AS count,
             GROUPING(entity_type) AS g_entity, GROUPING(status) AS g_status, GROUPING(priority) AS g_priority
      FROM matched
      GROUP BY GROUPING SETS ((entity_type), (status), (priority), ())`;

    // Page: each branch keeps only its own top (offset + perPage) rows, which
    // is sufficient for a correct global top-k after the merge.
    const pageParams = new SqlParams();
    const pText = hasText ? pageParams.add(text) : null;
    const pNumbers = hasText && numbers.length ? pageParams.add(numbers) : null;
    const pageBranches = types.map((t) =>
      buildBranch(schema, SEARCH_ENTITIES[t], tree, pageParams, userId, pText, pNumbers, {
        orderBy,
        count: offset + perPage,
      }).sql
    );
    const snippetExpr = pText
      ? `ts_headline('${SEARCH_LANGUAGE}', left(coalesce(body, ''), 20000), ${tsQueryExpr(pText)}, ${pageParams.add(HEADLINE_OPTIONS)})`
      : `left(coalesce(body, ''), 240)`;
    const limitParam = pageParams.add(perPage);
    const offsetParam = pageParams.add(offset);
    const pageSql = `WITH matched AS (${pageBranches.join(' UNION ALL ')}),
      page AS (SELECT * FROM matched ORDER BY ${orderBy} LIMIT ${limitParam} OFFSET ${offsetParam})
      SELECT entity_type, id, number, title, status, priority, assigned_to, created_at, updated_at, rank,
             ${snippetExpr} AS snippet
      FROM page
      ORDER BY ${orderBy}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${SEARCH_STATEMENT_TIMEOUT_MS}`);
      const facetResult = await client.query(facetSql, facetParams.values);
      const pageResult = await client.query(pageSql, pageParams.values);
      await client.query('COMMIT');

      let total = 0;
      const entityRows: Array<{ value: string | null; count: number }> = [];
      const statusRows: Array<{ value: string | null; count: number }> = [];
      const priorityRows: Array<{ value: string | null; count: number }> = [];
      for (const row of facetResult.rows) {
        const count = Number(row.count);
        if (row.g_entity === 1 && row.g_status === 1 && row.g_priority === 1) total = count;
        else if (row.g_entity === 0) entityRows.push({ value: row.entity_type, count });
        else if (row.g_status === 0) statusRows.push({ value: row.status, count });
        else if (row.g_priority === 0) priorityRows.push({ value: row.priority, count });
      }

      const results: SearchResultItem[] = pageResult.rows.map((row) => {
        const type = row.entity_type as SearchEntityType;
        return {
          entityType: type,
          id: row.id,
          number: row.number,
          title: row.title,
          snippet: row.snippet ?? '',
          status: row.status ?? null,
          priority: row.priority ?? null,
          assignedTo: row.assigned_to ?? null,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
          rank: Number(row.rank) || 0,
          url: `${SEARCH_ENTITIES[type].urlPrefix}/${row.id}`,
        };
      });

      return {
        results,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        facets: { entityType: bucket(entityRows), status: bucket(statusRows), priority: bucket(priorityRows) },
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '57014') {
        throw new BadRequestError('Search took too long. Add more specific terms or filters.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // SEARCH HISTORY
  // ============================================

  async recordHistory(
    tenantSlug: string,
    userId: string,
    queryText: string,
    filters: FilterGroup | null,
    entityTypes: SearchEntityType[],
    resultCount: number,
    durationMs: number
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const text = queryText.slice(0, 500);
    try {
      await pool.query(
        `INSERT INTO ${schema}.search_history
           (user_id, query_text, normalized_query, filters, entity_types, result_count, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, text, normalizeQuery(text), JSON.stringify(filters ?? {}), entityTypes, resultCount, Math.round(durationMs)]
      );
    } catch (error) {
      // History is best effort and must never fail the search itself.
      logger.warn({ err: error, tenantSlug }, 'Failed to record search history');
    }
  }

  async getHistory(tenantSlug: string, userId: string, limit = 20): Promise<SearchHistoryEntry[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const result = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (normalized_query, filters::text)
                id, query_text, filters, entity_types, result_count, created_at
         FROM ${schema}.search_history
         WHERE user_id = $1
         ORDER BY normalized_query, filters::text, created_at DESC
       ) latest
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, safeLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      queryText: row.query_text,
      filters: row.filters ?? {},
      entityTypes: row.entity_types ?? [],
      resultCount: Number(row.result_count),
      createdAt: toIso(row.created_at),
    }));
  }

  async clearHistory(tenantSlug: string, userId: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
    return result.rowCount ?? 0;
  }

  async deleteHistoryEntry(tenantSlug: string, userId: string, entryId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const target = await pool.query(
      `SELECT normalized_query, filters::text AS filters FROM ${schema}.search_history WHERE id = $1 AND user_id = $2`,
      [entryId, userId]
    );
    if (target.rows.length === 0) throw new NotFoundError('Search history entry', entryId);
    // Remove every occurrence of the same search so it disappears from the list.
    await pool.query(
      `DELETE FROM ${schema}.search_history WHERE user_id = $1 AND normalized_query = $2 AND filters::text = $3`,
      [userId, target.rows[0].normalized_query, target.rows[0].filters]
    );
  }

  // ============================================
  // AUTOCOMPLETE
  // ============================================

  async suggest(tenantSlug: string, caller: SearchCaller, prefix: string, limit = 5): Promise<SearchSuggestions> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const normalized = normalizeQuery(prefix).slice(0, 100);
    const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)));
    if (!normalized) return { history: [], popular: [], records: [] };

    const likePattern = `${normalized.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const historyResult = await pool.query(
      `SELECT query_text FROM (
         SELECT DISTINCT ON (normalized_query) query_text, created_at
         FROM ${schema}.search_history
         WHERE user_id = $1 AND normalized_query LIKE $2 AND normalized_query <> ''
         ORDER BY normalized_query, created_at DESC
       ) h ORDER BY created_at DESC LIMIT $3`,
      [caller.userId, likePattern, safeLimit]
    );

    const popularResult = await pool.query(
      `SELECT normalized_query AS query, COUNT(DISTINCT user_id)::int AS users, COUNT(*)::int AS count
       FROM ${schema}.search_history
       WHERE normalized_query LIKE $1 AND normalized_query <> '' AND result_count > 0
         AND created_at >= NOW() - interval '30 days'
       GROUP BY normalized_query
       HAVING COUNT(DISTINCT user_id) >= $3
       ORDER BY users DESC, count DESC, normalized_query
       LIMIT $2`,
      [likePattern, safeLimit, POPULAR_MIN_DISTINCT_USERS]
    );

    const records: SearchSuggestions['records'] = [];
    const tsq = buildPrefixTsQuery(prefix);
    if (tsq && caller.allowedTypes.length > 0) {
      const params = new SqlParams();
      const qParam = params.add(tsq);
      const branches = caller.allowedTypes.map((type) => {
        const entity = SEARCH_ENTITIES[type];
        const vector = entity.vector('t');
        const query = `to_tsquery('${SEARCH_LANGUAGE}', ${qParam})`;
        return `(SELECT '${type}'::text AS entity_type, t.id, t.${entity.numberColumn}::text AS number, t.${entity.titleColumn}::text AS title,
                  ts_rank_cd(${RANK_WEIGHTS}, ${vector}, ${query}) AS rank, t.updated_at
                FROM ${schema}.${entity.table} t
                WHERE (${vector}) @@ ${query}
                ORDER BY rank DESC, t.updated_at DESC NULLS LAST
                LIMIT ${safeLimit})`;
      });
      const limitParam = params.add(safeLimit);
      const result = await pool.query(
        `SELECT * FROM (${branches.join(' UNION ALL ')}) s ORDER BY rank DESC, updated_at DESC NULLS LAST LIMIT ${limitParam}`,
        params.values
      );
      for (const row of result.rows) {
        const type = row.entity_type as SearchEntityType;
        records.push({
          entityType: type,
          id: row.id,
          number: row.number,
          title: row.title,
          url: `${SEARCH_ENTITIES[type].urlPrefix}/${row.id}`,
        });
      }
    }

    return {
      history: historyResult.rows.map((r) => r.query_text),
      popular: popularResult.rows.map((r) => r.query),
      records,
    };
  }

  // ============================================
  // SAVED SEARCH TEMPLATES
  // ============================================

  private mapTemplate(row: Record<string, unknown>, userId: string): SavedSearch {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      queryText: (row.query_text as string) ?? '',
      filters: (row.filters as FilterGroup) ?? {},
      entityTypes: (row.entity_types as SearchEntityType[]) ?? [],
      isShared: Boolean(row.is_shared),
      isOwner: row.user_id === userId,
      useCount: Number(row.use_count ?? 0),
      lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private validateTemplate(input: Partial<SavedSearchInput>): void {
    if (input.filters && input.filters.conditions?.length) validateFilterTree(input.filters);
    if (input.queryText) {
      // Rejects unsupported qualifiers early instead of at run time.
      validateFilterTree({ op: 'and', conditions: parseSearchQuery(input.queryText).conditions });
    }
  }

  async listTemplates(tenantSlug: string, userId: string): Promise<SavedSearch[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.saved_searches
       WHERE user_id = $1 OR is_shared = true
       ORDER BY (user_id = $1) DESC, name ASC`,
      [userId]
    );
    return result.rows.map((row) => this.mapTemplate(row, userId));
  }

  async getTemplate(tenantSlug: string, userId: string, id: string): Promise<SavedSearch> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.saved_searches WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
      [id, userId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Saved search', id);
    return this.mapTemplate(result.rows[0], userId);
  }

  async createTemplate(tenantSlug: string, userId: string, input: SavedSearchInput): Promise<SavedSearch> {
    this.validateTemplate(input);
    const schema = tenantService.getSchemaName(tenantSlug);
    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.saved_searches
           (user_id, name, description, query_text, filters, entity_types, is_shared)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userId,
          input.name.trim(),
          input.description ?? null,
          input.queryText ?? '',
          JSON.stringify(input.filters ?? {}),
          input.entityTypes ?? [],
          input.isShared ?? false,
        ]
      );
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return this.mapTemplate(result.rows[0], userId);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError(`A saved search named "${input.name.trim()}" already exists`);
      }
      throw error;
    }
  }

  async updateTemplate(
    tenantSlug: string,
    userId: string,
    id: string,
    input: Partial<SavedSearchInput>
  ): Promise<SavedSearch> {
    this.validateTemplate(input);
    const schema = tenantService.getSchemaName(tenantSlug);
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) add('name', input.name.trim());
    if (input.description !== undefined) add('description', input.description);
    if (input.queryText !== undefined) add('query_text', input.queryText);
    if (input.filters !== undefined) add('filters', JSON.stringify(input.filters ?? {}));
    if (input.entityTypes !== undefined) add('entity_types', input.entityTypes);
    if (input.isShared !== undefined) add('is_shared', input.isShared);
    if (sets.length === 0) return this.getTemplate(tenantSlug, userId, id);

    values.push(id, userId);
    try {
      const result = await pool.query(
        `UPDATE ${schema}.saved_searches SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND user_id = $${values.length}
         RETURNING *`,
        values
      );
      if (result.rows.length === 0) throw new NotFoundError('Saved search', id);
      await cacheService.invalidateTenant(tenantSlug, 'search');
      return this.mapTemplate(result.rows[0], userId);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError(`A saved search named "${input.name?.trim()}" already exists`);
      }
      throw error;
    }
  }

  async deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.saved_searches WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if ((result.rowCount ?? 0) === 0) throw new NotFoundError('Saved search', id);
    await cacheService.invalidateTenant(tenantSlug, 'search');
  }

  /** Marks a template as used (for "most used" ordering and analytics). */
  async useTemplate(tenantSlug: string, userId: string, id: string): Promise<SavedSearch> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `UPDATE ${schema}.saved_searches
       SET use_count = use_count + 1, last_used_at = NOW()
       WHERE id = $1 AND (user_id = $2 OR is_shared = true)
       RETURNING *`,
      [id, userId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Saved search', id);
    return this.mapTemplate(result.rows[0], userId);
  }

  // ============================================
  // ANALYTICS
  // ============================================

  async getAnalytics(tenantSlug: string, days = 30): Promise<SearchAnalytics> {
    const safeDays = Math.min(365, Math.max(1, Math.floor(days)));
    const cacheKey = `${tenantSlug}:search:analytics:${safeDays}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const since = `created_at >= NOW() - make_interval(days => $1)`;

        const [totals, top, zero, perDay, usage, templates] = await Promise.all([
          pool.query(
            `SELECT COUNT(*)::int AS searches,
                    COUNT(DISTINCT user_id)::int AS unique_users,
                    COALESCE(ROUND(AVG(duration_ms)), 0)::int AS avg_duration_ms,
                    COALESCE(ROUND(AVG(result_count), 1), 0)::float8 AS avg_results,
                    COUNT(*) FILTER (WHERE result_count = 0)::int AS zero_results
             FROM ${schema}.search_history WHERE ${since}`,
            [safeDays]
          ),
          pool.query(
            `SELECT normalized_query AS query, COUNT(*)::int AS count,
                    ROUND(AVG(result_count))::int AS avg_results, MAX(created_at) AS last_searched_at
             FROM ${schema}.search_history
             WHERE ${since} AND normalized_query <> ''
             GROUP BY normalized_query
             ORDER BY count DESC, query
             LIMIT 10`,
            [safeDays]
          ),
          pool.query(
            `SELECT normalized_query AS query, COUNT(*)::int AS count, MAX(created_at) AS last_searched_at
             FROM ${schema}.search_history
             WHERE ${since} AND normalized_query <> '' AND result_count = 0
             GROUP BY normalized_query
             ORDER BY count DESC, query
             LIMIT 10`,
            [safeDays]
          ),
          pool.query(
            `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
             FROM ${schema}.search_history
             WHERE ${since}
             GROUP BY 1
             ORDER BY 1`,
            [safeDays]
          ),
          pool.query(
            `SELECT entity_type, COUNT(*)::int AS count
             FROM ${schema}.search_history, unnest(entity_types) AS entity_type
             WHERE ${since}
             GROUP BY entity_type
             ORDER BY count DESC`,
            [safeDays]
          ),
          pool.query(
            `SELECT id, name, use_count FROM ${schema}.saved_searches
             WHERE use_count > 0
             ORDER BY use_count DESC, name
             LIMIT 5`
          ),
        ]);

        const t = totals.rows[0] ?? {};
        const searches = Number(t.searches ?? 0);
        const zeroResults = Number(t.zero_results ?? 0);

        return {
          days: safeDays,
          totals: {
            searches,
            uniqueUsers: Number(t.unique_users ?? 0),
            avgDurationMs: Number(t.avg_duration_ms ?? 0),
            avgResults: Number(t.avg_results ?? 0),
            zeroResultSearches: zeroResults,
            zeroResultRate: searches > 0 ? Math.round((zeroResults / searches) * 1000) / 1000 : 0,
          },
          topQueries: top.rows.map((r) => ({
            query: r.query,
            count: Number(r.count),
            avgResults: Number(r.avg_results),
            lastSearchedAt: toIso(r.last_searched_at),
          })),
          zeroResultQueries: zero.rows.map((r) => ({
            query: r.query,
            count: Number(r.count),
            lastSearchedAt: toIso(r.last_searched_at),
          })),
          searchesPerDay: perDay.rows.map((r) => ({ day: r.day, count: Number(r.count) })),
          entityTypeUsage: usage.rows.map((r) => ({ entityType: r.entity_type, count: Number(r.count) })),
          topTemplates: templates.rows.map((r) => ({ id: r.id, name: r.name, useCount: Number(r.use_count) })),
        };
      },
      { ttl: ANALYTICS_CACHE_TTL_SECONDS }
    );
  }
}

export const searchService = new SearchService();
