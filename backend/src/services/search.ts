import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { buildFilterQuery, parseSearchQuery, FilterGroup } from './search-filters.js';

// Same expression as the GIN index in migration 037 so the planner can use it.
const ISSUE_TSVECTOR = `to_tsvector('english', coalesce(i.title, '') || ' ' || coalesce(i.description, ''))`;

// Elasticsearch is not implemented in this codebase. If ELASTICSEARCH_URL is set we
// warn once and keep using the PostgreSQL full-text path.
let esWarned = false;
function warnIfElasticsearchConfigured(): void {
  if (process.env.ELASTICSEARCH_URL && !esWarned) {
    esWarned = true;
    logger.warn('ELASTICSEARCH_URL is set but the Elasticsearch backend is not implemented; using PostgreSQL full-text search');
  }
}

export interface SearchParams {
  q?: string;
  filterGroup?: FilterGroup;
  page?: number;
  perPage?: number;
}

export interface SearchResultRow {
  id: string;
  issue_number: string;
  title: string;
  status: string;
  priority: string;
  category_id: string | null;
  created_at: string;
  rank: number;
  headline: string | null;
}

export interface FacetCount { value: string | null; count: number }

export interface FilterTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  query: string | null;
  filter_group: FilterGroup;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

function buildWhere(params: SearchParams): { where: string; values: unknown[]; text: string } {
  const parsed = parseSearchQuery(params.q ?? '');
  const groups: FilterGroup = {
    operator: 'AND',
    conditions: [parsed.filterGroup, ...(params.filterGroup ? [params.filterGroup] : [])],
  };
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (parsed.text) {
    values.push(parsed.text);
    clauses.push(`${ISSUE_TSVECTOR} @@ websearch_to_tsquery('english', $1)`);
  }
  const built = buildFilterQuery(groups, values.length + 1);
  if (built.sql) {
    clauses.push(`(${built.sql})`);
    values.push(...built.params);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values, text: parsed.text };
}

/** Filter template repository: save/load/delete saved filter combinations. */
export class FilterTemplateRepository {
  async list(tenantSlug: string, userId: string): Promise<FilterTemplate[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT * FROM ${schema}.filter_templates WHERE user_id = $1 OR is_shared = true ORDER BY name`,
      [userId]
    );
    return r.rows;
  }

  async saveTemplate(
    tenantSlug: string,
    userId: string,
    data: { name: string; description?: string; query?: string; filterGroup?: FilterGroup; isShared?: boolean }
  ): Promise<FilterTemplate> {
    if (data.filterGroup) buildFilterQuery(data.filterGroup); // validate before persisting
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `INSERT INTO ${schema}.filter_templates (user_id, name, description, query, filter_group, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, data.name, data.description ?? null, data.query ?? null,
        JSON.stringify(data.filterGroup ?? { operator: 'AND', conditions: [] }), data.isShared ?? false]
    );
    return r.rows[0];
  }

  async loadTemplate(tenantSlug: string, userId: string, id: string): Promise<FilterTemplate> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT * FROM ${schema}.filter_templates WHERE id = $1 AND (user_id = $2 OR is_shared = true)`,
      [id, userId]
    );
    if (!r.rows[0]) throw new NotFoundError('Filter template', id);
    return r.rows[0];
  }

  async deleteTemplate(tenantSlug: string, userId: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `DELETE FROM ${schema}.filter_templates WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!r.rowCount) throw new NotFoundError('Filter template', id);
  }
}

export const filterTemplateRepository = new FilterTemplateRepository();

