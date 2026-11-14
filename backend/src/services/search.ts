import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { buildFilterClause, type FilterNode } from './search-filters.js';

export const SEARCH_MAX_PER_PAGE = 100;
export const FACET_FIELDS = ['status', 'priority', 'severity', 'assigned_group', 'application_id'] as const;
const FACET_LIMIT = 50;

export type SearchSort = 'relevance' | 'created_at' | 'updated_at';

export interface SearchParams {
  q?: string;
  filter?: FilterNode;
  sort?: SearchSort;
  order?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
  facets?: boolean;
}

export interface FacetBucket { value: string | null; count: number }
export type Facets = Record<string, FacetBucket[]>;

/**
 * Normalizes user query syntax (terms, "quoted phrases", OR, -exclusion) into
 * websearch_to_tsquery input. Unbalanced quotes are dropped.
 */
export function parseSearchQuery(q: string | undefined): string {
  if (!q) return '';
  let out = Array.from(q, (ch) => (ch.charCodeAt(0) < 0x20 ? ' ' : ch)).join('').trim().replace(/\s+/g, ' ');
  const quotes = (out.match(/"/g) || []).length;
  if (quotes % 2 === 1) {
    const idx = out.lastIndexOf('"');
    out = out.slice(0, idx) + out.slice(idx + 1);
  }
  return out.trim();
}

export class SearchService {
  async search(tenantSlug: string, params: SearchParams) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(SEARCH_MAX_PER_PAGE, Math.max(1, params.perPage ?? 20));
    const offset = (page - 1) * perPage;
    const tsq = parseSearchQuery(params.q);

    const values: unknown[] = [];
    const conds: string[] = [];
    let rankExpr = '0::float8';
    if (tsq) {
      values.push(tsq);
      conds.push(`i.search_vector @@ websearch_to_tsquery('english', $1)`);
      rankExpr = `ts_rank(i.search_vector, websearch_to_tsquery('english', $1))::float8`;
    }
    if (params.filter) {
      const f = buildFilterClause(params.filter, values.length + 1);
      conds.push(f.sql);
      values.push(...f.values);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const order = params.order === 'asc' ? 'ASC' : 'DESC';
    let orderBy: string;
    if (params.sort === 'created_at' || params.sort === 'updated_at') {
      orderBy = `i.${params.sort} ${order}, i.id`;
    } else if (tsq) {
      orderBy = `rank ${order}, i.created_at DESC, i.id`;
    } else {
      orderBy = `i.created_at ${order}, i.id`;
    }

    // Total counts only the matching set (GIN-driven when q is present)
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.issues i ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limitIdx = values.length + 1;
    const result = await pool.query(
      `SELECT i.*, ${rankExpr} AS rank
       FROM ${schema}.issues i
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      [...values, perPage, offset]
    );
    const data = result.rows.map((r: Record<string, unknown>) => ({ ...r, rank: Number(r.rank) }));

    let facets: Facets | undefined;
    if (params.facets) {
      facets = await this.facets(schema, where, values);
    }

    return {
      data,
      pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      ...(facets ? { facets } : {}),
    };
  }

  /** All facet counts in a single query over the matching set, each bucket list bounded. */
  private async facets(schema: string, where: string, values: unknown[]): Promise<Facets> {
    const parts = FACET_FIELDS.map(
      (f) => `(SELECT '${f}'::text AS field, ${f}::text AS value, COUNT(*) AS count
                FROM m GROUP BY ${f} ORDER BY COUNT(*) DESC, ${f}::text LIMIT ${FACET_LIMIT})`
    );
    const res = await pool.query(
      `WITH m AS (
         SELECT ${FACET_FIELDS.join(', ')} FROM ${schema}.issues i ${where}
       ) ${parts.join(' UNION ALL ')}`,
      values
    );
    const facets: Facets = {};
    for (const f of FACET_FIELDS) facets[f] = [];
    for (const row of res.rows) {
      facets[row.field]?.push({ value: row.value, count: parseInt(row.count, 10) });
    }
    return facets;
  }
}

export const searchService = new SearchService();
