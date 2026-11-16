import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

// Whitelisted filterable columns (column names never come from user input)
export const FILTER_FIELDS: Record<string, 'text' | 'uuid' | 'bool' | 'date'> = {
  status: 'text',
  priority: 'text',
  severity: 'text',
  impact: 'text',
  urgency: 'text',
  issue_type: 'text',
  source: 'text',
  category_id: 'uuid',
  application_id: 'uuid',
  assigned_to: 'uuid',
  assigned_group: 'uuid',
  reporter_id: 'uuid',
  sla_breached: 'bool',
  created_at: 'date',
  updated_at: 'date',
  resolved_at: 'date',
};

export const FACET_FIELDS = ['status', 'priority', 'severity', 'category_id', 'application_id', 'assigned_to'] as const;

export type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value?: string | number | boolean | Array<string | number | boolean>;
}

export interface FilterGroup {
  and?: FilterNode[];
  or?: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

const MAX_DEPTH = 5;
const MAX_NODES = 50;

const OPS: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

export interface BuiltFilter {
  sql: string;
  params: unknown[];
}

/**
 * Build a parameterized WHERE fragment from a filter tree.
 * Params are numbered starting at startIndex.
 */
export function buildFilterClause(node: FilterNode | undefined, startIndex = 1): BuiltFilter {
  const params: unknown[] = [];
  let nodes = 0;

  const walk = (n: FilterNode, depth: number): string => {
    if (depth > MAX_DEPTH) throw new BadRequestError('Filter nesting too deep');
    if (++nodes > MAX_NODES) throw new BadRequestError('Filter has too many conditions');
    if (n === null || typeof n !== 'object') throw new BadRequestError('Invalid filter node');

    if ('field' in n) {
      const type = Object.prototype.hasOwnProperty.call(FILTER_FIELDS, n.field) ? FILTER_FIELDS[n.field] : undefined;
      if (!type) throw new BadRequestError(`Unsupported filter field: ${String(n.field)}`);
      const col = `i.${n.field}`;

      if (n.op === 'is_null') return `${col} IS NULL`;
      if (n.op === 'not_null') return `${col} IS NOT NULL`;

      if (n.op === 'in') {
        if (!Array.isArray(n.value) || n.value.length === 0 || n.value.length > 100) {
          throw new BadRequestError(`Operator "in" on ${n.field} needs a non-empty array`);
        }
        params.push(n.value.map(String));
        return `${col}::text = ANY($${startIndex + params.length - 1}::text[])`;
      }

      const sqlOp = Object.prototype.hasOwnProperty.call(OPS, n.op) ? OPS[n.op] : undefined;
      if (!sqlOp) throw new BadRequestError(`Unsupported operator: ${String(n.op)}`);
      if (n.value === undefined || Array.isArray(n.value)) {
        throw new BadRequestError(`Operator "${n.op}" on ${n.field} needs a scalar value`);
      }
      if ((type === 'bool' || type === 'uuid') && n.op !== 'eq' && n.op !== 'neq') {
        throw new BadRequestError(`Operator "${n.op}" not valid for ${n.field}`);
      }
      params.push(n.value);
      return `${col} ${sqlOp} $${startIndex + params.length - 1}`;
    }

    const group = n as FilterGroup;
    const hasAnd = Array.isArray(group.and);
    const hasOr = Array.isArray(group.or);
    if (hasAnd === hasOr) throw new BadRequestError('Filter group needs exactly one of "and" or "or"');
    const children = (hasAnd ? group.and : group.or) as FilterNode[];
    if (children.length === 0) throw new BadRequestError('Filter group must not be empty');
    const parts = children.map((c) => walk(c, depth + 1));
    return `(${parts.join(hasAnd ? ' AND ' : ' OR ')})`;
  };

  if (!node) return { sql: 'TRUE', params };
  const sql = walk(node, 1);
  return { sql, params };
}

export interface SearchOptions {
  q?: string;
  filter?: FilterNode;
  page?: number;
  perPage?: number;
  sort?: 'relevance' | 'created_at' | 'updated_at';
}

class SearchService {
  async searchIssues(tenantSlug: string, userId: string, opts: SearchOptions) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 20));
    const q = opts.q?.trim();

    const params: unknown[] = [];
    let where = 'TRUE';
    let rank = '0::real';

    if (q) {
      params.push(q);
      where = `i.search_vector @@ websearch_to_tsquery('english', $1)`;
      rank = `ts_rank(i.search_vector, websearch_to_tsquery('english', $1))`;
    }

    const built = buildFilterClause(opts.filter, params.length + 1);
    params.push(...built.params);
    where += ` AND ${built.sql}`;

    const sort =
      q && (opts.sort ?? 'relevance') === 'relevance'
        ? 'rank DESC, i.created_at DESC'
        : opts.sort === 'updated_at'
          ? 'i.updated_at DESC'
          : 'i.created_at DESC';

    const limitIdx = params.length + 1;
    const rows = await pool.query(
      `SELECT i.id, i.issue_number, i.title, i.description, i.status, i.priority, i.severity,
              i.assigned_to, i.category_id, i.application_id, i.created_at, i.updated_at,
              ${rank} AS rank, COUNT(*) OVER() AS total_count
       FROM ${schema}.issues i
       WHERE ${where}
       ORDER BY ${sort}
       LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      [...params, perPage, (page - 1) * perPage]
    );

    const total = rows.rows.length > 0 ? parseInt(rows.rows[0].total_count, 10) : 0;
    const data = rows.rows.map(({ total_count: _t, ...r }: Record<string, unknown>) => r);

    if (q) {
      // History is best-effort; do not fail the search on it
      await pool
        .query(
          `INSERT INTO ${schema}.search_history (user_id, query, result_count) VALUES ($1, $2, $3)`,
          [userId, q.slice(0, 500), total]
        )
        .catch(() => undefined);
    }

    return { data, total, page, perPage };
  }

  async facets(tenantSlug: string, opts: Pick<SearchOptions, 'q' | 'filter'>) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const params: unknown[] = [];
    let where = 'TRUE';
    if (opts.q?.trim()) {
      params.push(opts.q.trim());
      where = `i.search_vector @@ websearch_to_tsquery('english', $1)`;
    }
    const built = buildFilterClause(opts.filter, params.length + 1);
    params.push(...built.params);
    where += ` AND ${built.sql}`;

    const result: Record<string, Array<{ value: string | null; count: number }>> = {};
    for (const field of FACET_FIELDS) {
      const r = await pool.query(
        `SELECT i.${field}::text AS value, COUNT(*)::int AS count
         FROM ${schema}.issues i WHERE ${where}
         GROUP BY i.${field} ORDER BY count DESC LIMIT 50`,
        params
      );
      result[field] = r.rows;
    }
    return result;
  }

  async listFilters(tenantSlug: string, userId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT * FROM ${schema}.saved_filters WHERE user_id = $1 OR is_shared = true ORDER BY name`,
      [userId]
    );
    return r.rows;
  }

  async createFilter(
    tenantSlug: string,
    userId: string,
    data: { name: string; query?: string; filter?: FilterNode; isShared?: boolean }
  ) {
    buildFilterClause(data.filter); // validate before storing
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `INSERT INTO ${schema}.saved_filters (user_id, name, query, filter, is_shared)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, data.name, data.query ?? null, JSON.stringify(data.filter ?? {}), data.isShared ?? false]
    );
    return r.rows[0];
  }

  async deleteFilter(tenantSlug: string, userId: string, id: string) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `DELETE FROM ${schema}.saved_filters WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (r.rowCount === 0) throw new NotFoundError('Saved filter');
  }

  async history(tenantSlug: string, userId: string, limit = 20) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const r = await pool.query(
      `SELECT query, MAX(created_at) AS last_used FROM ${schema}.search_history
       WHERE user_id = $1 GROUP BY query ORDER BY last_used DESC LIMIT $2`,
      [userId, Math.min(100, limit)]
    );
    return r.rows;
  }

  async suggest(tenantSlug: string, userId: string, prefix: string) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
    const r = await pool.query(
      `SELECT query, MAX(created_at) AS last_used FROM ${schema}.search_history
       WHERE user_id = $1 AND query ILIKE $2 ESCAPE '\\'
       GROUP BY query ORDER BY last_used DESC LIMIT 10`,
      [userId, `${escaped}%`]
    );
    return r.rows.map((x: { query: string }) => x.query);
  }

  async analytics(tenantSlug: string, days = 30) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const d = Math.min(365, Math.max(1, days));
    const popular = await pool.query(
      `SELECT query, COUNT(*)::int AS searches, ROUND(AVG(result_count))::int AS avg_results
       FROM ${schema}.search_history WHERE created_at > NOW() - make_interval(days => $1)
       GROUP BY query ORDER BY searches DESC LIMIT 20`,
      [d]
    );
    const noResults = await pool.query(
      `SELECT query, COUNT(*)::int AS searches
       FROM ${schema}.search_history
       WHERE created_at > NOW() - make_interval(days => $1) AND result_count = 0
       GROUP BY query ORDER BY searches DESC LIMIT 20`,
      [d]
    );
    const daily = await pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS searches
       FROM ${schema}.search_history WHERE created_at > NOW() - make_interval(days => $1)
       GROUP BY 1 ORDER BY 1`,
      [d]
    );
    return { popular: popular.rows, noResults: noResults.rows, daily: daily.rows };
  }
}

export const searchService = new SearchService();