export const searchService = {
  /** Full-text search over issues ranked by ts_rank, with AND/OR filters and pagination. */
  async search(tenantSlug: string, userId: string, params: SearchParams) {
    warnIfElasticsearchConfigured();
    const started = Date.now();
    const schema = tenantService.getSchemaName(tenantSlug);
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));
    const { where, values, text } = buildWhere(params);

    const rankExpr = text ? `ts_rank(${ISSUE_TSVECTOR}, websearch_to_tsquery('english', $1))` : '0';
    const headlineExpr = text
      ? `ts_headline('english', coalesce(i.description, i.title), websearch_to_tsquery('english', $1), 'MaxWords=30, MinWords=10')`
      : 'NULL';
    const limitIdx = values.length + 1;

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT i.id, i.issue_number, i.title, i.status, i.priority, i.category_id, i.created_at,
                ${rankExpr} AS rank, ${headlineExpr} AS headline
         FROM ${schema}.issues i ${where}
         ORDER BY rank DESC, i.created_at DESC
         LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
        [...values, perPage, (page - 1) * perPage]
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM ${schema}.issues i ${where}`, values),
    ]);
    const totalCount: number = total.rows[0]?.count ?? 0;

    if (params.q && params.q.trim()) {
      await this.recordSearch(tenantSlug, userId, params.q, params.filterGroup, totalCount, Date.now() - started)
        .catch((err) => logger.warn({ err }, 'Failed to record search history'));
    }

    return {
      data: rows.rows as SearchResultRow[],
      pagination: { page, perPage, total: totalCount, totalPages: Math.ceil(totalCount / perPage) },
    };
  },

  /** Facet counts for status, priority and category over the current result set. */
  async facets(tenantSlug: string, params: SearchParams): Promise<Record<string, FacetCount[]>> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { where, values } = buildWhere(params);
    const dims: Record<string, string> = { status: 'i.status', priority: 'i.priority', category: 'i.category_id' };
    const out: Record<string, FacetCount[]> = {};
    await Promise.all(Object.entries(dims).map(async ([name, col]) => {
      const r = await pool.query(
        `SELECT ${col}::text AS value, COUNT(*)::int AS count FROM ${schema}.issues i ${where}
         GROUP BY ${col} ORDER BY count DESC LIMIT 50`,
        values
      );
      out[name] = r.rows;
    }));
    return out;
  },

  async recordSearch(
    tenantSlug: string, userId: string, query: string, filterGroup: FilterGroup | undefined,
    resultCount: number, durationMs: number
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.search_history (user_id, query, filter_group, result_count) VALUES ($1, $2, $3, $4)`,
      [userId, query, filterGroup ? JSON.stringify(filterGroup) : null, resultCount]
    );
    await pool.query(
      `INSERT INTO ${schema}.search_analytics (normalized_query, result_count, duration_ms, user_id) VALUES ($1, $2, $3, $4)`,
      [query.trim().toLowerCase(), resultCount, durationMs, userId]
    );
  },

  async searchHistory(tenantSlug: string, userId: string, limit = 20) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT query, MAX(created_at) AS last_searched_at, COUNT(*)::int AS times
       FROM ${schema}.search_history WHERE user_id = $1
       GROUP BY query ORDER BY last_searched_at DESC LIMIT $2`,
      [userId, limit]
    );
    return r.rows;
  },

  async clearHistory(tenantSlug: string, userId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(`DELETE FROM ${schema}.search_history WHERE user_id = $1`, [userId]);
  },

  /** Autocomplete: user's recent searches plus matching issue titles. */
  async suggest(tenantSlug: string, userId: string, prefix: string, limit = 8) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const like = `${prefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const [recent, titles] = await Promise.all([
      pool.query(
        `SELECT DISTINCT query FROM ${schema}.search_history WHERE user_id = $1 AND query ILIKE $2 LIMIT $3`,
        [userId, like, limit]
      ),
      pool.query(
        `SELECT title FROM ${schema}.issues WHERE title ILIKE $1 ORDER BY updated_at DESC LIMIT $2`,
        [`%${like}`, limit]
      ),
    ]);
    return {
      recentSearches: recent.rows.map((r: { query: string }) => r.query),
      titles: titles.rows.map((r: { title: string }) => r.title),
    };
  },

  /** Search analytics: popular searches, zero-result searches and daily volume. */
  async analytics(tenantSlug: string, days = 30) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const [popular, zero, daily] = await Promise.all([
      pool.query(
        `SELECT normalized_query AS query, COUNT(*)::int AS count, ROUND(AVG(result_count))::int AS avg_results
         FROM ${schema}.search_analytics WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY normalized_query ORDER BY count DESC LIMIT 20`,
        [days]
      ),
      pool.query(
        `SELECT normalized_query AS query, COUNT(*)::int AS count
         FROM ${schema}.search_analytics WHERE result_count = 0 AND created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY normalized_query ORDER BY count DESC LIMIT 20`,
        [days]
      ),
      pool.query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS searches, ROUND(AVG(duration_ms))::int AS avg_ms
         FROM ${schema}.search_analytics WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [days]
      ),
    ]);
    return { popularSearches: popular.rows, zeroResultSearches: zero.rows, daily: daily.rows };
  },
};
